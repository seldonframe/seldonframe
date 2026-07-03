-- packages/crm/drizzle/0062_wallet_rls.sql
-- Postgres RLS Phase 1 (spec docs/superpowers/specs/2026-07-03-postgres-rls-defense-in-depth-design.md).
--
-- Enables Row-Level Security on the two money tables — wallet_accounts,
-- wallet_transactions — so Postgres itself refuses to return another
-- tenant's rows, independent of any application-layer WHERE org_id = …
-- filter. A path that forgets to scope its query (or the withOrgRls
-- context) now reads ZERO rows instead of silently leaking across tenants.
--
-- FAIL MODE: current_setting('app.org_id', true) returns NULL when unset
-- (the `true` second arg suppresses the "unset variable" error) — the
-- policy then matches nothing, which is DEFAULT-DENY. A caller that forgot
-- withOrgRls gets an empty result set, loudly wrong in dev, never a
-- silent cross-tenant leak in prod.
--
-- ROLES: this migration does NOT create seldonframe_app or
-- seldonframe_service, and does NOT grant credentials — those are Max's to
-- own in the Neon console (see the runbook at the bottom of this file).
-- The GRANT statements below are additive-and-guarded: they no-op via a
-- DO $$ block if the target role doesn't exist yet, so this migration is
-- safe to apply BEFORE Max has created the roles (RLS will simply have no
-- effect until a role that isn't BYPASSRLS actually connects — the
-- existing DATABASE_URL/service path is unaffected either way since
-- FORCE ROW LEVEL SECURITY still exempts the table owner).
--
-- IDEMPOTENT WHERE POSTGRES ALLOWS IT: ENABLE/FORCE ROW LEVEL SECURITY are
-- safe to re-run (no error). CREATE POLICY has no IF NOT EXISTS in
-- Postgres — a re-run raises 42710 duplicate_object, which
-- scripts/migrate-tolerant.mjs already classifies as SAFE-SKIP (see that
-- script's SAFE_SKIP_PG_CODES set), so a re-application via the Neon MCP
-- out-of-band process does not break the build.
--
-- KILL SWITCH (reversible instantly, no code change, no deploy):
--   ALTER TABLE wallet_accounts DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE wallet_transactions DISABLE ROW LEVEL SECURITY;

ALTER TABLE "wallet_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wallet_accounts" FORCE ROW LEVEL SECURITY;

ALTER TABLE "wallet_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wallet_transactions" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON "wallet_accounts"
  USING ("org_id" = current_setting('app.org_id', true)::uuid);

CREATE POLICY "tenant_isolation" ON "wallet_transactions"
  USING ("org_id" = current_setting('app.org_id', true)::uuid);

-- Guarded GRANTs: no-op if seldonframe_app doesn't exist yet (Max creates it
-- separately in the Neon console runbook below). Once created, this role
-- needs ordinary DML rights on both tables — RLS then narrows what rows
-- those rights can see/touch, it does not replace the grant.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'seldonframe_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "wallet_accounts" TO seldonframe_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "wallet_transactions" TO seldonframe_app;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'seldonframe_service') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "wallet_accounts" TO seldonframe_service;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "wallet_transactions" TO seldonframe_service;
  END IF;
END $$;

-- ============================================================================
-- RUNBOOK — Max-side Neon console steps (NOT SQL run by this migration;
-- perform these once, in order, on each Neon branch this migration is
-- applied to — dev/preview branch first, prod branch after smoke-testing):
-- ============================================================================
--
-- 1. In the Neon console, open the project → Roles → Create role.
--    Name: seldonframe_app
--    Do NOT check "Bypass Row-Level Security" (that's the whole point —
--    this role is the one RLS actually restricts).
--
-- 2. Create a second role (or confirm it already exists — DATABASE_URL's
--    current owner role may already qualify):
--    Name: seldonframe_service
--    DO check "Bypass Row-Level Security" — crons, migrations, platform
--    ops, and agency rollups all need to see every org's rows and must
--    keep working unchanged.
--
-- 3. Re-run this migration (or the guarded GRANT blocks alone) AFTER both
--    roles exist, so the DO $$ blocks above actually grant instead of
--    no-op. (Safe to run this file twice — see the idempotency note above.)
--
-- 4. In the Neon console's Connection Details panel, select role
--    seldonframe_app and COPY THE POOLED connection string (the one with
--    "-pooler" in the hostname — NOT the direct/unpooled string; the
--    pooled string is required because withOrgRls opens short-lived
--    per-call connections via a Pool, and Neon's pooler is what makes that
--    cheap at request volume).
--
-- 5. In Vercel → Project → Settings → Environment Variables, add:
--      DATABASE_URL_APP = <the pooled seldonframe_app connection string>
--    Scope it to the same environments DATABASE_URL is already set in.
--    Leave DATABASE_URL untouched — it keeps authenticating as the
--    existing owner/service role for every non-RLS code path.
--
-- 6. Deploy (or redeploy) so the new env var is picked up. No code change
--    is required for this step — withOrgRls reads DATABASE_URL_APP at call
--    time. The moment it's set, every wallet-store.ts call site (rewired
--    in this branch's next task) starts enforcing tenant isolation at the
--    database layer. Unsetting the var is an equally instant rollback.
--
-- 7. Watch p95 latency on wallet reads for the first hour after flipping
--    the var (expected overhead <5% — the policy predicate hits the
--    existing org_id index on both tables, same one every current
--    application-layer WHERE org_id = … clause already uses).
