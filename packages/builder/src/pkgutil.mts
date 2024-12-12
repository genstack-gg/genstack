import chalk from "chalk";

export type PackageManifest = {
  [key: string]: any;
  name: string;
  version: string;
  description: string;
  main: string;
  type: string;
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
  optionalDependencies: Record<string, string>;
  bundledDependencies: string[];
  engines: Record<string, string>;
  os: string[];
  cpu: string[];
  private: boolean;
  publishConfig: Record<string, string>;
  repository: string;
};

function enforce(obj: Partial<PackageManifest>, key: string, message: string, validator: (value: any) => boolean) {
  if (!validator(obj[key])) {
    throw new Error(message);
  }
}

function deps(obj: PackageManifest, message: string, validator: (pkg: string, version: any) => boolean) {
  const depsProps = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
  for (const prop of depsProps) {
    const deps = obj[prop];
    if (!deps) {
      continue;
    }
    for (const [pkg, version] of Object.entries(obj[prop])) {
      if (!validator(pkg, version as any)) {
        throw new Error(message);
      }
    }
  }
  console.info(chalk.green(`✅ Package '${obj.name}' is valid`));
}

export { validatePackageJson };

/**
 * Validate a `package.json` file for public distribution.
 *
 * @param pkg Package JSON object to validate.
 */
export default function validatePackageJson(pkg: PackageManifest) {
  enforce(pkg, "name", "Package name must be a string", (value) => typeof value === "string");
  enforce(pkg, "version", "Package version must be a string", (value) => typeof value === "string");
  enforce(pkg, "description", "Package description must be a string", (value) => typeof value === "string");
  enforce(pkg, "type", 'Package type must be set to "module"', (value) => value === "module");
  deps(pkg, "Dependency versions must not mention `workspace`", (_pkg, version) => !version.includes("workspace"));
}
