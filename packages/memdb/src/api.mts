import * as dbClient from "@/client.mjs";
import { create } from "@bufbuild/protobuf";
import { type Client, ConnectError, type ConnectRouter } from "@connectrpc/connect";
import {
  ConnectionTokenSchema,
  DatabaseConnectRequestSchema,
  type DatabaseConnection,
  DatabaseConnectionSchema,
  type DatabaseQueryRequest,
  DatabaseQueryRequestSchema,
  type DatabaseQueryResponse,
  DatabaseQuerySchema,
  type DatabaseRow,
  type DatabaseService,
  type DatabaseTable,
  DatabaseTablesRequestSchema,
} from "@genstack.js/protocol/model/api/v1/db";
import { type ColumnSpec, decodeRow } from "./util.mts";

/**
 * ## Common Database Driver Options
 *
 * Options which are shared by all database drivers.
 */
export type CommonDriverOptions = {
  debugLogging: boolean;
};

/**
 * # Database Driver
 *
 * Describes the main interface for a database driver implementation; drivers are backend objects which comply with a
 * generic interface for accessing a SQLite-style database.
 *
 * ## Database API
 *
 * Database drivers implement facilities for connection management, query execution, result decoding, and metadata
 * assembly (table names, column info, and so on).
 *
 * Ultimately, database drivers return primitive values. There are several return modes for a query:
 * - Error: The query failed in some way; this mode encloses an error string and optional code.
 * - Empty: The query succeeded, but returned no rows; this type is also used for DDL queries.
 * - Single: The query returned a single primitive value (for example, a `SELECT COUNT(*)` query).
 * - Rows: The query returned a set of rows, which are decoded into a list of objects in accordance with table schema.
 * - Mutation: The query succeeded and returned a mutation count (for example, `INSERT`, `UPDATE`, or `DELETE`).
 *
 * This interface makes no guarantees about the queries supported by a given driver, except that queries must be valid
 * ANSI SQL statements. The driver may support additional features, such as table creation, schema introspection, and
 * access control.
 *
 * ## Driver Lifecycle
 *
 * When a driver is created, it is polled for its `version`, which may be used to determine compatibility, and may be
 * emitted to logs for diagnostic purposes. Once created, a database driver's `setup` method is called, which registers
 * RPC call implementations.
 *
 * RPC call implementations are then dispatched directly. These implementations may call into the singleton instance as
 * needed.
 */
export interface DatabaseDriver {
  /**
   * @return Version of the driver.
   */
  version(): string;

  /**
   * @return Active options for the driver.
   */
  options(): CommonDriverOptions;

  /**
   * Set up this driver for RPC use.
   *
   * @param router RPC router to setup with.
   */
  setup(router: ConnectRouter): void;
}

/**
 * ## Query Result Mode
 *
 * Enumerates the types of query results which can be returned by a database driver.
 */
export enum QueryResultMode {
  /**
   * The query returned a single primitive value.
   */
  Single = 0,

  /**
   * The query returned a set of rows.
   */
  Rows = 1,

  /**
   * The query returned a mutation count.
   */
  Mutation = 2,

  /**
   * The query returned no rows or made no quantifiable changes.
   */
  Empty = 3,

  /**
   * The query failed.
   */
  Error = 4,
}

/**
 * ## Query Result
 *
 * Generic interface which all query results comply with; this includes the `mode` of the query result, and the result
 * values itself, as applicable, plus any metadata or error information.
 */
export interface QueryResult {
  /**
   * Mode of the query result.
   */
  mode: QueryResultMode;
}

/**
 * ## Database Access Level
 *
 * Enumerates common access levels which can be enforced across driver types.
 */
export enum DatabaseAccessLevel {
  /**
   * Anonymous access: this may not be supported by all drivers.
   */
  ANONYMOUS = 0,

  /**
   * Read-only access: the user may read data, but not write it.
   */
  READ_ONLY = 1,

  /**
   * Read-write access: the user may read and write data.
   */
  READ_WRITE = 2,

  /**
   * Admin access: the user may read/write/delete data and modify schema.
   */
  ADMIN = 3,
}

/**
 * ### Query Result: Error
 *
 * Describes a result where a query failed, and enclosed an error string and/or error code.
 */
export interface QueryErrorResult extends QueryResult {
  mode: QueryResultMode.Error;
  error?: string;
  code?: string;
}

/**
 * ### Query Result: Empty
 *
 * Describes a result where a query succeeded, but returned no rows or made no quantifiable changes.
 */
export interface QueryEmptyResult extends QueryResult {
  mode: QueryResultMode.Empty;
}

/**
 * ### Query Result: Single
 *
 * Describes a result where a query returned a single primitive value.
 */
export interface QuerySingleResult extends QueryResult {
  mode: QueryResultMode.Single;
  value?: any;
}

/**
 * ### Query Result: Mutation
 *
 * Describes a result where a query returned a mutation count.
 */
export interface QueryRowsResult extends QueryResult {
  mode: QueryResultMode.Rows;
  rows: DatabaseRow[];
  tables?: DatabaseTable[];
}

/**
 * ### Query Result: Mutation
 *
 * Describes a result where a query returned a mutation count.
 */
export interface QueryMutationResult extends QueryResult {
  mode: QueryResultMode.Mutation;
  count: number;
}

/**
 * ## Query Callback: Row
 *
 * Handle a single row result from a query observer.
 */
export type QueryRowCallback = (row: DatabaseRow) => void;

/**
 * ## Query Callback: End
 *
 * Handle the end of a query observer, which includes the final response. This callback is terminal.
 */
export type QueryEndCallback = (result: QueryResult) => void;

/**
 * ## Query Callback: Error
 *
 * Handle an error from a query observer. This callback is terminal.
 */
export type QueryErrorCallback = (err: Error) => void;

/**
 * ## Any Query Result
 *
 * Union type for all possible query results.
 */
export type AnyQueryResult =
  | QuerySingleResult
  | QueryEmptyResult
  | QueryRowsResult
  | QueryMutationResult
  | QueryErrorResult;

/**
 * ## Exec Query Result
 *
 * Union type for all possible query results from an `exec` call.
 */
export type ExecQueryResult = QueryEmptyResult | QuerySingleResult | QueryMutationResult | QueryErrorResult;

/**
 * ## Query Observer
 *
 * Query observers are generic structures returned by a database driver when a query is executed; typically, a driver
 * should implement its own specialized observer type which extends this interface.
 *
 * Query observers receive results from executed queries, and mediate the decoding of those results. Once results are
 * ready, callbacks are dispatched in order to assemble final results.
 */
export interface QueryObserver {
  /**
   * Execute the attached query (if needed), and then decode results; once the returned promise resolves, all work and
   * callbacks have completed.
   *
   * @return Decoded row
   */
  recv(): Promise<QueryResult>;

  /**
   * Register a callback to handle a row result.
   *
   * @param cbk Row callback
   * @return This; allows chaining
   */
  onRow(cbk: QueryRowCallback): this;

  /**
   * Register a callback to handle the end of a query.
   *
   * @param cbk End callback
   * @return This; allows chaining
   */
  onEnd(cbk: QueryEndCallback): this;

  /**
   * Register a callback to handle an error.
   *
   * @param cbk Error callback
   * @return This; allows chaining
   */
  onError(cbk: QueryErrorCallback): this;
}

/**
 * ## Generic Query Observer
 *
 * Implements a generic base class for a `QueryObserver`; the base class handles generic tasks like callback
 * registration and dispatch.
 */
export abstract class GenericQueryObserver implements QueryObserver {
  // Row callbacks attached to this observer.
  protected readonly onRowCbks: QueryRowCallback[] = [];

  // End callbacks attached to this observer.
  protected readonly onEndCbks: QueryEndCallback[] = [];

  // Error callbacks attached to this observer.
  protected readonly onErrorCbks: QueryErrorCallback[] = [];

  onRow(cbk: QueryRowCallback): this {
    this.onRowCbks.push(cbk);
    return this;
  }

  onError(cbk: QueryErrorCallback): this {
    this.onErrorCbks.push(cbk);
    return this;
  }

  onEnd(cbk: QueryEndCallback): this {
    this.onEndCbks.push(cbk);
    return this;
  }

  /**
   * Decode a row result from an attached query result.
   *
   * @param tableIndex Index of the table in the result set
   * @param columns Column information for the table
   * @param index Index of the row in the result set
   * @param stmt Query result
   */
  decode(tableIndex: number, columns: ColumnSpec[], index: number, stmt: any): DatabaseRow {
    return decodeRow(tableIndex, index, stmt, columns);
  }

  /**
   * Execute the underlying query, decode results (as applicable), dispatch callbacks, and then complete the returned
   * promise.
   *
   * @return Promise for a query result
   */
  abstract apply(): Promise<QueryResult>;

  /**
   * Execute the attached query (if needed), and then decode results; once the returned promise resolves, all work and
   * callbacks have completed.
   *
   * @return Decoded row
   */
  async recv(): Promise<QueryResult> {
    return await this.apply();
  }
}

/**
 * # Database Adapter
 *
 * Describes the API supplied for database use in simple generic form; a database adapter accepts queries and returns
 * well-formed structured results, regardless of the underlying database implementation or driver.
 *
 * There is a default implementation of the `DatabaseAdapter` interface which is an expected call site point for all
 * drivers.
 */
export interface DatabaseAdapter {
  /**
   * Indicate whether the database is currently connected.
   *
   * @return `true` if connected, `false` otherwise
   */
  connected(): boolean;

  /**
   * Connect to the database, as applicable.
   *
   * @param spec Name or connection string for the database
   * @return Promise for a connection result
   */
  connect(spec: string): Promise<void>;

  /**
   * ## Queries: Execute
   *
   * Execute a `statement` against the database, without expecting any sort of response; the `exec` method is typically
   * used for structural queries.
   *
   * @param statement Statement to execute against the database
   * @return Promise for a query result
   */
  exec(statement: string): Promise<ExecQueryResult>;

  /**
   * ## Queries: Query
   *
   * Execute a `statement` against the database, and return a query observer which can be used to handle the results.
   *
   * @param statement
   */
  query(statement: string): Promise<AdapterQueryReturn>;

  /**
   * ## Queries: Tables
   *
   * Retrieve a list of tables in the attached database.
   */
  tables(): Promise<DatabaseTable[]>;
}

/**
 * Create a database query request with the specified connection token and query value; if the query expects no
 * response, `statement` should be flipped to `true`.
 *
 * @param token Connection token
 * @param value Query to run
 * @param statement Whether the query is a statement or a query
 * @return Database query request
 */
export function connectionTokenOf(token: number): DatabaseConnection {
  return create(DatabaseConnectionSchema, {
    spec: {
      case: "token",
      value: create(ConnectionTokenSchema, {
        token: BigInt(token),
      }),
    },
  });
}

/**
 * Create a database query request with the specified connection token and query value; if the query expects no
 * response, `statement` should be flipped to `true`.
 *
 * @param token Connection token
 * @param value Query to run
 * @param statement Whether the query is a statement or a query
 * @return Database query request
 */
export function queryWithToken(token: number, value: string, statement = false): DatabaseQueryRequest {
  return create(DatabaseQueryRequestSchema, {
    connection: connectionTokenOf(token),
    query: create(DatabaseQuerySchema, {
      statement,
      spec: {
        case: "query",
        value,
      },
    }),
  });
}

export type AdapterQueryReturn = { result: AnyQueryResult; response: DatabaseQueryResponse };

/**
 * ## Generic Database Adapter
 *
 * Default implementation of a `DatabaseAdapter`, which uses a `DatabaseDriver` via a service implementation.
 */
export class DatabaseClientAdapter implements DatabaseAdapter {
  // Connection status.
  private isConnected = false;

  // Connection token.
  private connectionToken = 0;

  constructor(private readonly client: Client<typeof DatabaseService>) {
    // nothing at this time
  }

  connected(): boolean {
    return this.isConnected;
  }

  // Establish the underlying database connection.
  async connect(spec: string): Promise<void> {
    const req = create(DatabaseConnectRequestSchema, {
      identifier: {
        case: "name",
        value: spec,
      },
    });
    try {
      const conn = await this.client.databaseConnect(req);
      if (conn?.connection?.token) {
        this.connectionToken = Number(conn.connection.token);
      } else {
        throw new Error("connection token not provided by server");
      }
      this.isConnected = true;
    } catch (err) {
      this.isConnected = false;
      throw err;
    }
  }

  // Execute a response-less query against the client.
  async exec(statement: string): Promise<ExecQueryResult> {
    if (!this.connected) {
      throw new Error("Database is not connected");
    }
    const query = queryWithToken(this.connectionToken, statement, true);
    let err: Error | ConnectError | null = null;
    let resp: DatabaseQueryResponse | null = null;

    try {
      resp = await this.client.databaseQuery(query);
    } catch (e) {
      if (e && e instanceof ConnectError) {
        err = e;
      } else if (e && e instanceof Error) {
        err = e;
      } else {
        throw new Error(`unexpected error: ${e}`);
      }
    }
    if (err) {
      throw err;
    }
    if (!resp) {
      throw new Error("no response and no error; invalid state");
    }

    // process response
    switch (resp.result?.result?.case) {
      case "empty":
        return { mode: QueryResultMode.Empty } satisfies QueryEmptyResult;
      case "mutation":
        return {
          mode: QueryResultMode.Mutation,
          count: resp.result?.result?.value?.result?.value ? Number(resp.result.result.value.result.value) : 0,
        };
    }
    console.info("would build response", {
      statement,
      resp,
    });
    throw new Error(`not yet implemented (query client exec): ${resp.result?.result?.case}`);
  }

  // Retrieve a list of tables in the attached database.
  async tables(): Promise<DatabaseTable[]> {
    if (!this.connected) {
      throw new Error("Database is not connected");
    }
    return (
      await this.client.databaseTables(
        create(DatabaseTablesRequestSchema, {
          connection: connectionTokenOf(this.connectionToken),
        }),
      )
    ).table;
  }

  // Execute a query against the client.
  async query(statement: string): Promise<AdapterQueryReturn> {
    if (!this.connected) {
      throw new Error("Database is not connected");
    }
    const query = queryWithToken(this.connectionToken, statement);
    let err: Error | ConnectError | null = null;
    let resp: DatabaseQueryResponse | null = null;

    try {
      resp = await this.client.databaseQuery(query);
    } catch (e) {
      if (e && e instanceof ConnectError) {
        err = e;
      } else if (e && e instanceof Error) {
        err = e;
      } else {
        throw new Error(`unexpected error: ${e}`);
      }
    }
    if (err) {
      throw err;
    }
    if (!resp) {
      throw new Error("no response and no error; invalid state");
    }

    // process response
    switch (resp.result?.result?.case) {
      case "empty":
        return {
          result: { mode: QueryResultMode.Empty } satisfies QueryEmptyResult,
          response: resp,
        };
      case "mutation":
        return {
          response: resp,
          result: {
            mode: QueryResultMode.Mutation,
            count: resp.result?.result?.value?.result?.value ? Number(resp.result.result.value.result.value) : 0,
          } satisfies QueryMutationResult,
        };
      case "single": {
        // TODO: only supports `numberValue`, carrying a `number`, for now
        const single = resp.result?.result?.value?.value;
        if (!single) {
          throw new Error("Single result is empty (unexpected)");
        }
        switch (single.data.case) {
          case "value": {
            switch (single.data.value.kind.case) {
              case "boolValue":
              case "stringValue":
              case "nullValue":
              case "numberValue":
                return {
                  response: resp,
                  result: {
                    mode: QueryResultMode.Single,
                    value: single.data.value.kind.value,
                  } satisfies QuerySingleResult,
                };
              default:
                throw new Error("Single result is not a valid value (unexpected)");
            }
          }
          case "blob": {
            return {
              response: resp,
              result: {
                mode: QueryResultMode.Single,
                value: single.data.value,
              },
            };
          }
          case "empty":
            return {
              response: resp,
              result: {
                mode: QueryResultMode.Empty,
              },
            };
          case "real":
            return {
              response: resp,
              result: {
                mode: QueryResultMode.Single,
                value: single.data.value,
              },
            };
          default:
            throw new Error("Single result is not a valid value (unexpected)");
        }
      }
      case "resultset": {
        const multi = resp.result?.result?.value;
        if (!multi || !multi.row) {
          throw new Error("Result set is empty (unexpected)");
        }
        return {
          response: resp,
          result: {
            mode: QueryResultMode.Rows,
            rows: multi.row,
            tables: multi.table,
          } satisfies QueryRowsResult,
        };
      }
    }
    throw new Error(`not yet implemented (query client recv): ${resp.result?.result?.case}`);
  }
}

/**
 * Create a database client adapter from a client instance.
 *
 * @param driverFactory Database driver factory
 * @param client Client instance; if one is not provided, one will be created using the provided driver
 * @return Database client adapter
 */
export function createClientAdapter(
  driverFactory: () => DatabaseDriver,
  client?: Client<typeof DatabaseService>,
): DatabaseClientAdapter {
  let effective: Client<typeof DatabaseService>;
  if (client) {
    effective = client;
  } else {
    const driver = driverFactory();
    const inMemory = dbClient.createInMemoryTransport((routes) => driver.setup(routes));
    const db = dbClient.databaseClient(inMemory);
    effective = db;
  }
  return new DatabaseClientAdapter(effective);
}

/**
 * Use a Database Service client to create a database client adapter.
 *
 * @param client Client instance; if one is not provided, one will be created using the provided driver
 * @return Database client adapter
 */
export function useClient(client: Client<typeof DatabaseService>): DatabaseClientAdapter {
  return new DatabaseClientAdapter(client);
}
