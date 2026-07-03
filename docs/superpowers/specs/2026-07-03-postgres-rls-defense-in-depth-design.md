# Postgres Row-Level Security — defense-in-depth design

**Date:** 2026-07-03 · **Status:** approved by Max (chat, 2026-07-03) · **Origin:** third adopt item from the security-posture review (Dependabot ✅, npm provenance ✅, RLS = this spec)

## Goal

Make tenant isolation **structural** instead of disciplinary. Today every query must remember its `WHERE org_id = …` (the audited "org-scope every query" invariant, plus the `scopedQuery` convenience wrapper in `src/db/scoped.ts` — both app-layer). After this project, Postgres itself refuses to return another tenant's rows, so a forgotten predicate, an AI-generated query, or an SQL injection cannot cross tenants. Secondary payoff: "tenant isolation enforced at the database layer" becomes a checkable trust claim for agencies and marketplace buyers — consistent with the never-lies positioning.

## Current state (verified in-repo, 2026-07-03)

- Driver: `drizzle-orm/neon-http` (`src/db/index.ts`) — one HTTP round-trip per statement, **no session**, so `SET LOCAL` has nothing to attach to. This is the central plumbing problem.
- All tenant tables carry `org_id` (uuid, indexed). Money tables: `wallet_accounts`, `wallet_transactions` (UNIQUE idempotency keys), plus payout rows in the same ledger.
- Access to the ledger flows through `src/lib/build/wallet-store.ts` + `wallet-ledger.ts` — a small, closed set of call sites. CRM tables have many more call sites.
- Platform-level access that must NOT be tenant-filtered: migrations, crons (`/api/cron/*`), platform admin/ops queries, cross-org agency rollups (`listManagedOrganizations`), marketplace browse.

## Design

### D1 — Context mechanism: `withOrgRls(orgId, fn)` over a WebSocket-driver transaction

Policies key on `current_setting('app.org_id', true)`. Because neon-http cannot hold a session, RLS-covered code paths run through a new helper:

```ts
// src/db/rls.ts
// Opens a transaction on the Neon WebSocket driver (drizzle-orm/neon-serverless,
// Pool from @neondatabase/serverless), sets the tenant context with SET LOCAL,
// and hands fn a tx-bound drizzle instance. SET LOCAL dies with the transaction —
// no leakage across pooled connections.
export async function withOrgRls<T>(orgId: string, fn: (tx: RlsDb) => Promise<T>): Promise<T>
```

- `orgId` is validated as a UUID before interpolation (`sql`select set_config('app.org_id', ${orgId}, true)``).
- The existing `db` (neon-http) stays untouched for non-RLS tables and platform paths — zero regression surface while phases roll out.
- Drizzle's native `pgPolicy` schema API declares policies in `src/db/schema/*` so `drizzle-kit generate` owns the SQL, same as every other migration.

### D2 — Roles

| Role | RLS | Used by |
|---|---|---|
| `seldonframe_app` | enforced (no BYPASSRLS) | `withOrgRls` connections (request path) |
| `seldonframe_service` | `BYPASSRLS` | crons, migrations, platform ops, agency rollups |

Two connection strings in env (`DATABASE_URL` stays the service/owner string so **nothing breaks on day one**; `DATABASE_URL_APP` is the enforced role). Neon supports both roles on the same branch.

### D3 — Policy shape + fail mode

```sql
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON wallet_transactions
  USING (org_id = current_setting('app.org_id', true)::uuid);
```

- `current_setting(..., true)` returns NULL when unset → the policy matches nothing → **default-deny**. A path that forgot `withOrgRls` reads zero rows and writes nothing, loudly failing in dev rather than silently leaking in prod.
- One `FOR ALL` policy per table (SELECT/INSERT/UPDATE/DELETE all filtered); `WITH CHECK` implied by `USING` for our shape.

### D4 — Phasing (money first)

1. **Phase 1 — the ledger** (~2–4 days): `wallet_accounts`, `wallet_transactions`. Rewire `wallet-store.ts`/`wallet-ledger.ts` call sites through `withOrgRls`. Crons that sweep all orgs (voice rent) use the service role explicitly. Highest stakes, fewest sites — proves the whole mechanism.
2. **Phase 2 — core CRM**: `contacts`, `deals`, `bookings`, `activities`, `conversations`, `agents`, `deployments`.
3. **Phase 3 — the long tail** + FORCE everywhere + retire `scopedQuery` in favor of RLS-backed paths.

### D5 — Testing

Integration spec per phase against a **Neon branch** (cheap, disposable): seed two orgs; run a deliberately unscoped `SELECT` through the app role inside org A's context and assert org B's rows are invisible; assert an uncontexted query returns nothing (default-deny); assert the service role sees both; assert the ledger's never-negative + idempotency behaviors are unchanged under RLS. Plus the standard verify gate (tsc, unit suites, `pnpm -C packages/crm build`).

### D6 — Rollout + kill switch

Apply on a Neon branch → smoke → prod tables one phase at a time. Kill switch is one statement per table (`ALTER TABLE … DISABLE ROW LEVEL SECURITY`) and the request path can fall back instantly by pointing `withOrgRls` at the service string (env flip, no deploy). Watch p95 on wallet reads after Phase 1; expected overhead <5% (policies hit existing `org_id` indexes).

## Non-goals

- Browser-direct DB access / Neon Auth `crudPolicy` per-USER policies — our clients never talk to Postgres; org-level isolation is the correct grain.
- RLS on non-tenant tables (`users`, `organizations` themselves, platform config) — separate treatment, out of scope.
- Replacing the app-layer scoping — it stays; RLS is the second lock, not a substitute.

## Estimate

Phase 1: 2–4 focused days. Phases 2–3: 1–2 weeks cumulative. Scheduled after batch day; Phase 1 is a natural next SDD plan (`writing-plans` → subagent execution) when Max calls it.
