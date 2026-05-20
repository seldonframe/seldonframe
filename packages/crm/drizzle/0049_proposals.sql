-- packages/crm/drizzle/0049_proposals.sql
-- 2026-05-19 — Proposal Builder. Two new tables + organizations.preview_mode
-- flag. Spec: 2026-05-19-proposal-builder-design.md.

CREATE TABLE IF NOT EXISTS "proposals" (
  "id"                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "agency_org_id"               UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "prospect_url"                TEXT NOT NULL,
  "prospect_name"               TEXT NOT NULL,
  "prospect_email"              TEXT NOT NULL,
  "prospect_first_name"         TEXT,
  "prospect_phone"              TEXT,
  "preview_workspace_id"        UUID REFERENCES "organizations"("id") ON DELETE SET NULL,
  "pricing_tier"                TEXT NOT NULL,
  "monthly_price_cents"         INTEGER NOT NULL,
  "generated_html"              TEXT NOT NULL,
  "scope_items"                 JSONB NOT NULL DEFAULT '[]'::jsonb,
  "status"                      TEXT NOT NULL DEFAULT 'draft',
  "signed_token"                TEXT NOT NULL UNIQUE,
  "sent_at"                     TIMESTAMPTZ,
  "first_viewed_at"             TIMESTAMPTZ,
  "accepted_at"                 TIMESTAMPTZ,
  "declined_at"                 TIMESTAMPTZ,
  "declined_reason"             TEXT,
  "expires_at"                  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  "stripe_checkout_session_id"  TEXT,
  "stripe_subscription_id"      TEXT,
  "stripe_customer_id"          TEXT,
  "created_at"                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "created_by_user_id"          UUID REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "proposals_agency_status_idx"
  ON "proposals"("agency_org_id", "status", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "proposals_signed_token_idx"
  ON "proposals"("signed_token");
CREATE INDEX IF NOT EXISTS "proposals_checkout_session_idx"
  ON "proposals"("stripe_checkout_session_id")
  WHERE "stripe_checkout_session_id" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "proposal_events" (
  "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "proposal_id"  UUID NOT NULL REFERENCES "proposals"("id") ON DELETE CASCADE,
  "event_type"   TEXT NOT NULL,
  "metadata"     JSONB,
  "ip_address"   TEXT,
  "user_agent"   TEXT,
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "proposal_events_proposal_idx"
  ON "proposal_events"("proposal_id", "created_at" DESC);

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "preview_mode" BOOLEAN NOT NULL DEFAULT FALSE;
