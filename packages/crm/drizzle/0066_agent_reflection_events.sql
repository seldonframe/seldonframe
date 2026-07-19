-- 0066 — agent_reflection_events (the `/dream` loop's persisted signal).
-- Persists every vision_check verdict (previously console.log-only via
-- logEvent) so the daily dream routine has a queryable collect source. See
-- docs/superpowers/specs/2026-07-06-dream-loop-design.md.
CREATE TABLE IF NOT EXISTS "agent_reflection_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "surface" text NOT NULL,
  "instruction_summary" text,
  "trigger_tool" text,
  "pass" boolean NOT NULL,
  "skipped" text,
  "gaps" jsonb DEFAULT '[]'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_agent_reflection_events_created" ON "agent_reflection_events" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_agent_reflection_events_pass_created" ON "agent_reflection_events" ("pass", "created_at");
