-- May 1, 2026 — Measurement Layer 3: Brain learning OUTCOMES.
--
-- NOTE: a `brain_events` table already exists from the Brain v2
-- module (workspace_id / event_type / payload / salience_score). This
-- new table is a DIFFERENT concept — it records OUTCOME data that
-- trains the cross-workspace recommender. Renamed to brain_outcomes
-- to avoid colliding with the existing table.
--
-- Captures OUTCOME data per vertical. Where seldonframe_events is
-- "what happened" (operator journey), brain_outcomes is "what worked"
-- (which configurations / patterns produced positive outcomes per
-- vertical). The moat lives here.
--
-- Event_type + vertical + outcome give us per-vertical priors that
-- inform smarter defaults: which agent archetypes convert best for
-- HVAC operators, which page personalities convert intake forms
-- best for dental clinics, etc.
--
-- Loggers in src/lib/analytics/brain.ts are fire-and-forget. Indexes
-- target the queries we'll run for Brain analysis:
--   - by vertical + event_type + time (per-vertical learning)
--   - by outcome + time (success rate trend)
--   - by org + time (debugging individual workspace history)

CREATE TABLE IF NOT EXISTS "brain_outcomes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "vertical" varchar(50),
  "event_type" varchar(50) NOT NULL,
  "context" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "outcome" varchar(50),
  "outcome_value_cents" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_brain_outcomes_vertical"
  ON "brain_outcomes" ("vertical", "event_type", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_brain_outcomes_outcome"
  ON "brain_outcomes" ("outcome", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_brain_outcomes_org"
  ON "brain_outcomes" ("org_id", "created_at" DESC);

COMMENT ON TABLE "brain_outcomes" IS
  'Cross-workspace learning data — what works for each vertical. The moat. Fire-and-forget writes from src/lib/analytics/brain.ts at outcome moments (intake conversion, deal progression, agent run, booking show/no-show, workspace activation). Distinct from brain_events (Brain v2 salience-scored event log).';
