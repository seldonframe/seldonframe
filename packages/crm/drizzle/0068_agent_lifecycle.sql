-- packages/crm/drizzle/0068_agent_lifecycle.sql
-- Agent lifecycle slice (Learn -> Verify -> Connect -> Run -> Sell).
-- HAND-WRITTEN (house rule: never drizzle-kit generate in this repo). Design:
-- docs/superpowers/specs/2026-07-11-agent-lifecycle-design.md.
--
-- supervised_runs: one real-tool, supervised run of an agent template (Stage
-- 04 "Run"), org-scoped. actionLog carries SUMMARIZED tool events only (tool
-- name + a short human line + status) -- never raw tool payloads.
--
-- recording_sessions.answered_questions: the Learned stage's Q&A record.
--
-- Additive only + idempotent (CREATE ... IF NOT EXISTS / ADD COLUMN IF NOT
-- EXISTS) so a re-run after an out-of-band apply is a no-op.

ALTER TABLE "recording_sessions" ADD COLUMN IF NOT EXISTS "answered_questions" jsonb;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "supervised_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "template_id" uuid NOT NULL,
  "status" text DEFAULT 'running' NOT NULL,
  "action_log" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "summary" text,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finished_at" timestamp with time zone,
  CONSTRAINT "supervised_runs_org_id_fk"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE cascade,
  CONSTRAINT "supervised_runs_template_id_fk"
    FOREIGN KEY ("template_id") REFERENCES "agent_templates"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supervised_runs_org_template_started_idx" ON "supervised_runs" ("org_id", "template_id", "started_at");
