import { type ChildProcess, spawn } from "node:child_process";
import { constants, accessSync, existsSync } from "node:fs";
import { join } from "node:path";

// Architecture tags to recognize as `arm64`.
const arm64Tags = new Set<string>();
arm64Tags.add("arm64");
arm64Tags.add("aarch64");

// Architecture tags to recognize as `amd64`.
const amd64Tags = new Set<string>();
amd64Tags.add("x64");
amd64Tags.add("x86_64");
amd64Tags.add("amd64");

// Whether to emit debug logs.
let debugLogging = !!process.env.BINPATH_DEBUG;

/**
 * Enumerates supported binary platforms.
 */
export enum BinaryPlatform {
  // Linux AMD64.
  LINUX_AMD64 = "linux-amd64",

  // Linux ARM64.
  LINUX_ARM64 = "linux-arm64",

  // macOS AMD64.
  MACOS_AMD64 = "macos-amd64",

  // macOS ARM64.
  MACOS_ARM64 = "macos-arm64",

  // Windows AMD64.
  WINDOWS_AMD64 = "windows-amd64",

  // Windows ARM64.
  WINDOWS_ARM64 = "windows-arm64",
}

/**
 * Log a message to the console if debug logging is enabled.
 *
 * @param message Message to log.
 */
function debugLog(...message: any[]) {
  if (debugLogging) {
    console.log(...message);
  }
}

/**
 * Enable or disable debug logging.
 *
 * @param state Whether to enable debug logging.
 */
export function enableDebugLogging(state = true): void {
  debugLogging = state;
}

/**
 * Format a binary name to be platform-qualified.
 *
 * @param name Name of the binary (unqualified).
 * @param platform Platform of the binary.
 * @returns Platform-formatted name.
 */
export function formatBinName(name: string, platform: BinaryPlatform): string {
  const fmt = `${name}-${platform}`;
  debugLog(`Formatted binary name: ${fmt}`);
  return fmt;
}

/**
 * Format a binary path to be platform-qualified.
 *
 * @param path Path where binaries are located.
 * @param name Name of the binary (unqualified).
 * @param platform Platform of the binary.
 * @returns Platform-qualified binary path.
 */
export function formatBinPath(path: string, name: string, platform: BinaryPlatform): string {
  const joined = join(path, formatBinName(name, platform));
  debugLog(`Formatted binary path: ${joined}`);
  return joined;
}

/**
 * Resolve the path to a platform-qualified binary within a given path.
 *
 * @param path Path where binaries are located.
 * @param name Name of the binary (unqualified).
 * @return Platform-qualified binary name within the provided path.
 */
export function resolveBin(path: string, name: string): { name: string; path: string } {
  const osName = process.platform;
  const arch = process.arch;

  let platform: BinaryPlatform;
  switch (osName.trim().toLowerCase()) {
    case "linux":
      platform = arm64Tags.has(arch) ? BinaryPlatform.LINUX_ARM64 : BinaryPlatform.LINUX_AMD64;
      break;
    case "macos":
      platform = arm64Tags.has(arch) ? BinaryPlatform.MACOS_ARM64 : BinaryPlatform.MACOS_AMD64;
      break;
    case "win32":
      platform = arm64Tags.has(arch) ? BinaryPlatform.WINDOWS_ARM64 : BinaryPlatform.WINDOWS_AMD64;
      break;
    default:
      throw new Error(`Unsupported platform: ${osName} / ${arch}`);
  }
  debugLog("Resolved platform:", platform);

  return {
    name: formatBinName(name, platform),
    path: formatBinPath(path, name, platform),
  };
}

/**
 * Resolve the path to a platform-qualified binary within a given path, checking that it exists and
 * is executable.
 *
 * This method may throw.
 *
 * @param path Path where binaries are located.
 * @param name Name of the binary (unqualified).
 * @throws Error if the binary is not found or is not executable.
 * @return Platform-qualified binary name within the provided path.
 */
export async function resolveBinChecked(path: string, name: string): Promise<{ name: string; path: string }> {
  const { name: resolvedName, path: resolvedPath } = resolveBin(path, name);
  if (!existsSync(resolvedPath)) {
    throw new Error(`Binary not found: ${resolvedPath} (name: ${resolvedName})`);
  }

  debugLog("Resolved binary path exists:", resolvedPath);

  accessSync(resolvedPath, constants.R_OK | constants.X_OK);
  debugLog("Resolved binary path is executable:", resolvedPath);

  return {
    name: resolvedName,
    path: resolvedPath,
  };
}

/**
 * Invoke a resolved binary (which is expected to exist and be executable), using the provided `name`
 * and `command` for logging and other output purposes; the provided `args` and `env` (if any) are
 * applied before the binary is executed.
 *
 * This method may throw. Standard streams attached to this process are piped to the resulting child
 * process.
 *
 * @param path Resolved path to the binary to invoke.
 * @param args Arguments to pass to the binary.
 * @param env Environment variables to set for the binary.
 * @param includeEnv Whether to include the current process environment in the binary environment.
 * @param shell Whether to use a shell to invoke the binary.
 * @return Promise for a running process.
 */
export async function invokeBinPassthrough(
  path: string,
  args: string[] = [],
  env: Record<string, string> = {},
  includeEnv = true,
  shell: boolean | string = false,
): Promise<ChildProcess> {
  // prepare a `spawn` call
  return spawn(path, args, {
    stdio: "inherit",
    shell,
    env: {
      ...(includeEnv ? process.env : {}),
      ...env,
    },
  });
}

/**
 * Resolve and invoke a binary (which is expected to exist and be executable) within a given path,
 * using the provided `name` and `command` for logging and other output purposes; the provided `args`
 * and `env` (if any) are applied before the binary is executed.
 *
 * Effectively, this method results in a call to `resolveBinChecked` followed by `invokeBinPassthrough`.
 *
 * @param path Path where bins are expected to be found for this package.
 * @param name Name of the bin to resolve (unqualified).
 * @param args Args to pass to the resulting binary.
 * @param env Environment to pass to the resulting binary.
 * @param includeEnv Whether to include the current process environment in the binary environment.
 * @param shell Whether to use a shell to invoke the binary.
 * @returns Promise for a child process.
 * @throws If the bin cannot be resolved, found, or invoked.
 */
export default async function resolveInvokeBin(
  path: string,
  name: string,
  args: string[] = [],
  env: Record<string, string> = {},
  includeEnv = true,
  shell: boolean | string = false,
): Promise<ChildProcess> {
  const { path: resolvedPath } = await resolveBinChecked(path, name);
  return invokeBinPassthrough(resolvedPath, args, env, includeEnv, shell);
}

export { resolveInvokeBin };
