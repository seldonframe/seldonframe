# Postgres RLS — Phase 1 (the ledger) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Sequential implementer in THIS worktree (virality, branch feature/virality-pack). Spec: `docs/superpowers/specs/2026-07-03-postgres-rls-defense-in-depth-design.md` (source of truth — read it before starting).

**Goal:** Make tenant isolation on the two money tables — `wallet_accounts`, `wallet_transactions` — structural instead of disciplinary. Add a `withOrgRls(orgId, fn)` helper that runs ledger reads/writes inside a Postgres transaction with `app.org_id` set via `SET LOCAL`, add default-deny RLS policies on both tables, and rewire every `wallet-store.ts` call site through the helper. **Zero behavior change on day one**: the whole mechanism is INERT — `withOrgRls` transparently falls back to the existing neon-http `db` — until Max sets `DATABASE_URL_APP` in the deploy environment. The cron sweep (`/api/cron/voice-rent`) stays on the cross-org service path unchanged.

**Architecture:** One new file (`src/db/rls.ts`) owns the context mechanism. One new hand-written SQL migration (`0062_wallet_rls.sql`) owns the table-level RLS statements only — role creation and connection-string provisioning are a **Max-side Neon-console runbook**, not code, because credentials are Max's to own. `wallet-store.ts`'s 8 mutating/reading functions get rewired to open their DB work through `withOrgRls`; `wallet-ledger.ts` is untouched (it is already pure — no `db` import, nothing to rewire). Two new test files: a `node:test` unit spec that runs in every CI run (UUID validation + env-off passthrough via an injectable driver factory, no real DB), and a separate opt-in integration spec that only runs when a human points `RLS_TEST_DATABASE_URL` at a disposable Neon branch.

**Tech stack:** `drizzle-orm@^0.45.1` (`pgPolicy` confirmed exported at `drizzle-orm/pg-core/policies.d.ts:24`), `@neondatabase/serverless@^1.0.2` (`Pool` + `neonConfig` — already a dependency), `drizzle-orm/neon-serverless` driver (confirmed present at `node_modules/drizzle-orm/neon-serverless/driver.d.ts`, not previously used anywhere in this repo — this plan is its first usage), `ws@8.20.0` (already a dependency, reused here as the WebSocket polyfill for the Neon pool so the driver works regardless of the exact Node minor version on Vercel), Node's built-in `node:test` + `tsx` (matches `scripts/run-unit-tests.js`'s `node --import tsx --test` invocation).

## Global Constraints

- **Flag:** `DATABASE_URL_APP` unset ⇒ `withOrgRls` is INERT (runs `fn` against the existing neon-http `db`, no transaction, no `SET LOCAL` — byte-identical to pre-Phase-1 behavior). Setting it in Vercel is the ONLY way RLS enforcement turns on in prod. No migration, deploy, or code change is required at flip-time — it's a pure env addition.
- **Policy predicate (verbatim, both tables):** `org_id = current_setting('app.org_id', true)::uuid`. The `true` second arg to `current_setting` means "don't error if unset — return NULL instead," which is what makes an uncontexted query see zero rows (default-deny) rather than throwing.
- **Roles:** `seldonframe_app` (RLS enforced, no BYPASSRLS — used by `withOrgRls` connections, the request path) and `seldonframe_service` (`BYPASSRLS` — used by crons, migrations, platform ops, agency rollups; this is the SAME role/connection the existing `DATABASE_URL` already authenticates as, unchanged). Both roles are created by Max in the Neon console — this plan's migration does NOT create roles or grant credentials.
- **Phase-1 tables ONLY:** `wallet_accounts`, `wallet_transactions`. No other table gets RLS in this plan. Phases 2–3 (CRM tables, FORCE everywhere, retiring `scopedQuery`) are explicitly out of scope here.
- **Kill switch:** `ALTER TABLE wallet_accounts DISABLE ROW LEVEL SECURITY;` / `ALTER TABLE wallet_transactions DISABLE ROW LEVEL SECURITY;` — one statement per table, reversible instantly, documented in the runbook (Task 2).
- **Verify gate per task**, run from `packages/crm` unless noted: `node --import tsx --test <touched spec(s)>` → `npx tsc --noEmit -p tsconfig.json` (judge only non-`.next` errors — `next.config.ts:9` sets `typescript: { ignoreBuildErrors: true }` specifically because this repo has known pre-existing React 19 type artifacts baked into `.next/types`; a clean `tsc` run against `src/**/*.ts` is the bar, not zero output from the whole project) → `bash scripts/check-use-server.sh src` → `pnpm -C packages/crm build` (only on the final task — a full Next build is slow; run it once at the end, not per task).
- **Commit early and often; NEVER push.** One commit per task, in this worktree, on `feature/virality-pack`.
- **Money-safety non-negotiable:** the never-negative guard (`WHERE balance_micros >= amount`) and the UNIQUE `idempotency_key` backstop in `wallet-store.ts` are NOT touched by this plan — RLS is a second, independent lock, not a replacement for either. The integration spec (Task 4) explicitly re-asserts both still hold under RLS.

---

## Locate-first findings (pinned facts this plan depends on)

1. **`wallet-store.ts` call sites** (`packages/crm/src/lib/build/wallet-store.ts`) — imports `db` at module scope (`import { db } from "@/db";`, line 32), not as a parameter. Every exported function below reads/writes `wallet_accounts` and/or `wallet_transactions` directly against that module-level `db`:
   - `ensureWallet(orgId, stripeMode)` — insert + select on `walletAccounts`
   - `getWalletBalanceMicros(orgId, stripeMode)` — select on `walletAccounts`
   - `insertLedgerRow(args)` — **private** (not exported), insert on `walletTransactions`; called by every mutating function below
   - `creditTopupToWallet(args)` — calls `ensureWallet` + `insertLedgerRow` + update on `walletAccounts`
   - `debitWalletForRun(args)` — calls `ensureWallet` + `insertLedgerRow` + update on `walletAccounts` + (on guard failure) delete on `walletTransactions`
   - `debitVoiceUsage(args)` — calls `ensureWallet` + `getWalletBalanceMicros` + `insertLedgerRow` + update(s) on `walletAccounts` + update/delete on `walletTransactions`
   - `debitNumberRent(args)` — calls `ensureWallet` + `insertLedgerRow` + update on `walletAccounts` + (on guard failure) delete on `walletTransactions`
   - `accrueBuilderEarning(args)` — calls `insertLedgerRow`
   - `getBuilderEarningsMicros(sellerOrgId)` — select/aggregate on `walletTransactions`
   - `getWithdrawableEarningsMicros(sellerOrgId)` — select/aggregate on `walletTransactions`
   - `creditReferralToWallet(args)` — calls `ensureWallet` + `insertLedgerRow` + update on `walletAccounts`
   - `recordBuilderPayout(args)` — calls `insertLedgerRow`

   `wallet-ledger.ts` (`packages/crm/src/lib/build/wallet-ledger.ts`) has **no `db` import at all** — it is 100% pure (takes/returns a `WalletState` object). Nothing to rewire there; confirmed by reading the full file.

2. **Schema** — `packages/crm/src/db/schema/wallet.ts`. `walletAccounts` (table `wallet_accounts`) and `walletTransactions` (table `wallet_transactions`) both declare `orgId: uuid("org_id").notNull()` — a plain `uuid` column, `NOT NULL`, no default. This is exactly the shape the policy predicate `org_id = current_setting('app.org_id', true)::uuid` needs (a direct `uuid = uuid::uuid` comparison, no cast surprises). `db/index.ts` (`packages/crm/src/db/index.ts`) is the neon-http driver: `drizzle(neon(databaseUrl), { schema, casing: "snake_case" })`, exported as `db`, plus `export type DbClient = typeof db;`.

3. **`package.json` (`packages/crm/package.json`)** — `@neondatabase/serverless` is already a dependency (`^1.0.2`, line 37). `drizzle-orm` is `^0.45.1` (line 52). Confirmed installed: `node_modules/drizzle-orm/pg-core/policies.d.ts` exports `export declare function pgPolicy(name: string, config?: PgPolicyConfig): PgPolicy;` (line 24) — **`pgPolicy` IS available**. Decision: **this plan uses a HAND-WRITTEN SQL migration anyway**, not `pgPolicy` in the schema file. Reason: every existing migration in `packages/crm/drizzle/` (e.g. `0059_build_wallet.sql`) is hand-written, idempotent SQL (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`) rather than a raw `drizzle-kit generate` dump applied verbatim — `migrate-tolerant.mjs`'s own header comment confirms migrations are sometimes applied out-of-band via the Neon MCP and the journal can drift from reality, so every migration in this repo is written to be manually re-runnable. `CREATE POLICY` has no `IF NOT EXISTS` clause in Postgres, so hand-writing it lets this plan wrap it in a guard the generated form wouldn't get for free, and keeps the SQL colocated with the same hand-audited style as `0059_build_wallet.sql` instead of introducing a second migration-authoring path (`pgPolicy` in the schema + `drizzle-kit generate`) for just this one file. `pgPolicy` is confirmed available for a FUTURE phase if the team wants to switch authoring styles — not required here.

4. **Migrations dir + journal** (`packages/crm/drizzle/`, `packages/crm/drizzle/meta/_journal.json`) — highest existing migration file is `0061_referrals.sql`; the journal's last entry is `{ "idx": 38, "tag": "0061_referrals", ... }`. **Next migration: file `0062_wallet_rls.sql`, journal `idx: 39`.** Repo gotcha (from `migrate-tolerant.mjs`'s header comment, confirmed by reading the script): a migration that trips a "already exists"-class Postgres SQLSTATE (42701 duplicate_column, 42P07 duplicate_table, 42710 duplicate_object, 42712, 42723, 42P06, 42P16, 23505) is treated as a SAFE-SKIP (warn, continue) because production migrations are sometimes applied out-of-band via the Neon MCP and the journal can drift from reality — but anything else is FATAL and must break the build. `CREATE POLICY tenant_isolation ON wallet_accounts ...` run a second time raises `42710 duplicate_object`, which IS in the safe-skip set, so a re-run of this migration after an out-of-band apply will not break the build — but Task 2's migration still wraps every statement so the intent is explicit and reviewable, matching the hand-inspected style of every prior migration in this directory.

5. **Voice-rent cron** (`packages/crm/src/app/api/cron/voice-rent/route.ts`) — imports `debitNumberRent, resolveWalletStripeMode` from `@/lib/build/wallet-store` (line 37) and calls `debitNumberRent` in a loop over `plan.charge` (every SF-managed deployment across every org, from `listSfManagedDeploymentsForRent()`). This is a genuine cross-org sweep. **This plan explicitly does NOT rewire this cron.** After Task 3 rewires `wallet-store.ts`, `debitNumberRent` will call `withOrgRls(args.orgId, ...)` per-invocation — since the cron already calls it once per deployment with that deployment's own `orgId`, the call is still CORRECT per-call (each debit is scoped to its own org's context, which is fine — `withOrgRls` isn't "wrong" for a cron, it's just narrower-scoped than the cron's overall cross-org sweep needs for anything that reads/writes MULTIPLE orgs' rows in one query). The cron itself does not run any multi-org `SELECT`/`UPDATE` directly against `wallet_accounts`/`wallet_transactions` — `listSfManagedDeploymentsForRent()` reads the `deployments` table (out of Phase-1 scope; untouched by RLS), and every wallet mutation is already per-deployment/per-org. **No code change needed in the cron route for Phase 1** — it is called out here so a future reader doesn't wonder why the cron file has zero diff in this plan.

6. **Env var access style** — `db/index.ts` reads `process.env.DATABASE_URL` directly at module scope with an inline fallback string (`process.env.DATABASE_URL ?? "postgresql://user:pass@localhost:5432/seldon_frame?sslmode=require"`), not through an env-module wrapper. `src/db/rls.ts` follows this exact precedent (it's a peer file to `db/index.ts`, in the same directory) — a direct top-level `process.env.DATABASE_URL_APP` read, no fallback (undefined is the valid "inert" state, unlike `DATABASE_URL` which needs a fallback for local dev).

---

### Task 1: `withOrgRls` helper — the context mechanism (TDD, no DB required)

**Files:**
- Create: `packages/crm/src/db/rls.ts`
- Create: `packages/crm/tests/unit/db/rls.spec.ts`

**Interfaces (Produces):**
```ts
export type RlsDb = PgDatabase<any, typeof schema>; // the tx-bound drizzle instance handed to fn (driver-agnostic)

export class InvalidOrgIdError extends Error {
  readonly code = "INVALID_ORG_ID";
}

export async function withOrgRls<T>(
  orgId: string,
  fn: (tx: RlsDb) => Promise<T>,
): Promise<T>;
```

**Steps:**

- [ ] Write the failing test first. Create `packages/crm/tests/unit/db/rls.spec.ts`:

```ts
// Postgres RLS Phase 1 — withOrgRls context mechanism (spec
// docs/superpowers/specs/2026-07-03-postgres-rls-defense-in-depth-design.md, D1).
//
// Two things are tested here with NO real Postgres connection:
//   1. orgId is validated as a UUID before it ever reaches a SQL string —
//      a non-UUID throws InvalidOrgIdError and NEVER opens a connection.
//   2. The INERT-WITHOUT-ENV fallback: when DATABASE_URL_APP is unset,
//      withOrgRls must call fn with the passed-through db (no transaction,
//      no set_config) rather than attempting to open the Neon WebSocket pool.
// The transaction-path itself (real SET LOCAL + real RLS enforcement) is
// covered by the SEPARATE opt-in integration spec
// (tests/integration/rls-phase1.spec.ts) against a disposable Neon branch —
// that path needs a real Postgres server and is out of scope for a unit test.
//
// To run:
//   cd packages/crm
//   node --import tsx --test tests/unit/db/rls.spec.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { withOrgRls, InvalidOrgIdError } from "../../../src/db/rls";

const VALID_ORG_ID = "3f9a1c2e-4b6d-4e7f-8a2b-9c1d2e3f4a5b";

describe("withOrgRls — orgId validation", () => {
  test("rejects a non-UUID orgId without ever calling fn", async () => {
    let called = false;
    await assert.rejects(
      () =>
        withOrgRls("not-a-uuid", async () => {
          called = true;
          return "unreachable";
        }),
      InvalidOrgIdError,
    );
    assert.equal(called, false, "fn must never run when orgId fails validation");
  });

  test("rejects an empty string orgId", async () => {
    await assert.rejects(
      () => withOrgRls("", async () => "unreachable"),
      InvalidOrgIdError,
    );
  });

  test("rejects a UUID-shaped-but-wrong-version string with stray characters", async () => {
    await assert.rejects(
      () => withOrgRls("3f9a1c2e-4b6d-4e7f-8a2b-9c1d2e3f4a5bZZ", async () => "unreachable"),
      InvalidOrgIdError,
    );
  });

  test("accepts a well-formed UUID and proceeds to fn (env-off path)", async () => {
    delete process.env.DATABASE_URL_APP;
    const result = await withOrgRls(VALID_ORG_ID, async (tx) => {
      assert.ok(tx, "fn must receive a truthy db handle");
      return "ok";
    });
    assert.equal(result, "ok");
  });
});

describe("withOrgRls — INERT-WITHOUT-ENV passthrough", () => {
  test("with DATABASE_URL_APP unset, fn runs against the passthrough db with no pool/tx opened", async () => {
    delete process.env.DATABASE_URL_APP;
    let receivedTx: unknown;
    const result = await withOrgRls(VALID_ORG_ID, async (tx) => {
      receivedTx = tx;
      return 42;
    });
    assert.equal(result, 42);
    // The passthrough path hands fn the SAME object identity as the module's
    // exported `db` — proving no transaction/pool wrapper was constructed.
    const { db } = await import("../../../src/db");
    assert.equal(receivedTx, db, "env-off must pass through the existing neon-http db unchanged");
  });

  test("setting DATABASE_URL_APP does not affect a call that never opens a real socket in this test (documents intent only)", () => {
    // This test intentionally does NOT set DATABASE_URL_APP and call withOrgRls,
    // because doing so would attempt a real network connection to Neon's
    // WebSocket endpoint — that path is exercised ONLY by the opt-in
    // integration spec (tests/integration/rls-phase1.spec.ts) against a real
    // Neon branch. Asserting that here would make this unit spec flaky/slow
    // and would violate the "no real DB in unit tests" boundary.
    assert.ok(true, "see tests/integration/rls-phase1.spec.ts for the enforced-transaction path");
  });
});
```

- [ ] Run it and confirm it fails (the module doesn't exist yet):

```
cd packages/crm
node --import tsx --test tests/unit/db/rls.spec.ts
```

Expected output: a module-resolution error, e.g. `Cannot find module '../../../src/db/rls'` — this is the correct RED state.

- [ ] Now write `packages/crm/src/db/rls.ts` to make it pass:

```ts
// src/db/rls.ts — Postgres RLS Phase 1 context mechanism
// (spec docs/superpowers/specs/2026-07-03-postgres-rls-defense-in-depth-design.md, D1).
//
// Policies on RLS-covered tables key on current_setting('app.org_id', true).
// The existing driver (drizzle-orm/neon-http, src/db/index.ts) does one HTTP
// round-trip per statement with NO session, so `SET LOCAL` has nothing to
// attach to. withOrgRls is the ONE place that opens a real session (the Neon
// WebSocket driver, drizzle-orm/neon-serverless) for RLS-covered code paths:
// it validates orgId as a UUID, opens a transaction, sets the tenant context
// with `SET LOCAL` (via set_config's third arg = true, which scopes the
// setting to the current transaction — it is gone the instant the tx ends,
// so there is no leakage across a pooled connection's next borrower), and
// hands fn a tx-bound drizzle instance.
//
// INERT-WITHOUT-ENV (the SeldonFrame flag pattern — same shape as
// voiceManagedEnabled/SF_VOICE_MANAGED): when DATABASE_URL_APP is unset,
// withOrgRls runs fn against the EXISTING neon-http `db` directly — no pool,
// no transaction, no set_config, byte-identical to pre-Phase-1 behavior.
// Enabling RLS enforcement in prod is a pure env addition in Vercel; no
// migration, deploy, or code change is required at flip-time, and flipping
// it back off (unsetting the var) is an equally instant rollback.
//
// DATABASE_URL stays the service/owner connection string (unchanged,
// BYPASSRLS via the seldonframe_service role) — nothing on that path
// breaks. DATABASE_URL_APP is a SEPARATE, ADDITIVE connection string that
// authenticates as seldonframe_app (RLS enforced, no BYPASSRLS). Both
// roles + both connection strings are provisioned by Max in the Neon
// console (see the runbook in drizzle/0062_wallet_rls.sql's header comment)
// — this file never creates a role or a credential.

import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import ws from "ws";
import * as schema from "./schema";
import { db as passthroughDb } from "./index";

// The Neon serverless Pool needs a WebSocket implementation on Node runtimes
// that don't expose a global WebSocket (pre-22). `ws` is already a repo
// dependency (used by the voice realtime client) — reusing it here means
// this works regardless of the exact Node minor version Vercel runs.
neonConfig.webSocketConstructor = ws;

// Driver-agnostic handle. The neon-http default `db` and the
// neon-serverless transaction client parameterize PgDatabase with
// DIFFERENT query-result HKTs; a union of the two collapses drizzle's
// fielded .returning() overload to the zero-arg form (TS2554). Erasing
// the HKT slot keeps full schema-aware query building on both drivers.
export type RlsDb = PgDatabase<any, typeof schema>;

/** Thrown when orgId is not a well-formed UUID. Thrown BEFORE any connection
 *  is opened or any SQL is built — an invalid orgId must never reach a query. */
export class InvalidOrgIdError extends Error {
  readonly code = "INVALID_ORG_ID";
  constructor(orgId: string) {
    super(`withOrgRls: orgId is not a valid UUID: ${JSON.stringify(orgId)}`);
    this.name = "InvalidOrgIdError";
  }
}

// Matches the house idiom in src/app/api/v1/forms/[id]/route.ts:24.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(orgId: string): void {
  if (typeof orgId !== "string" || !UUID_REGEX.test(orgId)) {
    throw new InvalidOrgIdError(orgId);
  }
}

// Lazily constructed — a single Pool is reused across calls when the
// enforced path is active, rather than opening a fresh pool per call.
let enforcedPool: Pool | null = null;

function getEnforcedPool(databaseUrlApp: string): Pool {
  if (!enforcedPool) {
    enforcedPool = new Pool({ connectionString: databaseUrlApp });
  }
  return enforcedPool;
}

/**
 * Run `fn` with tenant context `orgId` established for every RLS-covered
 * query it issues.
 *
 * ENFORCED (DATABASE_URL_APP set): opens a transaction on the Neon
 * WebSocket driver, runs `select set_config('app.org_id', $1, true)` inside
 * that transaction (the `true` third arg = SET LOCAL semantics — scoped to
 * the transaction, gone when it ends), then calls `fn(tx)`. The whole thing
 * is wrapped in the driver's transaction() so a thrown error inside fn rolls
 * back cleanly and the pool connection is released back to the pool either way.
 *
 * INERT (DATABASE_URL_APP unset): calls `fn(passthroughDb)` directly — the
 * exact same `db` every other module in this codebase already imports from
 * `@/db`. No pool is opened, no transaction, no set_config. This is the
 * default in every environment until Max sets the var in Vercel.
 *
 * orgId is validated as a UUID in BOTH paths, before either branch runs —
 * an invalid orgId must never reach a query in the inert path either
 * (defense in depth: the app-layer scoping invariant still applies there).
 */
export async function withOrgRls<T>(
  orgId: string,
  fn: (tx: RlsDb) => Promise<T>,
): Promise<T> {
  assertUuid(orgId);

  const databaseUrlApp = process.env.DATABASE_URL_APP;
  if (!databaseUrlApp) {
    return fn(passthroughDb);
  }

  const pool = getEnforcedPool(databaseUrlApp);
  // IMPORTANT: drizzle(pool, …) round-robins queries across the pool's
  // connections — it does NOT pin every query from one drizzle instance to
  // one physical connection. If we built `tx` from the pool directly, the
  // set_config('app.org_id', …) below could land on connection #1 while
  // fn(tx)'s queries run on connection #2, silently losing the tenant
  // context (SET LOCAL is per-session — it does not exist on any OTHER
  // connection). To guarantee fn's queries see the SAME session the
  // set_config ran on, we check out ONE client from the pool ourselves and
  // build `tx` from THAT client, not from the pool.
  const client = await pool.connect();
  const tx = drizzle(client, { schema, casing: "snake_case" });

  try {
    await client.query("BEGIN");
    await client.query("select set_config('app.org_id', $1, true)", [orgId]);
    const result = await fn(tx);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
```

- [ ] Run the test again and confirm it now passes:

```
cd packages/crm
node --import tsx --test tests/unit/db/rls.spec.ts
```

Expected output: all `describe`/`test` blocks pass, e.g. `# pass 6` / `# fail 0` in the `node:test` summary, zero failures.

- [ ] Typecheck just this file's neighborhood (fast signal before the full gate):

```
cd packages/crm
npx tsc --noEmit -p tsconfig.json
```

Expected: no NEW errors attributable to `src/db/rls.ts` or `tests/unit/db/rls.spec.ts` (pre-existing `.next`-artifact errors are expected and ignored per the Global Constraints note — `next.config.ts:9` already carries `ignoreBuildErrors: true` for exactly this class of noise).

- [ ] Commit:

```
git add packages/crm/src/db/rls.ts packages/crm/tests/unit/db/rls.spec.ts
git commit -m "$(cat <<'EOF'
feat(db): withOrgRls context mechanism (inert without DATABASE_URL_APP)

The Phase 1 helper from the RLS defense-in-depth design (D1): validates
orgId as a UUID before any connection opens, then either runs fn inside a
real Neon-serverless transaction with app.org_id set via SET LOCAL
(DATABASE_URL_APP set), or passes fn straight through to the existing
neon-http db unchanged (DATABASE_URL_APP unset — the default everywhere
until Max flips the var in Vercel). Byte-identical behavior on day one.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: SQL migration — RLS + policies on the two ledger tables (+ Max-side runbook)

**Files:**
- Create: `packages/crm/drizzle/0062_wallet_rls.sql`
- Modify: `packages/crm/drizzle/meta/_journal.json` (append the new entry)

**Steps:**

- [ ] Create `packages/crm/drizzle/0062_wallet_rls.sql`:

```sql
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
```

- [ ] Append the journal entry. Read `packages/crm/drizzle/meta/_journal.json`, confirm the last entry is still `{ "idx": 38, "tag": "0061_referrals", ... }` (if another branch has landed a migration first and the tail has moved, STOP and re-number this migration to follow the actual new tail — do not silently overwrite a colliding idx), then add:

```json
    {
      "idx": 39,
      "version": "7",
      "when": <current epoch millis, e.g. via `node -e "console.log(Date.now())"`>,
      "tag": "0062_wallet_rls",
      "breakpoints": true
    }
```

  as the new last element of the `entries` array (comma-separate it after the `0061_referrals` entry, keep the closing `]` and `}` structure exactly as-is — this is a hand-edit of a JSON array, not a regenerate).

- [ ] Verify the migration file is syntactically valid SQL by a dry read-through (no live DB needed for this task — Task 4's integration spec is what actually applies and exercises this SQL against a real Neon branch). Confirm no other file in `packages/crm/drizzle/` references `tenant_isolation` as a policy name already (avoid an accidental name collision on a future table):

```
cd packages/crm
grep -rn "tenant_isolation" drizzle/
```

Expected output: only the two new `CREATE POLICY "tenant_isolation" ...` lines in `0062_wallet_rls.sql` itself.

- [ ] Commit:

```
git add packages/crm/drizzle/0062_wallet_rls.sql packages/crm/drizzle/meta/_journal.json
git commit -m "$(cat <<'EOF'
feat(db): RLS + tenant_isolation policy on wallet_accounts/wallet_transactions

Phase 1 of the RLS defense-in-depth design (D3): ENABLE + FORCE ROW LEVEL
SECURITY on both ledger tables, one tenant_isolation policy per table keyed
on current_setting('app.org_id', true)::uuid (default-deny when unset).
Role creation + DATABASE_URL_APP provisioning is a Max-side Neon-console
runbook (documented in this migration's header) — this migration only
touches table-level statements, guarded so the GRANTs no-op until the
roles exist. Kill switch is one ALTER TABLE per table, documented inline.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Rewire `wallet-store.ts` through `withOrgRls`

**Files:**
- Modify: `packages/crm/src/lib/build/wallet-store.ts`
- Modify: `packages/crm/tests/unit/build/wallet-webhook-apply.spec.ts`, `packages/crm/tests/unit/build/wallet-topup.spec.ts`, `packages/crm/tests/unit/build/run-drawdown.spec.ts`, `packages/crm/tests/unit/build/wallet-voice.spec.ts` (regression only — read each first; if any test calls `db` directly rather than through the store's exported functions, it does not need edits. If a test mocks `@/db`'s `db` export directly via `node:test`'s mock helpers, it will need an equivalent mock added for `@/db/rls`'s `withOrgRls` — inspect before editing, do not blind-edit.)

**Steps:**

- [ ] Read `packages/crm/src/lib/build/wallet-store.ts` in full (already done during planning — reproduced in the Locate-first findings above) and confirm the 11 call sites listed there are still exhaustive (grep as a cross-check):

```
cd packages/crm
grep -n "db\." src/lib/build/wallet-store.ts
```

Expected: every matched line is inside one of the 8 exported functions + the private `insertLedgerRow` enumerated in Locate-first item 1. If a NEW call site appears that wasn't enumerated (e.g. from a merge since this plan was written), add it to the rewiring below before proceeding — do not skip it silently.

- [ ] Rewrite `packages/crm/src/lib/build/wallet-store.ts`'s import block and every function body to route its DB work through `withOrgRls`. The full new file:

```ts
// wallet store — the DB layer over the prepaid wallet (spec 1ff09dcb, P2).
//
// Bridges the PURE ledger (wallet-ledger.ts) to Postgres. The pure ops own the
// arithmetic + the invariants; this module owns persistence + the idempotency
// BACKSTOP.
//
// Postgres RLS Phase 1 (spec docs/superpowers/specs/2026-07-03-postgres-rls-
// defense-in-depth-design.md): every function below now opens its DB work
// through withOrgRls(orgId, tx => …) instead of the raw module-level `db`.
// withOrgRls is INERT until Max sets DATABASE_URL_APP — until then it passes
// `tx` through as the exact same `db` these functions always used, so this
// rewiring is a no-op in behavior today and only starts enforcing tenant
// isolation at the database layer once the env var is set. See src/db/rls.ts
// for the full mechanism.
//
// Money-safety invariants (UNCHANGED by this rewiring — RLS is a second,
// independent lock, not a replacement):
//   1) INSERT the ledger row first with onConflictDoNothing on the UNIQUE
//      idempotency_key. If nothing inserted → it's a DUPLICATE (a webhook
//      re-delivery, or the same runId twice) → we no-op and return the current
//      balance. This is what makes top-ups + per-run debits impossible to apply
//      twice even under a race: the UNIQUE constraint, not a read-then-write.
//   2) Only AFTER the row inserted, apply the balance delta with ONE guarded
//      UPDATE:
//        • top-up/earning → balance += amount (unconditional add).
//        • debit          → balance -= amount WHERE balance >= amount (atomic;
//          can never drive the balance negative — if the guard fails, 0 rows
//          update and we surface "insufficient").
//
// Because the ledger row is the source of truth and the balance is a denormalized
// running total guarded atomically, a crash between (1) and (2) self-heals:
// reconcileBalance() can recompute balance from SUM(ledger) at any time. The pure
// canAfford gate still runs in the RUN ENDPOINT before execution (a 402 path);
// this store is the authoritative second line that no debit ever goes negative.
//
// MONEY-SAFE + inert: a wallet starts empty; with no Stripe key there are no
// top-ups, so every paid run 402s. stripeMode partitions wallets so a test top-up
// never funds a live run.

import { and, eq, sql } from "drizzle-orm";
import { withOrgRls, type RlsDb } from "@/db/rls";
import {
  walletAccounts,
  walletTransactions,
  type WalletAccountRow,
  type WalletTransactionKind,
} from "@/db/schema/wallet";
import type { MarketplaceStripeMode } from "@/db/schema/marketplace-purchases";
import { debitIdempotencyKey } from "@/lib/build/wallet-ledger";
import { resolveBillingMode } from "@/lib/marketplace/billing/billing-mode";

/**
 * resolveWalletStripeMode — the SAME key-derived resolver every metered call
 * site (voice webhook accept-gate + debit, SF-managed number rent, the rent
 * cron, Tier-0 readiness) must use to pick a wallet, re-exported here so
 * telephony/voice code doesn't need to import from `lib/marketplace/billing`.
 * Deliberately NOT a reimplementation — `resolveBillingMode` is already the
 * exact key-derived source the top-up credit path (wallet-topup.ts) and the
 * existing debit/read paths (run-drawdown-deps.ts, wallet/balance/route.ts)
 * use, so this alias guarantees the wallet a top-up credits is always the
 * wallet every metered path debits, with zero risk of a second
 * implementation drifting out of sync. Pure; no I/O.
 */
export const resolveWalletStripeMode = resolveBillingMode;

/** The result of a credit/debit: the new balance (micro-dollars) + whether the
 *  op actually moved money (`applied`) or was an idempotent no-op (`duplicate`).
 *  A debit that the balance couldn't cover is `{ ok:false, reason:"insufficient" }`. */
export type WalletApplyResult =
  | { ok: true; balanceMicros: number; applied: boolean; duplicate: boolean }
  | { ok: false; reason: "insufficient" | "invalid" };

/** Clamp to a finite, non-negative integer of micros (mirrors the pure ledger). */
function nonNegMicros(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.floor(v);
}

/** Ensure (and return) the org's wallet row for a Stripe mode, creating it at a 0
 *  balance on first touch. Idempotent via the UNIQUE(org_id, stripe_mode) index.
 *  Runs inside the caller's withOrgRls tx when called from another store
 *  function (pass `tx` through); opens its OWN withOrgRls when called directly. */
export async function ensureWallet(
  orgId: string,
  stripeMode: MarketplaceStripeMode = "test",
  tx?: RlsDb,
): Promise<WalletAccountRow> {
  const run = async (db: RlsDb) => {
    await db
      .insert(walletAccounts)
      .values({ orgId, stripeMode, balanceMicros: 0 })
      .onConflictDoNothing({ target: [walletAccounts.orgId, walletAccounts.stripeMode] });
    const [row] = await db
      .select()
      .from(walletAccounts)
      .where(and(eq(walletAccounts.orgId, orgId), eq(walletAccounts.stripeMode, stripeMode)))
      .limit(1);
    if (!row) throw new Error("wallet_accounts upsert returned no row");
    return row;
  };
  return tx ? run(tx) : withOrgRls(orgId, run);
}

/** The current balance (micro-dollars) for an org+mode. 0 when no wallet yet. */
export async function getWalletBalanceMicros(
  orgId: string,
  stripeMode: MarketplaceStripeMode = "test",
  tx?: RlsDb,
): Promise<number> {
  const run = async (db: RlsDb) => {
    const [row] = await db
      .select({ balanceMicros: walletAccounts.balanceMicros })
      .from(walletAccounts)
      .where(and(eq(walletAccounts.orgId, orgId), eq(walletAccounts.stripeMode, stripeMode)))
      .limit(1);
    return nonNegMicros(row?.balanceMicros ?? 0);
  };
  return tx ? run(tx) : withOrgRls(orgId, run);
}

/** Insert a ledger row keyed by idempotencyKey. Returns true if THIS call
 *  inserted it (money should move), false if a row already existed (duplicate →
 *  no-op). The UNIQUE(idempotency_key) constraint is the dedupe backstop.
 *  Always called from WITHIN another function's withOrgRls tx — never opens
 *  its own, since it has no independent entry point. */
async function insertLedgerRow(
  db: RlsDb,
  args: {
    orgId: string;
    kind: WalletTransactionKind;
    amountMicros: number;
    idempotencyKey: string;
    runId?: string;
    stripeRef?: string;
  },
): Promise<boolean> {
  const inserted = await db
    .insert(walletTransactions)
    .values({
      orgId: args.orgId,
      kind: args.kind,
      amountMicros: args.amountMicros,
      idempotencyKey: args.idempotencyKey,
      runId: args.runId ?? null,
      stripeRef: args.stripeRef ?? null,
    })
    .onConflictDoNothing({ target: walletTransactions.idempotencyKey })
    .returning({ id: walletTransactions.id });
  return inserted.length > 0;
}

/**
 * Credit a top-up (money IN). Idempotent on `idempotencyKey` (the Stripe session
 * id) — a re-applied credit (webhook re-delivery) is a no-op that credits ONCE.
 * Steps: ensure the wallet → insert the ledger row (dedupe backstop) → on a fresh
 * insert, balance += amount. Returns the new balance. Never negative; never throws
 * on a duplicate. The whole sequence runs inside ONE withOrgRls tx.
 */
export async function creditTopupToWallet(args: {
  orgId: string;
  amountMicros: number;
  idempotencyKey: string;
  stripeMode?: MarketplaceStripeMode;
  stripeRef?: string;
}): Promise<WalletApplyResult> {
  const stripeMode = args.stripeMode ?? "test";
  const amount = nonNegMicros(args.amountMicros);
  const key = (args.idempotencyKey ?? "").trim();
  if (amount <= 0 || !key) return { ok: false, reason: "invalid" };

  return withOrgRls(args.orgId, async (db) => {
    await ensureWallet(args.orgId, stripeMode, db);

    const fresh = await insertLedgerRow(db, {
      orgId: args.orgId,
      kind: "topup",
      amountMicros: amount,
      idempotencyKey: key,
      stripeRef: args.stripeRef,
    });

    if (!fresh) {
      return {
        ok: true,
        balanceMicros: await getWalletBalanceMicros(args.orgId, stripeMode, db),
        applied: false,
        duplicate: true,
      };
    }

    const [updated] = await db
      .update(walletAccounts)
      .set({
        balanceMicros: sql`${walletAccounts.balanceMicros} + ${amount}`,
        updatedAt: new Date(),
      })
      .where(and(eq(walletAccounts.orgId, args.orgId), eq(walletAccounts.stripeMode, stripeMode)))
      .returning({ balanceMicros: walletAccounts.balanceMicros });

    return {
      ok: true,
      balanceMicros: nonNegMicros(updated?.balanceMicros ?? 0),
      applied: true,
      duplicate: false,
    };
  });
}

/**
 * Draw down the wallet for a successful run — a LEDGER decrement, NO Stripe call.
 * Idempotent on `runId` (key `debit:<runId>`): replaying the same run is a no-op
 * that debits ONCE. NEVER NEGATIVE: the balance UPDATE carries a
 * `WHERE balance_micros >= amount` guard, so if the balance can't cover it 0 rows
 * update — we then DELETE the just-inserted ledger row (so the run can be retried
 * once funded) and return "insufficient". The run endpoint also checks canAfford
 * BEFORE executing; this is the authoritative second line. Runs inside ONE
 * withOrgRls tx.
 */
export async function debitWalletForRun(args: {
  orgId: string;
  runId: string;
  amountMicros: number;
  stripeMode?: MarketplaceStripeMode;
}): Promise<WalletApplyResult> {
  const stripeMode = args.stripeMode ?? "test";
  const amount = nonNegMicros(args.amountMicros);
  const runId = (args.runId ?? "").trim();
  if (!runId) return { ok: false, reason: "invalid" };

  return withOrgRls(args.orgId, async (db) => {
    if (amount <= 0) {
      return {
        ok: true,
        balanceMicros: await getWalletBalanceMicros(args.orgId, stripeMode, db),
        applied: false,
        duplicate: false,
      };
    }

    await ensureWallet(args.orgId, stripeMode, db);
    const key = debitIdempotencyKey(runId);

    const fresh = await insertLedgerRow(db, {
      orgId: args.orgId,
      kind: "debit",
      amountMicros: amount,
      idempotencyKey: key,
      runId,
    });

    if (!fresh) {
      return {
        ok: true,
        balanceMicros: await getWalletBalanceMicros(args.orgId, stripeMode, db),
        applied: false,
        duplicate: true,
      };
    }

    const decremented = await db
      .update(walletAccounts)
      .set({
        balanceMicros: sql`${walletAccounts.balanceMicros} - ${amount}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(walletAccounts.orgId, args.orgId),
          eq(walletAccounts.stripeMode, stripeMode),
          sql`${walletAccounts.balanceMicros} >= ${amount}`,
        ),
      )
      .returning({ balanceMicros: walletAccounts.balanceMicros });

    if (decremented.length === 0) {
      await db.delete(walletTransactions).where(eq(walletTransactions.idempotencyKey, key));
      return { ok: false, reason: "insufficient" };
    }

    return {
      ok: true,
      balanceMicros: nonNegMicros(decremented[0]?.balanceMicros ?? 0),
      applied: true,
      duplicate: false,
    };
  });
}

/** Pure drain split: how much of a voice debit the balance can cover. Voice
 *  minutes are never refusable after the fact (unlike a build run) — the
 *  wallet drains `LEAST(balance, amount)` instead of rejecting the whole
 *  debit, and the caller acts on the returned shortfall (e.g. suspending the
 *  agent) rather than the debit itself failing. Garbage-tolerant: negative/NaN
 *  inputs clamp to 0 via nonNegMicros. */
export function splitVoiceDrain(
  balanceMicros: number,
  amountMicros: number,
): { drainedMicros: number; shortfallMicros: number } {
  const bal = nonNegMicros(balanceMicros);
  const amt = nonNegMicros(amountMicros);
  const drained = Math.min(bal, amt);
  return { drainedMicros: drained, shortfallMicros: amt - drained };
}

/**
 * Drain the wallet for a voice call's metered usage — a LEDGER decrement, NO
 * Stripe call. UNLIKE debitWalletForRun, this NEVER refuses: minutes already
 * spoken can't be un-spoken, so on insufficient balance it drains whatever the
 * wallet has (`splitVoiceDrain`) and returns the shortfall for the caller to
 * act on (e.g. suspending the agent), rather than failing the debit. Idempotent
 * on `callId` (key `voice:<callId>`) — replaying the same call is a no-op.
 *
 * The ledger records what was actually TAKEN (`drainedMicros`), never the
 * amount owed — the ledger states money movement, not debt. An empty wallet
 * (drainedMicros === 0) skips the insert entirely (a 0-amount row is noise).
 *
 * NEVER NEGATIVE: the balance UPDATE carries a `WHERE balance_micros >=
 * drainedMicros` guard (drained ≤ the balance we read, so it normally
 * succeeds); if a concurrent debit races us and the guard fails, we re-read +
 * re-split ONCE and retry, otherwise we DELETE the just-inserted ledger row and
 * report a full shortfall (nothing moved). All of this runs inside ONE
 * withOrgRls tx.
 */
export async function debitVoiceUsage(args: {
  orgId: string;
  callId: string;
  amountMicros: number;
  stripeMode?: MarketplaceStripeMode;
}): Promise<{
  ok: true;
  applied: boolean;
  duplicate: boolean;
  drainedMicros: number;
  shortfallMicros: number;
}> {
  const stripeMode = args.stripeMode ?? "test";
  const amount = nonNegMicros(args.amountMicros);
  const callId = (args.callId ?? "").trim();
  if (amount <= 0 || !callId) {
    return { ok: true, applied: false, duplicate: false, drainedMicros: 0, shortfallMicros: 0 };
  }

  return withOrgRls(args.orgId, async (db) => {
    await ensureWallet(args.orgId, stripeMode, db);
    const key = `voice:${callId}`;

    const balance = await getWalletBalanceMicros(args.orgId, stripeMode, db);
    const split = splitVoiceDrain(balance, amount);

    if (split.drainedMicros === 0) {
      return {
        ok: true,
        applied: false,
        duplicate: false,
        drainedMicros: 0,
        shortfallMicros: split.shortfallMicros,
      };
    }

    const fresh = await insertLedgerRow(db, {
      orgId: args.orgId,
      kind: "voice_debit",
      amountMicros: split.drainedMicros,
      idempotencyKey: key,
      runId: callId,
    });

    if (!fresh) {
      return { ok: true, applied: false, duplicate: true, drainedMicros: 0, shortfallMicros: 0 };
    }

    let drained = split.drainedMicros;
    let shortfall = split.shortfallMicros;

    let decremented = await db
      .update(walletAccounts)
      .set({
        balanceMicros: sql`${walletAccounts.balanceMicros} - ${drained}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(walletAccounts.orgId, args.orgId),
          eq(walletAccounts.stripeMode, stripeMode),
          sql`${walletAccounts.balanceMicros} >= ${drained}`,
        ),
      )
      .returning({ balanceMicros: walletAccounts.balanceMicros });

    if (decremented.length === 0) {
      const rebalance = await getWalletBalanceMicros(args.orgId, stripeMode, db);
      const resplit = splitVoiceDrain(rebalance, amount);
      drained = resplit.drainedMicros;
      shortfall = resplit.shortfallMicros;

      if (drained > 0) {
        decremented = await db
          .update(walletAccounts)
          .set({
            balanceMicros: sql`${walletAccounts.balanceMicros} - ${drained}`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(walletAccounts.orgId, args.orgId),
              eq(walletAccounts.stripeMode, stripeMode),
              sql`${walletAccounts.balanceMicros} >= ${drained}`,
            ),
          )
          .returning({ balanceMicros: walletAccounts.balanceMicros });
      }

      if (drained === 0 || decremented.length === 0) {
        await db.delete(walletTransactions).where(eq(walletTransactions.idempotencyKey, key));
        return { ok: true, applied: false, duplicate: false, drainedMicros: 0, shortfallMicros: amount };
      }

      await db
        .update(walletTransactions)
        .set({ amountMicros: drained })
        .where(eq(walletTransactions.idempotencyKey, key));
    }

    return { ok: true, applied: true, duplicate: false, drainedMicros: drained, shortfallMicros: shortfall };
  });
}

/**
 * Drain the wallet for a deployment's monthly phone number rental — a LEDGER
 * decrement, NO Stripe call. EXACTLY debitWalletForRun's shape/semantics: rent,
 * unlike voice minutes, IS refusable. Idempotent on `rent:<deploymentId>:
 * <monthKey>` — replaying the same month is a no-op. NEVER NEGATIVE: the
 * balance UPDATE carries a `WHERE balance_micros >= amount` guard; if the
 * balance can't cover it, 0 rows update and we DELETE the just-inserted ledger
 * row (so rent can be retried once funded) and return "insufficient". Runs
 * inside ONE withOrgRls tx.
 *
 * Called by /api/cron/voice-rent per-deployment, each with THAT deployment's
 * own orgId — the cron's overall sweep is cross-org, but each individual
 * debitNumberRent call here is correctly single-org-scoped (see this plan's
 * Locate-first item 5 for why the cron itself needs no other change).
 */
export async function debitNumberRent(args: {
  orgId: string;
  deploymentId: string;
  monthKey: string;
  amountMicros: number;
  stripeMode?: MarketplaceStripeMode;
}): Promise<WalletApplyResult> {
  const stripeMode = args.stripeMode ?? "test";
  const amount = nonNegMicros(args.amountMicros);
  const deploymentId = (args.deploymentId ?? "").trim();
  const monthKey = (args.monthKey ?? "").trim();
  if (!deploymentId || !monthKey) return { ok: false, reason: "invalid" };

  return withOrgRls(args.orgId, async (db) => {
    if (amount <= 0) {
      return {
        ok: true,
        balanceMicros: await getWalletBalanceMicros(args.orgId, stripeMode, db),
        applied: false,
        duplicate: false,
      };
    }

    await ensureWallet(args.orgId, stripeMode, db);
    const key = `rent:${deploymentId}:${monthKey}`;

    const fresh = await insertLedgerRow(db, {
      orgId: args.orgId,
      kind: "number_rent",
      amountMicros: amount,
      idempotencyKey: key,
    });

    if (!fresh) {
      return {
        ok: true,
        balanceMicros: await getWalletBalanceMicros(args.orgId, stripeMode, db),
        applied: false,
        duplicate: true,
      };
    }

    const decremented = await db
      .update(walletAccounts)
      .set({
        balanceMicros: sql`${walletAccounts.balanceMicros} - ${amount}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(walletAccounts.orgId, args.orgId),
          eq(walletAccounts.stripeMode, stripeMode),
          sql`${walletAccounts.balanceMicros} >= ${amount}`,
        ),
      )
      .returning({ balanceMicros: walletAccounts.balanceMicros });

    if (decremented.length === 0) {
      await db.delete(walletTransactions).where(eq(walletTransactions.idempotencyKey, key));
      return { ok: false, reason: "insufficient" };
    }

    return {
      ok: true,
      balanceMicros: nonNegMicros(decremented[0]?.balanceMicros ?? 0),
      applied: true,
      duplicate: false,
    };
  });
}

/**
 * Accrue a builder's EARNING on a run they sold (cost − 5% fee), as a ledger
 * `earning` row keyed `earning:<runId>` (idempotent per run). This records what
 * the builder is owed; the actual payout via Connect is a follow-up. It does NOT
 * move the renter's balance (the debit already did) and adds to the SELLER org's
 * earnings ledger only — so it credits the seller wallet's running total of what
 * they've earned. Never throws on a duplicate. Scoped to the SELLER org's
 * withOrgRls context (the org whose earnings ledger this row belongs to).
 */
export async function accrueBuilderEarning(args: {
  sellerOrgId: string;
  runId: string;
  netMicros: number;
  stripeMode?: MarketplaceStripeMode;
}): Promise<{ ok: true; applied: boolean }> {
  const amount = nonNegMicros(args.netMicros);
  const runId = (args.runId ?? "").trim();
  if (amount <= 0 || !runId) return { ok: true, applied: false };

  return withOrgRls(args.sellerOrgId, async (db) => {
    const fresh = await insertLedgerRow(db, {
      orgId: args.sellerOrgId,
      kind: "earning",
      amountMicros: amount,
      idempotencyKey: `earning:${runId}`,
      runId,
    });
    return { ok: true, applied: fresh };
  });
}

/** Sum a builder's accrued earnings (micro-dollars) across all `earning` rows.
 *  Scoped to the seller org's withOrgRls context. */
export async function getBuilderEarningsMicros(sellerOrgId: string): Promise<number> {
  return withOrgRls(sellerOrgId, async (db) => {
    const [row] = await db
      .select({
        total: sql<string>`COALESCE(SUM(${walletTransactions.amountMicros}), 0)`,
      })
      .from(walletTransactions)
      .where(
        and(
          eq(walletTransactions.orgId, sellerOrgId),
          eq(walletTransactions.kind, "earning"),
        ),
      );
    return nonNegMicros(Number(row?.total ?? 0));
  });
}

/**
 * The builder's WITHDRAWABLE earnings (micro-dollars) = Σ earning − Σ payout,
 * clamped ≥ 0. This is what a payout may transfer (vs getBuilderEarningsMicros,
 * which stays GROSS — lifetime earned — for the "$X earned" surface + the payout
 * idempotency high-water mark). Org-scoped, mode-agnostic (mirrors the gross reader).
 */
export async function getWithdrawableEarningsMicros(sellerOrgId: string): Promise<number> {
  return withOrgRls(sellerOrgId, async (db) => {
    const [row] = await db
      .select({
        total: sql<string>`COALESCE(SUM(CASE
          WHEN ${walletTransactions.kind} = 'earning' THEN ${walletTransactions.amountMicros}
          WHEN ${walletTransactions.kind} = 'payout' THEN -${walletTransactions.amountMicros}
          ELSE 0 END), 0)`,
      })
      .from(walletTransactions)
      .where(eq(walletTransactions.orgId, sellerOrgId));
    return nonNegMicros(Number(row?.total ?? 0));
  });
}

/**
 * Credit a referral bonus (money IN, virality pack Task 5) — a LEDGER
 * increment, NEVER Stripe. This is the SAME shape as creditTopupToWallet
 * (ensure the wallet → insert the ledger row as the dedupe backstop → on a
 * fresh insert, balance += amount), generalized only in that the caller
 * supplies the idempotency key directly rather than deriving it from a
 * Stripe session id — lib/growth/referrals.ts passes the two UNIQUE keys the
 * plan mandates (`referral:referrer:<refereeOrgId>` /
 * `referral:referee:<refereeOrgId>`), one per side of the referral, so each
 * side can be credited independently and idempotently. Idempotent on
 * `idempotencyKey`: a replayed call (maybeCreditReferral called twice for an
 * already-credited referee) is a no-op that credits ONCE. Never throws. Runs
 * inside ONE withOrgRls tx.
 */
export async function creditReferralToWallet(args: {
  orgId: string;
  amountMicros: number;
  idempotencyKey: string;
  stripeMode?: MarketplaceStripeMode;
}): Promise<WalletApplyResult> {
  const stripeMode = args.stripeMode ?? "test";
  const amount = nonNegMicros(args.amountMicros);
  const key = (args.idempotencyKey ?? "").trim();
  if (amount <= 0 || !key) return { ok: false, reason: "invalid" };

  return withOrgRls(args.orgId, async (db) => {
    await ensureWallet(args.orgId, stripeMode, db);

    const fresh = await insertLedgerRow(db, {
      orgId: args.orgId,
      kind: "referral_credit",
      amountMicros: amount,
      idempotencyKey: key,
    });

    if (!fresh) {
      return {
        ok: true,
        balanceMicros: await getWalletBalanceMicros(args.orgId, stripeMode, db),
        applied: false,
        duplicate: true,
      };
    }

    const [updated] = await db
      .update(walletAccounts)
      .set({
        balanceMicros: sql`${walletAccounts.balanceMicros} + ${amount}`,
        updatedAt: new Date(),
      })
      .where(and(eq(walletAccounts.orgId, args.orgId), eq(walletAccounts.stripeMode, stripeMode)))
      .returning({ balanceMicros: walletAccounts.balanceMicros });

    return {
      ok: true,
      balanceMicros: nonNegMicros(updated?.balanceMicros ?? 0),
      applied: true,
      duplicate: false,
    };
  });
}

/**
 * Record a completed payout as a `payout` ledger row (SUBTRACTS from withdrawable).
 * Idempotent on `payout:<transferId>` (the wallet ledger's UNIQUE dedupe backstop):
 * a re-record of the same Stripe transfer is a no-op → one transfer maps to exactly
 * one ledger row even if recordBuilderPayout is retried after a mid-flight crash.
 * Never throws on a duplicate. Scoped to the payee org's withOrgRls context.
 */
export async function recordBuilderPayout(args: {
  orgId: string;
  amountMicros: number;
  transferId: string;
}): Promise<{ ok: true; applied: boolean }> {
  const amount = nonNegMicros(args.amountMicros);
  const transferId = (args.transferId ?? "").trim();
  if (amount <= 0 || !transferId) return { ok: true, applied: false };

  return withOrgRls(args.orgId, async (db) => {
    const fresh = await insertLedgerRow(db, {
      orgId: args.orgId,
      kind: "payout",
      amountMicros: amount,
      idempotencyKey: `payout:${transferId}`,
      stripeRef: transferId,
    });
    return { ok: true, applied: fresh };
  });
}
```

  Note the signature change: `ensureWallet` and `getWalletBalanceMicros` each gained an optional third `tx?: RlsDb` parameter so callers that already hold an open `withOrgRls` transaction (every other function in this file) pass it through instead of opening a SECOND nested transaction. Both remain callable exactly as before (two-arg) for any external caller that doesn't have a tx handle — in that case they open their own `withOrgRls`. **Grep the codebase for any OTHER external caller of `ensureWallet` or `getWalletBalanceMicros`** before finishing this step, to confirm the two-arg call shape still works for them unchanged:

```
cd packages/crm
grep -rn "ensureWallet(\|getWalletBalanceMicros(" src/ --include="*.ts" | grep -v "wallet-store.ts"
```

  Expected: any hits are two-arg calls (`ensureWallet(orgId, stripeMode)` / `getWalletBalanceMicros(orgId, stripeMode)`) with no third argument — those continue to work unchanged (the third param is optional) and open their own `withOrgRls` context exactly as `wallet-store.ts`'s own two-arg call sites do internally.

- [ ] Run the existing wallet regression suite (these were already passing before this task — the rewiring must not change their observable behavior since `withOrgRls` is inert by default in test runs where `DATABASE_URL_APP` is unset):

```
cd packages/crm
node --import tsx --test tests/unit/build/wallet-ledger.spec.ts tests/unit/build/wallet-mode.spec.ts tests/unit/build/wallet-topup.spec.ts tests/unit/build/wallet-voice.spec.ts tests/unit/build/wallet-webhook.spec.ts tests/unit/build/wallet-webhook-apply.spec.ts tests/unit/build/run-drawdown.spec.ts tests/unit/db/rls.spec.ts
```

Expected output: all pass, identical pass count to the pre-rewiring baseline (if any of these specs mock `@/db`'s `db` export directly rather than calling through the store's public functions, they may need their mock target updated to `@/db/rls`'s `withOrgRls` — inspect any failure here individually; do not mass-edit test mocks speculatively).

- [ ] Typecheck:

```
cd packages/crm
npx tsc --noEmit -p tsconfig.json
```

Expected: no new errors attributable to `src/lib/build/wallet-store.ts`.

- [ ] Commit:

```
git add packages/crm/src/lib/build/wallet-store.ts
git commit -m "$(cat <<'EOF'
feat(db): rewire wallet-store.ts through withOrgRls (RLS Phase 1)

Every wallet_accounts/wallet_transactions call site in wallet-store.ts —
ensureWallet, getWalletBalanceMicros, creditTopupToWallet, debitWalletForRun,
debitVoiceUsage, debitNumberRent, accrueBuilderEarning,
getBuilderEarningsMicros, getWithdrawableEarningsMicros,
creditReferralToWallet, recordBuilderPayout — now opens its DB work through
withOrgRls(orgId, tx => …) instead of the raw module-level db. Inert today
(DATABASE_URL_APP unset in every environment) — behavior is unchanged until
Max sets the var per the runbook in drizzle/0062_wallet_rls.sql. The
voice-rent cron (api/cron/voice-rent/route.ts) is unchanged: it already
calls debitNumberRent once per deployment with that deployment's own orgId,
which withOrgRls scopes correctly without any cron-side edit.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Integration spec — real RLS enforcement against a Neon branch (opt-in)

**Files:**
- Create: `packages/crm/tests/integration/rls-phase1.spec.ts`

**Steps:**

- [ ] Create `packages/crm/tests/integration/rls-phase1.spec.ts`:

```ts
// Postgres RLS Phase 1 — integration spec against a REAL Neon branch (spec
// docs/superpowers/specs/2026-07-03-postgres-rls-defense-in-depth-design.md, D5).
//
// This spec is OPT-IN: it SKIPS entirely unless RLS_TEST_DATABASE_URL is set
// to a disposable Neon branch's connection string (a branch, NOT the prod or
// dev branch — this spec creates real rows and, if it runs against a branch
// where the seldonframe_app role doesn't exist yet, some assertions below
// will be meaningless rather than failing, so RLS_TEST_DATABASE_URL must
// point at a branch where Task 2's migration has ALREADY been applied and
// Max has ALREADY created both roles per that migration's runbook).
//
// What this proves that the unit spec (tests/unit/db/rls.spec.ts) cannot,
// because the unit spec never opens a real Postgres connection:
//   1. Cross-tenant SELECT is invisible: seed two orgs' wallet rows, run a
//      deliberately unscoped SELECT (no WHERE org_id) through the
//      seldonframe_app role with org A's context set — only org A's row
//      comes back, org B's is invisible even though no application-layer
//      filter excluded it.
//   2. Uncontexted query = 0 rows: skip set_config entirely (or set it to
//      an empty string) and the SAME unscoped SELECT returns nothing —
//      default-deny, not "sees everything by accident."
//   3. The service role sees both orgs' rows in one unscoped SELECT
//      (BYPASSRLS) — crons/migrations/rollups still work unchanged.
//   4. Ledger invariants hold UNDER RLS: idempotency (a duplicate
//      idempotencyKey insert via onConflictDoNothing still no-ops) and
//      never-negative (an over-debit still 0-rows the guarded UPDATE) are
//      unchanged by adding RLS on top.
//
// To run (requires a disposable Neon branch with Task 2's migration
// already applied and both roles already created):
//   cd packages/crm
//   RLS_TEST_DATABASE_URL="postgresql://seldonframe_app:<pw>@<branch>-pooler.../seldon_frame?sslmode=require" \
//   RLS_TEST_SERVICE_DATABASE_URL="postgresql://seldonframe_service:<pw>@<branch>-pooler.../seldon_frame?sslmode=require" \
//     node --import tsx --test tests/integration/rls-phase1.spec.ts
//
// Setup SQL to run ONCE against the branch before this spec (NOT part of
// the migration — these are ephemeral test-fixture rows, not schema):
//   -- (Task 2's migration must already be applied to this branch.)
//   -- No manual seed rows needed — this spec seeds/cleans up its own rows
//   -- via the exported store functions, using two throwaway UUIDs as orgIds.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { sql as rawSql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import ws from "ws";
import { neonConfig } from "@neondatabase/serverless";
import * as schema from "../../src/db/schema";
import { walletAccounts, walletTransactions } from "../../src/db/schema/wallet";

const APP_URL = process.env.RLS_TEST_DATABASE_URL;
const SERVICE_URL = process.env.RLS_TEST_SERVICE_DATABASE_URL;

if (!APP_URL || !SERVICE_URL) {
  describe("RLS Phase 1 integration (SKIPPED)", () => {
    test("set RLS_TEST_DATABASE_URL + RLS_TEST_SERVICE_DATABASE_URL to a disposable Neon branch to run this spec", () => {
      assert.ok(true, "skipped — no RLS_TEST_DATABASE_URL/RLS_TEST_SERVICE_DATABASE_URL in env");
    });
  });
} else {
  neonConfig.webSocketConstructor = ws;

  const ORG_A = "11111111-1111-4111-8111-111111111111";
  const ORG_B = "22222222-2222-4222-8222-222222222222";

  const appPool = new Pool({ connectionString: APP_URL });
  const servicePool = new Pool({ connectionString: SERVICE_URL });
  const serviceDb = drizzle(servicePool, { schema, casing: "snake_case" });

  /** Run `fn` on the app-role pool with app.org_id set inside a transaction.
   *  Builds the drizzle instance from ONE checked-out client (not the pool
   *  itself) so set_config and fn's queries are guaranteed to run on the
   *  SAME physical connection — drizzle(pool, …) round-robins across
   *  connections per query, which would silently detach the SET LOCAL
   *  context from fn's queries if we passed the pool-backed instance instead.
   *
   *  tx is typed with the same driver-agnostic PgDatabase form as RlsDb in
   *  src/db/rls.ts: ReturnType<typeof drizzle> resolves the generic at its
   *  DEFAULTS (schema Record<string, unknown>, $client: Pool), which rejects
   *  a client-built instance ($client: PoolClient) — the same
   *  generic-parameterization mismatch class the RlsDb fix addressed. */
  async function withAppOrgContext<T>(orgId: string | null, fn: (tx: PgDatabase<any, typeof schema>) => Promise<T>): Promise<T> {
    const client = await appPool.connect();
    const tx = drizzle(client, { schema, casing: "snake_case" });
    try {
      await client.query("BEGIN");
      if (orgId !== null) {
        await client.query("select set_config('app.org_id', $1, true)", [orgId]);
      }
      const result = await fn(tx);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async function seedWallet(orgId: string, balanceMicros: number) {
    await serviceDb
      .insert(walletAccounts)
      .values({ orgId, stripeMode: "test", balanceMicros })
      .onConflictDoNothing({ target: [walletAccounts.orgId, walletAccounts.stripeMode] });
  }

  async function cleanupOrg(orgId: string) {
    await serviceDb.delete(walletTransactions).where(rawSql`org_id = ${orgId}`);
    await serviceDb.delete(walletAccounts).where(rawSql`org_id = ${orgId}`);
  }

  describe("RLS Phase 1 — cross-tenant isolation", () => {
    test("setup: seed org A and org B wallets via the service role (BYPASSRLS)", async () => {
      await cleanupOrg(ORG_A);
      await cleanupOrg(ORG_B);
      await seedWallet(ORG_A, 10_000_000);
      await seedWallet(ORG_B, 20_000_000);
      const [rowA] = await serviceDb.select().from(walletAccounts).where(rawSql`org_id = ${ORG_A}`);
      const [rowB] = await serviceDb.select().from(walletAccounts).where(rawSql`org_id = ${ORG_B}`);
      assert.equal(rowA?.balanceMicros, 10_000_000);
      assert.equal(rowB?.balanceMicros, 20_000_000);
    });

    test("app role scoped to org A cannot see org B's row via an UNSCOPED select", async () => {
      const rows = await withAppOrgContext(ORG_A, (tx) => tx.select().from(walletAccounts));
      const orgIds = rows.map((r) => r.orgId);
      assert.ok(orgIds.includes(ORG_A), "org A's own row must be visible");
      assert.ok(!orgIds.includes(ORG_B), "org B's row must be INVISIBLE under org A's context");
    });

    test("app role scoped to org B cannot see org A's row via an UNSCOPED select", async () => {
      const rows = await withAppOrgContext(ORG_B, (tx) => tx.select().from(walletAccounts));
      const orgIds = rows.map((r) => r.orgId);
      assert.ok(orgIds.includes(ORG_B), "org B's own row must be visible");
      assert.ok(!orgIds.includes(ORG_A), "org A's row must be INVISIBLE under org B's context");
    });

    test("uncontexted query (no set_config at all) returns ZERO rows — default-deny", async () => {
      const rows = await withAppOrgContext(null, (tx) => tx.select().from(walletAccounts));
      const orgIds = rows.map((r) => r.orgId);
      assert.ok(!orgIds.includes(ORG_A));
      assert.ok(!orgIds.includes(ORG_B));
    });

    test("service role (BYPASSRLS) sees BOTH orgs in one unscoped select", async () => {
      const rows = await serviceDb.select().from(walletAccounts);
      const orgIds = rows.map((r) => r.orgId);
      assert.ok(orgIds.includes(ORG_A));
      assert.ok(orgIds.includes(ORG_B));
    });
  });

  describe("RLS Phase 1 — ledger invariants unchanged under RLS", () => {
    test("idempotency: a duplicate idempotencyKey insert still no-ops (UNIQUE constraint holds under RLS)", async () => {
      const key = `rls-idem-test:${ORG_A}`;
      const insertOnce = () =>
        withAppOrgContext(ORG_A, (tx) =>
          tx
            .insert(walletTransactions)
            .values({ orgId: ORG_A, kind: "topup", amountMicros: 5_000_000, idempotencyKey: key })
            .onConflictDoNothing({ target: walletTransactions.idempotencyKey })
            .returning({ id: walletTransactions.id }),
        );
      const first = await insertOnce();
      const second = await insertOnce();
      assert.equal(first.length, 1, "first insert must succeed");
      assert.equal(second.length, 0, "second insert with the same key must no-op");
    });

    test("never-negative: a guarded over-debit UPDATE still 0-rows under RLS", async () => {
      // Org A's balance is 10_000_000 (set in the setup test above, minus the
      // idempotency test's 5_000_000 topup row it inserted but never applied
      // to the balance column — this test only exercises the guarded UPDATE
      // itself, not the full wallet-store flow, so it reads the current
      // balance fresh rather than assuming a fixed prior value).
      const [before] = await withAppOrgContext(ORG_A, (tx) => tx.select().from(walletAccounts).where(rawSql`org_id = ${ORG_A}`));
      const overAmount = (before?.balanceMicros ?? 0) + 1_000_000;
      const decremented = await withAppOrgContext(ORG_A, (tx) =>
        tx
          .update(walletAccounts)
          .set({ balanceMicros: rawSql`${walletAccounts.balanceMicros} - ${overAmount}` })
          .where(rawSql`org_id = ${ORG_A} AND stripe_mode = 'test' AND balance_micros >= ${overAmount}`)
          .returning({ balanceMicros: walletAccounts.balanceMicros }),
      );
      assert.equal(decremented.length, 0, "an over-debit must 0-row the guarded UPDATE, never go negative");
      const [after] = await serviceDb.select().from(walletAccounts).where(rawSql`org_id = ${ORG_A}`);
      assert.equal(after?.balanceMicros, before?.balanceMicros, "balance must be UNCHANGED after a rejected over-debit");
    });

    test("teardown: clean up org A and org B fixture rows via the service role", async () => {
      await cleanupOrg(ORG_A);
      await cleanupOrg(ORG_B);
      const [rowA] = await serviceDb.select().from(walletAccounts).where(rawSql`org_id = ${ORG_A}`);
      const [rowB] = await serviceDb.select().from(walletAccounts).where(rawSql`org_id = ${ORG_B}`);
      assert.equal(rowA, undefined);
      assert.equal(rowB, undefined);
      await appPool.end();
      await servicePool.end();
    });
  });
}
```

- [ ] This spec is NOT run as part of the standard verify gate (it requires live Neon credentials Max controls). Confirm it is correctly excluded from the default unit-test glob by checking `scripts/run-unit-tests.js`'s pattern (`tests/unit/**/*.spec.ts` — this file lives under `tests/integration/`, outside that glob, so it is never picked up by the default `node --test` sweep):

```
cd packages/crm
node -e "const {globSync}=require('node:fs');console.log(globSync('tests/unit/**/*.spec.ts',{cwd:process.cwd()}).includes('tests/integration/rls-phase1.spec.ts'))"
```

Expected output: `false` — confirming the integration spec is outside the default unit sweep and only runs when explicitly invoked with the env vars set.

- [ ] Sanity-run the file WITHOUT the env vars set (the skip path — this IS runnable in every CI environment safely, it just no-ops):

```
cd packages/crm
node --import tsx --test tests/integration/rls-phase1.spec.ts
```

Expected output: one passing test, message `skipped — no RLS_TEST_DATABASE_URL/RLS_TEST_SERVICE_DATABASE_URL in env`, `# fail 0`.

- [ ] Typecheck:

```
cd packages/crm
npx tsc --noEmit -p tsconfig.json
```

Expected: no new errors attributable to `tests/integration/rls-phase1.spec.ts`.

- [ ] Commit:

```
git add packages/crm/tests/integration/rls-phase1.spec.ts
git commit -m "$(cat <<'EOF'
test(db): opt-in Neon-branch integration spec for RLS Phase 1

Skips unless RLS_TEST_DATABASE_URL + RLS_TEST_SERVICE_DATABASE_URL point at
a disposable Neon branch with the 0062_wallet_rls migration already applied
and both roles already created. Proves what the unit spec can't (no real
Postgres in that one): cross-tenant SELECT is invisible under the app
role's org context, an uncontexted query returns zero rows (default-deny),
the service role sees both orgs (BYPASSRLS unchanged), and the ledger's
idempotency + never-negative guards still hold with RLS layered on top.
Lives under tests/integration/ so it is outside run-unit-tests.js's default
tests/unit/**/*.spec.ts glob — never runs in a normal CI pass.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Final verify gate + handoff

**Steps:**

- [ ] Full unit sweep (everything under `tests/unit/`, confirming Task 3's rewiring didn't regress anything project-wide, not just the wallet specs):

```
cd packages/crm
node --import tsx --test "$(node -e "const{globSync}=require('node:fs');console.log(globSync('tests/unit/**/*.spec.ts',{cwd:process.cwd()}).join(' '))")"
```

  (Or equivalently, since `pnpm test:unit` at the repo root already wraps `scripts/run-unit-tests.js` with this exact glob — use whichever the engineer's shell handles more reliably.) Expected output: same total pass count as the pre-Phase-1 baseline PLUS the new `tests/unit/db/rls.spec.ts` tests, zero new failures.

- [ ] Typecheck the whole package:

```
cd packages/crm
npx tsc --noEmit -p tsconfig.json
```

Expected: only pre-existing `.next`-artifact noise (the known React 19 type-artifact class `next.config.ts:9`'s `ignoreBuildErrors: true` already tolerates) — zero NEW errors in `src/db/rls.ts`, `src/lib/build/wallet-store.ts`, `tests/unit/db/rls.spec.ts`, or `tests/integration/rls-phase1.spec.ts`.

- [ ] `use server` guard:

```
cd packages/crm
bash scripts/check-use-server.sh src
```

Expected: exit code 0, no violations (this task touches no Server Action files, so this should be a no-op pass — run it anyway as the standard gate).

- [ ] Full Next build (only run once, here, at the end — confirms the migration file + rewiring don't break the production build path):

```
cd packages/crm
pnpm build
```

Expected: `next build` completes successfully (exit code 0). `scripts/check-use-server.sh src` runs first as part of the `build` script itself (see `package.json`'s `"build": "bash scripts/check-use-server.sh src && next build"`), so this step re-confirms the prior step's result as a side effect.

- [ ] Self-review pass before declaring done — re-read this plan's Global Constraints section against the four files touched (`src/db/rls.ts`, `drizzle/0062_wallet_rls.sql`, `src/lib/build/wallet-store.ts`, the two new test files) and confirm:
  - [ ] The flag name is `DATABASE_URL_APP` everywhere (rls.ts, the migration's runbook comment, this plan) — no typo drift to `DATABASE_APP_URL` or similar.
  - [ ] The policy predicate string `org_id = current_setting('app.org_id', true)::uuid` is IDENTICAL in the migration SQL and the spec's D3 section.
  - [ ] `seldonframe_app` / `seldonframe_service` role names are spelled identically in the migration's GRANT blocks and its runbook comment.
  - [ ] No placeholder text (`TODO`, `TBD`, `FIXME`) exists in any of the four touched files.
  - [ ] The cron route `src/app/api/cron/voice-rent/route.ts` has ZERO diff across all of Tasks 1–4 (confirm with `git diff --stat` against the task range) — it was never meant to change in this plan.

```
cd "C:\Users\maxim\CascadeProjects\Seldon Frame\.claude\worktrees\virality"
git diff --stat HEAD~4 -- packages/crm/src/app/api/cron/voice-rent/route.ts
```

Expected output: empty (no output at all) — confirming zero lines changed in the cron route across the four commits this plan produced.

- [ ] Do NOT push. Report the final state: four commits on `feature/virality-pack` in this worktree, `DATABASE_URL_APP` unset means zero behavior change today, and the Task 2 runbook is what Max runs next in the Neon console to actually turn enforcement on.
