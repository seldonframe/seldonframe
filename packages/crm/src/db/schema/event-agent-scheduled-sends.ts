// 2026-06-26 — Outbound-UX Bundle F2 (send delay): the durable queue for
// time-deferred EVENT-AGENT sends.
//
// runEventAgent (lib/agents/triggers/run-event-agent.ts) dispatches a fired
// SeldonEvent (booking.completed / lead.created) to an outbound message. When
// the matched agent's trigger carries `delayMinutes > 0` it must DEFER that
// send — a review-requester that fires its ask 24h AFTER the job, not the
// second the booking completes. The orchestrator enqueues the FROZEN EVENT
// CONTEXT (a ScheduledEventAgentSend) here instead of sending now; the cron
// consumer at /api/cron/event-agent-scheduled-sends picks up due rows and
// REPLAYS runEventAgent so the gates (throttle / guardrails / verify / memory)
// run at the ACTUAL send time, never at enqueue time.
//
// Why a SEPARATE table from outbound_scheduled_sends: that table is
// MESSAGE-TRIGGER-shaped — its `trigger_id` is a NOT-NULL FK to an
// outbound_message_triggers row, and its cron composes via the lib/messaging
// path which knows nothing of runEventAgent's skills/gates. Event agents have no
// outbound_message_triggers row and a completely different compose/verify/
// guardrail/memory pipeline. So F2 carries the event context forward (not a
// pre-composed message) and replays the orchestrator at due time. This table is
// that durable queue. See scheduled-event-agent.ts for the row contract.
//
// Columns mirror ScheduledEventAgentSend plus the queue bookkeeping (status /
// attempts / processed_at / last_error). The row is the frozen context: the cron
// reconstructs the FiredEvent from { event_type, org_id, contact_id, payload }
// and replays. agent_skill / channel are observability only — the replay
// re-resolves the matching agent(s) independently via findEventAgents.
//
// Idempotency / no double-fire: the cron claims a row by CAS'ing status
// 'pending' → 'sent'/'failed' (only a still-'pending' row is selected and the
// transition is conditional on status='pending'), so a row can fire at most once
// even if two ticks race. A still-delayed agent can't re-defer on replay because
// runDueScheduledEventAgent strips the enqueue seam (no second row is ever
// inserted from inside a replay).

import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { contacts } from "./contacts";
import { organizations } from "./organizations";

export const eventAgentScheduledSends = pgTable(
  "event_agent_scheduled_sends",
  {
    id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** The SeldonEvent slug to replay (e.g. "booking.completed"). */
    eventType: text("event_type").notNull(),
    /** Optional contact link — the recipient. null → the replay no-ops (same as
     *  the live path). SET NULL on delete so a removed contact doesn't strand
     *  the row, just renders the replay a graceful skip. */
    contactId: uuid("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    /** The frozen event payload, passed back into the replayed FiredEvent so
     *  compose runs against the same event data the immediate path would have. */
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    /** The skill the matched agent ran (e.g. "review-requester") — for the audit
     *  row / observability; the replay re-resolves agents independently. */
    agentSkill: text("agent_skill").notNull(),
    /** The channel the matched agent used ("sms" | "email") — observability. */
    channel: text("channel").notNull(),
    /** Absolute time the send becomes due. Cron tick selects WHERE due_at <=
     *  now() AND status='pending'. */
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    /** 'pending' | 'sent' | 'failed' | 'skipped'. */
    status: text("status").notNull().default("pending"),
    /** How many times the cron has attempted this row (incremented on failure). */
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** When the cron worker actually processed this row (sent/failed/skipped). */
    processedAt: timestamp("processed_at", { withTimezone: true }),
    /** The error message if the replay failed. */
    lastError: text("last_error"),
  },
  (table) => [
    // Cron tick hot path: pending rows due now, ordered by due time. Partial
    // index keeps the scan tight under write volume.
    index("event_agent_scheduled_sends_due_idx")
      .on(table.dueAt)
      .where(sql`status = 'pending'`),
    // Per-org lookups (cancellation / observability) scoped by status.
    index("event_agent_scheduled_sends_org_idx").on(
      table.orgId,
      table.status,
    ),
  ],
);

export type EventAgentScheduledSend = typeof eventAgentScheduledSends.$inferSelect;
export type NewEventAgentScheduledSend = typeof eventAgentScheduledSends.$inferInsert;
