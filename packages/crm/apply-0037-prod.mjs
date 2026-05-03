// One-shot applier for migration 0037 (brain_notes).
// v1.6.0 — Karpathy LLM-Wiki brain layer.
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
  "C:/Users/maxim/CascadeProjects/Seldon Frame/.claude/worktrees/blueprint-renderer/packages/crm/drizzle/0037_brain_notes.sql";

const env = parseEnv(ENV_PATH);
const databaseUrl = env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL not found in", ENV_PATH);
  process.exit(2);
}

const sql = neon(databaseUrl);
const fileContent = readFileSync(SQL_PATH, "utf8");
const statements = splitStatements(fileContent);

console.log(`Applying ${statements.length} statements from 0037_brain_notes.sql...`);

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

const cols = await sql`
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'brain_notes'
  ORDER BY ordinal_position
`;
if (cols.length === 0) {
  console.error("✗ Verification failed — brain_notes not found");
  process.exit(1);
}
console.log(`\n✓ brain_notes (${cols.length} columns)`);
const idx = await sql`
  SELECT indexname FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'brain_notes'
  ORDER BY indexname
`;
for (const i of idx) console.log(`  ✓ index ${i.indexname}`);
console.log("\nMigration 0037 applied successfully.");
