/**
 * Schema audit: compare Drizzle definitions against the live Neon DB.
 * Usage: node packages/crm/scripts/schema-audit.mjs
 * Requires DATABASE_URL in env (or .env).
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { neon } from "@neondatabase/serverless";

const __dirname = dirname(fileURLToPath(import.meta.url));
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

const sql = neon(DATABASE_URL);

// ---------- Expected schema from Drizzle ----------
const expected = {
  organizations: {
    id: "uuid", name: "text", slug: "text", owner_id: "uuid", parent_user_id: "uuid",
    settings: "jsonb", soul: "jsonb", soul_id: "text", soul_content_generated: "integer",
    soul_learning: "jsonb", soul_completed_at: "timestamptz", enabled_blocks: "text[]",
    integrations: "jsonb", plan: "text", email_sends_this_month: "integer",
    ai_calls_today: "integer", usage_reset_at: "timestamptz",
    created_at: "timestamptz", updated_at: "timestamptz",
  },
  users: {
    id: "uuid", org_id: "uuid", name: "text", email: "text", role: "text",
    avatar_url: "text", email_verified: "timestamptz", password_hash: "text",
    plan_id: "text", stripe_customer_id: "text", stripe_subscription_id: "text",
    billing_period: "text", subscription_status: "text", trial_ends_at: "timestamptz",
    created_at: "timestamptz", updated_at: "timestamptz",
  },
  accounts: {
    user_id: "uuid", type: "text", provider: "text", provider_account_id: "text",
    refresh_token: "text", access_token: "text", expires_at: "integer",
    token_type: "text", scope: "text", id_token: "text", session_state: "text",
  },
  sessions: {
    session_token: "text", user_id: "uuid", expires: "timestamptz",
  },
  verification_tokens: {
    identifier: "text", token: "text", expires: "timestamptz",
  },
  contacts: {
    id: "uuid", org_id: "uuid", first_name: "text", last_name: "text", email: "text",
    phone: "text", company: "text", title: "text", status: "text", source: "text",
    score: "integer", tags: "text[]", custom_fields: "jsonb", assigned_to: "uuid",
    last_contacted_at: "timestamptz", created_at: "timestamptz", updated_at: "timestamptz",
  },
  pipelines: {
    id: "uuid", org_id: "uuid", name: "text", stages: "jsonb",
    is_default: "boolean", created_at: "timestamptz", updated_at: "timestamptz",
  },
  deals: {
    id: "uuid", org_id: "uuid", contact_id: "uuid", pipeline_id: "uuid",
    title: "text", value: "numeric", currency: "text", stage: "text",
    probability: "integer", expected_close_date: "date", assigned_to: "uuid",
    custom_fields: "jsonb", notes: "text",
    created_at: "timestamptz", updated_at: "timestamptz", closed_at: "timestamptz",
  },
  activities: {
    id: "uuid", org_id: "uuid", contact_id: "uuid", deal_id: "uuid", user_id: "uuid",
    type: "text", subject: "text", body: "text", metadata: "jsonb",
    scheduled_at: "timestamptz", completed_at: "timestamptz",
    created_at: "timestamptz", updated_at: "timestamptz",
  },
  bookings: {
    id: "uuid", org_id: "uuid", contact_id: "uuid", user_id: "uuid",
    title: "text", booking_slug: "text", full_name: "text", email: "text",
    notes: "text", provider: "text", status: "text",
    starts_at: "timestamptz", ends_at: "timestamptz", meeting_url: "text",
    external_event_id: "text", metadata: "jsonb",
    cancelled_at: "timestamptz", completed_at: "timestamptz",
    created_at: "timestamptz", updated_at: "timestamptz",
  },
  emails: {
    id: "uuid", org_id: "uuid", contact_id: "uuid", user_id: "uuid",
    provider: "text", from_email: "text", to_email: "text", subject: "text",
    body_text: "text", body_html: "text", status: "text",
    external_message_id: "text", open_count: "integer", click_count: "integer",
    sent_at: "timestamptz", opened_at: "timestamptz", last_clicked_at: "timestamptz",
    metadata: "jsonb", created_at: "timestamptz", updated_at: "timestamptz",
  },
  landing_pages: {
    id: "uuid", org_id: "uuid", title: "text", slug: "text", status: "text",
    source: "text", sections: "jsonb", content_html: "text", content_css: "text",
    editor_data: "jsonb", seo: "jsonb", settings: "jsonb",
    created_at: "timestamptz", updated_at: "timestamptz",
  },
  portal_access_codes: {
    id: "uuid", org_id: "uuid", contact_id: "uuid", email: "text",
    code_hash: "text", expires_at: "timestamptz", used_at: "timestamptz",
    created_at: "timestamptz",
  },
  portal_messages: {
    id: "uuid", org_id: "uuid", contact_id: "uuid", sender_type: "text",
    sender_name: "text", subject: "text", body: "text",
    attachment_url: "text", attachment_name: "text",
    is_pinned: "text", pinned_at: "timestamptz",
    created_at: "timestamptz", read_at: "timestamptz",
  },
  portal_resources: {
    id: "uuid", org_id: "uuid", contact_id: "uuid", title: "text",
    description: "text", url: "text", resource_type: "text",
    viewed_at: "timestamptz", created_at: "timestamptz",
  },
  intake_forms: {
    id: "uuid", org_id: "uuid", name: "text", slug: "text",
    fields: "jsonb", settings: "jsonb", is_active: "boolean",
    created_at: "timestamptz", updated_at: "timestamptz",
  },
  intake_submissions: {
    id: "uuid", org_id: "uuid", form_id: "uuid", contact_id: "uuid",
    data: "jsonb", created_at: "timestamptz", updated_at: "timestamptz",
  },
  metrics_snapshots: {
    id: "uuid", org_id: "uuid", date: "date",
    contacts_total: "integer", contacts_new: "integer",
    pipeline_value: "numeric", deals_won: "integer", deals_lost: "integer",
    win_rate: "numeric", avg_deal_cycle_days: "numeric",
    bookings_total: "integer", booking_no_show_rate: "numeric",
    emails_sent: "integer", email_open_rate: "numeric", email_click_rate: "numeric",
    portal_active_clients: "integer",
    revenue_total: "numeric", revenue_new: "numeric",
    custom_metrics: "jsonb", created_at: "timestamptz",
  },
  webhook_endpoints: {
    id: "uuid", org_id: "uuid", url: "text", events: "text[]",
    secret: "text", is_active: "boolean",
    created_at: "timestamptz", updated_at: "timestamptz",
  },
  api_keys: {
    id: "uuid", org_id: "uuid", name: "text", key_hash: "text",
    key_prefix: "text", last_used_at: "timestamptz", expires_at: "timestamptz",
    created_at: "timestamptz", updated_at: "timestamptz",
  },
  stripe_connections: {
    id: "uuid", org_id: "uuid", stripe_account_id: "text",
    access_token: "text", stripe_publishable_key: "text",
    is_active: "boolean", connected_at: "timestamptz",
    created_at: "timestamptz", updated_at: "timestamptz",
  },
  payment_records: {
    id: "uuid", org_id: "uuid", contact_id: "uuid", booking_id: "uuid",
    stripe_payment_intent_id: "text", amount: "numeric", currency: "text",
    status: "text", source_block: "text", source_id: "text", metadata: "jsonb",
    created_at: "timestamptz", updated_at: "timestamptz",
  },
  marketplace_blocks: {
    id: "uuid", block_id: "text", name: "text", description: "text",
    long_description: "text", icon: "text", category: "text",
    preview_images: "jsonb", seller_id: "uuid", seller_name: "text",
    seller_stripe_account_id: "text", price: "numeric", currency: "text",
    block_md: "text", generation_status: "text",
    install_count: "integer", rating_average: "numeric", rating_count: "integer",
    published_at: "timestamptz", created_at: "timestamptz", updated_at: "timestamptz",
  },
  generated_blocks: {
    id: "uuid", block_id: "text", seller_org_id: "uuid",
    files: "jsonb", status: "text", review_notes: "text",
    approved_at: "timestamptz", merged_at: "timestamptz",
    created_at: "timestamptz", updated_at: "timestamptz",
  },
  block_purchases: {
    id: "uuid", org_id: "uuid", user_id: "uuid", block_id: "text",
    stripe_payment_id: "text", purchased_at: "timestamptz",
  },
  block_ratings: {
    id: "uuid", block_id: "text", user_id: "uuid", org_id: "uuid",
    rating: "integer", review: "text", created_at: "timestamptz",
  },
  seldon_usage: {
    id: "uuid", org_id: "uuid", user_id: "uuid", block_id: "text",
    mode: "text", model: "text", input_tokens: "integer", output_tokens: "integer",
    estimated_cost: "numeric", billed_amount: "numeric", created_at: "timestamptz",
  },
};

// Normalise PG data_type to our categories
function normaliseType(dataType, udtName) {
  if (dataType === "uuid") return "uuid";
  if (dataType === "text" || dataType === "character varying") return "text";
  if (dataType === "integer" || dataType === "bigint" || dataType === "smallint") return "integer";
  if (dataType === "numeric") return "numeric";
  if (dataType === "boolean") return "boolean";
  if (dataType === "date") return "date";
  if (dataType === "jsonb") return "jsonb";
  if (dataType === "json") return "jsonb";
  if (dataType === "timestamp with time zone") return "timestamptz";
  if (dataType === "timestamp without time zone") return "timestamptz";
  if (dataType === "ARRAY") {
    if (udtName === "_text") return "text[]";
    return `${udtName}[]`;
  }
  return dataType;
}

// ---------- Query actual DB ----------
const existingTables = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`;
const existingTableNames = new Set(existingTables.map((r) => r.table_name));

const missingTables = [];
const missingColumns = [];
const typeMismatches = [];

for (const [tableName, columns] of Object.entries(expected)) {
  if (!existingTableNames.has(tableName)) {
    missingTables.push(tableName);
    continue;
  }

  // Get actual columns
  const actualCols = await sql`SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ${tableName}`;
  const actualMap = new Map(actualCols.map((c) => [c.column_name, normaliseType(c.data_type, c.udt_name)]));

  for (const [colName, expectedType] of Object.entries(columns)) {
    if (!actualMap.has(colName)) {
      missingColumns.push({ table: tableName, column: colName, expectedType });
    } else {
      const actualType = actualMap.get(colName);
      if (actualType !== expectedType) {
        typeMismatches.push({ table: tableName, column: colName, expected: expectedType, actual: actualType });
      }
    }
  }
}

// ---------- Report ----------
console.log("\n=== SCHEMA AUDIT REPORT ===\n");

if (missingTables.length) {
  console.log("MISSING TABLES:");
  for (const t of missingTables) console.log(`  - ${t}`);
} else {
  console.log("✓ All tables exist.");
}

console.log("");

if (missingColumns.length) {
  console.log("MISSING COLUMNS:");
  for (const c of missingColumns) console.log(`  - ${c.table}.${c.column} (expected: ${c.expectedType})`);
} else {
  console.log("✓ All columns exist.");
}

console.log("");

if (typeMismatches.length) {
  console.log("TYPE MISMATCHES:");
  for (const m of typeMismatches) console.log(`  - ${m.table}.${m.column}: expected ${m.expected}, got ${m.actual}`);
} else {
  console.log("✓ All column types match.");
}

console.log("\n=== END ===\n");

// neon() is stateless, no cleanup needed
