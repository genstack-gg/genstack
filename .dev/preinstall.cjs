const path = require("path");
const fs = require("fs");

// Check for both npm and pnpm workspace commands
const isWorkspaceCommand =
  process.env.npm_config_workspace || // npm workspace
  process.env.PNPM_SCRIPT_SRC_DIR || // pnpm workspace
  process.env.npm_lifecycle_event === "postinstall";

// Get the working directory (handles both npm and pnpm)
const initCwd = process.env.INIT_CWD || process.env.PNPM_SCRIPT_SRC_DIR;

if (!isWorkspaceCommand) {
  try {
    // Check if working directory contains package.json with workspaces
    const initPackageJson = JSON.parse(
      fs.readFileSync(path.join(initCwd, "package.json"), "utf8"),
    );

    // Check for both npm workspaces and pnpm workspace config
    const hasWorkspaceConfig =
      !!initPackageJson.workspaces ||
      fs.existsSync(path.join(initCwd, "pnpm-workspace.yaml"));

    if (!hasWorkspaceConfig && initPackageJson.name) {
      console.error(
        "\x1b[31m%s\x1b[0m",
        `
╔════════════════════════════════════════════════════════════════╗
║                          ERROR                                 ║
║  Please run 'pnpm --filter ${initPackageJson.name} install'    ║
║  from the root of the monorepo. Individual workspace           ║
║  installation is not supported.                                ║
╚════════════════════════════════════════════════════════════════╝
`,
      );
      process.exit(1);
    } else if (!hasWorkspaceConfig) {
      console.error(
        "\x1b[31m%s\x1b[0m",
        `
╔════════════════════════════════════════════════════════════════╗
║                          ERROR                                 ║
║  Please run 'pnpm install' from the root of the monorepo.      ║
║  Individual workspace installation is not supported.           ║
╚════════════════════════════════════════════════════════════════╝
`,
      );
      process.exit(1);
    }
  } catch (error) {
    console.error(
      "\x1b[31m%s\x1b[0m",
      `
╔════════════════════════════════════════════════════════════════╗
║                          ERROR                                 ║
║  Cannot read package.json or it does not exist.                ║
║  Ensure you are in the correct directory and try again.        ║
╚════════════════════════════════════════════════════════════════╝
`,
    );
    process.exit(1);
  }
}
