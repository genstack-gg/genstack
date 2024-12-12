import { describe, expect, test } from "bun:test";
import { ColumnPrimitiveType } from "@genstack.js/protocol/model/api/v1/db";
import * as util from "../src/util.mjs";

const columnNamed = (name: string, type?: ColumnPrimitiveType, index = 0) => ({
  name,
  type,
  index,
});

const decode = (column: string, value: any, type?: ColumnPrimitiveType) => {
  return util.decodeCell(columnNamed(column, type), value);
};

const primitive = (column: string, value: any, type?: ColumnPrimitiveType) => {
  const cell = decode(column, value, type);
  switch (cell.kind.case) {
    case "nullValue":
      return null;
    case "stringValue":
      return cell.kind.value as string;
    case "numberValue":
      return cell.kind.value as number;
    case "boolValue":
      return cell.kind.value as boolean;
    default:
      throw new Error(`Unexpected value kind: ${cell.kind.case}`);
  }
};

describe("decode cell with type guidance", async () => {
  describe("`TEXT`", () => {
    test("supports strings", () => {
      expect(primitive("sample", "hello", ColumnPrimitiveType.TEXT)).toBeString();
      expect(primitive("sample", "hello", ColumnPrimitiveType.TEXT)).toBe("hello");
    });
    test("supports `null`", () => {
      expect(primitive("sample", null, ColumnPrimitiveType.TEXT)).toBeNull();
    });
  });
  describe("`INTEGER`", () => {
    test("supports integers", () => {
      expect(primitive("sample", 42, ColumnPrimitiveType.INTEGER)).toBeNumber();
      expect(primitive("sample", 42, ColumnPrimitiveType.INTEGER)).toBe(42);
    });
    test("supports `null`", () => {
      expect(primitive("sample", null, ColumnPrimitiveType.INTEGER)).toBeNull();
    });
    test("supports bigint", () => {
      expect(primitive("sample", BigInt(42), ColumnPrimitiveType.INTEGER)).toBeNumber();
      expect(primitive("sample", BigInt(42), ColumnPrimitiveType.INTEGER)).toBe(42);
    });
    test("rejects non-numerics", () => {
      expect(() => primitive("sample", false, ColumnPrimitiveType.INTEGER)).toThrow();
      expect(() => primitive("sample", "false", ColumnPrimitiveType.INTEGER)).toThrow();
    });
  });
  describe("`REAL`", () => {
    test("supports decimals", () => {
      expect(primitive("sample", 3.14, ColumnPrimitiveType.REAL)).toBeNumber();
      expect(primitive("sample", 3.14, ColumnPrimitiveType.REAL)).toBe(3.14);
    });
    test("supports integers", () => {
      expect(primitive("sample", 123, ColumnPrimitiveType.REAL)).toBeNumber();
      expect(primitive("sample", 123, ColumnPrimitiveType.REAL)).toBe(123);
    });
    test("supports `null`", () => {
      expect(primitive("sample", null, ColumnPrimitiveType.REAL)).toBeNull();
    });
  });
  describe("`BLOB`", () => {
    test("supports bytes as base64", () => {
      const bytes = new Uint8Array([0x01, 0x02, 0x03]);
      expect(primitive("sample", bytes, ColumnPrimitiveType.BLOB)).toBeString();
      expect(primitive("sample", bytes, ColumnPrimitiveType.BLOB)).toBe("AQID");
    });
    test("supports `null`", () => {
      expect(primitive("sample", null, ColumnPrimitiveType.BLOB)).toBeNull();
    });
    test("rejects other types", () => {
      expect(() => primitive("sample", false, ColumnPrimitiveType.BLOB)).toThrow();
    });
  });
  test("fails on unrecognized column type", () => {
    // @ts-expect-error
    expect(() => primitive("sample", false, "some-other-type")).toThrow();
  });
});

describe("decode cell with type inference", async () => {
  test("supports strings", () => {
    expect(primitive("sample", "hello")).toBeString();
    expect(primitive("sample", "hello")).toBe("hello");
  });
  test("supports integers", () => {
    expect(primitive("sample", 42)).toBeNumber();
    expect(primitive("sample", 42)).toBe(42);
  });
  test("supports decimals", () => {
    expect(primitive("sample", 3.14)).toBeNumber();
    expect(primitive("sample", 3.14)).toBe(3.14);
  });
});
