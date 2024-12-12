import { Database, type Statement } from "bun:sqlite";
import assert from "node:assert";
import { create } from "@bufbuild/protobuf";
import { Code, ConnectError, type ConnectRouter, type HandlerContext } from "@connectrpc/connect";
import pkg from "../package.json";

import {
  type AnyQueryResult,
  type CommonDriverOptions,
  type DatabaseDriver,
  GenericQueryObserver,
  type QueryEmptyResult,
  type QueryErrorResult,
  type QueryMutationResult,
  type QueryResult,
  QueryResultMode,
  type QueryRowsResult,
  type QuerySingleResult,
} from "@/api.mts";

import * as api from "@/api.mts";
import * as sql from "@/sql.mts";

import {
  AttachedDatabaseSchema,
  ColumnPrimitiveType,
  type ConnectionToken,
  ConnectionTokenSchema,
  DatabaseColumnSchema,
  type DatabaseConnectRequest,
  DatabaseConnectResponseSchema,
  type DatabaseConnection,
  DatabaseIdentifierSchema,
  type DatabaseListRequest,
  DatabaseListResponseSchema,
  type DatabaseListenEvent,
  DatabaseListenEventSchema,
  type DatabaseListenRequest,
  DatabaseMutationResultSchema,
  type DatabaseQuery,
  type DatabaseQueryRequest,
  type DatabaseQueryResponse,
  DatabaseQueryResponseSchema,
  DatabaseResultSchema,
  DatabaseResultSetSchema,
  type DatabaseRow,
  DatabaseSchema,
  DatabaseService,
  type DatabaseTable,
  DatabaseTableSchema,
  type DatabaseTablesRequest,
  DatabaseTablesResponseSchema,
  type DatabaseValue,
  DatabaseValueResultSchema,
  DatabaseValueSchema,
  ResultSetMetadataSchema,
} from "@genstack.js/protocol/model/api/v1/db";

import { type ColumnSpec, createTableInfo, decodeCell } from "./util.mts";

function setupBunDb(_db: Database) {
  // Nothing to do at this time.
}

type ManagedDatabase = {
  id: number;
  db: Database;
};

type ManagedConnection = {
  id: number;
  db: number;
  active: boolean;
};

/**
 * Render a database connection spec string from a database "name".
 *
 * @param name Name provided by the client
 * @return Database connection string spec
 */
export function specFromName(name: string): string {
  // TODO: other names, name mapping mechanism
  if (name !== "default") {
    throw new ConnectError("Please use 'default' as the database name", Code.InvalidArgument);
  }
  return ":memory:";
}

/**
 * Compile a SQL statement from a query string.
 *
 * @param db Database connection
 * @param query Query string
 * @return Compiled statement
 * @throws ConnectError if the query is invalid
 */
export function compileStatement(db: Database, query: string): Statement {
  try {
    return db.prepare(query);
  } catch (err) {
    throw new ConnectError("Invalid or unsupported query", Code.InvalidArgument);
  }
}

/**
 * Decode a cell value from a query result into a `DatabaseValue` wrapper.
 *
 * @param singleInfo Query result info
 * @return Database value
 */
export function databaseValueForCell(value: any, column?: ColumnSpec): DatabaseValue {
  // default: create a wrapping protobuf `Value` for this cell
  return create(DatabaseValueSchema, {
    data: {
      case: "value",
      value: decodeCell(column || { index: 0 }, value),
    },
  });
}

/**
 * Build a query result into a response object.
 *
 * @param result Generic query result
 * @returns Concrete query response
 */
export function buildQueryResponse(result: QueryResult): DatabaseQueryResponse {
  // TODO: implement
  switch (result.mode) {
    case QueryResultMode.Empty:
      return create(DatabaseQueryResponseSchema, {
        result: create(DatabaseResultSchema, {
          ok: true,
          result: {
            case: "empty",
            value: true,
          },
        }),
      });

    case QueryResultMode.Error: {
      const errInfo = result as QueryErrorResult;
      throw new ConnectError(`Query failed: [code=${errInfo.code || "none"}] ${errInfo.error || "no message"}`);
    }

    case QueryResultMode.Mutation: {
      const mutInfo = result as QueryMutationResult;
      return create(DatabaseQueryResponseSchema, {
        result: create(DatabaseResultSchema, {
          ok: true,
          result: {
            case: "mutation",
            value: create(DatabaseMutationResultSchema, {
              result: {
                case: "rowsModified",
                value: BigInt(mutInfo.count),
              },
            }),
          },
        }),
      });
    }

    case QueryResultMode.Single: {
      const singleInfo = result as QuerySingleResult;
      return create(DatabaseQueryResponseSchema, {
        result: create(DatabaseResultSchema, {
          ok: true,
          result: {
            case: "single",
            value: create(DatabaseValueResultSchema, {
              value: databaseValueForCell(singleInfo.value, { index: 0 }),
            }),
          },
        }),
      });
    }

    case QueryResultMode.Rows: {
      const rowsInfo = result as QueryRowsResult;
      return create(DatabaseQueryResponseSchema, {
        result: create(DatabaseResultSchema, {
          ok: true,
          result: {
            case: "resultset",
            value: create(DatabaseResultSetSchema, {
              table: rowsInfo.tables,
              metadata: create(ResultSetMetadataSchema, {
                // nothing at this time
              }),
              row: rowsInfo.rows,
            }),
          },
        }),
      });
    }
  }
}

/**
 * Implements a query result observer for Bun's SQLite layer.
 */
export class BunQueryObserver extends GenericQueryObserver {
  constructor(
    private readonly db: Database,
    private readonly query: DatabaseQuery,
  ) {
    super();
  }

  async apply(): Promise<AnyQueryResult> {
    const queryStr = this.query.spec?.value;
    if (!queryStr || !(typeof queryStr === "string")) {
      throw new ConnectError("Invalid query", Code.InvalidArgument);
    }
    const rows: DatabaseRow[] = [];
    let err: Error | null = null;
    let result: AnyQueryResult | null = null;

    try {
      // 1.1: in this case `query.statement` means we do not expect a response, so we can safely fire this query
      // with `exec`, and wait for an error or completion.
      if (this.query.statement) {
        const changes = this.db.exec(queryStr);
        if (changes.changes) {
          // there was a count of mutated changes
          result = {
            mode: QueryResultMode.Mutation,
            count: changes.changes,
          } satisfies QueryMutationResult;
        } else {
          // no changes, so we have an empty statement result
          result = {
            mode: QueryResultMode.Empty,
          } satisfies QueryEmptyResult;
        }
      } else {
        // 1.2: otherwise, we need to execute the query with the soft expectation that it may return row results.
        // note that an empty result is still valid here, as is a single primitive value. a mutation value cannot
        // be yielded within this branch legally.
        const stmt = compileStatement(this.db, queryStr);
        const data = stmt.all();
        const columns = stmt.columnNames;
        let isSingleResult = false;

        // @TODO: support for table names
        const columnSpecs = columns.map((name, index) => ({ name, index }));
        const tableInfo = createTableInfo(1, null, columnSpecs);

        // 1.3: special case for a single result. if the column length is 1, and the row length is 1, and the row
        // present only has one property matching the column name, then we can assume this is a single result.
        if (columns.length === 1 && data.length === 1) {
          const row: { [key: string]: any } = data[0] as object;
          assert(typeof row === "object");
          const keys = Object.keys(row);
          if (keys.length === 1 && keys[0] === columns[0]) {
            const value = row[keys[0]];

            // note: `null` is a valid value here
            if (value !== undefined) {
              isSingleResult = true;
              result = {
                mode: QueryResultMode.Single,
                value,
              } satisfies QuerySingleResult;
            }
          }
        }

        // 1.4: if we haven't detected a single result, we need to decode it as a multi-row result.
        if (!isSingleResult) {
          // for each row, decode it into a structured row descriptor. errors within the loop are fatal.
          for (let i = 0; i < data.length; i++) {
            try {
              const row = data[i];
              const decoded = this.decode(tableInfo.identity, columnSpecs, i, row);
              rows.push(decoded);

              // dispatch: on-row callbacks
              for (const cbk of this.onRowCbks) {
                cbk(decoded);
              }
            } catch (e) {
              throw new ConnectError("Failed to decode row", Code.Internal);
            }
          }

          // we have a multi-row result
          result = {
            mode: QueryResultMode.Rows,
            tables: [tableInfo],
            rows,
          } satisfies QueryRowsResult;
        }
      }
    } catch (e) {
      if (e && e instanceof ConnectError) {
        err = e;
      } else if (e && e instanceof Error) {
        err = e;
      } else {
        err = new ConnectError(e ? e.toString() : "Query failed for unknown reasons", Code.Internal);
      }

      // dispatch: on-end callbacks
      for (const cbk of this.onErrorCbks) {
        cbk(err);
      }
      return {
        mode: QueryResultMode.Error,
        error: err.message || err.toString(),
        code: err instanceof ConnectError ? err.code.toString() : "internal",
      } satisfies QueryErrorResult;
    }

    if (!result) {
      throw new ConnectError("Query failed with no result", Code.Internal);
    }

    // dispatch: on-end callbacks
    for (const cbk of this.onEndCbks) {
      cbk(result);
    }
    return result;
  }
}

/**
 * Options for the Bun database driver.
 */
export type BunDriverOptions = CommonDriverOptions & {};

/**
 * Default options for the Bun database driver.
 */
const defaultBunDriverOptions: BunDriverOptions = {
  debugLogging: false,
};

// Bind an async generator for query responses.
function bindListenerFactory(
  factory: (req: DatabaseListenRequest, ctx: HandlerContext) => Generator<DatabaseListenEvent, void, unknown>,
) {
  return async function* (req: DatabaseListenRequest, ctx: HandlerContext) {
    yield* factory(req, ctx);
  };
}

/**
 * Wrap a connection ID as a connection token.
 *
 * @param token Token value to wrap.
 * @returns Wrapped value.
 */
function connectionToken(token: number): ConnectionToken {
  return create(ConnectionTokenSchema, {
    token: BigInt(token),
  });
}

/**
 * Interpret a column type string from SQLite as a primitive column type.
 *
 * @param type Column type string to convert.
 * @return Primitive column type.
 */
export function columnTypeToPrimitive(type: string): ColumnPrimitiveType {
  switch (type) {
    case "TEXT":
      return ColumnPrimitiveType.TEXT;
    case "INTEGER":
      return ColumnPrimitiveType.INTEGER;
    case "REAL":
      return ColumnPrimitiveType.REAL;
    case "BLOB":
      return ColumnPrimitiveType.BLOB;
    default:
      throw new ConnectError(`Unsupported column type: ${type}`, Code.InvalidArgument);
  }
}

/**
 * ## Bun Database Driver
 *
 * Implements a `DatabaseDriver` backed by Bun's built-in SQLite functionality.
 */
export default class BunDatabaseDriver implements DatabaseDriver {
  private nextDbId = 1;
  private nextConnectionId = 1;
  private readonly databasesBySpec: Record<string, ManagedDatabase> = {};
  private readonly activeDatabases: Record<number, ManagedDatabase> = {};
  private readonly activeConnections: Record<number, ManagedConnection> = {};

  // Private constructor; please use factory methods.
  private constructor(private readonly config: BunDriverOptions) {
    // no-op
  }

  /**
   * Create an instance of the Bun database driver with the provided options; if no options are provided,
   * the default options are used.
   *
   * Defaults are merged into the effective options before any provided options.
   *
   * @param options Additional options overrides
   * @return Bun database driver instance
   */
  static create(options?: Partial<BunDriverOptions>): BunDatabaseDriver {
    const effective: BunDriverOptions = {
      ...defaultBunDriverOptions,
      ...(options || {}),
    };
    return new BunDatabaseDriver(effective);
  }

  /**
   * Create an instance of the Bun database driver which uses defaults.
   *
   * @return Bun database driver instance
   */
  static defaults(): BunDatabaseDriver {
    return new BunDatabaseDriver(defaultBunDriverOptions);
  }

  /**
   * @returns Assigned driver options.
   */
  options() {
    return this.config;
  }

  /**
   * @returns Version of the Bun database driver.
   */
  version() {
    return pkg.version || "unknown";
  }

  /**
   * Emit debug logs; enabled when `debugLogging` is set in the driver options.
   *
   * @param msg Messages to emit.
   */
  #debugLog(...msg: any[]) {
    if (this.options().debugLogging) {
      console.log("[BunDatabaseDriver]", ...msg);
    }
  }

  /**
   * Create a new database instance based on the provided connection string.
   *
   * @param spec Connection string.
   * @returns Spawned database.
   */
  #spawn(spec: string): ManagedDatabase {
    const db = new Database(spec);
    setupBunDb(db);
    const id = this.nextDbId++;
    const managed = {
      id,
      db,
    };
    this.databasesBySpec[spec] = managed;
    this.activeDatabases[id] = managed;
    return managed;
  }

  /**
   * Connect to an underlying database using the specified connection string.
   *
   * @param spec Connection spec string.
   * @returns Managed connection.
   */
  #connect(spec: string): ManagedConnection {
    let resolved: ManagedDatabase;
    if (!this.databasesBySpec[spec]) {
      resolved = this.#spawn(spec);
    } else {
      resolved = this.databasesBySpec[spec];
    }
    const id = this.nextConnectionId++;
    const conn: ManagedConnection = {
      id,
      db: resolved.id,
      active: true,
    };
    this.activeConnections[id] = conn;
    return conn;
  }

  /**
   * Resolve an available connection given a connection spec string; if no connection is available, `null` is returned.
   *
   * @param spec Connection string spec to resolve a connection for.
   * @returns Resolved connection, or `null` if none could be located.
   */
  #availableConnection(spec: string): ManagedConnection | null {
    const db = this.databasesBySpec[spec];
    if (!db) {
      return null;
    }
    for (const id in this.activeConnections) {
      const conn = this.activeConnections[id];
      if (conn.db === db.id) {
        return conn;
      }
    }
    return null;
  }

  /**
   * Validates the specified connection ID.
   *
   * This method checks if a connection with the given ID exists and is active.
   * If the connection does not exist or is inactive, it logs an error message
   * (if debug logging is enabled) and returns false. Otherwise, it returns true.
   *
   * @param id The ID of the connection to validate.
   * @returns A boolean indicating whether the connection is valid and active.
   */
  #validateConnection(id: number): boolean {
    const conn = this.activeConnections[id];
    if (!conn) {
      if (this.options().debugLogging) {
        console.error(`Connection ${id} not found`);
      }
      return false;
    }
    if (!conn.active) {
      if (this.options().debugLogging) {
        console.error(`Connection ${id} is inactive`);
      }
      return false;
    }
    return conn.active;
  }

  /**
   * Listen for changes to the results from a specified query; this method is equipped for end-to-end
   * streaming of changes back to an invoking client.
   *
   * @param req Request to establish a listener.
   * @param ctx Operating handler context for the listener.
   * @yields Database listener events, until cancelled.
   */
  *#listenQuery(_req: DatabaseListenRequest, _ctx: HandlerContext) {
    yield create(DatabaseListenEventSchema, {});
    throw new ConnectError("Not implemented", Code.Unimplemented);
  }

  /**
   * Given a request which declares use of an existing connection, resolve the connection ID to an
   * active connection; if one cannot be resolved, throw.
   *
   * Database connections can be declared for a given query in multiple ways:
   *
   * - The request can reference a connection, which is assumed to exist, by a connection ID, which
   *   was previously obtained from the `databaseConnect` method. In this case, we must resolve the
   *   connection from internal state, failing if it is not active or missing.
   *
   * - The request can declare a fully qualified connection spec, which is used to lazily establish
   *   the connection on-demand. In this case, we must attempt to find an existing connection which
   *   remains in the `active` state; if none can be found, we must create one.
   *
   * If no database connection can be resolved (because a referenced connection was not found or
   * inactive, or a lazily-created connection could not be established), then a `ConnectError` is
   * thrown to the client.
   *
   * @param conn Connection request
   * @return Resolved connection
   * @throws ConnectError if the connection cannot be resolved
   */
  #resolveConnection(conn: DatabaseConnection): ManagedConnection {
    switch (conn.spec.case) {
      // `token`: the payload references an existing connection which we must resolve.
      case "token": {
        const id = conn.spec.value.token;
        if (!this.#validateConnection(Number(id))) {
          throw new ConnectError(`Connection ${id} is not valid`, Code.FailedPrecondition);
        }
        const resolved = this.activeConnections[Number(id)];
        if (!resolved) {
          throw new ConnectError(`Connection ${id} not found`, Code.NotFound);
        }
        if (!resolved.active) {
          throw new ConnectError(`Connection ${id} is inactive`, Code.FailedPrecondition);
        }
        return resolved;
      }

      // `connect`: the payload encloses a fully-qualified database connection string.
      case "connect": {
        const str = conn.spec.value.identifier.value;
        if (!str || typeof str !== "string") {
          throw new ConnectError("Invalid connection string", Code.InvalidArgument);
        }
        const spec = specFromName(str);
        const avail = this.#availableConnection(spec);
        if (avail) {
          return avail;
        }
        try {
          return this.#connect(spec);
        } catch (e) {
          throw new ConnectError(`Failed to connect to ${spec}: ${e}`, Code.FailedPrecondition);
        }
      }

      default:
        throw new ConnectError("Invalid connection spec", Code.InvalidArgument);
    }
  }

  /**
   * Execute a query by binding it to an observer; the result can be `recv`-ed to start the operation
   * and obtain a promise for a result.
   *
   * Usually, `recv` is implemented by calling `apply`, which is charged with collapsing a query to
   * results within the context of a given observer.
   *
   * @param conn Connection to use when executing this query.
   * @param query Query to execute.
   * @returns Query observer which computes responses and dispatches callbacks.
   */
  #execute(conn: ManagedConnection, query: DatabaseQuery): BunQueryObserver {
    // resolve the query string
    const str = query.spec?.value;
    if (!str || typeof str !== "string") {
      throw new ConnectError("Unsupported query type or missing query", Code.InvalidArgument);
    }

    // resolve the active database
    const db = this.activeDatabases[conn.db].db;
    if (!db || !conn.active) {
      throw new ConnectError("Invalid connection or connection failure", Code.FailedPrecondition);
    }

    // create statement from query
    return new BunQueryObserver(db, query);
  }

  /**
   * Implementation: sets up routing against a `ConnectRouter` instance.
   *
   * @param router Service router to configure.
   * @returns Configured service router.
   */
  setup(router: ConnectRouter) {
    return router.service(DatabaseService, {
      // impl: `DatabaseConnect(DatabaseConnectRequest) returns (DatabaseConnectResponse)`
      databaseConnect: async (req: DatabaseConnectRequest, _ctx: HandlerContext) => {
        // only a string spec is supported for now
        switch (req.identifier.case) {
          case "name": {
            const spec = specFromName(req.identifier.value);
            const conn = this.#connect(spec);
            const token = connectionToken(conn.id);
            this.#debugLog(`Connected to '${spec}' with token '${token.token}'`);
            return create(DatabaseConnectResponseSchema, {
              connection: token,
            });
          }
        }
        throw new ConnectError("Unsupported identifier type", Code.Unimplemented);
      },

      // impl: `DatabaseQuery(DatabaseQueryRequest) returns (DatabaseQueryResponse)`
      databaseQuery: async (req: DatabaseQueryRequest, _ctx: HandlerContext) => {
        const spec = req.connection;
        if (!spec) {
          throw new ConnectError("No connection specified", Code.InvalidArgument);
        }

        // resolve declared or enclosed connection
        const conn = this.#resolveConnection(spec);

        // execute query
        const query = req.query;
        if (!query) {
          throw new ConnectError("No query specified", Code.InvalidArgument);
        }

        // use connection to exec the query
        let err: ConnectError | null = null;
        let resp: DatabaseQueryResponse | null = null;

        await this.#execute(conn, query)
          .onRow((row) => {
            this.#debugLog(`Row: ${JSON.stringify(row)}`);
          })
          .onEnd((result) => {
            resp = buildQueryResponse(result);
          })
          .onError((e) => {
            if (this.options().debugLogging) {
              console.error("Query failed", e);
            }
            if (e instanceof ConnectError) {
              err = e;
            } else {
              err = new ConnectError(e.message || e.toString(), Code.Internal);
            }
          })
          .recv();

        if (err) {
          throw err;
        }
        if (!resp) {
          throw new ConnectError("Query failed with no response", Code.Internal);
        }
        return resp;
      },

      // impl: `DatabaseList(DatabaseListRequest) returns (DatabaseListResponse)`
      databaseList: async (req: DatabaseListRequest, _ctx: HandlerContext) => {
        const spec = req.connection;
        if (!spec) {
          throw new ConnectError("No connection specified", Code.InvalidArgument);
        }

        // resolve declared or enclosed connection
        this.#resolveConnection(spec);

        // TODO: this driver only supports the `default` database
        return create(DatabaseListResponseSchema, {
          database: [
            create(AttachedDatabaseSchema, {
              database: create(DatabaseSchema, {
                identifier: create(DatabaseIdentifierSchema, {
                  spec: {
                    case: "default",
                    value: true,
                  },
                }),
              }),
            }),
          ],
        });
      },

      // impl: `DatabaseTables(DatabaseTablesRequest) returns (DatabaseTablesResponse)`
      databaseTables: async (req: DatabaseTablesRequest, _ctx: HandlerContext) => {
        const spec = req.connection;
        if (!spec) {
          throw new ConnectError("No connection specified", Code.InvalidArgument);
        }

        // resolve declared or enclosed connection
        const conn = this.#resolveConnection(spec);
        const db = this.activeDatabases[conn.db].db;
        if (!db) {
          throw new ConnectError("Invalid connection or connection failure", Code.FailedPrecondition);
        }

        const tables: DatabaseTable[] = db
          .query("SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name")
          .all()
          .map(((tableRow: { name: string; sql: string }) => {
            const query = sql.parseQuery(tableRow.sql);
            assert(query.statements.length === 1);
            assert(query.statements[0].ast.type === "create");
            assert(query.statements[0].ast.keyword === "table");
            assert(Array.isArray(query.statements[0].ast.table));
            assert(query.statements[0].ast.table.length === 1);
            assert(query.statements[0].ast.table[0].table === tableRow.name);
            assert(Array.isArray(query.statements[0].ast.create_definitions));
            assert(query.statements[0].ast.create_definitions.length > 0);
            const columnDefinitions = query.statements[0].ast.create_definitions;
            const columns = columnDefinitions.map((column) => {
              assert(column.resource === "column");
              assert(column.column.type === "column_ref");
              const dataType = column.definition.dataType;
              const columnName = column.column.column as string;
              const primitiveType = columnTypeToPrimitive(dataType);

              return create(DatabaseColumnSchema, {
                name: columnName,
                type: {
                  case: "primitive",
                  value: primitiveType,
                },
              });
            });
            return create(DatabaseTableSchema, {
              name: tableRow.name,
              column: columns,
            });
          }) as any);

        return create(DatabaseTablesResponseSchema, {
          table: tables,
        });
      },

      // impl: `DatabaseListen(DatabaseListenRequest) returns (stream DatabaseListenResponse)`
      databaseListen: bindListenerFactory(this.#listenQuery),
    });
  }
}

export { BunDatabaseDriver, api, sql };
