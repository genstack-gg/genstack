import { join } from "node:path";
import * as esbuild from "esbuild";

//
// Builds utils for Genstack.
//

const enableCjs = true;
const enableEsm = true;
const outDir = "dist";
const outPath = join(process.cwd(), outDir);

console.info(`Building 'util' to ${outPath}`);

const baseConfig: esbuild.BuildOptions = {
  bundle: true,
  splitting: false,
  outbase: outPath,
  external: ["node:assert", "node:child_process", "node:fs", "node:path", "node:fs/promises"],
};

async function build(name: string, cfg: Partial<esbuild.BuildOptions> = {}) {
  console.info(`Building target '${name}'...`);
  await esbuild.build({
    ...baseConfig,
    ...cfg,
  });
}

function src(name: string): string {
  return join(process.cwd(), "src", name);
}

function out(name: string): string {
  return join(outPath, name);
}

if (enableCjs)
  await build("bin-cjs", {
    entryPoints: [src("bin.mts")],
    outfile: out("bin/index.cjs"),
    format: "cjs",
  });

if (enableEsm)
  await build("bin-esm", {
    entryPoints: [src("bin.mts")],
    outfile: out("bin/index.mjs"),
    format: "esm",
  });
