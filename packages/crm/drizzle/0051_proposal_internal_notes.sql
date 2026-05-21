-- 2026-05-21 — Proposal Builder: operator-only internal notes
-- (JSONB array of { body, createdAt, createdByUserId }). Append-only;
-- deletion is intentional (no edit-in-place since notes are timestamped
-- observations). Not visible on the public /p/[token] page.

ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS internal_notes JSONB NOT NULL DEFAULT '[]'::jsonb;
