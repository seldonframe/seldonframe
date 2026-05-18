-- packages/crm/drizzle/0047_outbound_scheduled_sends.sql
-- 2026-05-18 — Outbound scheduled sends (messaging plan v2, slice 6).
--
-- Time-delayed queue for outbound messages. See
-- db/schema/outbound-scheduled-sends.ts for the full doc.

CREATE TABLE IF NOT EXISTS "outbound_scheduled_sends" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"      UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "trigger_id"  UUID NOT NULL REFERENCES "outbound_message_triggers"("id") ON DELETE CASCADE,
  "channel"     TEXT NOT NULL,
  "event_type"  TEXT NOT NULL,
  "fire_at"     TIMESTAMPTZ NOT NULL,
  "contact_id"  UUID REFERENCES "contacts"("id") ON DELETE SET NULL,
  "payload"     JSONB NOT NULL,
  "status"      TEXT NOT NULL DEFAULT 'pending',
  "send_id"     UUID,
  "note"        TEXT,
  "fired_at"    TIMESTAMPTZ,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "outbound_scheduled_sends_due_idx"
  ON "outbound_scheduled_sends" ("fire_at")
  WHERE "status" = 'pending';

CREATE INDEX IF NOT EXISTS "outbound_scheduled_sends_cancel_idx"
  ON "outbound_scheduled_sends" ("org_id", "event_type", "status");

CREATE INDEX IF NOT EXISTS "outbound_scheduled_sends_trigger_idx"
  ON "outbound_scheduled_sends" ("trigger_id");
