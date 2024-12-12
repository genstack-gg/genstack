import { describe, expect, test } from "bun:test";
import * as api from "../src/api.mjs";
import * as sql from "../src/sql.mjs";

describe("sql parser", () => {
  test("throws for invalid queries", () => {
    expect(() => sql.parseQuery("SELECT * FROM x WHERE a = 1 AND")).toThrow();
    expect(() => sql.parseQuery("bunk")).toThrow();
    expect(() => sql.parseQuery("SELECT * FROM x WHERE a = 1; SELECT")).toThrow();
    expect(() => sql.parseQuery(";")).toThrow();
  });
  describe("`SELECT`", () => {
    test("can parse static SELECT 1", () => {
      const parsed = sql.parseQuery("SELECT 1");
      expect(parsed).not.toBeUndefined();
      expect(parsed).toBeObject();
      expect(parsed.statements).toBeArrayOfSize(1);
      expect(parsed.statements[0].sql).toBe("SELECT 1");
      expect(parsed.statements[0].type).toBe(sql.QueryType.DQL);
      expect(parsed.statements[0].ast.type).toBe("select");
    });
    test("can parse SELECT ...", () => {
      const parsed = sql.parseQuery("SELECT a, b, c FROM x");
      expect(parsed).not.toBeUndefined();
      expect(parsed).toBeObject();
      expect(parsed.statements).toBeObject();
      const stmt = parsed.statements[0];
      expect(stmt).toBeObject();
      expect(stmt.type).toBe(sql.QueryType.DQL);
      expect(stmt.sql).toBe('SELECT "a", "b", "c" FROM "x"');
      expect(parsed.statements[0].ast.type).toBe("select");
    });
  });
  describe("`INSERT`", () => {
    test("can parse INSERT ...", () => {
      const parsed = sql.parseQuery("INSERT INTO x (a, b, c) VALUES (1, 2, 3)");
      expect(parsed).not.toBeUndefined();
      expect(parsed).toBeObject();
      expect(parsed.statements).toBeObject();
      const stmt = parsed.statements[0];
      expect(stmt).toBeObject();
      expect(stmt.type).toBe(sql.QueryType.DML);
      expect(stmt.sql).toBe('INSERT INTO "x" (a, b, c) VALUES (1,2,3)');
      expect(parsed.statements[0].ast.type).toBe("insert");
    });
  });
  describe("`UPDATE`", () => {
    test("can parse UPDATE ...", () => {
      const parsed = sql.parseQuery("UPDATE x SET a = 1, b = 2, c = 3");
      expect(parsed).not.toBeUndefined();
      expect(parsed).toBeObject();
      expect(parsed.statements).toBeObject();
      const stmt = parsed.statements[0];
      expect(stmt).toBeObject();
      expect(stmt.type).toBe(sql.QueryType.DML);
      expect(stmt.sql).toBe('UPDATE "x" SET "a" = 1, "b" = 2, "c" = 3');
      expect(parsed.statements[0].ast.type).toBe("update");
    });
  });
  describe("`CREATE TABLE`", () => {
    test("can parse CREATE TABLE ...", () => {
      const parsed = sql.parseQuery("CREATE TABLE x (a INT, b TEXT)");
      expect(parsed).not.toBeUndefined();
      expect(parsed).toBeObject();
      expect(parsed.statements).toBeObject();
      const stmt = parsed.statements[0];
      expect(stmt).toBeObject();
      expect(stmt.type).toBe(sql.QueryType.DDL);
      expect(stmt.sql).toBe('CREATE TABLE "x" ("a" INT, "b" TEXT)');
      expect(parsed.statements[0].ast.type).toBe("create");
    });
  });
  describe("`ALTER TABLE`", () => {
    test("can parse ALTER TABLE ...", () => {
      const parsed = sql.parseQuery("ALTER TABLE x ADD COLUMN c TEXT");
      expect(parsed).not.toBeUndefined();
      expect(parsed).toBeObject();
      expect(parsed.statements).toBeObject();
      const stmt = parsed.statements[0];
      expect(stmt).toBeObject();
      expect(stmt.type).toBe(sql.QueryType.DDL);
      expect(stmt.sql).toBe('ALTER TABLE "x" ADD COLUMN "c" TEXT');
      expect(parsed.statements[0].ast.type).toBe("alter");
    });
  });
  describe("`DROP TABLE`", () => {
    test("can parse DROP TABLE ...", () => {
      const parsed = sql.parseQuery("DROP TABLE x");
      expect(parsed).not.toBeUndefined();
      expect(parsed).toBeObject();
      expect(parsed.statements).toBeObject();
      const stmt = parsed.statements[0];
      expect(stmt).toBeObject();
      expect(stmt.type).toBe(sql.QueryType.DDL);
      expect(stmt.sql).toBe('DROP TABLE "x"');
      expect(parsed.statements[0].ast.type).toBe("drop");
    });
  });

  describe("access levels", () => {
    test("`SELECT ...` → DQL", () => {
      const parsed = sql.parseQuery("SELECT a, b, c FROM x");
      expect(parsed).not.toBeUndefined();
      expect(parsed).toBeObject();
      expect(parsed.statements).toBeObject();
      const stmt = parsed.statements[0];
      expect(stmt).toBeObject();
      expect(stmt.type).toBe(sql.QueryType.DQL);
    });
    test("`INSERT ...` → DML", () => {
      const parsed = sql.parseQuery("INSERT INTO x (a, b, c) VALUES (1, 2, 3)");
      expect(parsed).not.toBeUndefined();
      expect(parsed).toBeObject();
      expect(parsed.statements).toBeObject();
      const stmt = parsed.statements[0];
      expect(stmt).toBeObject();
      expect(stmt.type).toBe(sql.QueryType.DML);
    });
    test("`UPDATE ...` → DML", () => {
      const parsed = sql.parseQuery("UPDATE x SET a = 1, b = 2, c = 3");
      expect(parsed).not.toBeUndefined();
      expect(parsed).toBeObject();
      expect(parsed.statements).toBeObject();
      const stmt = parsed.statements[0];
      expect(stmt).toBeObject();
      expect(stmt.type).toBe(sql.QueryType.DML);
    });
    test("`DELETE ...` → DML", () => {
      const parsed = sql.parseQuery("DELETE FROM x WHERE a = 1");
      expect(parsed).not.toBeUndefined();
      expect(parsed).toBeObject();
      expect(parsed.statements).toBeObject();
      const stmt = parsed.statements[0];
      expect(stmt).toBeObject();
      expect(stmt.type).toBe(sql.QueryType.DML);
    });
    test("`CREATE TABLE ...` → DDL", () => {
      const parsed = sql.parseQuery("CREATE TABLE x (a INT, b TEXT)");
      expect(parsed).not.toBeUndefined();
      expect(parsed).toBeObject();
      expect(parsed.statements).toBeObject();
      const stmt = parsed.statements[0];
      expect(stmt).toBeObject();
      expect(stmt.type).toBe(sql.QueryType.DDL);
    });
    test("`ALTER TABLE ...` → DDL", () => {
      const parsed = sql.parseQuery("ALTER TABLE x ADD COLUMN c TEXT");
      expect(parsed).not.toBeUndefined();
      expect(parsed).toBeObject();
      expect(parsed.statements).toBeObject();
      const stmt = parsed.statements[0];
      expect(stmt).toBeObject();
      expect(stmt.type).toBe(sql.QueryType.DDL);
    });
    test("`DROP TABLE ...` → DDL", () => {
      const parsed = sql.parseQuery("DROP TABLE x");
      expect(parsed).not.toBeUndefined();
      expect(parsed).toBeObject();
      expect(parsed.statements).toBeObject();
      const stmt = parsed.statements[0];
      expect(stmt).toBeObject();
      expect(stmt.type).toBe(sql.QueryType.DDL);
    });
  });
  describe("access level checks", () => {
    test("`SELECT ...` → DQL → READ_ONLY", () => {
      const parsed = sql.parseQuery("SELECT a, b, c FROM x");
      expect(parsed).not.toBeUndefined();
      expect(parsed).toBeObject();
      expect(parsed.statements).toBeObject();
      const stmt = parsed.statements[0];
      expect(stmt).toBeObject();
      expect(stmt.type).toBe(sql.QueryType.DQL);
      const access = sql.requisiteAccessForQueryType(stmt.type);
      expect(access).toBe(api.DatabaseAccessLevel.READ_ONLY);
      expect(sql.checkQueryAccess(parsed, api.DatabaseAccessLevel.ANONYMOUS)).toBeFalse();
      expect(sql.checkQueryAccess(parsed, api.DatabaseAccessLevel.READ_ONLY)).toBeTrue();
      expect(sql.checkQueryAccess(parsed, api.DatabaseAccessLevel.READ_WRITE)).toBeTrue();
      expect(sql.checkQueryAccess(parsed, api.DatabaseAccessLevel.ADMIN)).toBeTrue();
      expect(() => sql.parseCheckQuery(stmt.sql, api.DatabaseAccessLevel.ANONYMOUS)).toThrow();
      expect(() => sql.parseCheckQuery(stmt.sql, api.DatabaseAccessLevel.READ_ONLY)).not.toThrow();
      expect(() => sql.parseCheckQuery(stmt.sql, api.DatabaseAccessLevel.READ_WRITE)).not.toThrow();
      expect(() => sql.parseCheckQuery(stmt.sql, api.DatabaseAccessLevel.ADMIN)).not.toThrow();
    });
    test("`INSERT ...` → DML → READ_WRITE", () => {
      const parsed = sql.parseQuery("INSERT INTO x (a, b, c) VALUES (1, 2, 3)");
      expect(parsed).not.toBeUndefined();
      expect(parsed).toBeObject();
      expect(parsed.statements).toBeObject();
      const stmt = parsed.statements[0];
      expect(stmt).toBeObject();
      expect(stmt.type).toBe(sql.QueryType.DML);
      const access = sql.requisiteAccessForQueryType(stmt.type);
      expect(access).toBe(api.DatabaseAccessLevel.READ_WRITE);
      expect(sql.checkQueryAccess(parsed, api.DatabaseAccessLevel.ANONYMOUS)).toBeFalse();
      expect(sql.checkQueryAccess(parsed, api.DatabaseAccessLevel.READ_ONLY)).toBeFalse();
      expect(sql.checkQueryAccess(parsed, api.DatabaseAccessLevel.READ_WRITE)).toBeTrue();
      expect(sql.checkQueryAccess(parsed, api.DatabaseAccessLevel.ADMIN)).toBeTrue();
      expect(() => sql.parseCheckQuery(stmt.sql, api.DatabaseAccessLevel.ANONYMOUS)).toThrow();
      expect(() => sql.parseCheckQuery(stmt.sql, api.DatabaseAccessLevel.READ_ONLY)).toThrow();
      expect(() => sql.parseCheckQuery(stmt.sql, api.DatabaseAccessLevel.READ_WRITE)).not.toThrow();
      expect(() => sql.parseCheckQuery(stmt.sql, api.DatabaseAccessLevel.ADMIN)).not.toThrow();
    });
    test("`UPDATE ...` → DML → READ_WRITE", () => {
      const parsed = sql.parseQuery("UPDATE x SET a = 1, b = 2, c = 3");
      expect(parsed).not.toBeUndefined();
      expect(parsed).toBeObject();
      expect(parsed.statements).toBeObject();
      const stmt = parsed.statements[0];
      expect(stmt).toBeObject();
      expect(stmt.type).toBe(sql.QueryType.DML);
      const access = sql.requisiteAccessForQueryType(stmt.type);
      expect(access).toBe(api.DatabaseAccessLevel.READ_WRITE);
      expect(sql.checkQueryAccess(parsed, api.DatabaseAccessLevel.ANONYMOUS)).toBeFalse();
      expect(sql.checkQueryAccess(parsed, api.DatabaseAccessLevel.READ_ONLY)).toBeFalse();
      expect(sql.checkQueryAccess(parsed, api.DatabaseAccessLevel.READ_WRITE)).toBeTrue();
      expect(sql.checkQueryAccess(parsed, api.DatabaseAccessLevel.ADMIN)).toBeTrue();
      expect(() => sql.parseCheckQuery(stmt.sql, api.DatabaseAccessLevel.ANONYMOUS)).toThrow();
      expect(() => sql.parseCheckQuery(stmt.sql, api.DatabaseAccessLevel.READ_ONLY)).toThrow();
      expect(() => sql.parseCheckQuery(stmt.sql, api.DatabaseAccessLevel.READ_WRITE)).not.toThrow();
      expect(() => sql.parseCheckQuery(stmt.sql, api.DatabaseAccessLevel.ADMIN)).not.toThrow();
    });
    test("`DELETE ...` → DML → READ_WRITE", () => {
      const parsed = sql.parseQuery("DELETE FROM x WHERE a = 1");
      expect(parsed).not.toBeUndefined();
      expect(parsed).toBeObject();
      expect(parsed.statements).toBeObject();
      const stmt = parsed.statements[0];
      expect(stmt).toBeObject();
      expect(stmt.type).toBe(sql.QueryType.DML);
      const access = sql.requisiteAccessForQueryType(stmt.type);
      expect(access).toBe(api.DatabaseAccessLevel.READ_WRITE);
      expect(sql.checkQueryAccess(parsed, api.DatabaseAccessLevel.ANONYMOUS)).toBeFalse();
      expect(sql.checkQueryAccess(parsed, api.DatabaseAccessLevel.READ_ONLY)).toBeFalse();
      expect(sql.checkQueryAccess(parsed, api.DatabaseAccessLevel.READ_WRITE)).toBeTrue();
      expect(sql.checkQueryAccess(parsed, api.DatabaseAccessLevel.ADMIN)).toBeTrue();
      expect(() => sql.parseCheckQuery(stmt.sql, api.DatabaseAccessLevel.ANONYMOUS)).toThrow();
      expect(() => sql.parseCheckQuery(stmt.sql, api.DatabaseAccessLevel.READ_ONLY)).toThrow();
      expect(() => sql.parseCheckQuery(stmt.sql, api.DatabaseAccessLevel.READ_WRITE)).not.toThrow();
      expect(() => sql.parseCheckQuery(stmt.sql, api.DatabaseAccessLevel.ADMIN)).not.toThrow();
    });
    test("`CREATE TABLE ...` → DDL → ADMIN", () => {
      const parsed = sql.parseQuery("CREATE TABLE x (a INT, b TEXT)");
      expect(parsed).not.toBeUndefined();
      expect(parsed).toBeObject();
      expect(parsed.statements).toBeObject();
      const stmt = parsed.statements[0];
      expect(stmt).toBeObject();
      expect(stmt.type).toBe(sql.QueryType.DDL);
      const access = sql.requisiteAccessForQueryType(stmt.type);
      expect(access).toBe(api.DatabaseAccessLevel.ADMIN);
      expect(sql.checkQueryAccess(parsed, api.DatabaseAccessLevel.ANONYMOUS)).toBeFalse();
      expect(sql.checkQueryAccess(parsed, api.DatabaseAccessLevel.READ_ONLY)).toBeFalse();
      expect(sql.checkQueryAccess(parsed, api.DatabaseAccessLevel.READ_WRITE)).toBeFalse();
      expect(sql.checkQueryAccess(parsed, api.DatabaseAccessLevel.ADMIN)).toBeTrue();
      expect(() => sql.parseCheckQuery(stmt.sql, api.DatabaseAccessLevel.ANONYMOUS)).toThrow();
      expect(() => sql.parseCheckQuery(stmt.sql, api.DatabaseAccessLevel.READ_ONLY)).toThrow();
      expect(() => sql.parseCheckQuery(stmt.sql, api.DatabaseAccessLevel.READ_WRITE)).toThrow();
      expect(() => sql.parseCheckQuery(stmt.sql, api.DatabaseAccessLevel.ADMIN)).not.toThrow();
    });
    test("`ALTER TABLE ...` → DDL → ADMIN", () => {
      const parsed = sql.parseQuery("ALTER TABLE x ADD COLUMN c TEXT");
      expect(parsed).not.toBeUndefined();
      expect(parsed).toBeObject();
      expect(parsed.statements).toBeObject();
      const stmt = parsed.statements[0];
      expect(stmt).toBeObject();
      expect(stmt.type).toBe(sql.QueryType.DDL);
      const access = sql.requisiteAccessForQueryType(stmt.type);
      expect(access).toBe(api.DatabaseAccessLevel.ADMIN);
      expect(sql.checkQueryAccess(parsed, api.DatabaseAccessLevel.ANONYMOUS)).toBeFalse();
      expect(sql.checkQueryAccess(parsed, api.DatabaseAccessLevel.READ_ONLY)).toBeFalse();
      expect(sql.checkQueryAccess(parsed, api.DatabaseAccessLevel.READ_WRITE)).toBeFalse();
      expect(sql.checkQueryAccess(parsed, api.DatabaseAccessLevel.ADMIN)).toBeTrue();
      expect(() => sql.parseCheckQuery(stmt.sql, api.DatabaseAccessLevel.ANONYMOUS)).toThrow();
      expect(() => sql.parseCheckQuery(stmt.sql, api.DatabaseAccessLevel.READ_ONLY)).toThrow();
      expect(() => sql.parseCheckQuery(stmt.sql, api.DatabaseAccessLevel.READ_WRITE)).toThrow();
      expect(() => sql.parseCheckQuery(stmt.sql, api.DatabaseAccessLevel.ADMIN)).not.toThrow();
    });
    test("`DROP TABLE ...` → DDL → ADMIN", () => {
      const parsed = sql.parseQuery("DROP TABLE x");
      expect(parsed).not.toBeUndefined();
      expect(parsed).toBeObject();
      expect(parsed.statements).toBeObject();
      const stmt = parsed.statements[0];
      expect(stmt).toBeObject();
      expect(stmt.type).toBe(sql.QueryType.DDL);
      const access = sql.requisiteAccessForQueryType(stmt.type);
      expect(access).toBe(api.DatabaseAccessLevel.ADMIN);
      expect(sql.checkQueryAccess(parsed, api.DatabaseAccessLevel.ANONYMOUS)).toBeFalse();
      expect(sql.checkQueryAccess(parsed, api.DatabaseAccessLevel.READ_ONLY)).toBeFalse();
      expect(sql.checkQueryAccess(parsed, api.DatabaseAccessLevel.READ_WRITE)).toBeFalse();
      expect(sql.checkQueryAccess(parsed, api.DatabaseAccessLevel.ADMIN)).toBeTrue();
      expect(() => sql.parseCheckQuery(stmt.sql, api.DatabaseAccessLevel.ANONYMOUS)).toThrow();
      expect(() => sql.parseCheckQuery(stmt.sql, api.DatabaseAccessLevel.READ_ONLY)).toThrow();
      expect(() => sql.parseCheckQuery(stmt.sql, api.DatabaseAccessLevel.READ_WRITE)).toThrow();
      expect(() => sql.parseCheckQuery(stmt.sql, api.DatabaseAccessLevel.ADMIN)).not.toThrow();
    });
  });
});
