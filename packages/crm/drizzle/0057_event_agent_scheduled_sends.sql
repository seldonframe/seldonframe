-- packages/crm/drizzle/0057_event_agent_scheduled_sends.sql
-- 2026-06-26 — Outbound-UX Bundle F2 (send delay): durable queue for
-- time-deferred EVENT-AGENT sends.
--
-- When a matched event-agent's trigger carries delayMinutes > 0, runEventAgent
-- enqueues the FROZEN EVENT CONTEXT here instead of sending now; the cron at
-- /api/cron/event-agent-scheduled-sends picks up due rows and REPLAYS
-- runEventAgent so the gates (throttle / guardrails / verify / memory) run at the
-- actual send time. Separate from outbound_scheduled_sends because that table is
-- message-trigger-shaped (NOT-NULL FK to outbound_message_triggers). See
-- db/schema/event-agent-scheduled-sends.ts for the full doc.
--
-- Additive only. Idempotent (CREATE TABLE/INDEX IF NOT EXISTS) so a re-run after
-- an out-of-band apply is a no-op.

CREATE TABLE IF NOT EXISTS "event_agent_scheduled_sends" (
  "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"       UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "event_type"   TEXT NOT NULL,
  "contact_id"   UUID REFERENCES "contacts"("id") ON DELETE SET NULL,
  "payload"      JSONB NOT NULL,
  "agent_skill"  TEXT NOT NULL,
  "channel"      TEXT NOT NULL,
  "due_at"       TIMESTAMPTZ NOT NULL,
  "status"       TEXT NOT NULL DEFAULT 'pending',
  "attempts"     INTEGER NOT NULL DEFAULT 0,
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "processed_at" TIMESTAMPTZ,
  "last_error"   TEXT
);

-- Cron tick hot path: pending rows due now, ordered by due time.
CREATE INDEX IF NOT EXISTS "event_agent_scheduled_sends_due_idx"
  ON "event_agent_scheduled_sends" ("due_at")
  WHERE "status" = 'pending';

-- Per-org lookups (cancellation / observability) scoped by status.
CREATE INDEX IF NOT EXISTS "event_agent_scheduled_sends_org_idx"
  ON "event_agent_scheduled_sends" ("org_id", "status");
