// Emit step for Composition Contract v2 — runs z.toJSONSchema() on each
// block's Zod-authored tools and writes the result between TOOLS markers
// in the corresponding BLOCK.md.
//
// Shipped in Scope 3 Step 2b.1 PR 1 (C6) per audit §7.1.
//
// Usage:
//   pnpm emit:blocks          # writes updated BLOCK.md files
//   pnpm emit:blocks:check    # reads-and-diffs; exit 1 on drift (CI gate)
//
// PR 1 note: only CRM is wired here; CRM's BLOCK.md will not carry TOOLS
// markers until PR 3, so in PR 1 this script reports "skipped" for CRM.
// The logic is exercised by unit tests against synthetic BLOCK.md
// fixtures in the meantime. 2b.2 adds the other 6 core blocks.

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
    path.join(repoRoot, "scripts", "emit-block-tools.impl.ts"),
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
