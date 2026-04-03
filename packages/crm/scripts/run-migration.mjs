/**
 * Run a SQL migration file against the Neon production DB.
 * Usage: node packages/crm/scripts/run-migration.mjs <path-to-sql>
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { neon } from "@neondatabase/serverless";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local
const envPath = resolve(__dirname, "../.env.local");
const envContent = readFileSync(envPath, "utf8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx < 0) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  let val = trimmed.slice(eqIdx + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  if (!process.env[key]) process.env[key] = val;
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sqlFile = process.argv[2];
if (!sqlFile) {
  console.error("Usage: node run-migration.mjs <path-to-sql>");
  process.exit(1);
}

const migrationSql = readFileSync(resolve(sqlFile), "utf8");
console.log(`Running migration: ${sqlFile}`);
console.log(`SQL length: ${migrationSql.length} chars\n`);

const sql = neon(DATABASE_URL);

// Split into individual statements (neon serverless can only run one at a time)
// Remove comments first, then split on semicolons that end statements
const cleaned = migrationSql.replace(/--[^\n]*/g, "").trim();
const statements = cleaned
  .split(/;\s*\n/)
  .map((s) => s.replace(/;$/, "").trim())
  .filter((s) => s.length > 0);

let applied = 0;
for (const stmt of statements) {
  try {
    await sql.query(`${stmt};`);
    applied++;
    console.log(`  ✓ Statement ${applied}/${statements.length}`);
  } catch (err) {
    console.error(`  ❌ Statement ${applied + 1} failed: ${err.message}`);
    console.error(`     SQL: ${stmt.slice(0, 120)}...`);
    process.exit(1);
  }
}
console.log(`\n✅ Migration applied successfully (${applied} statements).`);
