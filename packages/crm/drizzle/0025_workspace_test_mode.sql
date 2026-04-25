-- SLICE 8 C1 — workspace test_mode column on organizations.
-- Authored manually per existing convention (matches 0023, 0024).
-- Additive; default false so existing workspaces never route to sandbox.
--
-- G-8-1 APPROVED: top-level boolean column (mirrors plan / timezone
-- convention) rather than nested in settings JSONB. Indexed
-- implicitly via the workspace lookup hot path (org_id is already
-- the PK).
--
-- Per-provider test credentials live in
-- organizations.integrations.{twilio,resend}.test sub-objects
-- (typed via OrganizationIntegrations + validated by
-- TestModeConfigSchema at the persistence boundary).
-- No schema change needed for those — they're additive within the
-- existing `integrations` jsonb column.

ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "test_mode" boolean NOT NULL DEFAULT false;
