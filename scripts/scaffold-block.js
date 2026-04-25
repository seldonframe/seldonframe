// Scaffold-block CLI wrapper. Mirrors the emit-block-tools.js
// pattern (pure Node wrapper + tsx-imported .impl.ts).
//
// Usage:
//   pnpm scaffold:block --spec <spec.json>
//   pnpm scaffold:block --spec <spec.json> --dry-run
//   pnpm scaffold:block --spec <spec.json> --skip-validation

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const crmRoot = path.join(repoRoot, "packages", "crm");

const result = spawnSync(
  process.execPath,
  [
    "--import",
    "tsx",
    path.join(repoRoot, "scripts", "scaffold-block.impl.ts"),
    ...process.argv.slice(2),
  ],
  {
    stdio: "inherit",
    cwd: crmRoot,
    env: process.env,
  },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
