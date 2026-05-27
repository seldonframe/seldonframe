-- packages/crm/drizzle/0055_users_onboarding_completed_at.sql
-- 2026-05-27 — Unified onboarding shell.
--
-- Adds `onboarding_completed_at` to the users table. NULL means the user
-- is mid-onboarding; non-NULL means the shell never renders again. The
-- shell wraps three pages (/signup/connect-ai, /clients/new,
-- /clients/[slug]/ready) and uses this single timestamp as the source
-- of truth so the rendering decision is one SELECT, not a multi-table
-- join across the BYOK key + workspace count + domain status.
--
-- Backfill rule: any user created BEFORE this migration who already has
-- a saved card OR owns at least one workspace should be marked complete.
-- Otherwise the next time they hit any of the three shell-wrapped pages
-- they'd be surprised by an onboarding strip — by definition they are
-- already past the moment we're trying to drive them to.
--
-- A "saved card" is the proxy for "completed the v1 signup arc" (which
-- was card-first); an "owns a workspace" is the proxy for "made it
-- through /clients/new at least once". Either condition is sufficient.
-- New signups after this migration ships will have the column NULL
-- (the column default), so the shell engages for them on next visit.
--
-- migrate-tolerant.mjs will pick this up on the next Vercel deploy.
-- DO NOT run against the live database manually.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "onboarding_completed_at" timestamptz;

-- Backfill: any existing user who's clearly past onboarding shouldn't
-- be re-onboarded. Two independent conditions, either is enough:
--
--   (a) stripe_payment_method_id IS NOT NULL — they completed the old
--       card-first signup; whatever they did before is "done" by
--       definition.
--   (b) owns an organization (organizations.owner_id = u.id) OR is the
--       agency operator who parented one (organizations.parent_user_id
--       = u.id). They've already been through /clients/new and built
--       something; the shell would be a step backwards.
UPDATE "users" AS u
SET    "onboarding_completed_at" = NOW()
WHERE  u.onboarding_completed_at IS NULL
  AND  (
    u.stripe_payment_method_id IS NOT NULL
    OR EXISTS (
      SELECT 1
      FROM   "organizations" AS o
      WHERE  o.owner_id = u.id
         OR  o.parent_user_id = u.id
    )
  );
