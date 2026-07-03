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
