// Diagnose what 0015 still needs after the partial-apply discovery.
// 0015 has 2 statements:
//   (1) ALTER TABLE api_keys ADD COLUMN kind text DEFAULT 'user' NOT NULL;
//   (2) CREATE INDEX api_keys_kind_prefix_idx ON api_keys (kind, key_prefix);
// We know (1) is already done. Check (2) and any other columns/indexes
// that subsequent migrations might also have partially applied.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { neon } from "@neondatabase/serverless";

const envText = readFileSync(resolve(process.cwd(), ".env.prod"), "utf8");
const DATABASE_URL = envText
  .split(/\r?\n/)
  .find((l) => l.startsWith("DATABASE_URL="))
  .replace(/^DATABASE_URL=/, "")
  .replace(/^"|"$/g, "");

const sql = neon(DATABASE_URL);

console.log("=== api_keys columns (does 'kind' really exist?) ===");
const apiKeysCols = await sql`
  SELECT column_name, data_type, column_default
  FROM information_schema.columns
  WHERE table_name = 'api_keys'
  ORDER BY ordinal_position
`;
for (const c of apiKeysCols) {
  console.log(`  ${c.column_name.padEnd(20)} ${c.data_type.padEnd(15)} default=${c.column_default ?? "—"}`);
}

console.log("\n=== api_keys indexes ===");
const idx = await sql`
  SELECT indexname, indexdef
  FROM pg_indexes
  WHERE tablename = 'api_keys'
  ORDER BY indexname
`;
for (const i of idx) {
  console.log(`  ${i.indexname}`);
  console.log(`    ${i.indexdef}`);
}

console.log("\n=== Quick check: are 0016/0017/0018 tables present? (sanity for the rest) ===");
const tables = await sql`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN (
      'email_events', 'conversations', 'conversation_messages', 'suppression_list',
      'sms_messages', 'sms_events',
      'invoices', 'invoice_items', 'subscriptions',
      'workflow_runs', 'workflow_waits', 'workflow_event_log',
      'workflow_step_results',
      'block_subscription_registry', 'block_subscription_deliveries',
      'scheduled_triggers', 'scheduled_trigger_fires',
      'message_triggers', 'message_trigger_fires',
      'workflow_approvals',
      'workspace_secrets'
    )
  ORDER BY table_name
`;
const present = new Set(tables.map((t) => t.table_name));
const expected = [
  "email_events", "conversations", "conversation_messages", "suppression_list",
  "sms_messages", "sms_events",
  "invoices", "invoice_items", "subscriptions",
  "workflow_runs", "workflow_waits", "workflow_event_log",
  "workflow_step_results",
  "block_subscription_registry", "block_subscription_deliveries",
  "scheduled_triggers", "scheduled_trigger_fires",
  "message_triggers", "message_trigger_fires",
  "workflow_approvals",
  "workspace_secrets",
];
for (const name of expected) {
  console.log(`  ${name.padEnd(35)} ${present.has(name) ? "PRESENT ✓" : "MISSING ✗"}`);
}

console.log("\n=== organizations columns post-0012/13/14 apply ===");
const orgCols = await sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'organizations' AND column_name IN ('timezone', 'test_mode')
`;
const orgColsPresent = new Set(orgCols.map((c) => c.column_name));
console.log(`  timezone (0022):  ${orgColsPresent.has("timezone") ? "PRESENT ✓" : "MISSING ✗"}`);
console.log(`  test_mode (0025): ${orgColsPresent.has("test_mode") ? "PRESENT ✓" : "MISSING ✗"}`);

console.log("\n=== brain_events columns post-0012/13 apply ===");
const brainCols = await sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'brain_events'
    AND column_name IN ('salience', 'feedback_score')
`;
const bSet = new Set(brainCols.map((c) => c.column_name));
console.log(`  salience (0012):       ${bSet.has("salience") ? "PRESENT ✓" : "MISSING ✗"}`);
console.log(`  feedback_score (0013): ${bSet.has("feedback_score") ? "PRESENT ✓" : "MISSING ✗"}`);
