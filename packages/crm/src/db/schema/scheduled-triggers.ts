// scheduled_triggers + scheduled_trigger_fires — durable persistence
// for SLICE 5 scheduled triggers.
//
// Shipped in SLICE 5 PR 1 C4 per audit §3.2.
//
// Design (mirrors SLICE 2c workflow_waits pattern):
//   - scheduled_triggers: one row per configured schedule instance
//     per workspace. nextFireAt is the polling cursor; the cron-tick
//     dispatcher (C5) scans `enabled = true AND nextFireAt <= now()`.
//   - scheduled_trigger_fires: idempotency/audit trail. UNIQUE
//     (scheduledTriggerId, fireTimeUtc) prevents double-fire across
//     cron-tick races + restart windows (same invariant as
//     block_subscription_deliveries.(subscriptionId, idempotencyKey)).
//
// Catchup + concurrency enums stored as text; runtime asserts the
// allowlist (same pattern as workflow_waits.resumedReason).
//
// Timezone stored as an IANA string (e.g., "America/New_York").
// Resolution chain at dispatch time: trigger.timezone → workspace
// organizations.timezone → "UTC" (via resolveScheduleTimezone helper).

import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organizations } from "./organizations";

export const scheduledTriggers = pgTable(
  "scheduled_triggers",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    archetypeId: text("archetype_id").notNull(),
    cronExpression: text("cron_expression").notNull(),
    timezone: text("timezone").notNull(),
    catchup: text("catchup").notNull().default("skip"),
    concurrency: text("concurrency").notNull().default("skip"),
    nextFireAt: timestamp("next_fire_at", { withTimezone: true }).notNull(),
    lastFiredAt: timestamp("last_fired_at", { withTimezone: true }),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Dispatcher poll index: enabled + due triggers ordered by nextFireAt.
    index("scheduled_triggers_due_idx").on(t.nextFireAt),
    // One active schedule per (org, archetype). Future: support multiple
    // schedules per archetype by extending this uniqueness to include a
    // name/variant column.
    uniqueIndex("scheduled_triggers_org_archetype_idx").on(t.orgId, t.archetypeId),
  ],
);

export const scheduledTriggerFires = pgTable(
  "scheduled_trigger_fires",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    scheduledTriggerId: uuid("scheduled_trigger_id")
      .notNull()
      .references(() => scheduledTriggers.id, { onDelete: "cascade" }),
    // Rounded to minute boundary at insert time; matches cron granularity.
    fireTimeUtc: timestamp("fire_time_utc", { withTimezone: true }).notNull(),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Idempotency: the dispatcher attempts insert; UNIQUE conflict means
    // another tick already claimed this fire window.
    uniqueIndex("scheduled_trigger_fires_unique_idx").on(
      t.scheduledTriggerId,
      t.fireTimeUtc,
    ),
  ],
);

export type ScheduledTriggerRow = typeof scheduledTriggers.$inferSelect;
export type ScheduledTriggerFireRow = typeof scheduledTriggerFires.$inferSelect;
