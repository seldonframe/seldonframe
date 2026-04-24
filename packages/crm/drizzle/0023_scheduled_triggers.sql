-- SLICE 5 PR 1 C4 — scheduled_triggers + scheduled_trigger_fires tables.
-- Authored manually per existing convention (drizzle-kit journal out of
-- sync; same pattern as 0019-0022). Additive; no backfill.
--
-- scheduled_triggers: one row per configured schedule per workspace.
-- scheduled_trigger_fires: idempotency / audit trail. UNIQUE on
--                          (scheduled_trigger_id, fire_time_utc)
--                          prevents double-fire across tick races.
--
-- Design choices per audit §3.2:
--   - timezone: text (IANA zone). Resolution at dispatch time via
--     resolveScheduleTimezone helper (trigger → workspace → UTC).
--   - catchup / concurrency: text enum stored as string; runtime asserts
--     the allowlist (same pattern as workflow_waits.resumedReason).
--   - nextFireAt: timezone-aware timestamp (polled by workflow-tick).
--   - ON DELETE CASCADE on org_id: deleting a workspace cascades its
--     scheduled triggers.
--   - scheduled_trigger_fires.fire_time_utc rounded to minute boundary
--     at insert time (matches 1-minute cron granularity per G-5-3).

CREATE TABLE IF NOT EXISTS "scheduled_triggers" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"          uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "archetype_id"    text NOT NULL,
  "cron_expression" text NOT NULL,
  "timezone"        text NOT NULL,
  "catchup"         text NOT NULL DEFAULT 'skip',
  "concurrency"     text NOT NULL DEFAULT 'skip',
  "next_fire_at"    timestamptz NOT NULL,
  "last_fired_at"   timestamptz,
  "enabled"         boolean NOT NULL DEFAULT true,
  "created_at"      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "scheduled_triggers_due_idx"
  ON "scheduled_triggers" ("next_fire_at");

CREATE UNIQUE INDEX IF NOT EXISTS "scheduled_triggers_org_archetype_idx"
  ON "scheduled_triggers" ("org_id", "archetype_id");

CREATE TABLE IF NOT EXISTS "scheduled_trigger_fires" (
  "id"                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "scheduled_trigger_id"  uuid NOT NULL REFERENCES "scheduled_triggers"("id") ON DELETE CASCADE,
  "fire_time_utc"         timestamptz NOT NULL,
  "dispatched_at"         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "scheduled_trigger_fires_unique_idx"
  ON "scheduled_trigger_fires" ("scheduled_trigger_id", "fire_time_utc");
