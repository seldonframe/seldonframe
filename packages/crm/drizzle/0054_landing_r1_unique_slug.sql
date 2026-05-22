-- packages/crm/drizzle/0054_landing_r1_unique_slug.sql
-- 2026-05-22 — R1 landing auto-generator (landing-r1 wiring).
--
-- Changes:
--   1. Drop the plain (org_id, slug) index on landing_pages.
--   2. Add a UNIQUE constraint on (org_id, slug) so the R1 generator
--      can upsert with ON CONFLICT DO UPDATE — idempotent, no duplicate rows.
--
-- The unique constraint is backward-compatible: existing rows won't violate
-- it (no workspace has two landing_pages rows with the same slug). The 'r1'
-- slug used by the new generator is new and doesn't collide with 'home',
-- 'landing', etc. used by the old system.
--
-- migrate-tolerant.mjs will pick this up on the next Vercel deploy.
-- DO NOT run against the live database manually.

-- Step 1: remove the plain index (replaced by the unique constraint below)
DROP INDEX IF EXISTS "landing_pages_org_slug_idx";

-- Step 2: add the unique constraint
ALTER TABLE "landing_pages"
  ADD CONSTRAINT "landing_pages_org_slug_uniq"
  UNIQUE ("org_id", "slug");
