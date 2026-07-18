-- packages/crm/drizzle/0074_agent_workflow_traces.sql
-- Deterministic replay — Reelier phase 2c, slice 1 (OBSERVE MODE ONLY).
-- One row per email-triggered deployed-agent turn, recorded ONLY when
-- SF_DETERMINISTIC_REPLAY=1. `records` is a jsonb array in the Reelier
-- trace-record FORMAT (lib/deployments/replay/trace-format.ts) — no npm
-- dependency on Reelier, only the record contract. No replay in this slice.
--
-- HAND-WRITTEN (house rule: never drizzle-kit generate in this repo).
-- Additive only + idempotent (CREATE ... IF NOT EXISTS) so a re-run after an
-- out-of-band apply is a no-op. Mirrors 0073_agent_run_receipts.sql's style.

CREATE TABLE IF NOT EXISTS "agent_workflow_traces" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "deployment_id" uuid REFERENCES "deployments"("id") ON DELETE SET NULL,
  "trigger_kind" text NOT NULL,
  "trigger_key" text,
  "started_at" timestamp with time zone NOT NULL,
  "finished_at" timestamp with time zone NOT NULL,
  "ok" boolean NOT NULL,
  "call_count" integer NOT NULL DEFAULT 0,
  "records" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "input_tokens" integer NOT NULL DEFAULT 0,
  "output_tokens" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "agent_workflow_traces_org_deployment_created_idx"
  ON "agent_workflow_traces" ("org_id", "deployment_id", "created_at");
