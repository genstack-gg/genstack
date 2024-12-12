import { join } from "node:path";
import validatePkgJson from "./pkgutil.mjs";

export async function main() {
  const path = process.argv[2] || process.cwd();
  const pkg = await import(join(path, "package.json"), {
    assert: { type: "json" },
  });
  validatePkgJson(pkg as any);
}

await main();
