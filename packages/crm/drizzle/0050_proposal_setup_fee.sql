-- 2026-05-21 — Proposal Builder: optional one-time setup fee.
-- Spec: 2026-05-19-proposal-builder-design.md (extended). One-time charge
-- collected at acceptance via a second non-recurring line_item in the
-- Stripe Checkout session. Default 0 = no setup fee (most proposals).

ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS setup_fee_cents INTEGER NOT NULL DEFAULT 0;
