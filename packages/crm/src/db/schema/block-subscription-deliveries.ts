// block_subscription_deliveries — one row per (subscription, event)
// delivery attempt.
//
// Shipped in SLICE 1 PR 2 Commit 1 per tasks/step-subscription-audit.md
// §4.1 + §4.4 + G-6. The deliveries table drives the cron dispatcher:
// the bus enqueues a row when an event fires and matches an active
// subscription; the cron sweeps pending/failed rows, CAS-claims them,
// invokes the handler, and commits the outcome.
//
// Design choices (audit §4.1 + §4.4 + §4.5):
//   - Status enum matches PR 1's SubscriptionDeliveryStatusSchema
//     (contract-v2.ts): pending | in_flight | delivered | failed |
//     filtered | dead. G-6 `filtered` is distinct from
//     `delivered`/`failed` so admin can show "predicate rejected".
//   - claimedAt is the CAS cursor. NULL = claimable; set on
//     successful CAS. Mirrors workflow_waits.resumedAt pattern.
//   - UNIQUE (subscriptionId, idempotencyKey) absorbs duplicate
//     emissions: second insert with the same key fails with a
//     constraint violation; the bus handles the race quietly.
//   - Partial index on (status, nextAttemptAt) WHERE status IN
//     ('pending', 'failed') keeps the cron scan tight — `delivered`
//     and `dead` rows accumulate but never show up in the sweep.
//   - eventLogId FK cascade: if an event log row is deleted (90-day
//     retention), its deliveries go too. Deliveries and their
//     triggering event live and die together.

import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { blockSubscriptionRegistry } from "./block-subscription-registry";
import { workflowEventLog } from "./workflow-event-log";

// Mirrors SubscriptionDeliveryStatusSchema in lib/blocks/contract-v2.ts.
// Keeping both is deliberate: the Zod schema governs contract
// validation; this union governs DB storage. A single source of truth
// would cross-module couple the DB layer to the block authoring
// module.
export type BlockSubscriptionDeliveryStatus =
  | "pending"
  | "in_flight"
  | "delivered"
  | "failed"
  | "filtered"
  | "dead";

export const blockSubscriptionDeliveries = pgTable(
  "block_subscription_deliveries",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => blockSubscriptionRegistry.id, { onDelete: "cascade" }),
    eventLogId: uuid("event_log_id")
      .notNull()
      .references(() => workflowEventLog.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status").$type<BlockSubscriptionDeliveryStatus>().notNull().default("pending"),
    attempt: integer("attempt").notNull().default(1),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    // CAS cursor for at-most-once dispatch. NULL until claimed.
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Dedup: second emission with the same key + subscription is a
    // no-op insert (handled by bus via ON CONFLICT DO NOTHING).
    uniqueIndex("block_subscription_deliveries_sub_idem_uidx")
      .on(table.subscriptionId, table.idempotencyKey),
    // Cron sweep: pending / failed rows with nextAttemptAt <= now().
    index("block_subscription_deliveries_status_next_idx")
      .on(table.status, table.nextAttemptAt)
      .where(sql`status IN ('pending', 'failed')`),
    // Observability: all deliveries for a subscription (admin).
    index("block_subscription_deliveries_sub_idx").on(table.subscriptionId),
    // Observability: all deliveries for an event (debugging).
    index("block_subscription_deliveries_event_idx").on(table.eventLogId),
  ],
);

export type StoredBlockSubscriptionDelivery = typeof blockSubscriptionDeliveries.$inferSelect;
export type NewBlockSubscriptionDelivery = typeof blockSubscriptionDeliveries.$inferInsert;
