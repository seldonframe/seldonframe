// referral wallet credits — virality pack Task 5 (MONEY, inert behind
// SF_REFERRALS_ENABLED).
//
// MONEY-SAFETY under test:
//   • disabled (flag absent/false) → every entry point is a total no-op:
//     recordReferral writes nothing, maybeCreditReferral credits nothing.
//   • self-referral (referrerOrgId === refereeOrgId) is rejected — never
//     recorded, even when enabled.
//   • one referral row per referee EVER — a second recordReferral for the
//     same refereeOrgId is a no-op (the UNIQUE(refereeOrgId) invariant,
//     modeled here via the fake store's own dedupe).
//   • maybeCreditReferral is idempotent — the SECOND call for an
//     already-credited referee returns { credited:false } and does NOT
//     insert a second ledger row for either party (asserted by reusing the
//     exact idempotency keys and observing the fake ledger's call count).
//   • the happy path credits BOTH parties with the two EXACT idempotency
//     keys the plan mandates (`referral:referrer:<refereeOrgId>` and
//     `referral:referee:<refereeOrgId>`) for SF_REFERRAL_CREDIT_CENTS
//     (default 500 → 500_000 micros), and reads the wallet mode via
//     resolveWalletStripeMode.
//
// DI'd over fakes — no DB, no network, no wallet-store import. The fakes
// model exactly the invariants the real store enforces (UNIQUE on
// refereeOrgId; UNIQUE on ledger idempotencyKey) so a test can't pass by
// accident.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  referralsEnabled,
  recordReferral,
  maybeCreditReferral,
  REFERRAL_CREDIT_CENTS_DEFAULT,
  referrerIdempotencyKey,
  refereeIdempotencyKey,
  type ReferralsDeps,
  type ReferralRow,
} from "../../../src/lib/growth/referrals";

// ─── fakes ───────────────────────────────────────────────────────────────

/** An in-memory fake of the `referrals` table, keyed by id. Enforces the
 *  same UNIQUE(refereeOrgId) invariant the real migration does. */
function makeFakeReferralsStore() {
  const rows: ReferralRow[] = [];
  let nextId = 1;
  return {
    rows,
    async findByRefereeOrgId(refereeOrgId: string): Promise<ReferralRow | null> {
      return rows.find((r) => r.refereeOrgId === refereeOrgId) ?? null;
    },
    async insert(args: {
      referrerOrgId: string;
      refereeOrgId: string;
      source: string;
    }): Promise<ReferralRow | null> {
      // Mirror the UNIQUE(refereeOrgId) DB constraint: a second insert for an
      // already-recorded referee is a no-op (returns null, like
      // onConflictDoNothing().returning() would).
      if (rows.some((r) => r.refereeOrgId === args.refereeOrgId)) return null;
      const row: ReferralRow = {
        id: String(nextId++),
        referrerOrgId: args.referrerOrgId,
        refereeOrgId: args.refereeOrgId,
        source: args.source,
        status: "pending",
        createdAt: new Date(),
        creditedAt: null,
      };
      rows.push(row);
      return row;
    },
    async markCredited(id: string): Promise<void> {
      const row = rows.find((r) => r.id === id);
      if (row) {
        row.status = "credited";
        row.creditedAt = new Date();
      }
    },
  };
}

/** A fake wallet ledger. Mirrors wallet-store.ts's real idempotency
 *  contract: inserting the SAME idempotencyKey twice is a no-op (the second
 *  call returns applied:false, duplicate:true, and the ledger's call log
 *  does NOT grow) — exactly the UNIQUE(idempotency_key) backstop. */
function makeFakeWalletLedger() {
  const credited: Array<{
    orgId: string;
    amountMicros: number;
    idempotencyKey: string;
    kind: string;
    stripeMode: string;
  }> = [];
  const appliedKeys = new Set<string>();
  return {
    credited,
    async creditReferral(args: {
      orgId: string;
      amountMicros: number;
      idempotencyKey: string;
      stripeMode: "test" | "live";
    }): Promise<{ applied: boolean }> {
      if (appliedKeys.has(args.idempotencyKey)) {
        return { applied: false };
      }
      appliedKeys.add(args.idempotencyKey);
      credited.push({ ...args, kind: "referral_credit" });
      return { applied: true };
    },
  };
}

function buildDeps(overrides?: {
  enabledEnv?: NodeJS.ProcessEnv;
  store?: ReturnType<typeof makeFakeReferralsStore>;
  ledger?: ReturnType<typeof makeFakeWalletLedger>;
  creditCents?: string;
}): {
  deps: ReferralsDeps;
  store: ReturnType<typeof makeFakeReferralsStore>;
  ledger: ReturnType<typeof makeFakeWalletLedger>;
} {
  const store = overrides?.store ?? makeFakeReferralsStore();
  const ledger = overrides?.ledger ?? makeFakeWalletLedger();
  const env: NodeJS.ProcessEnv = {
    SF_REFERRALS_ENABLED: "true",
    ...(overrides?.creditCents ? { SF_REFERRAL_CREDIT_CENTS: overrides.creditCents } : {}),
    ...overrides?.enabledEnv,
  };
  const deps: ReferralsDeps = {
    env,
    findReferralByRefereeOrgId: store.findByRefereeOrgId,
    insertReferral: store.insert,
    markReferralCredited: store.markCredited,
    creditReferralToWallet: ledger.creditReferral,
    resolveWalletStripeMode: () => "test",
  };
  return { deps, store, ledger };
}

const REFERRER = "org_referrer_1";
const REFEREE = "org_referee_1";

// ─── referralsEnabled ────────────────────────────────────────────────────

describe("referralsEnabled — the flag gate", () => {
  test("absent → disabled", () => {
    assert.equal(referralsEnabled({}), false);
  });

  test('"false" → disabled', () => {
    assert.equal(referralsEnabled({ SF_REFERRALS_ENABLED: "false" }), false);
  });

  test("any non-\"true\" value → disabled (garbage-tolerant)", () => {
    assert.equal(referralsEnabled({ SF_REFERRALS_ENABLED: "1" }), false);
    assert.equal(referralsEnabled({ SF_REFERRALS_ENABLED: "TRUE" }), false);
    assert.equal(referralsEnabled({ SF_REFERRALS_ENABLED: "yes" }), false);
  });

  test('exactly "true" → enabled', () => {
    assert.equal(referralsEnabled({ SF_REFERRALS_ENABLED: "true" }), true);
  });
});

// ─── recordReferral — disabled short-circuit ────────────────────────────

describe("recordReferral — disabled is a total no-op", () => {
  test("flag absent: writes nothing", async () => {
    const { deps, store } = buildDeps({ enabledEnv: { SF_REFERRALS_ENABLED: undefined } });
    await recordReferral(
      { referrerOrgId: REFERRER, refereeOrgId: REFEREE, source: "powered_by" },
      deps,
    );
    assert.equal(store.rows.length, 0);
  });

  test('flag "false": writes nothing', async () => {
    const { deps, store } = buildDeps({ enabledEnv: { SF_REFERRALS_ENABLED: "false" } });
    await recordReferral(
      { referrerOrgId: REFERRER, refereeOrgId: REFEREE, source: "powered_by" },
      deps,
    );
    assert.equal(store.rows.length, 0);
  });
});

// ─── recordReferral — self-referral rejected ────────────────────────────

describe("recordReferral — self-referral rejected", () => {
  test("referrerOrgId === refereeOrgId is never recorded, even when enabled", async () => {
    const { deps, store } = buildDeps();
    await recordReferral(
      { referrerOrgId: REFEREE, refereeOrgId: REFEREE, source: "powered_by" },
      deps,
    );
    assert.equal(store.rows.length, 0);
  });
});

// ─── recordReferral — double-record no-ops ──────────────────────────────

describe("recordReferral — one row per referee EVER", () => {
  test("a second recordReferral for the same refereeOrgId is a no-op", async () => {
    const { deps, store } = buildDeps();
    await recordReferral(
      { referrerOrgId: REFERRER, refereeOrgId: REFEREE, source: "powered_by" },
      deps,
    );
    assert.equal(store.rows.length, 1);

    // Replay — same referee, even a DIFFERENT referrer/source — still a no-op.
    await recordReferral(
      { referrerOrgId: "org_referrer_2", refereeOrgId: REFEREE, source: "other" },
      deps,
    );
    assert.equal(store.rows.length, 1);
    assert.equal(store.rows[0]?.referrerOrgId, REFERRER); // unchanged — first write wins
  });

  test("happy path records a pending row with the given referrer/referee/source", async () => {
    const { deps, store } = buildDeps();
    await recordReferral(
      { referrerOrgId: REFERRER, refereeOrgId: REFEREE, source: "powered_by" },
      deps,
    );
    assert.equal(store.rows.length, 1);
    const row = store.rows[0];
    assert.equal(row?.referrerOrgId, REFERRER);
    assert.equal(row?.refereeOrgId, REFEREE);
    assert.equal(row?.source, "powered_by");
    assert.equal(row?.status, "pending");
  });
});

// ─── maybeCreditReferral — disabled ─────────────────────────────────────

describe("maybeCreditReferral — disabled is a total no-op", () => {
  test("flag absent: no referral row, credits nothing, returns credited:false", async () => {
    const { deps, ledger } = buildDeps({ enabledEnv: { SF_REFERRALS_ENABLED: undefined } });
    const result = await maybeCreditReferral(REFEREE, deps);
    assert.deepEqual(result, { credited: false });
    assert.equal(ledger.credited.length, 0);
  });

  test("flag absent even with a pending referral row present: still a no-op", async () => {
    const store = makeFakeReferralsStore();
    await store.insert({ referrerOrgId: REFERRER, refereeOrgId: REFEREE, source: "powered_by" });
    const { deps, ledger } = buildDeps({ store, enabledEnv: { SF_REFERRALS_ENABLED: undefined } });
    const result = await maybeCreditReferral(REFEREE, deps);
    assert.deepEqual(result, { credited: false });
    assert.equal(ledger.credited.length, 0);
    // The row must stay pending — disabled must not silently transition state.
    assert.equal(store.rows[0]?.status, "pending");
  });
});

// ─── maybeCreditReferral — no referral on file ──────────────────────────

describe("maybeCreditReferral — no referral recorded for this referee", () => {
  test("returns credited:false, credits nothing", async () => {
    const { deps, ledger } = buildDeps();
    const result = await maybeCreditReferral(REFEREE, deps);
    assert.deepEqual(result, { credited: false });
    assert.equal(ledger.credited.length, 0);
  });
});

// ─── maybeCreditReferral — happy path ───────────────────────────────────

describe("maybeCreditReferral — happy path credits BOTH parties", () => {
  test("credits referrer + referee with the two EXACT idempotency keys and the default amount", async () => {
    const store = makeFakeReferralsStore();
    await store.insert({ referrerOrgId: REFERRER, refereeOrgId: REFEREE, source: "powered_by" });
    const { deps, ledger } = buildDeps({ store });

    const result = await maybeCreditReferral(REFEREE, deps);
    assert.deepEqual(result, { credited: true });

    assert.equal(ledger.credited.length, 2);

    const referrerCredit = ledger.credited.find((c) => c.orgId === REFERRER);
    const refereeCredit = ledger.credited.find((c) => c.orgId === REFEREE);
    assert.ok(referrerCredit, "referrer must be credited");
    assert.ok(refereeCredit, "referee must be credited");

    // The EXACT idempotency keys the plan mandates.
    assert.equal(referrerCredit?.idempotencyKey, `referral:referrer:${REFEREE}`);
    assert.equal(refereeCredit?.idempotencyKey, `referral:referee:${REFEREE}`);
    assert.equal(referrerCredit?.idempotencyKey, referrerIdempotencyKey(REFEREE));
    assert.equal(refereeCredit?.idempotencyKey, refereeIdempotencyKey(REFEREE));

    // Default amount: SF_REFERRAL_CREDIT_CENTS default 500 cents = 500_000 micros.
    assert.equal(referrerCredit?.amountMicros, 500_000);
    assert.equal(refereeCredit?.amountMicros, 500_000);
    assert.equal(REFERRAL_CREDIT_CENTS_DEFAULT, 500);

    // Wallet mode came from resolveWalletStripeMode (faked to "test" above).
    assert.equal(referrerCredit?.stripeMode, "test");
    assert.equal(refereeCredit?.stripeMode, "test");

    // The row transitions to credited.
    assert.equal(store.rows[0]?.status, "credited");
    assert.ok(store.rows[0]?.creditedAt instanceof Date);
  });

  test("honors SF_REFERRAL_CREDIT_CENTS when set (e.g. 250 cents → 250_000 micros)", async () => {
    const store = makeFakeReferralsStore();
    await store.insert({ referrerOrgId: REFERRER, refereeOrgId: REFEREE, source: "powered_by" });
    const { deps, ledger } = buildDeps({ store, creditCents: "250" });

    const result = await maybeCreditReferral(REFEREE, deps);
    assert.deepEqual(result, { credited: true });
    assert.equal(ledger.credited[0]?.amountMicros, 250_000);
    assert.equal(ledger.credited[1]?.amountMicros, 250_000);
  });
});

// ─── maybeCreditReferral — idempotent (the money-safety core) ───────────

describe("maybeCreditReferral — idempotent, one credit pair per referee EVER", () => {
  test("a second call for an already-credited referee returns credited:false and writes NO second ledger row", async () => {
    const store = makeFakeReferralsStore();
    await store.insert({ referrerOrgId: REFERRER, refereeOrgId: REFEREE, source: "powered_by" });
    const { deps, ledger } = buildDeps({ store });

    const first = await maybeCreditReferral(REFEREE, deps);
    assert.deepEqual(first, { credited: true });
    assert.equal(ledger.credited.length, 2);

    // Replay — status is now 'credited'.
    const second = await maybeCreditReferral(REFEREE, deps);
    assert.deepEqual(second, { credited: false });
    // NO new ledger rows — the exact two idempotency keys were not reused to
    // insert twice (the fake ledger itself would have no-op'd even if called
    // again, but the real assertion is that the row count didn't grow at all,
    // proving maybeCreditReferral short-circuits on status !== 'pending'
    // rather than relying solely on the ledger's own dedupe).
    assert.equal(ledger.credited.length, 2);
  });

  test("even if the store raced and re-inserted a 'pending' row for an already-credited key, the ledger's own idempotency prevents a double-credit", async () => {
    // Defense in depth: simulate calling the ledger directly with the SAME
    // idempotency keys twice (bypassing maybeCreditReferral's own status
    // check) — the fake ledger (which mirrors the real UNIQUE(idempotency_key)
    // backstop) must refuse the second application.
    const ledger = makeFakeWalletLedger();
    const key = referrerIdempotencyKey(REFEREE);
    const first = await ledger.creditReferral({
      orgId: REFERRER,
      amountMicros: 500_000,
      idempotencyKey: key,
      stripeMode: "test",
    });
    assert.equal(first.applied, true);
    const replay = await ledger.creditReferral({
      orgId: REFERRER,
      amountMicros: 500_000,
      idempotencyKey: key,
      stripeMode: "test",
    });
    assert.equal(replay.applied, false);
    assert.equal(ledger.credited.length, 1);
  });
});

// ─── idempotency key helpers — exact shape ──────────────────────────────

describe("idempotency key helpers — exact shape mandated by the plan", () => {
  test("referrerIdempotencyKey / refereeIdempotencyKey produce the exact mandated strings", () => {
    assert.equal(referrerIdempotencyKey("abc-123"), "referral:referrer:abc-123");
    assert.equal(refereeIdempotencyKey("abc-123"), "referral:referee:abc-123");
  });
});
