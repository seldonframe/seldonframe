-- packages/crm/drizzle/0075_replay_skills.sql
-- Deterministic replay — Reelier phase 2c, slice 2. Adds:
--   1. `agent_workflow_traces.kind` — 'trace' (slice 1, default) vs
--      'replay-run' (an L0 replay attempt's RunRecord, slice 2).
--   2. `replay_skills` — compiled-from-trace SKILL.md rows, at most one
--      'enabled' per deployment (partial unique index).
--
-- HAND-WRITTEN (house rule: never drizzle-kit generate in this repo).
-- Additive only + idempotent (IF NOT EXISTS / CREATE ... IF NOT EXISTS) so a
-- re-run after an out-of-band apply is a no-op. Mirrors 0074's style.

ALTER TABLE "agent_workflow_traces"
  ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'trace';

CREATE TABLE IF NOT EXISTS "replay_skills" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "deployment_id" uuid NOT NULL REFERENCES "deployments"("id") ON DELETE CASCADE,
  "name" text,
  "skill_md" text NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "source_trace_id" uuid REFERENCES "agent_workflow_traces"("id") ON DELETE SET NULL,
  "heal_count" integer NOT NULL DEFAULT 0,
  "last_replay_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- At most one ENABLED skill per deployment — replay-before-llm.ts's
-- org-scoped lookup assumes "the" enabled skill, singular.
CREATE UNIQUE INDEX IF NOT EXISTS "replay_skills_one_enabled_per_deployment_idx"
  ON "replay_skills" ("deployment_id")
  WHERE "status" = 'enabled';

CREATE INDEX IF NOT EXISTS "replay_skills_org_deployment_idx"
  ON "replay_skills" ("org_id", "deployment_id");
