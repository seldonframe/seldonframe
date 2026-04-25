// Unit-test runner for SeldonFrame.
//
// Single entry point for `pnpm test:unit` — globs all *.spec.ts files under
// packages/*/tests/unit/, then hands them to `node --test --import tsx`.
// Identical invocation works locally (tight-feedback loop during dev) and
// in CI (same command, different context per Max's PR 1 directive).
//
// Why a runner script rather than a bare glob in package.json scripts:
// glob expansion differs between bash, PowerShell, and pnpm's internal
// shell on Windows. Resolving the files in Node guarantees identical
// behavior across platforms. Node 24's fs.globSync is used directly.
//
// Added in Scope 3 Step 2b.1 PR 1 (C1). The test framework is node:test
// (Node 24+ built-in); TS is loaded via tsx. Zero new test-runner deps.

const { globSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
// tsx is a devDep of @seldonframe/crm. Run from that package's directory so
// Node resolves the tsx ESM loader from packages/crm/node_modules without
// needing tsx hoisted to the workspace root. If unit tests ever need to
// live in another package, that package must declare tsx as a devDep too
// and this runner must iterate per-package.
const crmRoot = path.join(repoRoot, "packages", "crm");
// SLICE 4a adds .spec.tsx for React component tests (renderToString-
// based — no jsdom). tsx handles both extensions; glob both patterns.
const patterns = ["tests/unit/**/*.spec.ts", "tests/unit/**/*.spec.tsx"];

const files = patterns.flatMap((p) => globSync(p, { cwd: crmRoot }));

if (files.length === 0) {
  console.error(`No unit test files matched ${patterns.join(" / ")} under ${crmRoot}`);
  process.exit(1);
}

console.log(`Running ${files.length} unit test file(s) via node:test + tsx:`);
for (const f of files) console.log(`  - packages/crm/${f.replace(/\\/g, "/")}`);
console.log();

const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "--test", ...files],
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
