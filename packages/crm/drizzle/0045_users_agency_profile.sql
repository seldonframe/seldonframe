-- packages/crm/drizzle/0045_users_agency_profile.sql
-- Adds the agency_profile JSONB column to users for the web-onboarding pivot.
-- Spec: 2026-05-16-seldonframe-web-onboarding-pivot-design.md.
--
-- Backfill rule: for each user that has a primary org (users.org_id), copy the
-- org's name into agency_profile.name so existing accounts get a non-empty
-- agency identity. We do this in a single statement so the migration is idempotent.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "agency_profile" JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE "users" AS u
SET    "agency_profile" = jsonb_build_object('name', o.name)
FROM   "organizations" AS o
WHERE  u.org_id = o.id
  AND  (u.agency_profile = '{}'::jsonb OR u.agency_profile IS NULL)
  AND  o.name IS NOT NULL
  AND  length(o.name) > 0;
