// 2026-05-18 — Outbound messaging layer schema (plan v2, slice 2).
//
// Naming note: SLICE 7 already shipped `message_triggers` + `message_trigger_fires`
// for INBOUND SMS routing (Twilio webhook → match pattern → fire agent).
// These tables here are the OUTBOUND symmetric: event fires → dispatch
// rule → compose + send. Different lifecycle, different access patterns,
// different table names so the two never collide.
//
// Two tables that together power transactional outbound messages
// (booking confirmation, intake auto-reply, reminders, etc.) per
// workspace.
//
//   outbound_message_triggers — one row per (workspace, event, channel,
//     skill). The default set is seeded when a workspace is created;
//     operators can disable, edit, or add via /emails or /sms (Slice 5
//     ships the editor; Slice 2 just reads platform defaults).
//
//   outbound_message_sends — append-only audit log of every customer-
//     facing outbound dispatch attempt. Powers the "Sent" tab on
//     /emails and the Sent log on /sms.
//
// Why two tables not one: triggers are operator-edited config (low
// write volume, important versioning surface); sends are append-only
// (high write volume, no edits). Different access patterns + different
// retention policies (sends can be pruned to 90 days; triggers never
// expire).

import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { contacts } from "./contacts";
import { organizations } from "./organizations";

// ─── outbound_message_triggers ──────────────────────────────────────────

export const outboundMessageTriggers = pgTable(
  "outbound_message_triggers",
  {
    id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Event that fires this trigger. e.g. 'booking.created',
     *  'booking.cancelled', 'intake.submitted'. Multiple triggers can
     *  exist for the same event (e.g. one email + one SMS). */
    eventType: text("event_type").notNull(),
    /** 'email' | 'sms'. Determines which send-from-api the dispatcher
     *  calls. */
    channel: text("channel").notNull(),
    /** Stable skill id, e.g. 'booking-confirmation',
     *  'booking-confirmation-sms', 'intake-auto-reply'. Maps to a file
     *  in lib/messaging/skills/<id>/SKILL.md via the registry. */
    skillId: text("skill_id").notNull(),
    /** How many minutes after the event fires to dispatch. 0 = immediate.
     *  Non-zero values use the workflow_waits primitive (Slice 6). */
    delayMinutes: integer("delay_minutes").notNull().default(0),
    /** When false, the trigger is skipped even if a matching event
     *  fires. Operators disable specific defaults this way. */
    enabled: boolean("enabled").notNull().default(true),
    /** Operator-supplied skill override, used in place of the platform
     *  skill (same pattern as agents.blueprint.customSkillMd). Empty
     *  string or null = use platform default. */
    customSkillMd: text("custom_skill_md"),
    /** Free-form notes the operator can attach to a trigger. */
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("outbound_msg_triggers_org_event_idx").on(table.orgId, table.eventType),
    uniqueIndex("outbound_msg_triggers_org_event_channel_skill_uniq").on(
      table.orgId,
      table.eventType,
      table.channel,
      table.skillId,
    ),
  ],
);

export type OutboundMessageTrigger = typeof outboundMessageTriggers.$inferSelect;
export type NewOutboundMessageTrigger = typeof outboundMessageTriggers.$inferInsert;

// ─── outbound_message_sends ────────────────────────────────────────────

export const outboundMessageSends = pgTable(
  "outbound_message_sends",
  {
    id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    triggerId: uuid("trigger_id").references(() => outboundMessageTriggers.id, {
      onDelete: "set null",
    }),
    /** Mirror of triggers.channel — denormalized so a send row stays
     *  useful after the trigger is deleted. */
    channel: text("channel").notNull(),
    /** The source event (e.g. 'booking.created'). */
    eventType: text("event_type").notNull(),
    /** Optional contact reference. Null when the recipient was only
     *  identified by email/phone at send time. */
    contactId: uuid("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    /** Email or phone the message was sent to, verbatim. */
    toAddress: text("to_address").notNull(),
    /** Email subject. Null for SMS. */
    subject: text("subject"),
    /** Final composed body. */
    body: text("body").notNull(),
    /** 'queued' | 'sent' | 'failed' | 'suppressed' | 'skipped'. */
    status: text("status").notNull().default("queued"),
    /** Resend message id / Twilio sid for delivery tracking. */
    externalMessageId: text("external_message_id"),
    /** Human-readable error if status='failed' (provider response,
     *  validator rejection, etc.) or status='skipped' (reason why). */
    error: text("error"),
    /** When the provider acked the send. */
    sentAt: timestamp("sent_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("outbound_msg_sends_org_created_idx").on(table.orgId, table.createdAt),
    index("outbound_msg_sends_trigger_idx").on(table.triggerId),
    index("outbound_msg_sends_contact_idx").on(table.contactId),
    index("outbound_msg_sends_status_idx").on(table.orgId, table.status),
  ],
);

export type OutboundMessageSend = typeof outboundMessageSends.$inferSelect;
export type NewOutboundMessageSend = typeof outboundMessageSends.$inferInsert;
