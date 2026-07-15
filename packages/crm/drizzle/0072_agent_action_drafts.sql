-- packages/crm/drizzle/0072_agent_action_drafts.sql
-- Never-fail-compile slice — drafts filed by draft_for_approval, resolved
-- from /approvals. Spec: docs/superpowers/specs/
-- 2026-07-15-never-fail-compile-design.md.
--
-- HAND-WRITTEN (house rule: never drizzle-kit generate in this repo).
-- Additive only + idempotent (CREATE ... IF NOT EXISTS) so a re-run after an
-- out-of-band apply is a no-op.

CREATE TABLE IF NOT EXISTS "agent_action_drafts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "agent_id" text NOT NULL,
  "conversation_id" text NOT NULL,
  "step_action" text NOT NULL,
  "kind" text NOT NULL,
  "title" text NOT NULL,
  "content" jsonb NOT NULL,
  "tier" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "resolved_by_user_id" uuid,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "agent_action_drafts_org_status_created_idx"
  ON "agent_action_drafts" ("org_id", "status", "created_at");

CREATE INDEX IF NOT EXISTS "agent_action_drafts_org_agent_idx"
  ON "agent_action_drafts" ("org_id", "agent_id");

-- The atomic idempotency claim: one pending draft per (org, conversation,
-- step). Partial (pending-only) so resolved steps can re-file later.
CREATE UNIQUE INDEX IF NOT EXISTS "agent_action_drafts_pending_step_uniq"
  ON "agent_action_drafts" ("org_id", "conversation_id", "step_action")
  WHERE status = 'pending';
