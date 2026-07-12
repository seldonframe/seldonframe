-- packages/crm/drizzle/0071_eval_run_jobs.sql
-- H2 hotfix (2026-07-11 prod incident) — an ephemeral poll target for the
-- out-of-request "Run evals" flow (see runAgentEvalsAction / after()).
-- The durable eval_runs table is unchanged; this table only exists so the
-- client has something to poll while the real work runs out-of-request.
--
-- HAND-WRITTEN (house rule: never drizzle-kit generate in this repo).
-- Additive only + idempotent (CREATE ... IF NOT EXISTS) so a re-run after an
-- out-of-band apply is a no-op.

CREATE TABLE IF NOT EXISTS "eval_run_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "template_id" uuid NOT NULL,
  "status" text DEFAULT 'running' NOT NULL,
  "result" jsonb,
  "error" text,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finished_at" timestamp with time zone,
  CONSTRAINT "eval_run_jobs_org_id_fk"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE cascade,
  CONSTRAINT "eval_run_jobs_template_id_fk"
    FOREIGN KEY ("template_id") REFERENCES "agent_templates"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "eval_run_jobs_org_template_started_idx" ON "eval_run_jobs" ("org_id", "template_id", "started_at");
