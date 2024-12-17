import { describe, expect, test } from "bun:test";
import { dirname, join } from "node:path";

import * as bin from "../src/bin.mjs";

const binpath = join(dirname(import.meta.path), "bins");

describe("bin resolve", async () => {
  test("should be able to render a valid bin name/path", () => {
    expect(() => bin.resolveBin(binpath, "doesnotexist")).not.toThrow();
    expect(bin.resolveBin(binpath, "doesnotexist")).toBeObject();
    expect(bin.resolveBin(binpath, "doesnotexist").name).toBeString();
    expect(bin.resolveBin(binpath, "doesnotexist").path).toBeString();
  });

  test("bin name/path should contain current platform string", () => {
    const binary = bin.resolveBin(binpath, "doesnotexist");
    expect(binary.name).toContain("doesnotexist");
    let expected: string = process.platform;
    if (process.platform === "darwin") {
      expected = "macos";
    }
    expect(binary.name).toContain(expected);
  });

  test("should throw when resolving a non-existent bin", () => {
    expect(() => bin.resolveBinChecked(binpath, "doesnotexist")).toThrow();
  });

  // TODO: broken (access control queries aren't working on windows/wsl)
  // test("should throw when resolving a bin that exists but is not executable", async () => {
  //     expect(bin.resolveBinChecked(binpath, 'not-executable')).rejects.toThrow();
  // });

  test("should be able to resolve an executable bin name/path", async () => {
    expect(bin.resolveBinChecked(binpath, "executable")).resolves.toBeObject();
  });
});
