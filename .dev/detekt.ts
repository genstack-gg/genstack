import { $, BunFile } from "bun";
import { join } from "node:path";

const baseArgs = (await Bun.file(join(process.cwd(), '.dev', 'detekt.args')).text())
    .split("\n")
    .filter((i) => !!i)
    .map((i) => i.trim())
    .flatMap((i) => i.includes("=") || i.includes(" ") ? i.split(/[ ,=]/g) : [i])

const addlArgs = Bun.argv.slice(2)
const args = baseArgs.concat(addlArgs)

const { exitCode } = await $`detekt ${args}`.nothrow()
process.exitCode = exitCode;
