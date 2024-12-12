import { DatabaseAccessLevel } from "@/api.mts";
import { Code, ConnectError } from "@connectrpc/connect";
import NodeSQLParser from "node-sql-parser";

// SQL parser singleton.
const parser = new NodeSQLParser.Parser();

/**
 * ## SQL Abstract Syntax Tree
 *
 * Type alias for the internal type used for SQL ASTs. Exposed for testing.
 */
export type SQLAst = NodeSQLParser.AST;

/**
 * ## Query Type
 *
 * Enumerates recognized types of SQL queries; the query's capabilities and requisite access
 * can be determined by the type of query.
 */
export enum QueryType {
  /**
   * Data Definition Language
   *
   * Refers to statements like `CREATE`, `ALTER`, `DROP`, etc.
   */
  DDL = 3,

  /**
   * Data Manipulation Language
   *
   * Refers to statements like `SELECT`, `INSERT`, `UPDATE`, `DELETE`, etc.
   */
  DML = 2,

  /**
   * Data Query Languag
   *
   * Refers to read statements only (i.e. `SELECT`).
   */
  DQL = 1,
}

/**
 * Default access level for queries.
 */
export const defaultAccess = DatabaseAccessLevel.ANONYMOUS;

/**
 * Describes inferred or parsed table info for a query.
 */
export type QueryTable = {
  db: string;
  name: string;
  alias: string;
};

/**
 * Describes a single statement parsed from a (potentially compound) SQL query.
 */
export type QueryStatement = {
  type: QueryType;
  sql: string;
  ast: SQLAst;
};

/**
 * Describes top-level discrete query information, across all statements within a query.
 */
export type QueryInfo = {
  /**
   * One or more statements declared within this query.
   */
  statements: QueryStatement[];
};

// Intermediate type used during query processing.
export type SQLQueryIntermediate = {
  sql: string;
  ast: SQLAst;
};

// Infer the query's type based on its AST.
export function inferQueryType(sql: SQLQueryIntermediate): QueryType {
  switch (sql.ast.type) {
    case "select":
      return QueryType.DQL;
    case "insert":
    case "update":
    case "delete":
      return QueryType.DML;
    case "create":
    case "alter":
    case "drop":
      return QueryType.DDL;
    default:
      throw new Error(`Unknown query type: ${sql.ast.type}`);
  }
}

// Options to apply when manipulating SQL AST.
const dbOptions: NodeSQLParser.Option = {
  database: "sqlite",
};

/**
 * Parse a SQL query to an abstract syntax tree which can be interrogated for validation
 * and data protections.
 *
 * @param sql The SQL query to parse
 * @returns The abstract syntax tree
 */
export function parseSqlToAst(sql: string): SQLAst | SQLAst[] {
  return parser.astify(sql, dbOptions);
}

/**
 * Given a parsed SQL AST, format the tree back into compliant SQL.
 *
 * @param ast The abstract syntax tree
 * @returns The SQL query
 */
export function formatToSqlFromAst(ast: SQLAst): string {
  return parser.sqlify(ast, dbOptions);
}

/**
 * Parse a `query` string into structural AST information; multiple statements are
 * supported within a query string.
 *
 * @param query Query to parse.
 * @returns Parsed and inferred query info.
 */
export function parseQuery(query: string): QueryInfo {
  let parsed: SQLAst | SQLAst[];
  try {
    parsed = parseSqlToAst(query);
  } catch (e) {
    throw new Error(`Failed to parse query: ${e}`);
  }

  // normalize array
  if (!Array.isArray(parsed)) {
    parsed = [parsed];
  }

  // parse and infer from all statements
  const stmt = [];
  for (const ast of parsed) {
    const sql = formatToSqlFromAst(ast);
    const type = inferQueryType({ ast, sql });
    stmt.push({
      type,
      sql,
      ast,
    });
  }

  return {
    statements: Array.isArray(stmt) ? stmt : [stmt],
  };
}

/**
 * Resolves the requisite access level for a given query type.
 *
 * @param type The query type to resolve access for.
 * @returns The requisite access level for the query type.
 */
export function requisiteAccessForQueryType(type: QueryType): DatabaseAccessLevel {
  switch (type) {
    case QueryType.DDL:
      return DatabaseAccessLevel.ADMIN;
    case QueryType.DML:
      return DatabaseAccessLevel.READ_WRITE;
    case QueryType.DQL:
      return DatabaseAccessLevel.READ_ONLY;
  }
}

/**
 * Calculates the access level needed to execute all statements within a query.
 *
 * @param query Query info which was parsed.
 * @return The access level required for the query.
 */
export function maximalAccessLevel(query: QueryInfo): DatabaseAccessLevel {
  return Math.max(...query.statements.map((stmt) => requisiteAccessForQueryType(stmt.type)));
}

/**
 * Checks whether a given query can be executed at a given access level.
 *
 * @param query The query to check.
 * @param level The access level to check against.
 * @returns Whether the query can be executed at the given access level.
 */
export function checkQueryAccess(query: QueryInfo, level: DatabaseAccessLevel): boolean {
  return maximalAccessLevel(query) <= level;
}

/**
 * Parse and validate a query string, ensuring that it can be executed at the given
 * access level.
 *
 * If access is denied, an error is thrown.
 *
 * @param query Query string to parse.
 * @return Parsed and validated query info.
 */
export function parseCheckQuery(query: string, level: DatabaseAccessLevel = defaultAccess): QueryInfo {
  const parsed = parseQuery(query);
  if (!checkQueryAccess(parsed, level)) {
    throw new ConnectError("Access denied for query type", Code.PermissionDenied);
  }
  return parsed;
}
