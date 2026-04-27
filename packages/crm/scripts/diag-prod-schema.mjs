// One-shot read-only diagnostic for production DB.
// Reads DATABASE_URL from .env.prod (pulled via `vercel env pull`).
// Runs 3 SELECT-only queries to map the migration drift.
// Does NOT write anything. Safe to run multiple times.
//
// Usage (from packages/crm):
//   node scripts/diag-prod-schema.mjs

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { neon } from "@neondatabase/serverless";

const envFile = resolve(process.cwd(), ".env.prod");
const envText = readFileSync(envFile, "utf8");
const dbLine = envText.split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
if (!dbLine) {
  console.error("DATABASE_URL not found in .env.prod");
  process.exit(1);
}
const DATABASE_URL = dbLine
  .replace(/^DATABASE_URL=/, "")
  .replace(/^"|"$/g, "");

const sql = neon(DATABASE_URL);

async function main() {
  console.log("=== Q1: __drizzle_migrations content ===");
  try {
    const rows = await sql`
      SELECT id, hash, created_at
      FROM __drizzle_migrations
      ORDER BY created_at
    `;
    console.log(`Total rows: ${rows.length}`);
    for (const r of rows) {
      console.log(
        `  id=${r.id}  created_at=${r.created_at}  hash=${String(r.hash).slice(0, 12)}…`,
      );
    }
  } catch (err) {
    console.log(`__drizzle_migrations table error: ${err.message}`);
  }

  console.log("\n=== Q2: organizations columns ===");
  const orgCols = await sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'organizations'
    ORDER BY ordinal_position
  `;
  console.log(`Total columns: ${orgCols.length}`);
  for (const c of orgCols) {
    console.log(
      `  ${c.column_name.padEnd(35)} ${c.data_type.padEnd(20)} nullable=${c.is_nullable.padEnd(3)} default=${
        c.column_default ?? "—"
      }`,
    );
  }
  const hasTz = orgCols.some((c) => c.column_name === "timezone");
  console.log(`  timezone column present: ${hasTz ? "YES ✓" : "NO ✗ (this is the bug)"}`);

  console.log("\n=== Q3: tables in public schema ===");
  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `;
  console.log(`Total tables: ${tables.length}`);
  for (const t of tables) console.log(`  ${t.table_name}`);

  console.log("\n=== Q4: SLICE 5/9/10/11 expected tables (presence check) ===");
  const expected = [
    "workflow_runs", // 0019
    "workflow_step_results", // 0020
    "block_subscriptions", // 0021
    "scheduled_triggers", // 0023
    "message_triggers", // 0024
    "workflow_approvals", // 0027
    "preview_sessions", // 0011
    "brain_event_salience", // 0012
    "brain_feedback_score", // 0013
    "workspace_secrets", // 0014
    "workspace_bearer_tokens", // 0015
    "email_conversations", // 0016 (subset)
    "sms_messages", // 0017 (subset)
    "invoices", // 0018 (subset)
  ];
  const present = new Set(tables.map((t) => t.table_name));
  for (const name of expected) {
    console.log(`  ${name.padEnd(35)} ${present.has(name) ? "YES ✓" : "MISSING ✗"}`);
  }

  console.log("\n=== Q5: drizzle migration tracking schema ===");
  const trackingCols = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = '__drizzle_migrations'
    ORDER BY ordinal_position
  `;
  if (trackingCols.length === 0) {
    console.log("  __drizzle_migrations table does NOT exist");
  } else {
    for (const c of trackingCols) console.log(`  ${c.column_name}  ${c.data_type}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("FATAL:", err);
    process.exit(1);
  });
