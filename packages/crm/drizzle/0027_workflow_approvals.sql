-- SLICE 10 PR 1 C2 — workflow_approvals table for the request_approval
-- primitive. Authored manually per existing convention (matches 0023,
-- 0024, 0025, 0026). Additive; no changes to existing tables.
--
-- Distinct from workflow_waits (per G-10-9, Path B): the two pause
-- primitives have different semantics (event-arrival vs human-action)
-- and forcing them into one table requires nullable columns + runtime
-- discriminators. Two clean tables with focused indexes are easier
-- to reason about + extend.

CREATE TABLE IF NOT EXISTS "workflow_approvals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "run_id" uuid NOT NULL REFERENCES "workflow_runs"("id") ON DELETE CASCADE,
  "step_id" text NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),

  "approver_type" text NOT NULL,
  "approver_user_id" uuid,

  "status" text NOT NULL DEFAULT 'pending',

  "context_title" text NOT NULL,
  "context_summary" text NOT NULL,
  "context_preview" text,
  "context_metadata" jsonb,

  "timeout_action" text NOT NULL,
  "timeout_at" timestamp with time zone,

  "resolved_at" timestamp with time zone,
  "resolved_by_user_id" uuid,
  "resolution_comment" text,
  "resolution_reason" text,
  "override_flag" boolean NOT NULL DEFAULT false,

  "magic_link_token_hash" text,
  "magic_link_expires_at" timestamp with time zone,

  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Pending approvals for a workspace (admin /agents/approvals page).
-- Partial index keeps it tight as resolved rows accumulate.
CREATE INDEX IF NOT EXISTS "workflow_approvals_org_pending_idx"
  ON "workflow_approvals" ("org_id")
  WHERE status = 'pending';

-- Per-user pending approvals (notification follow-ups + future
-- client portal). Partial index — only rows with a bound user
-- and pending status.
CREATE INDEX IF NOT EXISTS "workflow_approvals_user_pending_idx"
  ON "workflow_approvals" ("approver_user_id")
  WHERE status = 'pending' AND approver_user_id IS NOT NULL;

-- Cron timeout sweep (parallel to workflow_waits_timeout_unresolved_idx).
CREATE INDEX IF NOT EXISTS "workflow_approvals_timeout_pending_idx"
  ON "workflow_approvals" ("timeout_at")
  WHERE status = 'pending' AND timeout_at IS NOT NULL;

-- Per-run lookup (admin /agents/runs drawer + run cancellation).
CREATE INDEX IF NOT EXISTS "workflow_approvals_run_idx"
  ON "workflow_approvals" ("run_id");

-- Magic-link token verification — partial index only on rows with
-- a hash present.
CREATE INDEX IF NOT EXISTS "workflow_approvals_magic_link_idx"
  ON "workflow_approvals" ("magic_link_token_hash")
  WHERE magic_link_token_hash IS NOT NULL;
