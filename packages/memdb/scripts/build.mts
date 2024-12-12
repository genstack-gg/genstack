import { join } from "node:path";
import * as esbuild from "esbuild";

//
// Builds the memdb package for Genstack.
//

const enableCjs = true;
const enableEsm = true;
const enableNodeBundle = true;
const enableBunBundle = true;
const enableNeutralBundle = true;

const outDir = "dist";
const outPath = join(process.cwd(), `${outDir}/lib`);

console.info(`Building 'memdb' to ${outPath}`);

const baseConfig: esbuild.BuildOptions = {
  bundle: true,
  splitting: false,
  outbase: outPath,
  external: ["node:assert", "node:path", "node:fs", "node:child_process", "bun:sqlite"],
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

if (enableNodeBundle) {
  if (enableEsm)
    await build("node-esm", {
      entryPoints: [src("node.mts")],
      outfile: out("node.mjs"),
      format: "esm",
    });
}

if (enableBunBundle) {
  await build("bun-esm", {
    entryPoints: [src("bun.mts")],
    outfile: out("bun.mjs"),
    format: "esm",
  });
}

if (enableNeutralBundle) {
  if (enableCjs)
    await build("index-cjs", {
      entryPoints: [src("index.mts")],
      outfile: out("neutral.cjs"),
      format: "cjs",
    });

  if (enableEsm)
    await build("index-esm", {
      entryPoints: [src("index.mts")],
      outfile: out("neutral.mjs"),
      format: "esm",
    });
}

// shim does not support cjs
await build("shim-esm", {
  entryPoints: [src("shim.mts")],
  outfile: out("shim.mjs"),
  format: "esm",
});
