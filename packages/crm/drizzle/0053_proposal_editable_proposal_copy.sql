-- 2026-05-21 — Proposal Builder Phase E: per-proposal overrides for the
-- proposal-page copy (intro, timeline, terms). When NULL, the composed
-- HTML at send time falls back to the agency template defaults.
-- Mirrors the email_subject + email_body pattern shipped in 0052.

ALTER TABLE proposals ADD COLUMN IF NOT EXISTS intro_text TEXT;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS timeline_text TEXT;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS terms_text TEXT;
