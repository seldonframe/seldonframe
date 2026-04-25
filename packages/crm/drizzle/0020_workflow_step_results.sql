-- 2c PR 3 M1 — workflow_step_results table for step-trace observability.
-- Authored manually (drizzle-kit journal out of sync; same pattern as
-- 0019_workflow_tables.sql). Additive to the tables from migration
-- 0019; no backfill required.

CREATE TABLE "workflow_step_results" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL,
  "step_id" text NOT NULL,
  "step_type" text NOT NULL,
  "outcome" text NOT NULL,
  "capture_value" jsonb,
  "error_message" text,
  "duration_ms" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflow_step_results" ADD CONSTRAINT "workflow_step_results_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "workflow_step_results_run_idx" ON "workflow_step_results" USING btree ("run_id", "created_at" DESC);
