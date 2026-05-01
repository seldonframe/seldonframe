-- May 1, 2026 — Client Portal V1.
--
-- Adds two columns to `contacts` so the operator can flip portal
-- access per contact and the admin UI can show a "Last seen: 3 days
-- ago" hint:
--   - portal_access_enabled: master switch the operator toggles in
--     the contact record's Portal Access card. Plan-gated to
--     Growth/Scale on the application side; if a workspace downgrades,
--     enabled rows still show a Disable affordance (we never auto-flip
--     on plan change).
--   - portal_last_login_at: stamped by verifyPortalAccessCodeAction +
--     establishPortalMagicSession every time the contact establishes
--     a portal session. Used by the operator dashboard to surface
--     activity and (future) for inviting-but-never-logged-in nudges.
--
-- Both are additive + nullable/defaulted so existing rows continue to
-- work without a backfill — the default of `false` for
-- portal_access_enabled means every existing contact starts with
-- portal disabled and the operator opts them in explicitly.

ALTER TABLE "contacts"
  ADD COLUMN IF NOT EXISTS "portal_access_enabled" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "portal_last_login_at" timestamp with time zone;

COMMENT ON COLUMN "contacts"."portal_access_enabled" IS
  'May 1, 2026 — operator-controlled flag for the Client Portal V1. When false, requestPortalAccessCodeAction silently no-ops so the contact cannot establish a portal session. Plan-gated to Growth/Scale on enable; disable is always permitted.';

COMMENT ON COLUMN "contacts"."portal_last_login_at" IS
  'May 1, 2026 — stamped on successful portal session establishment (OTC verify or magic-link). Surfaces as "Last seen: 3 days ago" on the contact record so operators can see whether their clients are actually using the portal.';
