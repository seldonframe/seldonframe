-- SLICE 5 PR 1 C3 — workspace timezone column on organizations.
-- Authored manually (drizzle-kit journal out of sync; same pattern as
-- 0019 / 0020 / 0021). Additive; no backfill complexity — default "UTC"
-- applies to all existing rows, and existing workspaces continue to
-- function unchanged since no trigger references this column yet.
--
-- Column:
--   organizations.timezone  text NOT NULL DEFAULT 'UTC'
--
-- Why "UTC" as the default (not browser locale / not NULL):
--   - NULL would require every consumer to handle nullable timezones;
--     the resolveScheduleTimezone helper already falls back through
--     (trigger → workspace → UTC), so a NOT NULL default "UTC" matches
--     the third tier of the fallback chain.
--   - Browser locale is not available at the DB layer.
--   - Operators who want a non-UTC default set it in a follow-up admin
--     UI slice (post-launch scope).
--
-- SLICE 5 scope uses this column only for scheduled-trigger next-fire
-- computation. Other surfaces (booking time, email delivery times,
-- dashboard date formatting) continue to read browser tz client-side.

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "timezone" text NOT NULL DEFAULT 'UTC';
