// One-shot applier for migration 0036 (block_instances).
// v1.4.0 — per-workspace storage for v2 (MCP-native) blocks.
// Same quote-aware statement-splitter pattern as 0034 / 0035.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

function parseEnv(path) {
  const out = {};
  for (const line of readFileSync(path, "utf8").replace(/\r/g, "").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    val = val.replace(/(\\r|\\n)+$/g, "");
    out[m[1]] = val;
  }
  return out;
}

function splitStatements(fileContent) {
  const stripped = fileContent
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");
  const out = [];
  let buf = "";
  let inString = false;
  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i];
    if (ch === "'" && stripped[i - 1] !== "\\") {
      if (inString && stripped[i + 1] === "'") {
        buf += "''";
        i++;
        continue;
      }
      inString = !inString;
      buf += ch;
      continue;
    }
    if (ch === ";" && !inString) {
      const s = buf.trim();
      if (s.length > 0) out.push(s);
      buf = "";
      continue;
    }
    buf += ch;
  }
  const tail = buf.trim();
  if (tail.length > 0) out.push(tail);
  return out;
}

const ENV_PATH = "C:/Users/maxim/AppData/Local/Temp/prod-env-fresh";
const SQL_PATH =
  "C:/Users/maxim/CascadeProjects/Seldon Frame/.claude/worktrees/blueprint-renderer/packages/crm/drizzle/0036_block_instances.sql";
const TABLES = ["block_instances"];

const env = parseEnv(ENV_PATH);
const databaseUrl = env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL not found in", ENV_PATH);
  process.exit(2);
}

const sql = neon(databaseUrl);
const fileContent = readFileSync(SQL_PATH, "utf8");
const statements = splitStatements(fileContent);

console.log(`Applying ${statements.length} statements from 0036_block_instances.sql to:`);
console.log("  " + databaseUrl.replace(/:([^:@]+)@/, ":***@"));
console.log("");

for (let i = 0; i < statements.length; i++) {
  const stmt = statements[i];
  const preview = stmt.split("\n")[0].slice(0, 80);
  process.stdout.write(`[${i + 1}/${statements.length}] ${preview}… `);
  try {
    await sql.query(stmt);
    console.log("OK");
  } catch (e) {
    console.log("FAIL");
    console.error("  ", e.message);
    process.exit(1);
  }
}

console.log("");
for (const table of TABLES) {
  const cols = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table}
    ORDER BY ordinal_position
  `;
  if (cols.length === 0) {
    console.error(`✗ Verification failed — ${table} not found`);
    process.exit(1);
  }
  console.log(`✓ ${table} (${cols.length} columns)`);
  for (const c of cols) {
    console.log(`    ${c.column_name.padEnd(22)} ${c.data_type}`);
  }
}

// Verify both indexes landed.
const idx = await sql`
  SELECT indexname FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename = 'block_instances'
  ORDER BY indexname
`;
const expectedIndexes = ["block_instances_org_block_uniq", "block_instances_org_idx"];
const foundIndexes = idx.map((i) => i.indexname).filter((n) => expectedIndexes.includes(n));
for (const expected of expectedIndexes) {
  if (!foundIndexes.includes(expected)) {
    console.error(`✗ Index ${expected} not found`);
    process.exit(1);
  }
  console.log(`✓ index ${expected}`);
}

console.log("\nMigration 0036 applied successfully.");
