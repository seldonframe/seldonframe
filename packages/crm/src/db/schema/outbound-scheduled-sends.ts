// 2026-05-18 — Outbound scheduled sends (messaging plan v2, slice 6).
//
// Pending queue for time-delayed outbound messages. When a trigger
// has delayMinutes > 0 the dispatcher inserts a row here instead of
// composing/sending immediately; the cron worker at
// /api/cron/outbound-scheduled-sends polls every minute, claims due
// rows (fireAt <= now() AND status='pending'), and runs the same
// compose+send path the immediate dispatcher uses.
//
// Why not workflow_waits: workflow_waits is tied to workflow_runs
// (a step in an actual workflow spec). For "fire skill X at startsAt
// minus 24h" we don't want a synthetic workflow — we want a flat
// "fire at this time" queue. This table is that.
//
// Scheduling semantics (computed at insert time, persisted absolute):
//   - booking.* events  → fireAt = payload.startsAt - delayMinutes
//     (i.e. delayMinutes=1440 fires 24h BEFORE the appointment)
//   - everything else   → fireAt = now() + delayMinutes
//     (i.e. delayMinutes=4320 fires 3 days AFTER event received)
// The dispatcher resolves which mode applies; this table just stores
// the absolute fireAt.
//
// Cancellation: when a booking is cancelled, any pending scheduled
// sends for that booking are flipped to status='cancelled' so the
// reminder doesn't fire post-cancellation. Indexed on
// (orgId, payloadBookingId) to make that lookup cheap.

import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { contacts } from "./contacts";
import { organizations } from "./organizations";
import { outboundMessageTriggers } from "./outbound-messages";

export const outboundScheduledSends = pgTable(
  "outbound_scheduled_sends",
  {
    id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    triggerId: uuid("trigger_id")
      .notNull()
      .references(() => outboundMessageTriggers.id, { onDelete: "cascade" }),
    /** Channel mirrored from the trigger at schedule time so the row
     *  stays useful even if the trigger config changes before fire. */
    channel: text("channel").notNull(),
    /** The source event type. */
    eventType: text("event_type").notNull(),
    /** Absolute fire time. Cron tick selects WHERE fireAt <= now()
     *  AND status='pending'. */
    fireAt: timestamp("fire_at", { withTimezone: true }).notNull(),
    /** Optional contact link — when the recipient is in the CRM. */
    contactId: uuid("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    /** Frozen payload snapshot. We need this at fire time to build
     *  the render-vars (booking title, startsAt, etc.) without
     *  re-resolving the source event. Includes the bookingId / formId
     *  as appropriate so cancellations can target the right rows. */
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    /** 'pending' | 'fired' | 'cancelled' | 'failed'. */
    status: text("status").notNull().default("pending"),
    /** Filled with the outbound_message_sends row id once dispatched. */
    sendId: uuid("send_id"),
    /** Why it didn't fire (cancellation reason or error message). */
    note: text("note"),
    /** When the cron worker actually processed this row. */
    firedAt: timestamp("fired_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Cron tick hot path: pending rows due now, ordered by fire time.
    // Partial index keeps this tight under high write volume.
    index("outbound_scheduled_sends_due_idx")
      .on(table.fireAt)
      .where(sql`status = 'pending'`),
    // Cancellation lookup: when a booking is cancelled we need to find
    // pending sends scoped to that booking. The payload jsonb carries
    // bookingId via the dispatcher, so we index on (org, status, event)
    // to narrow the scan and apply the payload predicate after.
    index("outbound_scheduled_sends_cancel_idx").on(
      table.orgId,
      table.eventType,
      table.status,
    ),
    index("outbound_scheduled_sends_trigger_idx").on(table.triggerId),
  ],
);

export type OutboundScheduledSend = typeof outboundScheduledSends.$inferSelect;
export type NewOutboundScheduledSend = typeof outboundScheduledSends.$inferInsert;
