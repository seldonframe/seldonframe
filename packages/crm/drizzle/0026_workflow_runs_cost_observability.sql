-- SLICE 9 PR 2 C4 — cost observability columns on workflow_runs.
-- Authored manually per existing convention (matches 0023, 0024, 0025).
-- Additive; default 0 so existing rows + non-LLM runs record zero
-- cost cleanly.

ALTER TABLE "workflow_runs"
  ADD COLUMN IF NOT EXISTS "total_tokens_input" integer NOT NULL DEFAULT 0;

ALTER TABLE "workflow_runs"
  ADD COLUMN IF NOT EXISTS "total_tokens_output" integer NOT NULL DEFAULT 0;

ALTER TABLE "workflow_runs"
  ADD COLUMN IF NOT EXISTS "total_cost_usd_estimate" numeric(10, 4) NOT NULL DEFAULT 0;
