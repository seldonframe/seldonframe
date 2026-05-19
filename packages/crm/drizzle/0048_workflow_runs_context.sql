-- 2026-05-19 — RunContext: every workflow_run carries an identity
-- snapshot (customer, workspace, clock, agency, source) stamped at
-- startRun. Existing rows have context=NULL; the runtime lazily
-- rebuilds + persists on first access.
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS context JSONB;
