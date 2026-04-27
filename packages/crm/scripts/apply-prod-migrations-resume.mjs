// Resume migration applier — picks up after the 0015 false-positive.
// Phase 2 first-run state (verified via diag-prod-pre-15.mjs +
// verify-state.mjs):
//   0012 brain_event_salience          ✅ applied
//   0013 brain_feedback_score           ✅ applied
//   0014 workspace_secrets              ✅ applied
//   0015 workspace_bearer_tokens        ✅ SKIP — already fully applied
//                                          before this session (column +
//                                          index both present)
//   0016 → 0027                         ⏳ apply now
//
// Same per-file BEGIN/COMMIT atomicity. Stops at first real error.

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

// 0012-0014 already applied + 0015 already applied (skipped per Path A).
const MIGRATIONS = [
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

function splitStatements(sql) {
  return sql
    .split(/-->\s*statement-breakpoint/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const client = new Client({ connectionString: DATABASE_URL });
await client.connect();

console.log(
  `Connected. Resume mode: applying ${MIGRATIONS.length} migrations (0016 → 0027).\n`,
);

let appliedCount = 0;
const log = [];

for (const filename of MIGRATIONS) {
  const filepath = join(MIGRATIONS_DIR, filename);
  const sqlText = readFileSync(filepath, "utf8");
  const statements = splitStatements(sqlText);

  process.stdout.write(
    `→ ${filename.padEnd(50)} (${String(sqlText.length).padStart(5)}B, ${statements.length} stmt)`,
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
  `\n✓ All ${appliedCount}/${MIGRATIONS.length} resume-batch migrations applied successfully.`,
);
console.log("\n=== APPLY LOG ===");
console.log(JSON.stringify(log, null, 2));
