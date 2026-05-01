-- May 1, 2026 — Measurement Layer 2: product analytics events.
--
-- A single append-only table that captures the operator journey from
-- workspace creation through conversion. Loggers in
-- src/lib/analytics/track.ts are fire-and-forget — failures here
-- never block or throw. Analyse with raw SQL until the volume earns
-- a visual dashboard.
--
-- Property bag is jsonb so the schema doesn't churn every time we
-- want to capture a new dimension. Indexes cover the three primary
-- access patterns:
--   - by event name + time (funnel queries)
--   - by org + time (per-workspace history / debugging)
--   - by time alone (recent-activity stream)

CREATE TABLE IF NOT EXISTS "seldonframe_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "event" varchar(100) NOT NULL,
  "org_id" uuid REFERENCES "organizations"("id") ON DELETE SET NULL,
  "contact_id" uuid,
  "properties" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_sf_events_event_time"
  ON "seldonframe_events" ("event", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_sf_events_org"
  ON "seldonframe_events" ("org_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_sf_events_created"
  ON "seldonframe_events" ("created_at" DESC);

COMMENT ON TABLE "seldonframe_events" IS
  'Product analytics events — tracks the operator journey from workspace creation through conversion. Fire-and-forget writes from src/lib/analytics/track.ts.';
