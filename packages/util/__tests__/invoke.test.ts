import { describe, expect, test } from "bun:test";
import { dirname, join } from "node:path";

import * as bin from "../src/bin.mjs";

const binpath = join(dirname(import.meta.path), "bins");

describe("bin invoke", async () => {
  test("should fail to invoke a non-existent bin", async () => {
    expect(bin.resolveInvokeBin(binpath, "doesnotexist")).rejects.toThrow();
  });
  test("should be able to invoke a valid bin", async () => {
    expect(bin.resolveInvokeBin(binpath, "executable", [], {}, true, "bash")).resolves.toBeObject();
  });
});
