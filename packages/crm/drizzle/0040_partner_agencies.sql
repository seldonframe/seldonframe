-- v1.17.0 — partner agencies (white-label CRM resellers).
--
-- Hierarchy:
--   Layer 0  SeldonFrame (us)
--   Layer 1  Agency (paying SF customer; Scale-tier only)
--   Layer 2  Agency's client workspace (e.g. dentist, HVAC contractor)
--   Layer 3  The agency's client's customers (end users)
--
-- This table holds Layer 1. Layer 2 workspaces opt into the
-- relationship via organizations.parent_agency_id (added in this
-- migration as well). When set, the workspace's chrome substitutes
-- the agency's branding (logo, colors, sender domain, support
-- email) for SeldonFrame's. When NULL, default SF branding applies
-- (existing behavior pre-v1.17, unchanged).
--
-- Lifecycle:
--   1. Scale-tier user runs `register_partner_agency` from Claude
--      Code. Creates a row here with status='pending'.
--   2. (v1.18+) Agency configures their sender domain via Resend.
--      verified_sender_at populated when DNS resolves.
--   3. (v1.20+) Agency configures their custom domain for hosting
--      client workspaces. agency_domain populated + verified.
--   4. Agency creates client workspaces and attaches them via
--      `attach_workspace_to_agency` → sets parent_agency_id on
--      organizations.
--   5. From then on, every chrome surface for those workspaces
--      reads parent_agency → uses agency's branding.

CREATE TABLE IF NOT EXISTS "partner_agencies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Operator-facing identity.
  "name" text NOT NULL,
  "slug" text NOT NULL,

  -- Brand assets used by chrome substitution. Logos uploaded via
  -- Vercel Blob (same path as workspace logos). Colors are bare hex
  -- (#rrggbb). NULL = use the agency's "default" (SF defaults).
  "logo_url" text,
  "primary_color" text,
  "accent_color" text,

  -- Support pointers — replace the SF Discord / docs links in
  -- agency-branded chrome with the agency's own contact channels.
  "support_email" text,
  "support_url" text,

  -- v1.18+ — verified sender. When set, outbound emails (welcome,
  -- admin-link, portal-access-code) for workspaces attached to this
  -- agency are sent FROM this address instead of welcome@seldonframe.com.
  -- Verification flow: agency adds DNS records (SPF + DKIM) at their
  -- registrar; backend polls Resend; verified_sender_at populated on
  -- first successful verification. Resend's domain id is kept so we
  -- can call verify/remove against the exact record.
  "sender_email_address" text,
  "resend_domain_id" text,
  "verified_sender_at" timestamptz,

  -- v1.20+ — custom domain hosting agency-branded admin + clients.
  -- e.g. "crm.acmeai.com". Wildcard CNAME at *.crm.acmeai.com lets
  -- each client workspace get its own subdomain (dentist.crm.acmeai.com).
  -- Backed by the existing workspace_domains pattern; extended for
  -- agency-level domains in v1.20.
  "agency_domain" text,
  "agency_domain_verified_at" timestamptz,

  -- Plan gate: white-label is Scale-tier ($99) or higher. Enforced
  -- at agency creation + checked on every chrome substitution. If
  -- the owning user's plan drops below scale, status flips to
  -- 'suspended' and the chrome falls back to SF branding (data
  -- preserved; agency can reactivate by upgrading).
  "owner_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'pending',

  -- 'hide_powered_by_badge' lets the agency suppress the "Powered
  -- by SeldonFrame" footer badge on their clients' public pages.
  -- Scale-tier feature only.
  "hide_powered_by_badge" boolean NOT NULL DEFAULT false,

  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "partner_agencies_slug_uniq"
  ON "partner_agencies" ("slug")
  WHERE "status" != 'archived';

CREATE INDEX IF NOT EXISTS "partner_agencies_owner_idx"
  ON "partner_agencies" ("owner_user_id", "status");

-- v1.17 — workspaces opt into agency branding via this FK. NULL means
-- "no agency" (default SF chrome). ON DELETE SET NULL preserves the
-- workspace if the agency is removed.
ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "parent_agency_id" uuid
  REFERENCES "partner_agencies"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "organizations_parent_agency_idx"
  ON "organizations" ("parent_agency_id")
  WHERE "parent_agency_id" IS NOT NULL;
