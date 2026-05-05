-- v1.8.0 — custom domains for paying tiers (Growth $29, Scale $99).
--
-- Each row binds a custom hostname (joescuts.com) to a workspace.
-- Lifecycle:
--
--   1. Operator runs `add_custom_domain({ hostname: "joescuts.com" })`
--      from Claude Code. MCP gates on tier !== 'free'.
--   2. Backend calls Vercel Domains API to register the hostname under
--      our project. Vercel returns the verification CNAME target
--      (cname.vercel-dns.com) which we surface to the operator.
--   3. Operator adds the CNAME record at their DNS registrar
--      (Cloudflare, Namecheap, GoDaddy, etc.).
--   4. Operator runs `verify_domain` (or auto-verify polls). Backend
--      asks Vercel for verification status; once ok, we mark
--      verified_at + Vercel auto-provisions SSL via Let's Encrypt.
--   5. Once verified: proxy.ts (the host→workspace router) sees the
--      hostname, looks it up here, returns the workspace_id, page
--      renders for that workspace. Subdomain path stays as the
--      fallback for free-tier workspaces.
--
-- One workspace can have N custom domains (e.g. joescuts.com +
-- www.joescuts.com + bookings.joescuts.com). primary=true marks the
-- canonical domain that finalize_workspace + welcome_email use when
-- generating outbound links.

CREATE TABLE IF NOT EXISTS "workspace_domains" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  -- Lowercased + trimmed hostname. e.g. "joescuts.com", "www.joescuts.com".
  -- Never includes scheme or port. Unique across all workspaces — the
  -- whole point of a custom domain is exclusivity.
  "hostname" text NOT NULL,
  -- 'pending'  — registered with Vercel, awaiting DNS verification
  -- 'verified' — DNS resolves correctly + Vercel issued SSL
  -- 'failed'   — verification failed (e.g. wrong CNAME, registrar issue)
  -- 'removed'  — operator removed the domain; row kept for audit
  "status" text NOT NULL DEFAULT 'pending',
  -- Verification record we surface to the operator. For Vercel this is
  -- typically a CNAME pointing to "cname.vercel-dns.com" but we store
  -- whatever Vercel returns so registrar UIs match.
  "verification_record" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "verified_at" timestamptz,
  "failed_reason" text,
  -- The canonical domain for the workspace. Outbound URLs (welcome
  -- email, finalize_workspace summary) use this when set; fall back
  -- to <slug>.app.seldonframe.com otherwise.
  "is_primary" boolean NOT NULL DEFAULT false,
  -- Vercel-side identifier for this domain registration. We keep it
  -- so we can call verify/remove against the exact Vercel record.
  "vercel_domain_id" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- Hostname is globally unique among ACTIVE rows. We allow the same
-- hostname to reappear after a removal (so an operator who deletes
-- joescuts.com can re-add it later) by scoping the unique index to
-- non-removed rows.
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_domains_hostname_uniq"
  ON "workspace_domains" ("hostname")
  WHERE "status" != 'removed';

-- Lookup by workspace for the dashboard /settings/domains page +
-- list_workspace_domains MCP tool.
CREATE INDEX IF NOT EXISTS "workspace_domains_workspace_idx"
  ON "workspace_domains" ("workspace_id", "created_at" DESC);

-- proxy.ts hot path: hostname-to-workspace lookup. Only verified
-- domains route traffic.
CREATE INDEX IF NOT EXISTS "workspace_domains_active_lookup_idx"
  ON "workspace_domains" ("hostname")
  WHERE "status" = 'verified';
