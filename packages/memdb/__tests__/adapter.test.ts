import { describe, expect, test } from "bun:test";
import {
  type DatabaseAdapter,
  type QueryMutationResult,
  QueryResultMode,
  type QueryRowsResult,
  type QuerySingleResult,
} from "../src/api.mts";

export type AdapterFactory = () => DatabaseAdapter;

async function checkedInsert(adapter: DatabaseAdapter, query: string, expectedCount: number) {
  const insert = await adapter.exec(query);
  expect(insert).not.toBeUndefined();
  expect(insert.mode).toBe(QueryResultMode.Mutation);
  const mut = insert as QueryMutationResult;
  expect(mut.count).toBe(expectedCount);
}

export default async function adapterSuite(factory: AdapterFactory) {
  test("adapter factory", async () => {
    factory();
  });
  describe("connections", () => {
    test("`connect('default')`", async () => {
      const adapter = factory();
      await adapter.connect("default");
      expect(adapter.connected()).toBeTrue();
    });
  });
  describe("`exec`", () => {
    test("`exec('CREATE TABLE ...')`", async () => {
      const adapter = factory();
      await adapter.connect("default");
      expect(adapter.connected()).toBeTrue();
      const result = await adapter.exec("CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)");
      expect(result).not.toBeUndefined();
      expect(result.mode).toBe(QueryResultMode.Empty);
    });
    test("`exec('INSERT ...')`", async () => {
      const adapter = factory();
      await adapter.connect("default");
      expect(adapter.connected()).toBeTrue();
      const result = await adapter.exec("CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)");
      expect(result).not.toBeUndefined();
      expect(result.mode).toBe(QueryResultMode.Empty);
      const insert = await adapter.exec("INSERT INTO test (id, name) VALUES (1, 'test')");
      expect(insert).not.toBeUndefined();
      expect(insert.mode).toBe(QueryResultMode.Mutation);
      const mut = insert as QueryMutationResult;
      expect(mut.count).toBe(1);
    });
    test("`exec('SELECT 1;')`", async () => {
      const adapter = factory();
      await adapter.connect("default");
      expect(adapter.connected()).toBeTrue();
      const result = await adapter.exec("SELECT 1;");
      expect(result).not.toBeUndefined();
      expect(result.mode).toBe(QueryResultMode.Empty); // empty because it's an `exec`
    });
  });
  describe("`tables`", () => {
    test("can list tables", async () => {
      const adapter = factory();
      await adapter.connect("default");
      expect(adapter.connected()).toBeTrue();
      const result = await adapter.exec("CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)");
      expect(result).not.toBeUndefined();
      expect(result.mode).toBe(QueryResultMode.Empty);
      const tables = await adapter.tables();
      expect(tables).toBeArray();
      expect(tables).toHaveLength(1);
      expect(tables[0].name).toBe("test");
    });
  });
  describe("`query`", () => {
    test("`query('SELECT 1;')`", async () => {
      const adapter = factory();
      await adapter.connect("default");
      expect(adapter.connected()).toBeTrue();
      const { result, response } = await adapter.query("SELECT 1;");
      expect(response.result?.ok).toBeTrue();
      expect(result).not.toBeUndefined();
      expect(result.mode).toBe(QueryResultMode.Single);
      expect((result as QuerySingleResult).value).toBe(1);
    });
    test("`query('SELECT ... FROM ...;')`", async () => {
      const adapter = factory();
      await adapter.connect("default");
      expect(adapter.connected()).toBeTrue();
      const result = await adapter.exec("CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)");
      expect(result).not.toBeUndefined();
      expect(result.mode).toBe(QueryResultMode.Empty);
      await checkedInsert(adapter, "INSERT INTO test (id, name) VALUES (1, 'test')", 1);
      await checkedInsert(adapter, "INSERT INTO test (id, name) VALUES (2, 'test2')", 1);
      await checkedInsert(adapter, "INSERT INTO test (id, name) VALUES (3, 'test3')", 1);
      const { result: data, response } = await adapter.query("SELECT id, name FROM test LIMIT 10;");
      expect(response?.result?.ok).toBeTrue();
      expect(data).not.toBeUndefined();
      expect(data.mode).toBe(QueryResultMode.Rows);
      expect((data as QueryRowsResult).tables).toBeArray();
      expect((data as QueryRowsResult).tables).toHaveLength(1);
      // @ts-expect-error
      expect((data as QueryRowsResult).tables[0].identity).toBe(1);
      // @ts-expect-error
      expect((data as QueryRowsResult).tables[0].name).toBe(""); // table names are not available except by opt-in
      expect((data as QueryRowsResult).rows).toBeArray();
      expect((data as QueryRowsResult).rows).toHaveLength(3);
      const rows = (data as QueryRowsResult).rows;
      const first = rows[0];
      expect(first).not.toBeUndefined();
      expect(first).toBeObject();
      expect(first.value).toHaveLength(2);
      expect(first.value[0].data).toEqual({
        case: "value",
        value: {
          $typeName: "google.protobuf.Value",
          kind: {
            case: "numberValue",
            value: 1,
          },
        },
      });
    });
  });
}
