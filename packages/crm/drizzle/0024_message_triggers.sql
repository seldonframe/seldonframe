-- SLICE 7 PR 1 C3 — message_triggers + message_trigger_fires tables.
-- Authored manually per existing convention (matches 0023 scheduled_triggers).
-- Additive; no backfill.
--
-- message_triggers: materialized lookup index. Webhook receiver queries
--                   (org_id, channel, enabled=true) at request time.
-- message_trigger_fires: idempotency / observability. UNIQUE on
--                        (trigger_id, message_id) prevents double-fire
--                        when Twilio re-delivers (timeout retry race).
--                        Per G-7-6 + L-22 addendum (structural enforcement).
--
-- Design choices per audit §4.3 + §5.3 + gates G-7-6, G-7-8:
--   - channel: text (allowlist enforced at app layer; v1 = "sms" only).
--   - channel_binding + pattern: jsonb (Zod-validated at materializer).
--   - enabled: boolean default true; setEnabled() toggles for
--     temporary disable without DELETE.
--   - skipped_reason: text (loop_guard | no_match | already_fired |
--     dispatch_failed | NULL); enables observability without separate
--     table.
--   - run_id: nullable uuid; null when fire was skipped.
--   - ON DELETE CASCADE on org_id: deleting a workspace cascades its
--     message triggers (and their fires).

CREATE TABLE IF NOT EXISTS "message_triggers" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"          uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "archetype_id"    text NOT NULL,
  "channel"         text NOT NULL,
  "channel_binding" jsonb NOT NULL,
  "pattern"         jsonb NOT NULL,
  "enabled"         boolean NOT NULL DEFAULT true,
  "created_at"      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "message_triggers_lookup_idx"
  ON "message_triggers" ("org_id", "channel", "enabled");

CREATE UNIQUE INDEX IF NOT EXISTS "message_triggers_org_archetype_idx"
  ON "message_triggers" ("org_id", "archetype_id");

CREATE TABLE IF NOT EXISTS "message_trigger_fires" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "trigger_id"     uuid NOT NULL REFERENCES "message_triggers"("id") ON DELETE CASCADE,
  "message_id"     text NOT NULL,
  "run_id"         uuid,
  "skipped_reason" text,
  "fired_at"       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "message_trigger_fires_unique_idx"
  ON "message_trigger_fires" ("trigger_id", "message_id");

CREATE INDEX IF NOT EXISTS "message_trigger_fires_trigger_idx"
  ON "message_trigger_fires" ("trigger_id", "fired_at");
