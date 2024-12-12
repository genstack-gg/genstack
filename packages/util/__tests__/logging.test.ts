import { describe, expect, mock, test } from "bun:test";
import { dirname, join } from "node:path";

import * as bin from "../src/bin.mjs";

const binpath = join(dirname(import.meta.path), "bins");

const withMockStdStreams = (fn: () => void) => {
  const original_stdout = process.stdout.write;
  const original_stderr = process.stderr.write;
  const original_log = console.log;
  const calls: { stream: string; args: any[] }[] = [];
  const stdout = mock((...args) => {
    calls.push({ stream: "stdout", args });
  });
  const stderr = mock((...args) => {
    calls.push({ stream: "stderr", args });
  });
  const logger = mock((...args) => {
    calls.push({ stream: "stdout", args });
  });
  // @ts-ignore
  process.stdout.write = stdout;
  // @ts-ignore
  process.stderr.write = stderr;
  // @ts-ignore
  console.log = logger;

  try {
    fn();
  } finally {
    // @ts-ignore
    process.stdout.write = original_stdout;
    // @ts-ignore
    process.stderr.write = original_stderr;
    // @ts-ignore
    console.log = original_log;
  }
  const stdoutCalls = calls.filter((i) => i.stream === "stdout").map((i) => i.args);
  const stderrCalls = calls.filter((i) => i.stream === "stderr").map((i) => i.args);
  return { stdout: stdoutCalls, stderr: stderrCalls };
};

describe("binpath logging", () => {
  test("nothing logged by default", () => {
    const { stdout, stderr } = withMockStdStreams(() => {
      bin.resolveBin(binpath, "doesnotexist");
      expect(process.stdout.write).not.toBeCalled();
      expect(process.stderr.write).not.toBeCalled();
    });

    expect(stdout).toBeEmpty();
    expect(stderr).toBeEmpty();
  });

  test("debug logging can be activated or de-activated", () => {
    expect(() => bin.enableDebugLogging()).not.toThrow();
    expect(() => bin.enableDebugLogging(false)).not.toThrow();
  });

  test("debug logging emits output", () => {
    const { stdout, stderr } = withMockStdStreams(() => {
      bin.enableDebugLogging();
      bin.resolveBin(binpath, "doesnotexist");
      expect(process.stdout.write).not.toBeCalled();
      expect(process.stderr.write).not.toBeCalled();
      bin.enableDebugLogging(false);
    });

    expect(stdout).not.toBeEmpty();
    expect(stderr).toBeEmpty();
  });
});
