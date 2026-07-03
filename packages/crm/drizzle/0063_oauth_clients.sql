-- packages/crm/drizzle/0063_oauth_clients.sql
-- 2026-07-03 — OAuth 2.1 + Dynamic Client Registration for the claude.ai
-- connector directory (mcp.seldonframe.com/v1). Design:
-- docs/superpowers/specs/2026-07-03-oauth-connector-design.md §3.2.
--
-- Three additive tables, inert behind SF_OAUTH_ENABLED (no route reads or
-- writes them while the flag is off):
--
--   • oauth_clients — one row per DCR-registered client (RFC 7591). PUBLIC
--     clients only in v1: no client_secret column, token_endpoint_auth_method
--     is always "none". redirect_uris is the exact-match allowlist enforced
--     at /oauth/authorize and /api/oauth/token.
--   • oauth_authorization_codes — single-use, ≤60s-TTL codes, SHA-256-hashed
--     at rest (raw code is never stored). Bound at issuance to client_id +
--     redirect_uri + PKCE S256 code_challenge; consumed_at set atomically on
--     the one allowed redemption.
--   • oauth_refresh_tokens — rotating refresh tokens, SHA-256-hashed at
--     rest, family-linked (family_id) for OAuth 2.1 reuse detection:
--     presenting an already-revoked hash revokes the whole family plus the
--     live access token via api_key_id.
--
-- NO RLS on these tables — deliberate scope boundary, not an omission (plan
-- Global Constraints): they are only ever queried by the OAuth route
-- handlers themselves, which already hold org_id/client_id from the request
-- context; generic org-scoped app code never touches them (contrast
-- 0062_wallet_rls).
--
-- Additive only + idempotent (CREATE … IF NOT EXISTS) so a re-run after an
-- out-of-band apply is a no-op.

CREATE TABLE IF NOT EXISTS "oauth_clients" (
  "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "client_id"     TEXT NOT NULL UNIQUE,
  "client_name"   TEXT,
  "redirect_uris" JSONB NOT NULL,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "oauth_clients_client_id_idx"
  ON "oauth_clients" ("client_id");

CREATE TABLE IF NOT EXISTS "oauth_authorization_codes" (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "code_hash"      TEXT NOT NULL UNIQUE,
  "client_id"      TEXT NOT NULL REFERENCES "oauth_clients" ("client_id") ON DELETE CASCADE,
  "redirect_uri"   TEXT NOT NULL,
  "org_id"         UUID NOT NULL REFERENCES "organizations" ("id") ON DELETE CASCADE,
  "user_id"        UUID NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "code_challenge" TEXT NOT NULL,
  "resource"       TEXT,
  "scope"          TEXT,
  "expires_at"     TIMESTAMPTZ NOT NULL,
  "consumed_at"    TIMESTAMPTZ,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "oauth_auth_codes_code_hash_idx"
  ON "oauth_authorization_codes" ("code_hash");
CREATE INDEX IF NOT EXISTS "oauth_auth_codes_client_id_idx"
  ON "oauth_authorization_codes" ("client_id");

CREATE TABLE IF NOT EXISTS "oauth_refresh_tokens" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "token_hash"  TEXT NOT NULL UNIQUE,
  "family_id"   UUID NOT NULL,
  "client_id"   TEXT NOT NULL REFERENCES "oauth_clients" ("client_id") ON DELETE CASCADE,
  "org_id"      UUID NOT NULL REFERENCES "organizations" ("id") ON DELETE CASCADE,
  "user_id"     UUID NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "api_key_id"  UUID REFERENCES "api_keys" ("id") ON DELETE CASCADE,
  "resource"    TEXT,
  "revoked_at"  TIMESTAMPTZ,
  "expires_at"  TIMESTAMPTZ NOT NULL,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "oauth_refresh_tokens_token_hash_idx"
  ON "oauth_refresh_tokens" ("token_hash");
CREATE INDEX IF NOT EXISTS "oauth_refresh_tokens_family_id_idx"
  ON "oauth_refresh_tokens" ("family_id");
