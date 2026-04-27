// One-shot production migration applier.
// Reads DATABASE_URL from .env.prod (pulled via `vercel env pull`).
// Applies migrations 0012 → 0027 in numerical order, each in its own
// transaction. Stops at the first error (does NOT continue past failure).
//
// NOT a general-purpose migration runner — drizzle-kit's journal is
// out of sync (only 13 of 35 migrations registered), so this bypasses
// drizzle-kit and applies SQL files directly.
//
// Usage (from packages/crm):
//   node scripts/apply-prod-migrations.mjs

import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { Client } from "@neondatabase/serverless";

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

const MIGRATIONS_DIR = resolve(process.cwd(), "drizzle");

// Apply in numerical order. Order matters: foreign keys in later
// migrations reference tables created in earlier ones (e.g. 0021 FKs
// to workflow_event_log from 0019; 0026 FKs to workflow_runs from 0019).
const MIGRATIONS = [
  "0012_brain_event_salience.sql",
  "0013_brain_feedback_score.sql",
  "0014_workspace_secrets.sql",
  "0015_workspace_bearer_tokens.sql",
  "0016_phase3_email_conversations_suppression.sql",
  "0017_phase4_sms_messages_events.sql",
  "0018_phase5_invoices_subscriptions.sql",
  "0019_workflow_tables.sql",
  "0020_workflow_step_results.sql",
  "0021_block_subscriptions.sql",
  "0022_organizations_timezone.sql",
  "0023_scheduled_triggers.sql",
  "0024_message_triggers.sql",
  "0025_workspace_test_mode.sql",
  "0026_workflow_runs_cost_observability.sql",
  "0027_workflow_approvals.sql",
];

// Drizzle separates statements within a file with the comment
// `--> statement-breakpoint`. We split on it and run each statement
// as its own query inside a single per-file transaction. This is
// exactly what drizzle-kit migrate does internally.
function splitStatements(sql) {
  return sql
    .split(/-->\s*statement-breakpoint/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const client = new Client({ connectionString: DATABASE_URL });
await client.connect();

console.log(`Connected to production. Applying ${MIGRATIONS.length} migrations.\n`);

let appliedCount = 0;
const log = [];

for (const filename of MIGRATIONS) {
  const filepath = join(MIGRATIONS_DIR, filename);
  const sqlText = readFileSync(filepath, "utf8");
  const statements = splitStatements(sqlText);

  process.stdout.write(
    `→ ${filename}  (${sqlText.length}B, ${statements.length} stmt)`,
  );

  const start = Date.now();
  try {
    await client.query("BEGIN");
    for (const stmt of statements) {
      await client.query(stmt);
    }
    await client.query("COMMIT");
    const elapsed = Date.now() - start;
    console.log(`  ✓ ${elapsed}ms`);
    log.push({ filename, statements: statements.length, elapsedMs: elapsed, status: "ok" });
    appliedCount++;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback failure
    }
    console.log("  ✗ FAILED");
    console.error(`\n  Error: ${err.message}`);
    if (err.position) console.error(`  Position: ${err.position}`);
    if (err.detail) console.error(`  Detail: ${err.detail}`);
    if (err.hint) console.error(`  Hint: ${err.hint}`);
    console.error(
      `\n  ${appliedCount} of ${MIGRATIONS.length} applied successfully before this failure.`,
    );
    console.error(`  Stopping. Restore from Neon backup branch if needed.\n`);
    log.push({ filename, status: "failed", error: err.message });
    await client.end();
    console.log("\n=== APPLY LOG ===");
    console.log(JSON.stringify(log, null, 2));
    process.exit(1);
  }
}

await client.end();

console.log(
  `\n✓ All ${appliedCount}/${MIGRATIONS.length} migrations applied successfully.`,
);
console.log("\n=== APPLY LOG ===");
console.log(JSON.stringify(log, null, 2));
