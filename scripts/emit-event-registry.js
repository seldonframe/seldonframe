// Event-registry codegen entry point. Invoked by:
//   pnpm emit:event-registry          — regenerates the JSON
//   pnpm emit:event-registry:check    — drift-detection (CI gate)
//
// Shipped in Scope 3 Step 2b.1 PR 1 (C7) per audit §7.3.

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const crmRoot = path.join(repoRoot, "packages", "crm");
const checkMode = process.argv.includes("--check");

const result = spawnSync(
  process.execPath,
  [
    "--import",
    "tsx",
    path.join(repoRoot, "scripts", "emit-event-registry.impl.ts"),
    ...(checkMode ? ["--check"] : []),
  ],
  {
    stdio: "inherit",
    cwd: crmRoot,
    env: process.env,
  }
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
