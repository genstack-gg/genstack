import * as api from "@/api.mjs";
import * as client from "@/client.mjs";
import { toBinary, toJson, toJsonString } from "@bufbuild/protobuf";
import { type ConnectRouter, createConnectRouter } from "@connectrpc/connect";
import { connectWorkersAdapter } from "@depot/connectrpc-workers";
import {
  type DatabaseQueryResponse,
  DatabaseQueryResponseSchema,
  DatabaseRowSchema,
  DatabaseTablesResponseSchema,
} from "@genstack.js/protocol/model/api/v1/db";
import { type Command, Option, createCommand } from "commander";
import pkg from "../package.json";
import BunDriver from "./bun.mjs";

export const serverDefaults = {
  port: "3000",
  host: "localhost",
};

export enum CliOutputFormat {
  JSON = "json",
  BINARY = "binary",
}

export const defaultFormat = CliOutputFormat.JSON;

function setupRpc(router: ConnectRouter) {
  const driver = BunDriver.defaults();
  driver.setup(router);
}

const handler = connectWorkersAdapter({ routes: setupRpc });

// Determine a label for a query response mode.
export function labelForMode(mode: api.QueryResultMode): string {
  switch (mode) {
    case api.QueryResultMode.Empty:
      return "empty";
    case api.QueryResultMode.Mutation:
      return "mutation";
    case api.QueryResultMode.Error:
      return "error";
    case api.QueryResultMode.Rows:
      return "rows";
    case api.QueryResultMode.Single:
      return "single";
    default:
      return "unknown";
  }
}

// Return a vanilla JS data structure for a query response.
export function dataForMode(mode: api.QueryResultMode, value: api.AnyQueryResult): any {
  switch (mode) {
    case api.QueryResultMode.Empty:
      return {};
    case api.QueryResultMode.Mutation:
      return {
        count: (value as api.QueryMutationResult).count,
      };

    case api.QueryResultMode.Error:
      return {
        error: (value as api.QueryErrorResult).error,
        code: (value as api.QueryErrorResult).code,
      };

    case api.QueryResultMode.Rows:
      return {
        tables: (value as api.QueryRowsResult).tables,
        rows: (value as api.QueryRowsResult).rows.map((row) => toJson(DatabaseRowSchema, row)),
      };
    case api.QueryResultMode.Single:
      return {
        value: (value as api.QuerySingleResult).value,
      };

    default:
      throw new Error("Unrecognized response, cannot format");
  }
}

// Encode a response structure using the specified format, and return it as raw bytes.
export function encodeProtoResponse(format: CliOutputFormat, response: DatabaseQueryResponse): Uint8Array {
  switch (format) {
    case CliOutputFormat.JSON:
      return new TextEncoder().encode(toJsonString(DatabaseQueryResponseSchema, response, { prettySpaces: 2 }));
    case CliOutputFormat.BINARY:
      return toBinary(DatabaseQueryResponseSchema, response);

    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

// Encode a response structure using the specified format, and return it as raw bytes.
export function encodeQueryResponse(
  format: CliOutputFormat,
  response: DatabaseQueryResponse,
  result: api.AnyQueryResult,
): string {
  switch (format) {
    case CliOutputFormat.JSON:
      return JSON.stringify(
        {
          mode: labelForMode(result.mode),
          data: dataForMode(result.mode, result),
        },
        null,
        "  ",
      );

    // special case: encode as binary as normal, and then b64 encode it
    case CliOutputFormat.BINARY:
      return Buffer.from(encodeProtoResponse(format, response)).toString("base64");

    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

type CliOptions = {
  debug?: boolean;
  logFile?: string;
  port?: number;
  host?: string;
  tls?: boolean;
  prefix?: string;
};

type CliOutputOptions = {
  format?: CliOutputFormat;
  out?: string;
};

type CliServeOptions = CliOptions & {
  signal?: AbortSignal;
  debugLogger?: (...msg: string[]) => void;
  stopCallback?: () => void;
};

type CliClientOptions = CliOptions &
  CliOutputOptions & {
    database?: string;
  };

type CliQueryOptions = CliClientOptions;

// Create an adapter connected to a server.
async function connectedAdapter(options: CliOptions, db = "default") {
  const { port, host, tls } = {
    ...serverDefaults,
    ...options,
  };

  const protocol = tls ? "https" : "http";
  const urlPrefix = options.prefix || "";
  const transport = client.createWebTransport(`${protocol}://${host}:${port}${urlPrefix}`);
  const dbClient = client.databaseClient(transport);
  const adapter = api.useClient(dbClient);
  await adapter.connect(db);
  return adapter;
}

// Entrypoint for the CLI `serve` sub-command.
export function serve(options: CliServeOptions) {
  const router = createConnectRouter();
  const driver = BunDriver.defaults();
  driver.setup(router);
  const { port, host } = {
    ...serverDefaults,
    ...options,
  };

  const server = Bun.serve({
    port: typeof port === "number" ? port : Number.parseInt(port),
    hostname: host || undefined,

    fetch(req) {
      return handler(req, {}, {});
    },
  });

  const logger = options.debugLogger || ((...args) => console.info(...args));
  logger(`Serving in-memory Genstack DB (port: ${port})`);

  if (options.signal) {
    options.signal.addEventListener("abort", () => {
      server.stop(true).then(() => {
        if (options.stopCallback) options.stopCallback();
      });
    });
  }
}

// Generate output for a command, passing it to standard streams or writing to files as demanded by `options`.
export function outputForCommand(
  format: CliOutputFormat,
  options: CliOutputOptions,
  output: Uint8Array | string,
  {
    fileWriter,
    stdoutWriter,
    stderrWriter,
  }: {
    fileWriter: (path: string, data: Uint8Array | string) => Promise<void>;
    stdoutWriter: (data: Uint8Array | string) => void;
    stderrWriter: (data: Uint8Array | string) => void;
  },
) {
  if (options.out && options.out !== "-") {
    // we are writing to a file
    fileWriter(options.out, output);
  } else if (options.out === "-") {
    // we are writing to stdout
    stdoutWriter(output);
  } else {
    // we are writing to stderr
    switch (format) {
      case CliOutputFormat.JSON:
        stderrWriter(output);
        break;

      case CliOutputFormat.BINARY:
        // special case: when writing to `stderr`, we base64 encode the binary data
        stderrWriter(typeof output === "string" ? output : Buffer.from(output).toString("base64"));
        break;
    }
  }
}

const bunWriters = {
  fileWriter: async (path: string, data: Uint8Array | string) => {
    await Bun.write(path, data);
  },

  stdoutWriter: (data: Uint8Array | string) => {
    process.stdout.write(data);
  },

  stderrWriter: (data: Uint8Array | string) => {
    process.stderr.write(data);
  },
};

// Encode a generic protocol-buffers response into the target format.
export function encodeResponseGeneric(format: CliOutputFormat, schema: any, response: any): Uint8Array | string {
  switch (format) {
    case CliOutputFormat.JSON:
      return toJsonString(schema, response, { prettySpaces: 2 });

    case CliOutputFormat.BINARY:
      return toBinary(schema, response);

    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

// Fetch a list of tables within a database.
export async function databaseTables(options: CliQueryOptions): Promise<void> {
  const adapter = await connectedAdapter(options);
  const now = performance.now();
  const tables = await adapter.tables();
  const elapsed = performance.now() - now;
  if (options.debug) console.info(`Tables list completed in ${elapsed}ms`);
  const encoded = encodeResponseGeneric(options.format || defaultFormat, DatabaseTablesResponseSchema, tables);
  outputForCommand(options.format || defaultFormat, options, encoded, bunWriters);
}

// Execute (run a query with no response) or apply (run a query with a response).
export async function runQuery(statement: boolean, str: string, options: CliQueryOptions): Promise<void> {
  const adapter = await connectedAdapter(options);
  const action = statement ? "Executing" : "Querying with";
  if (options.debug) console.info(`${action} '${str}'`);
  const now = performance.now();
  const { result, response } = await adapter.query(str);
  const elapsed = performance.now() - now;
  if (options.debug) console.info(`Query completed in ${elapsed}ms`);
  const encoded = encodeQueryResponse(options.format || defaultFormat, response, result);
  outputForCommand(options.format || defaultFormat, options, encoded, bunWriters);
}

// Wire together CLI support for the `serve` command.
export function setupServeCommand(program: Command) {
  const serveCommand = program
    .command("serve")
    .description("Start the in-memory database as a server")
    .option("-p, --port <port>", "Port to listen on", "3000")
    .option("--host <host>", "Host to listen on", "localhost")
    .action(serve);

  return serveCommand;
}

// Wire together CLI support for the `client` command.
export function setupClientCommand(program: Command) {
  const clientCommand = program
    .command("client", { isDefault: true })
    .description("Client for the in-memory database service")
    .option("-p, --port <port>", "Port to send traffic to", "3000")
    .option("--host <host>", "Host to send traffic to", "localhost")
    .option("--tls", "Enable or disable TLS", false)
    .option("--prefix", "URL prefix to use")
    .option("--database <db>", "Database to connect to", "default")
    .addOption(
      new Option("-f, --format <fmt>", "format to use")
        .choices([CliOutputFormat.JSON, CliOutputFormat.BINARY])
        .default(CliOutputFormat.JSON),
    );

  clientCommand
    .command("exec")
    .description("Issue a no-response query to the database service")
    .argument("<str>", "Query string to send")
    .action(async (str, options) => await runQuery(true, str, options));

  clientCommand
    .command("query")
    .description("Issue a response-enabled query to the database service")
    .argument("<str>", "Query string to send")
    .action(async (str, options) => await runQuery(false, str, options));

  clientCommand
    .command("tables")
    .description("List tables in the database")
    .action(async (options) => await databaseTables(options));

  return clientCommand;
}

// Setup CLI commands.
export function setupCommands(program: Command) {
  setupServeCommand(program);
  setupClientCommand(program);
  return program;
}

// Create the CLI program.
export function createCli() {
  const program = createCommand();
  program.name("memdb").description("In-memory database tools for Genstack").version(pkg.version);
  return setupCommands(program);
}

// Entrypoint for the CLI.
export default function main(args: string[] = Bun.argv) {
  return createCli().parse(args);
}

export { main };
