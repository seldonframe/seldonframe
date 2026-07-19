-- packages/crm/drizzle/0073_agent_run_receipts.sql
-- Agent run receipts slice — a queryable record of every agent RUN
-- attempt (push / schedule / event), keep-forever. Spec: docs/superpowers/
-- specs/2026-07-16-agent-receipts-design.md.
--
-- HAND-WRITTEN (house rule: never drizzle-kit generate in this repo).
-- Additive only + idempotent (CREATE ... IF NOT EXISTS) so a re-run after an
-- out-of-band apply is a no-op. Mirrors 0072_agent_action_drafts.sql's style.

CREATE TABLE IF NOT EXISTS "agent_run_receipts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "deployment_id" uuid REFERENCES "deployments"("id") ON DELETE SET NULL,
  "trigger_kind" text NOT NULL,
  "source_ref" text,
  "status" text NOT NULL,
  "summary" text NOT NULL,
  "tool_calls" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "agent_run_receipts_org_created_idx"
  ON "agent_run_receipts" ("org_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "agent_run_receipts_deployment_created_idx"
  ON "agent_run_receipts" ("deployment_id", "created_at" DESC);
