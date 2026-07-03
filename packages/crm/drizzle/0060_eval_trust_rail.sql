-- packages/crm/drizzle/0060_eval_trust_rail.sql
-- 2026-07-02 — Improve verb + trust rail: eval_runs (durable eval-suite
-- results) + agent_improve_proposals (propose-only blueprint patch +
-- failure-cluster rationale) + marketplace_listings.trust_stats (cached
-- buyer-facing badge). See db/schema/eval-runs.ts + db/schema/marketplace.ts.
--
-- ADDITIVE ONLY — two new tables + one new nullable column on an existing
-- table. Idempotent (CREATE/ADD COLUMN … IF NOT EXISTS) so a re-run after an
-- out-of-band apply is a no-op.
--
-- No raw customer transcripts: eval_runs.results_summary and
-- agent_improve_proposals.rationale carry derived text only (scenario
-- titles/criteria/cluster evidence sentences <=200 chars each) — enforced at
-- the application layer, not by a DB constraint.

CREATE TABLE IF NOT EXISTS "eval_runs" (
  "id"                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"             UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "subject_kind"       TEXT NOT NULL,
  "subject_id"         UUID NOT NULL,
  "kind"               TEXT NOT NULL,
  "pass_rate"          INTEGER NOT NULL,
  "scenario_count"     INTEGER NOT NULL,
  "passed_count"       INTEGER NOT NULL,
  "grader_model"       TEXT,
  "blueprint_version"  INTEGER,
  "results_summary"    JSONB,
  "created_at"         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trust-badge + history lookups: latest runs for a given subject, newest
-- first.
CREATE INDEX IF NOT EXISTS "idx_eval_runs_subject_created"
  ON "eval_runs" ("subject_kind", "subject_id", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "agent_improve_proposals" (
  "id"                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"            UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "agent_id"          UUID NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "based_on_version"  INTEGER NOT NULL,
  "patch"             JSONB NOT NULL,
  "rationale"         JSONB NOT NULL,
  "baseline_run_id"   UUID REFERENCES "eval_runs"("id"),
  "candidate_run_id"  UUID REFERENCES "eval_runs"("id"),
  "status"            TEXT NOT NULL DEFAULT 'proposed',
  "created_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "resolved_at"       TIMESTAMPTZ
);

-- Studio panel's "open proposals for this agent" query.
CREATE INDEX IF NOT EXISTS "idx_improve_proposals_agent_status"
  ON "agent_improve_proposals" ("agent_id", "status");

-- Cached trust-badge snapshot on the existing listings table. Nullable —
-- absent means no eval history yet (pre-badge listings render unchanged).
ALTER TABLE "marketplace_listings" ADD COLUMN IF NOT EXISTS "trust_stats" JSONB;
