import { describe, expect, test } from "bun:test";
import * as api from "../src/api.mjs";
import BunDatabaseDriver from "../src/bun.mjs";
import * as client from "../src/client.mjs";

const inMemoryFactory = () => {
  return api.createClientAdapter(() => BunDatabaseDriver.defaults());
};

const createConnect = async () => {
  const db = inMemoryFactory();
  await db.connect("default");
  return db;
};

describe("web transport", () => {
  test("with defaults", () => {
    const transport = client.createWebTransport();
    expect(transport).not.toBeNull();
  });
  test("with endpoint", () => {
    const transport = client.createWebTransport("http://localhost:8000");
    expect(transport).not.toBeNull();
  });
  test("rejects invalid endpoints", () => {
    expect(() => client.createWebTransport("i-am-invalid")).toThrow();
  });
});

describe("memdb client", async () => {
  test("should export `databaseClient`", async () => {
    expect(client.databaseClient).not.toBeNull();
  });

  describe("in-memory", async () => {
    test("create", async () => {
      const driver = BunDatabaseDriver.defaults();
      const inMemory = client.createInMemoryTransport((routes) => driver.setup(routes));
      const db = client.databaseClient(inMemory);
      expect(db).not.toBeNull();
    });
    test("factory", async () => {
      expect(inMemoryFactory()).not.toBeNull();
    });
    test("connect", async () => {
      const db = await createConnect();
      expect(db).not.toBeUndefined();
      expect(db).not.toBeNull();
      expect(db.connected()).toBeTrue();
    });
    test("statement execution (no response)", async () => {
      const db = await createConnect();
      const result = await db.exec("SELECT 1;");
      expect(result).not.toBeNull();
      expect(result.mode).toBe(api.QueryResultMode.Empty);
    });
    test("structural query (no response)", async () => {
      const db = await createConnect();
      const result = await db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY);");
      expect(result).not.toBeNull();
      expect(result.mode).toBe(api.QueryResultMode.Empty);
    });
    test("mutation query (fill table)", async () => {
      const db = await createConnect();
      const result = await db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY);");
      expect(result).not.toBeNull();
      expect(result.mode).toBe(api.QueryResultMode.Empty);
      const next = await db.exec("INSERT INTO test (id) VALUES (1);");
      expect(next).not.toBeNull();
      expect(next.mode).toBe(api.QueryResultMode.Mutation);
      expect((next as api.QueryMutationResult).count).toBe(1);
    });
    test("select count (single result)", async () => {
      const db = await createConnect();
      const result = await db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY);");
      expect(result).not.toBeNull();
      expect(result.mode).toBe(api.QueryResultMode.Empty);
      const next = await db.exec("INSERT INTO test (id) VALUES (1);");
      expect(next).not.toBeNull();
      expect(next.mode).toBe(api.QueryResultMode.Mutation);
      expect((next as api.QueryMutationResult).count).toBe(1);
      const { result: count } = await db.query("SELECT COUNT(*) FROM test;");
      expect(count).not.toBeNull();
      expect(count.mode).toBe(api.QueryResultMode.Single);
      expect((count as api.QuerySingleResult).value).toBeNumber();
      expect((count as api.QuerySingleResult).value).toBeGreaterThan(0);
    });
    test("select row (single value)", async () => {
      const db = await createConnect();
      const result = await db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY, text TEXT);");
      expect(result).not.toBeNull();
      expect(result.mode).toBe(api.QueryResultMode.Empty);
      const next = await db.exec("INSERT INTO test (id, text) VALUES (1, 'hello');");
      expect(next).not.toBeNull();
      expect(next.mode).toBe(api.QueryResultMode.Mutation);
      expect((next as api.QueryMutationResult).count).toBe(1);
      const { result: value } = await db.query("SELECT text FROM test LIMIT 1;");
      expect(value).not.toBeNull();
      expect(value.mode).toBe(api.QueryResultMode.Single);
      expect((value as api.QuerySingleResult).value).toBeString();
      expect((value as api.QuerySingleResult).value).toBe("hello");
    });
    test("select rows (rows result)", async () => {
      const db = await createConnect();
      const result = await db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY, text TEXT);");
      expect(result).not.toBeNull();
      expect(result.mode).toBe(api.QueryResultMode.Empty);
      const next = await db.exec("INSERT INTO test (id, text) VALUES (1, 'hello');");
      expect(next).not.toBeNull();
      expect(next.mode).toBe(api.QueryResultMode.Mutation);
      expect((next as api.QueryMutationResult).count).toBe(1);
      const next2 = await db.exec("INSERT INTO test (id, text) VALUES (2, 'hello2');");
      expect(next2).not.toBeNull();
      expect(next2.mode).toBe(api.QueryResultMode.Mutation);
      expect((next2 as api.QueryMutationResult).count).toBe(1);
      const next3 = await db.exec("INSERT INTO test (id, text) VALUES (3, 'hello3');");
      expect(next3).not.toBeNull();
      expect(next3.mode).toBe(api.QueryResultMode.Mutation);
      expect((next3 as api.QueryMutationResult).count).toBe(1);

      const { result: rows } = await db.query("SELECT * FROM test;");
      expect(rows).not.toBeNull();
      expect(rows.mode).toBe(api.QueryResultMode.Rows);
      const data = rows as api.QueryRowsResult;
      expect(data.rows.length).toBe(3);
      expect(data.rows[0].table).toBe(1);
      // @ts-expect-error
      expect(data.rows[0].value[0].data.value.kind.case).toBe("numberValue");
      // @ts-expect-error
      expect(data.rows[0].value[0].data.value.kind.value).toBe(1);
      // @ts-expect-error
      expect(data.rows[0].value[1].data.value.kind.case).toBe("stringValue");
      // @ts-expect-error
      expect(data.rows[0].value[1].data.value.kind.value).toBe("hello");
      expect(data.rows[1].table).toBe(1);
      // @ts-expect-error
      expect(data.rows[1].value[0].data.value.kind.case).toBe("numberValue");
      // @ts-expect-error
      expect(data.rows[1].value[0].data.value.kind.value).toBe(2);
      // @ts-expect-error
      expect(data.rows[1].value[1].data.value.kind.case).toBe("stringValue");
      // @ts-expect-error
      expect(data.rows[1].value[1].data.value.kind.value).toBe("hello2");
      expect(data.rows[2].table).toBe(1);
      // @ts-expect-error
      expect(data.rows[2].value[0].data.value.kind.case).toBe("numberValue");
      // @ts-expect-error
      expect(data.rows[2].value[0].data.value.kind.value).toBe(3);
      // @ts-expect-error
      expect(data.rows[2].value[1].data.value.kind.case).toBe("stringValue");
      // @ts-expect-error
      expect(data.rows[2].value[1].data.value.kind.value).toBe("hello3");
    });
  });
});
