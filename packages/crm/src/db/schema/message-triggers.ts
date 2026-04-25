// message_triggers + message_trigger_fires — durable persistence for
// SLICE 7 message triggers.
//
// Shipped in SLICE 7 PR 1 C3 per audit §4.3 + §5.3 + gates G-7-6, G-7-8.
//
// Design (mirrors SLICE 5 scheduled_triggers pattern):
//   - message_triggers: materialized lookup index. Webhook receiver
//     queries enabled+channel rows at every inbound; pre-computed
//     channelBinding + pattern jsonb avoid scanning every agent's
//     specSnapshot on the hot path.
//   - message_trigger_fires: idempotency + observability. UNIQUE
//     (trigger_id, message_id) per G-7-6 — same invariant pattern as
//     scheduled_trigger_fires.(scheduledTriggerId, fireTimeUtc) and
//     block_subscription_deliveries.(subscriptionId, idempotencyKey).
//   - skipped_reason text column observability (per G-7-6): one of
//     loop_guard | no_match | already_fired | dispatch_failed; null
//     when the fire successfully created a run.
//
// Indexes (per G-7-8):
//   - (org_id, channel, enabled) — webhook hot-path lookup
//   - (org_id, archetype_id) — uniqueness for materializer (one trigger
//     per (org, archetype) at v1; future: multiple triggers per archetype
//     by extending the unique key with a name/variant column)

import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organizations } from "./organizations";

export const messageTriggers = pgTable(
  "message_triggers",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    archetypeId: text("archetype_id").notNull(),
    channel: text("channel").notNull(),
    channelBinding: jsonb("channel_binding").notNull(),
    pattern: jsonb("pattern").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Hot-path: webhook receiver queries (org, channel, enabled=true).
    index("message_triggers_lookup_idx").on(t.orgId, t.channel, t.enabled),
    // Materializer uniqueness: one message trigger per (org, archetype) at v1.
    uniqueIndex("message_triggers_org_archetype_idx").on(t.orgId, t.archetypeId),
  ],
);

export const messageTriggerFires = pgTable(
  "message_trigger_fires",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    triggerId: uuid("trigger_id")
      .notNull()
      .references(() => messageTriggers.id, { onDelete: "cascade" }),
    /** Provider-supplied message id (Twilio MessageSid for SMS). */
    messageId: text("message_id").notNull(),
    /** Null when the fire was skipped (no run created). */
    runId: uuid("run_id"),
    /** loop_guard | no_match | already_fired | dispatch_failed | NULL */
    skippedReason: text("skipped_reason"),
    firedAt: timestamp("fired_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // G-7-6: at-most-one fire per (trigger, inbound message). Dispatcher
    // attempts insert; UNIQUE conflict → "already fired" idempotent skip.
    uniqueIndex("message_trigger_fires_unique_idx").on(t.triggerId, t.messageId),
    // Observability: list fires for a trigger ordered chronologically.
    index("message_trigger_fires_trigger_idx").on(t.triggerId, t.firedAt),
  ],
);

export type MessageTriggerRow = typeof messageTriggers.$inferSelect;
export type MessageTriggerFireRow = typeof messageTriggerFires.$inferSelect;
