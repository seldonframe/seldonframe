-- v1.19.0 — partner_agencies polymorphic ownership.
--
-- v1.17 created the partner_agencies table with owner_user_id as the
-- ownership identity. The /api/v1/partner-agencies route resolves
-- owner_user_id from the bearer's workspace.owner_id.
--
-- v1.18 smoke surfaced: workspaces created via create_workspace_v2
-- (the v2 anonymous flow) have owner_id = NULL. They get an owner
-- only when "claimed" by a user — and the v1.7.3 NextAuth bug means
-- many workspaces never get claimed even after the user signs in.
-- register_partner_agency 403'd because there was no user identity
-- to anchor the agency to.
--
-- v1.19 — accept either user-owner OR workspace-owner. Anonymous
-- workspaces (which is the dominant create_workspace_v2 path) can
-- now register agencies natively, no manual users-row INSERT needed.
--
-- Constraint: at least one of owner_user_id OR owner_workspace_id
-- must be set. Both can be set (when a workspace is later claimed,
-- the agency keeps both pointers — the user_id is preferred for
-- ownership checks).

ALTER TABLE "partner_agencies"
  ADD COLUMN IF NOT EXISTS "owner_workspace_id" uuid
  REFERENCES "organizations"("id") ON DELETE SET NULL;

-- Drop NOT NULL on owner_user_id (was already nullable per v1.17
-- schema definition, but make it explicit). owner_user_id is the
-- preferred ownership identity when present; owner_workspace_id is
-- the fallback for anonymous-workspace-as-actor.
-- (No-op for current schema — kept here for documentation +
-- defense in depth.)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partner_agencies'
      AND column_name = 'owner_user_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE "partner_agencies" ALTER COLUMN "owner_user_id" DROP NOT NULL;
  END IF;
END $$;

-- At-least-one-owner constraint. Both can be set; neither cannot.
-- Use a NOT VALID style add so existing rows (where both might be
-- NULL after a partial migration) don't block the deployment, then
-- backfill + validate.
ALTER TABLE "partner_agencies"
  ADD CONSTRAINT IF NOT EXISTS "partner_agencies_at_least_one_owner_check"
  CHECK ("owner_user_id" IS NOT NULL OR "owner_workspace_id" IS NOT NULL)
  NOT VALID;

-- Lookup index for "find all agencies owned by this workspace."
CREATE INDEX IF NOT EXISTS "partner_agencies_owner_workspace_idx"
  ON "partner_agencies" ("owner_workspace_id", "status")
  WHERE "owner_workspace_id" IS NOT NULL;
