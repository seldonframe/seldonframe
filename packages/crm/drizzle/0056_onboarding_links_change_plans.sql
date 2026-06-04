-- packages/crm/drizzle/0056_onboarding_links_change_plans.sql
-- 2026-06-04 — Client-onboarding intake (Task 1 of 16).
-- Two tables:
--   onboarding_links — tokenized intake links sent to clients post-payment.
--                      Status flow: pending → submitted → applied.
--   change_plans     — wiring-agent output: validated diff to apply to the
--                      workspace (services, hours, branding, etc.).
--                      Status flow: pending_review → applied | discarded.
-- Spec: docs/superpowers/specs/2026-06-04-client-onboarding-intake-design.md

CREATE TABLE IF NOT EXISTS "onboarding_links" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"       uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "token"        text NOT NULL,
  "status"       text NOT NULL DEFAULT 'pending',
  "created_at"   timestamptz NOT NULL DEFAULT now(),
  "submitted_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "onboarding_links_token_idx"
  ON "onboarding_links" ("token");

CREATE TABLE IF NOT EXISTS "change_plans" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"        uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "submission_id" uuid,
  "plan"          jsonb NOT NULL,
  "status"        text NOT NULL DEFAULT 'pending_review',
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "applied_at"    timestamptz
);

CREATE INDEX IF NOT EXISTS "change_plans_org_idx"
  ON "change_plans" ("org_id");
