/** Package name and version, read from package.json (one level above both src/ and build/). */
import { createRequire } from "node:module";

const pkg = createRequire(import.meta.url)("../package.json") as { name: string; version: string };

export const PACKAGE_NAME: string = pkg.name;
export const VERSION: string = pkg.version;
