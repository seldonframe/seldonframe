const { spawnSync } = require("node:child_process");
const path = require("node:path");

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: pnpm tsx <script-path> [args...]");
  process.exit(1);
}

const firstArg = args[0] || "";
const normalizedScriptPath = firstArg.replace(/^packages\/crm\//, "");
const passthroughArgs = [normalizedScriptPath, ...args.slice(1)];

const command = "pnpm";
const result = spawnSync(
  command,
  ["--filter", "@seldonframe/crm", "exec", "tsx", ...passthroughArgs],
  {
    stdio: "inherit",
    cwd: path.resolve(__dirname, ".."),
    env: process.env,
    shell: true,
  }
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
