-- 2026-05-21 — Proposal Builder: per-proposal email_subject + email_body
-- overrides. When NULL, sendProposalAction falls back to the
-- template-substituted default (subject) and the hardcoded default body.
-- prospect_first_name already exists; no schema change for that field.

ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS email_subject TEXT;
ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS email_body TEXT;
