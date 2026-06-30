// version — read the package version at runtime from package.json.
//
// The bin is dist/cli.js; package.json sits one dir up (../package.json from
// dist/). We read it via the module URL so it works regardless of where the
// global install lands. Falls back to a constant if the file can't be read.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const FALLBACK_VERSION = "0.1.0";

export function getVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    // From dist/lib/version.js → ../../package.json ; from dist/version.js →
    // ../package.json. Try both so it's robust to the emitted layout.
    for (const rel of ["../package.json", "../../package.json"]) {
      try {
        const raw = readFileSync(join(here, rel), "utf8");
        const pkg = JSON.parse(raw) as { version?: unknown };
        if (typeof pkg.version === "string") return pkg.version;
      } catch {
        // try the next candidate
      }
    }
  } catch {
    // fall through
  }
  return FALLBACK_VERSION;
}
