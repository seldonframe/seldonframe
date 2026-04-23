// block_subscription_registry — one row per installed block-level
// reactive subscription per workspace.
//
// Shipped in SLICE 1 PR 2 Commit 1 per tasks/step-subscription-audit.md
// §4.1. The registry is the source of truth for "which handlers run
// when event X fires in org Y". Rows are materialized from BLOCK.md
// parse at install time (PR 2 Commit 4 wires the install path; PR 1
// shipped the parser).
//
// Naming note: the audit uses "subscription_registry" as the table
// name. This repo already has a `subscriptions` Drizzle table for
// Stripe billing subscriptions; we prefix `block_` here to
// disambiguate at schema + SQL level. Keeping the conceptual name
// "subscription registry" in comments.
//
// Design choices (audit §4.1 + §4.2 + §4.3):
//   - One row per (orgId, blockSlug, eventType, handlerName). A block
//     with two handlers for the same event = two rows. Composite
//     uniqueness enforced at the app layer (not a DB constraint) to
//     keep install-time re-entry cheap: registerSubscription upserts
//     on that tuple.
//   - active flag drives the cron's scan filter. G-4 install-time
//     "dormant" subscriptions land with active=false when their
//     producer block isn't installed yet. Flipped to true atomically
//     when the producer block installs (PR 2 Commit 4).
//   - idempotencyKeyTemplate is the template string authored in the
//     BLOCK.md's `idempotency_key` field (PR 1 schema default
//     `{{id}}`). The dispatcher resolves it against the envelope at
//     delivery time.
//   - filterPredicate stored as resolved JSON (NOT a raw template).
//     PR 1 `filter` is already a literal Predicate in the BLOCK.md
//     (not templated), so storage is a direct copy.
//   - retryPolicy stored as JSON {max, backoff, initial_delay_ms}.
//     Mirror of the PR 1 RetryPolicySchema shape.
//
// Index access patterns:
//   - Cron scan on emit (bus extension, Commit 2): "for this event +
//     org, which subscriptions match?" → (orgId, eventType, active)
//   - Admin list (Commit 5): "all subscriptions for this block" →
//     (orgId, blockSlug)

import { sql } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { organizations } from "./organizations";

export const blockSubscriptionRegistry = pgTable(
  "block_subscription_registry",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // The block that DECLARED the subscription (carries the
    // handler module). NOT the block that emits the event —
    // see eventType for that side of the relationship.
    blockSlug: text("block_slug").notNull(),
    // Bare event name (no block-slug prefix). PR 1 parser strips the
    // `<source-block>:` prefix before auto-populating consumes; we
    // store the same bare shape for dispatch matching against
    // SeldonEvent.type.
    eventType: text("event_type").notNull(),
    handlerName: text("handler_name").notNull(),
    idempotencyKeyTemplate: text("idempotency_key_template").notNull().default("{{id}}"),
    filterPredicate: jsonb("filter_predicate").$type<Record<string, unknown> | null>(),
    retryPolicy: jsonb("retry_policy")
      .$type<{ max: number; backoff: "exponential" | "linear" | "fixed"; initial_delay_ms: number }>()
      .notNull()
      .default(sql`'{"max":3,"backoff":"exponential","initial_delay_ms":1000}'::jsonb`),
    // G-4: `false` when declared but the producer block isn't
    // installed. Cron scan filters on this.
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Cron scan on emit — partial index on `active=true` keeps it
    // tight under large inactive sets (e.g., a workspace with many
    // dormant subscriptions for uninstalled blocks).
    index("block_subscription_registry_org_event_active_idx")
      .on(table.orgId, table.eventType)
      .where(sql`active = true`),
    // Admin list for a specific block.
    index("block_subscription_registry_org_block_idx").on(table.orgId, table.blockSlug),
  ],
);

export type StoredBlockSubscription = typeof blockSubscriptionRegistry.$inferSelect;
export type NewBlockSubscription = typeof blockSubscriptionRegistry.$inferInsert;
