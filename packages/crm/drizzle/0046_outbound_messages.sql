-- packages/crm/drizzle/0046_outbound_messages.sql
-- 2026-05-18 — Outbound messaging layer (plan v2, slice 2).
--
-- Two tables: outbound_message_triggers (operator config: when X event
-- fires, send Y skill via Z channel) + outbound_message_sends (audit
-- log of every dispatch attempt). See db/schema/outbound-messages.ts
-- for the full doc string. Named with the outbound_ prefix to avoid
-- colliding with the existing SLICE-7 message_triggers table (which
-- handles INBOUND SMS routing — symmetric but unrelated).

CREATE TABLE IF NOT EXISTS "outbound_message_triggers" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"          UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "event_type"      TEXT NOT NULL,
  "channel"         TEXT NOT NULL,
  "skill_id"        TEXT NOT NULL,
  "delay_minutes"   INTEGER NOT NULL DEFAULT 0,
  "enabled"         BOOLEAN NOT NULL DEFAULT TRUE,
  "custom_skill_md" TEXT,
  "notes"           TEXT,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "outbound_msg_triggers_org_event_idx"
  ON "outbound_message_triggers" ("org_id", "event_type");

CREATE UNIQUE INDEX IF NOT EXISTS "outbound_msg_triggers_org_event_channel_skill_uniq"
  ON "outbound_message_triggers" ("org_id", "event_type", "channel", "skill_id");

CREATE TABLE IF NOT EXISTS "outbound_message_sends" (
  "id"                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"               UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "trigger_id"           UUID REFERENCES "outbound_message_triggers"("id") ON DELETE SET NULL,
  "channel"              TEXT NOT NULL,
  "event_type"           TEXT NOT NULL,
  "contact_id"           UUID REFERENCES "contacts"("id") ON DELETE SET NULL,
  "to_address"           TEXT NOT NULL,
  "subject"              TEXT,
  "body"                 TEXT NOT NULL,
  "status"               TEXT NOT NULL DEFAULT 'queued',
  "external_message_id"  TEXT,
  "error"                TEXT,
  "sent_at"              TIMESTAMPTZ,
  "metadata"             JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at"           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "outbound_msg_sends_org_created_idx"
  ON "outbound_message_sends" ("org_id", "created_at");

CREATE INDEX IF NOT EXISTS "outbound_msg_sends_trigger_idx"
  ON "outbound_message_sends" ("trigger_id");

CREATE INDEX IF NOT EXISTS "outbound_msg_sends_contact_idx"
  ON "outbound_message_sends" ("contact_id");

CREATE INDEX IF NOT EXISTS "outbound_msg_sends_status_idx"
  ON "outbound_message_sends" ("org_id", "status");
