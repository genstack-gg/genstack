import { describe, expect, mock, test } from "bun:test";
import { create } from "@bufbuild/protobuf";
import { ValueSchema } from "@bufbuild/protobuf/wkt";
import {
  ColumnPrimitiveType,
  DatabaseColumnSchema,
  DatabaseQueryResponseSchema,
  DatabaseResultSchema,
  DatabaseResultSetSchema,
  DatabaseRowSchema,
  DatabaseTableSchema,
  DatabaseValueResultSchema,
  DatabaseValueSchema,
} from "@genstack.js/protocol/model/api/v1/db";
import { Command } from "commander";
import * as api from "../src/api.mjs";
import * as cli from "../src/cli.mjs";
import * as client from "../src/client.mjs";

const withMockExit = (fn) => {
  const exit = process.exit;
  let exitCode: number | null = null;
  // @ts-expect-error
  process.exit = mock((code: number) => {
    exitCode = code;
  });
  let result: any;
  try {
    result = fn();
  } finally {
    process.exit = exit;
  }
  return {
    exitCode: exitCode as number | null,
    result,
  };
};

const withStubbedStdStreams = (fn) => {
  const { stdout, stderr } = process;
  const write = stdout.write;
  const writeErr = stderr.write;
  const calls: { stream: "stdout" | "stderr"; args: any[] }[] = [];
  // @ts-expect-error
  stdout.write = mock((...args) => calls.push({ stream: "stdout", args }));
  // @ts-expect-error
  stderr.write = mock((...args) => calls.push({ stream: "stderr", args }));
  let result: any;
  try {
    result = fn();
  } finally {
    stdout.write = write;
    stderr.write = writeErr;
  }
  return {
    result,
    stdout: calls.filter((c) => c.stream === "stdout").map((c) => c.args.join("")),
    stderr: calls.filter((c) => c.stream === "stderr").map((c) => c.args.join("")),
  };
};

const sampleEmptyResponse = create(DatabaseQueryResponseSchema, {
  result: create(DatabaseResultSchema, {
    ok: true,
    result: {
      case: "empty",
      value: true,
    },
  }),
});

const sampleEmptyResult: api.QueryEmptyResult = {
  mode: api.QueryResultMode.Empty,
};

const sampleSingleResponse = create(DatabaseQueryResponseSchema, {
  result: create(DatabaseResultSchema, {
    ok: true,
    result: {
      case: "single",
      value: create(DatabaseValueResultSchema, {
        value: create(DatabaseValueSchema, {
          data: {
            case: "value",
            value: create(ValueSchema, {
              kind: {
                case: "numberValue",
                value: 42,
              },
            }),
          },
        }),
      }),
    },
  }),
});

const sampleSingleResult: api.QuerySingleResult = {
  mode: api.QueryResultMode.Single,
  value: 42,
};

const sampleRowsResponse = create(DatabaseQueryResponseSchema, {
  result: create(DatabaseResultSchema, {
    ok: true,
    result: {
      case: "resultset",
      value: create(DatabaseResultSetSchema, {
        table: [
          create(DatabaseTableSchema, {
            name: "foo",
            identity: 1,
            column: [
              create(DatabaseColumnSchema, {
                name: "id",
                type: {
                  case: "primitive",
                  value: ColumnPrimitiveType.INTEGER,
                },
              }),
              create(DatabaseColumnSchema, {
                name: "text",
                type: {
                  case: "primitive",
                  value: ColumnPrimitiveType.TEXT,
                },
              }),
            ],
          }),
        ],
        row: [
          create(DatabaseRowSchema, {
            table: 1,
            ordinal: 0,
            value: [
              create(DatabaseValueSchema, {
                data: {
                  case: "value",
                  value: create(ValueSchema, {
                    kind: {
                      case: "numberValue",
                      value: 42,
                    },
                  }),
                },
              }),
              create(DatabaseValueSchema, {
                data: {
                  case: "value",
                  value: create(ValueSchema, {
                    kind: {
                      case: "stringValue",
                      value: "hello world",
                    },
                  }),
                },
              }),
            ],
          }),
        ],
      }),
    },
  }),
});

const sampleRowsResult: api.QueryRowsResult = {
  mode: api.QueryResultMode.Rows,
  tables: [
    create(DatabaseTableSchema, {
      name: "foo",
      identity: 1,
      column: [
        create(DatabaseColumnSchema, {
          name: "id",
          type: {
            case: "primitive",
            value: ColumnPrimitiveType.INTEGER,
          },
        }),
        create(DatabaseColumnSchema, {
          name: "text",
          type: {
            case: "primitive",
            value: ColumnPrimitiveType.TEXT,
          },
        }),
      ],
    }),
  ],
  rows: [
    create(DatabaseRowSchema, {
      table: 1,
      ordinal: 0,
      value: [
        create(DatabaseValueSchema, {
          data: {
            case: "value",
            value: create(ValueSchema, {
              kind: {
                case: "numberValue",
                value: 42,
              },
            }),
          },
        }),
        create(DatabaseValueSchema, {
          data: {
            case: "value",
            value: create(ValueSchema, {
              kind: {
                case: "stringValue",
                value: "hello world",
              },
            }),
          },
        }),
      ],
    }),
  ],
};

// TODO: over-the-wire error response decision
// const sampleErrorResponse = create(DatabaseQueryResponseSchema, {
//   result: create(DatabaseResultSchema, {
//     ok: false,
//     result: {
//       case: "error",
//       value: {
//         error: "oops",
//         code: "42",
//       },
//     }
//   })
// })

describe("cli", () => {
  test("prepares `client` command", () => {
    const program = new Command();
    cli.setupClientCommand(program);
    expect(program.commands).toBeArrayOfSize(1);
    expect(program.commands[0].name()).toBe("client");
  });
  test("prepares `serve` command", () => {
    const program = new Command();
    cli.setupServeCommand(program);
    expect(program.commands).toBeArrayOfSize(1);
    expect(program.commands[0].name()).toBe("serve");
  });
  test("prepares sub-commands", () => {
    const program = new Command();
    cli.setupCommands(program);
    expect(program.commands).toBeArrayOfSize(2);
  });
  test("prepares top-level command", () => {
    const program = cli.createCli();
    expect(program.name()).toBe("memdb");
    expect(program.commands).toBeArrayOfSize(2);
  });
  test("run with `--help`", () => {
    const { exitCode, result } = withMockExit(() => {
      return withStubbedStdStreams(() => {
        expect(() => cli.main(["--help"])).not.toThrow();
      });
    });
    const { stdout, stderr } = result;
    expect(exitCode).toBe(1);
    expect(stdout).toBeArray();
    expect(stdout).toBeEmpty();
    expect(stderr).toBeArray();
    expect(stderr).not.toBeEmpty();
  });
  describe("`main`", () => {
    test("run with no-args", () => {
      const { exitCode, result } = withMockExit(() => {
        return withStubbedStdStreams(() => {
          expect(() => cli.main([])).not.toThrow();
        });
      });
      const { stdout, stderr } = result;
      expect(exitCode).toBe(1);
      expect(stdout).toBeArray();
      expect(stdout).toBeEmpty();
      expect(stderr).toBeArray();
      expect(stderr).not.toBeEmpty();
    });
  });
  describe("client", () => {
    test("run with `--help`", () => {
      const { exitCode, result } = withMockExit(() => {
        return withStubbedStdStreams(() => {
          expect(() => cli.main(["client", "--help"])).not.toThrow();
        });
      });
      const { stdout, stderr } = result;
      expect(exitCode).toBe(1);
      expect(stdout).toBeArray();
      expect(stdout).toBeEmpty();
      expect(stderr).toBeArray();
      expect(stderr).not.toBeEmpty();
    });
    test("run with no-args should fail", () => {
      const { exitCode, result } = withMockExit(() => {
        return withStubbedStdStreams(() => {
          expect(() => cli.main(["client"])).not.toThrow();
        });
      });
      const { stdout, stderr } = result;
      expect(exitCode).toBe(1);
      expect(stdout).toBeArray();
      expect(stdout).toBeEmpty();
      expect(stderr).toBeArray();
      expect(stderr).not.toBeEmpty();
    });
    test("e2e client to server", async () => {
      const controller = new AbortController();
      const { result } = withStubbedStdStreams(() => {
        const signal = controller.signal;
        const port = 3000;
        const host = "localhost";
        const databaseClient = client.databaseClient(client.createWebTransport("http://localhost:3000"));
        const dbClient = api.useClient(databaseClient);
        cli.serve({ signal, port, host, debugLogger: () => {} });
        return {
          signal,
          dbClient,
        };
      });
      const { signal, dbClient, closePromise } = result;
      expect(signal).not.toBeUndefined();
      expect(dbClient).not.toBeUndefined();
      await dbClient.connect("default");
      expect(dbClient.connected()).toBeTrue();
      expect(cli.runQuery(false, "SELECT 1;", { format: cli.CliOutputFormat.JSON })).resolves.toBeUndefined();
      controller.abort();
    });
  });
  describe("serve", () => {
    test("run with `--help`", () => {
      const { exitCode, result } = withMockExit(() => {
        return withStubbedStdStreams(() => {
          expect(() => cli.main(["serve", "--help"])).not.toThrow();
        });
      });
      const { stdout, stderr } = result;
      expect(exitCode).toBe(1);
      expect(stdout).toBeArray();
      expect(stdout).toBeEmpty();
      expect(stderr).toBeArray();
      expect(stderr).not.toBeEmpty();
    });
    test("run server", async () => {
      const controller = new AbortController();
      const { result } = withStubbedStdStreams(() => {
        const signal = controller.signal;
        const port = 3000;
        const host = "localhost";
        const databaseClient = client.databaseClient(client.createWebTransport("http://localhost:3000"));
        const dbClient = api.useClient(databaseClient);
        cli.serve({ signal, port, host, debugLogger: () => {} });
        return {
          signal,
          dbClient,
        };
      });
      const { signal, dbClient } = result;
      expect(signal).not.toBeUndefined();
      expect(dbClient).not.toBeUndefined();
      await dbClient.connect("default");
      expect(dbClient.connected()).toBeTrue();
      controller.abort();
    });
    test("e2e client to server", async () => {
      const controller = new AbortController();
      const { result } = withStubbedStdStreams(() => {
        const signal = controller.signal;
        const port = 3000;
        const host = "localhost";
        const databaseClient = client.databaseClient(client.createWebTransport("http://localhost:3000"));
        const dbClient = api.useClient(databaseClient);
        cli.serve({ signal, port, host, debugLogger: () => {} });
        return {
          signal,
          dbClient,
        };
      });
      const { signal, dbClient } = result;
      expect(signal).not.toBeUndefined();
      expect(dbClient).not.toBeUndefined();
      await dbClient.connect("default");
      expect(dbClient.connected()).toBeTrue();
      const { result: result1 } = await dbClient.query("SELECT 1;");
      expect(result1).not.toBeUndefined();
      expect(result1.mode).toBe(api.QueryResultMode.Single);
      expect((result1 as api.QuerySingleResult).value).toBe(1);
      controller.abort();
    });
  });
  describe("formats", () => {
    describe("proto", () => {
      test("rejects invalid formats", () => {
        expect(() => cli.encodeProtoResponse("invalid" as any, sampleEmptyResponse)).toThrow();
      });
      describe("JSON", () => {
        test("empty", () => {
          expect(() => cli.encodeProtoResponse(cli.CliOutputFormat.JSON, sampleEmptyResponse)).not.toThrow();
          expect(cli.encodeProtoResponse(cli.CliOutputFormat.JSON, sampleEmptyResponse)).toBeObject();
          expect(cli.encodeProtoResponse(cli.CliOutputFormat.JSON, sampleEmptyResponse)).not.toBeEmpty();
        });
        test("single", () => {
          expect(() => cli.encodeProtoResponse(cli.CliOutputFormat.JSON, sampleSingleResponse)).not.toThrow();
          expect(cli.encodeProtoResponse(cli.CliOutputFormat.JSON, sampleSingleResponse)).toBeObject();
          expect(cli.encodeProtoResponse(cli.CliOutputFormat.JSON, sampleSingleResponse)).not.toBeEmpty();
        });
        test("rows", () => {
          expect(() => cli.encodeProtoResponse(cli.CliOutputFormat.JSON, sampleRowsResponse)).not.toThrow();
          expect(cli.encodeProtoResponse(cli.CliOutputFormat.JSON, sampleRowsResponse)).toBeObject();
          expect(cli.encodeProtoResponse(cli.CliOutputFormat.JSON, sampleRowsResponse)).not.toBeEmpty();
        });
      });
      describe("BINARY", () => {
        test("empty", () => {
          expect(() => cli.encodeProtoResponse(cli.CliOutputFormat.BINARY, sampleEmptyResponse)).not.toThrow();
          expect(cli.encodeProtoResponse(cli.CliOutputFormat.BINARY, sampleEmptyResponse)).toBeObject();
          expect(cli.encodeProtoResponse(cli.CliOutputFormat.BINARY, sampleEmptyResponse)).not.toBeEmpty();
        });
        test("single", () => {
          expect(() => cli.encodeProtoResponse(cli.CliOutputFormat.BINARY, sampleSingleResponse)).not.toThrow();
          expect(cli.encodeProtoResponse(cli.CliOutputFormat.BINARY, sampleSingleResponse)).toBeObject();
          expect(cli.encodeProtoResponse(cli.CliOutputFormat.BINARY, sampleSingleResponse)).not.toBeEmpty();
        });
        test("rows", () => {
          expect(() => cli.encodeProtoResponse(cli.CliOutputFormat.BINARY, sampleRowsResponse)).not.toThrow();
          expect(cli.encodeProtoResponse(cli.CliOutputFormat.BINARY, sampleRowsResponse)).toBeObject();
          expect(cli.encodeProtoResponse(cli.CliOutputFormat.BINARY, sampleRowsResponse)).not.toBeEmpty();
        });
      });
    });
    describe("javascript types", () => {
      test("rejects invalid formats", () => {
        expect(() => cli.encodeQueryResponse("invalid" as any, sampleEmptyResponse, sampleEmptyResult)).toThrow();
      });
      describe("JSON", () => {
        test("empty", () => {
          expect(() =>
            cli.encodeQueryResponse(cli.CliOutputFormat.JSON, sampleEmptyResponse, sampleEmptyResult),
          ).not.toThrow();
          expect(
            cli.encodeQueryResponse(cli.CliOutputFormat.JSON, sampleEmptyResponse, sampleEmptyResult),
          ).toBeString();
          expect(
            cli.encodeQueryResponse(cli.CliOutputFormat.JSON, sampleEmptyResponse, sampleEmptyResult),
          ).not.toBeEmpty();
        });
        test("single", () => {
          expect(() =>
            cli.encodeQueryResponse(cli.CliOutputFormat.JSON, sampleSingleResponse, sampleSingleResult),
          ).not.toThrow();
          expect(
            cli.encodeQueryResponse(cli.CliOutputFormat.JSON, sampleSingleResponse, sampleSingleResult),
          ).toBeString();
          expect(
            cli.encodeQueryResponse(cli.CliOutputFormat.JSON, sampleSingleResponse, sampleSingleResult),
          ).not.toBeEmpty();
        });
        test("rows", () => {
          expect(() =>
            cli.encodeQueryResponse(cli.CliOutputFormat.JSON, sampleRowsResponse, sampleRowsResult),
          ).not.toThrow();
          expect(cli.encodeQueryResponse(cli.CliOutputFormat.JSON, sampleRowsResponse, sampleRowsResult)).toBeString();
          expect(
            cli.encodeQueryResponse(cli.CliOutputFormat.JSON, sampleRowsResponse, sampleRowsResult),
          ).not.toBeEmpty();
        });
      });
      describe("BINARY", () => {
        test("empty", () => {
          expect(() =>
            cli.encodeQueryResponse(cli.CliOutputFormat.BINARY, sampleEmptyResponse, sampleEmptyResult),
          ).not.toThrow();
          expect(
            cli.encodeQueryResponse(cli.CliOutputFormat.BINARY, sampleEmptyResponse, sampleEmptyResult),
          ).toBeString();
          expect(
            cli.encodeQueryResponse(cli.CliOutputFormat.BINARY, sampleEmptyResponse, sampleEmptyResult),
          ).not.toBeEmpty();
        });
        test("single", () => {
          expect(() =>
            cli.encodeQueryResponse(cli.CliOutputFormat.BINARY, sampleSingleResponse, sampleSingleResult),
          ).not.toThrow();
          expect(
            cli.encodeQueryResponse(cli.CliOutputFormat.BINARY, sampleSingleResponse, sampleSingleResult),
          ).toBeString();
          expect(
            cli.encodeQueryResponse(cli.CliOutputFormat.BINARY, sampleSingleResponse, sampleSingleResult),
          ).not.toBeEmpty();
        });
        test("rows", () => {
          expect(() =>
            cli.encodeQueryResponse(cli.CliOutputFormat.BINARY, sampleRowsResponse, sampleRowsResult),
          ).not.toThrow();
          expect(
            cli.encodeQueryResponse(cli.CliOutputFormat.BINARY, sampleRowsResponse, sampleRowsResult),
          ).toBeString();
          expect(
            cli.encodeQueryResponse(cli.CliOutputFormat.BINARY, sampleRowsResponse, sampleRowsResult),
          ).not.toBeEmpty();
        });
      });
    });
  });
  describe("output", () => {
    describe("JSON", () => {
      test("emits output to stderr by default", () => {
        const actions = {
          fileWriter: mock(),
          stdoutWriter: mock(),
          stderrWriter: mock(),
        };
        cli.outputForCommand(cli.CliOutputFormat.JSON, {}, "test", actions as any);
        expect(actions.fileWriter).not.toHaveBeenCalled();
        expect(actions.stdoutWriter).not.toHaveBeenCalledTimes(1);
        expect(actions.stderrWriter).toHaveBeenCalled();
      });
      test("emits output to file if instructed", () => {
        const actions = {
          fileWriter: mock(),
          stdoutWriter: mock(),
          stderrWriter: mock(),
        };
        cli.outputForCommand(cli.CliOutputFormat.JSON, { out: "test.json" }, "test", actions as any);
        expect(actions.fileWriter).toHaveBeenCalledTimes(1);
        expect(actions.stdoutWriter).not.toHaveBeenCalled();
        expect(actions.stderrWriter).not.toHaveBeenCalled();
      });
      test("emits output to stdout if instructed", () => {
        const actions = {
          fileWriter: mock(),
          stdoutWriter: mock(),
          stderrWriter: mock(),
        };
        cli.outputForCommand(cli.CliOutputFormat.JSON, { out: "-" }, "test", actions as any);
        expect(actions.fileWriter).not.toHaveBeenCalledTimes(1);
        expect(actions.stdoutWriter).toHaveBeenCalled();
        expect(actions.stderrWriter).not.toHaveBeenCalled();
      });
    });
    describe("BINARY", () => {
      test("emits output to stderr by default", () => {
        const actions = {
          fileWriter: mock(),
          stdoutWriter: mock(),
          stderrWriter: mock(),
        };
        cli.outputForCommand(cli.CliOutputFormat.BINARY, {}, "test", actions as any);
        expect(actions.fileWriter).not.toHaveBeenCalled();
        expect(actions.stdoutWriter).not.toHaveBeenCalledTimes(1);
        expect(actions.stderrWriter).toHaveBeenCalled();
      });
      test("emits output to file if instructed", () => {
        const actions = {
          fileWriter: mock(),
          stdoutWriter: mock(),
          stderrWriter: mock(),
        };
        cli.outputForCommand(cli.CliOutputFormat.BINARY, { out: "test.bin" }, "test", actions as any);
        expect(actions.fileWriter).toHaveBeenCalledTimes(1);
        expect(actions.stdoutWriter).not.toHaveBeenCalled();
        expect(actions.stderrWriter).not.toHaveBeenCalled();
      });
      test("emits output to stdout if instructed", () => {
        const actions = {
          fileWriter: mock(),
          stdoutWriter: mock(),
          stderrWriter: mock(),
        };
        cli.outputForCommand(cli.CliOutputFormat.BINARY, { out: "-" }, "test", actions as any);
        expect(actions.fileWriter).not.toHaveBeenCalledTimes(1);
        expect(actions.stdoutWriter).toHaveBeenCalled();
        expect(actions.stderrWriter).not.toHaveBeenCalled();
      });
    });
  });
  describe("utils", () => {
    test("labels for query types", () => {
      expect(cli.labelForMode(api.QueryResultMode.Empty)).toBe("empty");
      expect(cli.labelForMode(api.QueryResultMode.Mutation)).toBe("mutation");
      expect(cli.labelForMode(api.QueryResultMode.Error)).toBe("error");
      expect(cli.labelForMode(api.QueryResultMode.Rows)).toBe("rows");
      expect(cli.labelForMode(api.QueryResultMode.Single)).toBe("single");
      expect(cli.labelForMode("other")).toBe("unknown");
    });
    test("data for query types", () => {
      expect(cli.dataForMode(api.QueryResultMode.Empty, {})).toEqual({});
      expect(cli.dataForMode(api.QueryResultMode.Mutation, { count: 42 })).toEqual({ count: 42 });
      expect(
        cli.dataForMode(api.QueryResultMode.Error, {
          error: "oops",
          code: "42",
        }),
      ).toEqual({
        error: "oops",
        code: "42",
      });
      expect(cli.dataForMode(api.QueryResultMode.Rows, { tables: [], rows: [] })).toEqual({ tables: [], rows: [] });
      expect(cli.dataForMode(api.QueryResultMode.Single, { value: 42 })).toEqual({ value: 42 });
      expect(() => cli.dataForMode("other", {})).toThrow();
    });
  });
});
