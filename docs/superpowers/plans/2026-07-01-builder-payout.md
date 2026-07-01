# Builder Payout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a builder withdraw their accrued marketplace earnings to their own bank via a Stripe Connect Transfer — from the CLI/agent, the builder-state lens, and the dashboard.

**Architecture:** SF already holds the funds (renter top-ups) and accrues the seller's 95% as `kind:"earning"` wallet-ledger rows. A payout is a Stripe **Transfer** (platform balance → the builder's connected Express account), recorded as a new `kind:"payout"` ledger row so `withdrawable = Σ earning − Σ payout`. All money logic lives in a PURE `requestPayout(input, deps)` (unit-tested with a fake Stripe); the bearer route + the dashboard server action are thin wrappers over it sharing one deps factory. Additive — `kind` is a text column, so NO migration.

**Tech Stack:** Next.js 16 / React 19, Drizzle + Neon (neon-http, no interactive tx), Stripe SDK (Connect), the shipped prepaid-wallet rail, `node --import tsx --test`, the zero-dep `@seldonframe/cli`.

## Global Constraints

- **This is the only money-OUT path. Money-safety leads every task:**
  - **Flag-gated** by `SF_MARKETPLACE_BILLING` (`isBillingEnabled(env)`; default OFF → `disabled`, no transfer).
  - **Inert without a Stripe key:** `getStripeClient()` returns null → `getConnectedAccount` returns null → `connect_required`; no transfer is ever reachable in dev/test.
  - **Test-mode by default:** the Stripe mode is key-derived (`resolveBillingMode`); a live transfer is only possible under a live key.
  - **Idempotent on BOTH sides:** the Stripe Transfer carries an **idempotency key = `payout:<orgId>:<grossEarnedMicros>`** (cumulative gross earned — a monotonic high-water mark, NOT the amount); the `payout` ledger row dedupes on the wallet ledger's UNIQUE **`payout:<transferId>`**.
  - **Only transfers net-positive ≥ `$10`** (`MIN_WITHDRAW_USD = 10`), and only to a connected account with `payouts_enabled`.
  - **Safe order:** create the Transfer (idempotent) → THEN record the ledger row (idempotent). Record only what was actually transferred (`amountCents * MICRO_PER_CENT`); sub-cent dust stays withdrawable.
  - **Max enters all Stripe keys himself.** No key values are ever handled in code or by the assistant.
- **Additive, NO migration:** add `"payout"` to `WalletTransactionKind` (a `text` column). Do not create a drizzle migration.
- **`getBuilderEarningsMicros` stays GROSS** (Σ earning) — it feeds the block's "$X earned" and the idempotency high-water mark. Withdrawable is a NEW sibling reader.
- **Accounting unit is MICRO-DOLLARS** ($1 = 1_000_000; 1 cent = 10_000 = `MICRO_PER_CENT` from `@/lib/build/run-cost`).
- **Reuse, don't duplicate:** the Express Connect onboarding (`src/lib/proposals/stripe-connect.ts` — `getStripeClient`, `buildConnectAccountParams`, `buildAccountLinkParams`), the `stripeConnections` table, `insertLedgerRow`'s dedupe pattern, the topup route's DI-deps-factory shape.
- **Worktree:** `.claude/worktrees/icp3-wedge` on branch `feature/chatgpt-app-submission` (where the lifecycle spec `adfb5e93` + plan `19184c1c` + `builder-ladder.ts` live). All paths below are relative to `packages/crm/` unless prefixed `packages/cli/`.
- **Per-task commit.** Verify gate per task; the full gate (`tsc`, `pnpm check:use-server`, `pnpm build` for crm; `npm test` + `npm run build` for cli) runs in the final task.

## File Structure

- `src/db/schema/wallet.ts` — add `"payout"` to `WalletTransactionKind` (+ JSDoc). [Task 1]
- `src/lib/build/wallet-store.ts` — add `getWithdrawableEarningsMicros(orgId)` + `recordBuilderPayout({orgId, amountMicros, transferId})`. [Task 1]
- `src/lib/build/payout.ts` — **NEW, PURE.** `requestPayout(input, deps)` + all types. The money-safety heart. [Task 2]
- `tests/unit/build/payout.spec.ts` — **NEW.** Full TDD suite for `requestPayout`. [Task 2]
- `src/lib/build/payout-deps.ts` — **NEW.** The real deps factory (Stripe Transfer seam + Connect account read + onboarding URL + ledger readers). [Task 3]
- `src/app/api/v1/build/payout/route.ts` — **NEW.** Bearer-authed (`wst_`) route wrapping `requestPayout`. [Task 3]
- `src/lib/build/builder-ladder.ts` — widen `payout_status` to a `PayoutStatus` union; add an optional `payout` signal to `buildLifecycleView`. [Task 4]
- `tests/unit/build/builder-ladder.spec.ts` — extend for the new `payout_status`. [Task 4]
- `src/app/api/v1/workspace-state/route.ts` — gather the payout signal (flag-gated: connected + withdrawable) and pass it to `buildLifecycleView`. [Task 4]
- `packages/cli/src/lib/api-client.ts` — add `PayoutResult` + `payout()`; widen `WorkspaceState.builder.earnings.payout_status`. [Task 5]
- `packages/cli/src/commands/payout.ts` — **NEW.** `runPayoutCommand`. [Task 5]
- `packages/cli/src/commands/status.ts` — render the object `payout_status`. [Task 5]
- `packages/cli/src/cli.ts` + `packages/cli/src/lib/help.ts` — wire the `payout` command. [Task 5]
- `packages/cli/tests/payout.test.ts` — **NEW.** `runPayoutCommand` render tests (fake fetch). [Task 5]
- `src/lib/build/payout-action.ts` — **NEW, "use server".** `requestPayoutAction()` (cookie/`getOrgId()`). [Task 6]
- `src/components/build/wallet-withdraw-client.tsx` — **NEW.** The Withdraw island. [Task 6]
- `src/app/build/wallet/page.tsx` — compute withdrawable + connected, mount the island, add `payout` to `KIND_LABEL`. [Task 6]

---

### Task 1: Ledger — the `payout` kind + a net-withdrawable reader

**Files:**
- Modify: `src/db/schema/wallet.ts:40`
- Modify: `src/lib/build/wallet-store.ts` (append two exported functions after `getBuilderEarningsMicros`, line ~295)

**Interfaces:**
- Consumes: `insertLedgerRow` (private, in `wallet-store.ts`), `nonNegMicros` (private), `walletTransactions`, `WalletTransactionKind`.
- Produces:
  - `WalletTransactionKind = "topup" | "debit" | "earning" | "payout"`
  - `getWithdrawableEarningsMicros(sellerOrgId: string): Promise<number>` — `Σ earning − Σ payout`, clamped ≥ 0.
  - `recordBuilderPayout(args: { orgId: string; amountMicros: number; transferId: string }): Promise<{ ok: true; applied: boolean }>` — inserts a `payout` row, dedupe key `payout:<transferId>`; `applied:false` on duplicate/invalid.

> **No unit test in this task.** `wallet-store.ts` talks to neon-http (no DB in unit tests); these mirror the proven `accrueBuilderEarning` / `getBuilderEarningsMicros` patterns exactly and are exercised through faked deps in Task 2's pure suite. Verified here by `tsc`.

- [ ] **Step 1: Add `"payout"` to the kind union**

In `src/db/schema/wallet.ts`, replace the type + its JSDoc at line 37-40:

```ts
/** The kind of a wallet transaction. `topup` = money in (Stripe Checkout);
 *  `debit` = a per-run drawdown (ledger decrement, no Stripe call); `earning` =
 *  the builder's accrued net (cost − 5% fee) on a run they sold; `payout` = a
 *  withdrawal of accrued earnings to the builder's bank (a Stripe Connect
 *  Transfer), which SUBTRACTS from what's withdrawable. */
export type WalletTransactionKind = "topup" | "debit" | "earning" | "payout";
```

Also update the `idempotencyKey` column comment (line 87-90) to mention payout — append to the existing sentence: `` earning: `earning:<runId>`; payout: `payout:<transferId>`. ``

- [ ] **Step 2: Add the two store helpers**

Append to `src/lib/build/wallet-store.ts` (after `getBuilderEarningsMicros`, at the end of the file):

```ts
/**
 * The builder's WITHDRAWABLE earnings (micro-dollars) = Σ earning − Σ payout,
 * clamped ≥ 0. This is what a payout may transfer (vs getBuilderEarningsMicros,
 * which stays GROSS — lifetime earned — for the "$X earned" surface + the payout
 * idempotency high-water mark). Org-scoped, mode-agnostic (mirrors the gross reader).
 */
export async function getWithdrawableEarningsMicros(sellerOrgId: string): Promise<number> {
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
}

/**
 * Record a completed payout as a `payout` ledger row (SUBTRACTS from withdrawable).
 * Idempotent on `payout:<transferId>` (the wallet ledger's UNIQUE dedupe backstop):
 * a re-record of the same Stripe transfer is a no-op → one transfer maps to exactly
 * one ledger row even if recordBuilderPayout is retried after a mid-flight crash.
 * Never throws on a duplicate.
 */
export async function recordBuilderPayout(args: {
  orgId: string;
  amountMicros: number;
  transferId: string;
}): Promise<{ ok: true; applied: boolean }> {
  const amount = nonNegMicros(args.amountMicros);
  const transferId = (args.transferId ?? "").trim();
  if (amount <= 0 || !transferId) return { ok: true, applied: false };

  const fresh = await insertLedgerRow({
    orgId: args.orgId,
    kind: "payout",
    amountMicros: amount,
    idempotencyKey: `payout:${transferId}`,
    stripeRef: transferId,
  });
  return { ok: true, applied: fresh };
}
```

- [ ] **Step 3: Typecheck**

Run: `cd packages/crm && npx tsc --noEmit`
Expected: PASS (0 errors).

- [ ] **Step 4: Commit**

```bash
git add src/db/schema/wallet.ts src/lib/build/wallet-store.ts
git commit -m "feat(payout): payout ledger kind + getWithdrawableEarningsMicros/recordBuilderPayout"
```

---

### Task 2: PURE `requestPayout` orchestration (the money-safety heart — TDD)

**Files:**
- Create: `src/lib/build/payout.ts`
- Test: `tests/unit/build/payout.spec.ts`

**Interfaces:**
- Consumes: `MICRO_PER_CENT` from `@/lib/build/run-cost`.
- Produces:
  - `MIN_WITHDRAW_USD = 10`
  - `type ConnectedAccount = { stripeAccountId: string; payoutsEnabled: boolean }`
  - `type RequestPayoutDeps = { billingEnabled: boolean; minWithdrawUsd: number; getConnectedAccount(orgId): Promise<ConnectedAccount | null>; getWithdrawableMicros(orgId): Promise<number>; getGrossEarnedMicros(orgId): Promise<number>; createTransfer(i: { orgId: string; amountCents: number; destinationAccountId: string; idempotencyKey: string }): Promise<{ transferId: string }>; recordPayout(i: { orgId: string; amountMicros: number; transferId: string }): Promise<void>; onboardingUrl(orgId): Promise<string | null> }`
  - `type PayoutResult = { status: "paid"; amountUsd: number; transferId: string } | { status: "connect_required"; onboardingUrl: string | null } | { status: "below_min"; withdrawableUsd: number; minUsd: number } | { status: "disabled" }`
  - `requestPayout(input: { orgId: string }, deps: RequestPayoutDeps): Promise<PayoutResult>`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/build/payout.spec.ts`:

```ts
// requestPayout — the PURE money-OUT orchestration (spec 2026-07-01-builder-
// payout). Pins the money-safety invariants: disabled when the flag is off,
// connect_required without an enabled account, below_min under $10, ONE transfer
// then ONE ledger record on success, no phantom record when the transfer throws,
// and the idempotency-key = cumulative gross-earned (so two withdrawals at the
// same earning level can't double-pay, but new earnings get a fresh key).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  requestPayout,
  MIN_WITHDRAW_USD,
  type RequestPayoutDeps,
} from "../../../src/lib/build/payout";

const MICRO = 1_000_000;

/** A deps builder with money-safe defaults (enabled, connected, funded); each
 *  test overrides only what it exercises. Records every createTransfer call. */
function makeDeps(over: Partial<RequestPayoutDeps> = {}): {
  deps: RequestPayoutDeps;
  transfers: { amountCents: number; destinationAccountId: string; idempotencyKey: string }[];
  recorded: { amountMicros: number; transferId: string }[];
} {
  const transfers: { amountCents: number; destinationAccountId: string; idempotencyKey: string }[] = [];
  const recorded: { amountMicros: number; transferId: string }[] = [];
  const deps: RequestPayoutDeps = {
    billingEnabled: true,
    minWithdrawUsd: MIN_WITHDRAW_USD,
    getConnectedAccount: async () => ({ stripeAccountId: "acct_1", payoutsEnabled: true }),
    getWithdrawableMicros: async () => 25 * MICRO,
    getGrossEarnedMicros: async () => 25 * MICRO,
    createTransfer: async (i) => {
      transfers.push({ amountCents: i.amountCents, destinationAccountId: i.destinationAccountId, idempotencyKey: i.idempotencyKey });
      return { transferId: "tr_1" };
    },
    recordPayout: async (i) => {
      recorded.push({ amountMicros: i.amountMicros, transferId: i.transferId });
    },
    onboardingUrl: async () => "https://app.seldonframe.com/build/wallet",
    ...over,
  };
  return { deps, transfers, recorded };
}

describe("requestPayout", () => {
  test("flag OFF → disabled, no transfer", async () => {
    const { deps, transfers } = makeDeps({ billingEnabled: false });
    const r = await requestPayout({ orgId: "o1" }, deps);
    assert.deepEqual(r, { status: "disabled" });
    assert.equal(transfers.length, 0);
  });

  test("missing org → disabled, no transfer", async () => {
    const { deps, transfers } = makeDeps();
    const r = await requestPayout({ orgId: "  " }, deps);
    assert.deepEqual(r, { status: "disabled" });
    assert.equal(transfers.length, 0);
  });

  test("no connected account → connect_required + onboarding link, no transfer", async () => {
    const { deps, transfers } = makeDeps({ getConnectedAccount: async () => null });
    const r = await requestPayout({ orgId: "o1" }, deps);
    assert.equal(r.status, "connect_required");
    assert.equal((r as { onboardingUrl: string }).onboardingUrl, "https://app.seldonframe.com/build/wallet");
    assert.equal(transfers.length, 0);
  });

  test("account exists but payouts not enabled → connect_required", async () => {
    const { deps } = makeDeps({ getConnectedAccount: async () => ({ stripeAccountId: "acct_1", payoutsEnabled: false }) });
    const r = await requestPayout({ orgId: "o1" }, deps);
    assert.equal(r.status, "connect_required");
  });

  test("withdrawable below the $10 minimum → below_min, no transfer", async () => {
    const { deps, transfers } = makeDeps({ getWithdrawableMicros: async () => 9.99 * MICRO });
    const r = await requestPayout({ orgId: "o1" }, deps);
    assert.equal(r.status, "below_min");
    assert.equal((r as { minUsd: number }).minUsd, 10);
    assert.equal((r as { withdrawableUsd: number }).withdrawableUsd, 9.99);
    assert.equal(transfers.length, 0);
  });

  test("funded → ONE transfer of the withdrawable, THEN ONE ledger record, paid", async () => {
    const { deps, transfers, recorded } = makeDeps({
      getWithdrawableMicros: async () => 25 * MICRO,
      getGrossEarnedMicros: async () => 40 * MICRO, // gross ≥ withdrawable (some already paid)
    });
    const r = await requestPayout({ orgId: "o1" }, deps);
    assert.deepEqual(r, { status: "paid", amountUsd: 25, transferId: "tr_1" });
    assert.equal(transfers.length, 1);
    assert.equal(transfers[0]!.amountCents, 2500);
    assert.equal(transfers[0]!.destinationAccountId, "acct_1");
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0]!.amountMicros, 25 * MICRO);
    assert.equal(recorded[0]!.transferId, "tr_1");
  });

  test("idempotency key = payout:<orgId>:<grossEarnedMicros> (NOT the amount)", async () => {
    const { deps, transfers } = makeDeps({
      getWithdrawableMicros: async () => 25 * MICRO,
      getGrossEarnedMicros: async () => 40 * MICRO,
    });
    await requestPayout({ orgId: "o1" }, deps);
    assert.equal(transfers[0]!.idempotencyKey, `payout:o1:${40 * MICRO}`);
  });

  test("idempotency-key stability: same gross → same key; more earnings → different key", async () => {
    const a = makeDeps({ getWithdrawableMicros: async () => 10 * MICRO, getGrossEarnedMicros: async () => 10 * MICRO });
    await requestPayout({ orgId: "o1" }, a.deps);
    const b = makeDeps({ getWithdrawableMicros: async () => 10 * MICRO, getGrossEarnedMicros: async () => 10 * MICRO });
    await requestPayout({ orgId: "o1" }, b.deps);
    assert.equal(a.transfers[0]!.idempotencyKey, b.transfers[0]!.idempotencyKey); // same level → collapses
    const c = makeDeps({ getWithdrawableMicros: async () => 15 * MICRO, getGrossEarnedMicros: async () => 25 * MICRO });
    await requestPayout({ orgId: "o1" }, c.deps);
    assert.notEqual(a.transfers[0]!.idempotencyKey, c.transfers[0]!.idempotencyKey); // new earnings → new key
  });

  test("a createTransfer that throws surfaces the error and records NO ledger row", async () => {
    const { deps, recorded } = makeDeps({
      createTransfer: async () => { throw new Error("stripe boom"); },
    });
    await assert.rejects(() => requestPayout({ orgId: "o1" }, deps), /stripe boom/);
    assert.equal(recorded.length, 0); // no phantom payout row
  });

  test("records only whole cents actually transferred; sub-cent dust stays (not over-recorded)", async () => {
    // 25.005 dollars = 25_005_000 micros → transfers 2500 cents = 25_000_000 micros; 5_000 micros dust remains.
    const { deps, transfers, recorded } = makeDeps({
      getWithdrawableMicros: async () => 25_005_000,
      getGrossEarnedMicros: async () => 25_005_000,
    });
    const r = await requestPayout({ orgId: "o1" }, deps);
    assert.equal(transfers[0]!.amountCents, 2500);
    assert.equal(recorded[0]!.amountMicros, 25_000_000);
    assert.equal((r as { amountUsd: number }).amountUsd, 25);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/crm && node --import tsx --test tests/unit/build/payout.spec.ts`
Expected: FAIL — `Cannot find module '../../../src/lib/build/payout'`.

- [ ] **Step 3: Implement `requestPayout`**

Create `src/lib/build/payout.ts`:

```ts
// payout.ts — the PURE money-OUT orchestration (spec 2026-07-01-builder-payout).
// No DB, no Stripe, no clock: every side effect is an injected dep, so the
// money-safety invariants are unit-tested with fakes (no network, no real key,
// no charge). The route + the dashboard action both call this with the same real
// deps (payout-deps.ts).
//
// MONEY-SAFETY (see the plan's Global Constraints):
//   • flag off / no org → { disabled } (no transfer).
//   • no connected + payouts-enabled account → { connect_required } (no transfer).
//   • withdrawable < MIN_WITHDRAW_USD → { below_min } (no transfer).
//   • else: create the Transfer with idempotencyKey = payout:<orgId>:<grossEarned
//     Micros> (a MONOTONIC high-water mark, so the same earning level can't
//     double-pay but new earnings get a fresh key), THEN record the ledger row.
//     Record only whole cents actually transferred; sub-cent dust stays withdrawable.

import { MICRO_PER_CENT } from "@/lib/build/run-cost";

/** The minimum withdrawal (USD) — avoids dust + transfer inefficiency. */
export const MIN_WITHDRAW_USD = 10;

const MICRO_PER_DOLLAR = 1_000_000;

export type ConnectedAccount = { stripeAccountId: string; payoutsEnabled: boolean };

export type RequestPayoutDeps = {
  /** SF_MARKETPLACE_BILLING is ON (isBillingEnabled(env)). Off → inert. */
  billingEnabled: boolean;
  /** The minimum withdrawal in USD (MIN_WITHDRAW_USD). */
  minWithdrawUsd: number;
  /** The builder's active Connect account (+ payouts_enabled), or null. */
  getConnectedAccount: (orgId: string) => Promise<ConnectedAccount | null>;
  /** Σ earning − Σ payout (micro-dollars) — the amount transferable. */
  getWithdrawableMicros: (orgId: string) => Promise<number>;
  /** Σ earning (micro-dollars) — the cumulative high-water mark for the key. */
  getGrossEarnedMicros: (orgId: string) => Promise<number>;
  /** Create a Stripe Transfer (platform balance → the connected account). */
  createTransfer: (i: {
    orgId: string;
    amountCents: number;
    destinationAccountId: string;
    idempotencyKey: string;
  }) => Promise<{ transferId: string }>;
  /** Record the payout ledger row (idempotent on payout:<transferId>). */
  recordPayout: (i: { orgId: string; amountMicros: number; transferId: string }) => Promise<void>;
  /** Where to send the builder to connect their bank (dashboard). */
  onboardingUrl: (orgId: string) => Promise<string | null>;
};

export type PayoutResult =
  | { status: "paid"; amountUsd: number; transferId: string }
  | { status: "connect_required"; onboardingUrl: string | null }
  | { status: "below_min"; withdrawableUsd: number; minUsd: number }
  | { status: "disabled" };

/** Round to cents for display. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Clamp to a finite, non-negative integer of micros. */
function nonNegMicros(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.floor(v);
}

export async function requestPayout(
  input: { orgId: string },
  deps: RequestPayoutDeps,
): Promise<PayoutResult> {
  const orgId = (input?.orgId ?? "").trim();
  if (!orgId) return { status: "disabled" };
  if (!deps.billingEnabled) return { status: "disabled" };

  const account = await deps.getConnectedAccount(orgId);
  if (!account || !account.payoutsEnabled) {
    return { status: "connect_required", onboardingUrl: await deps.onboardingUrl(orgId) };
  }

  const withdrawableMicros = nonNegMicros(await deps.getWithdrawableMicros(orgId));
  const withdrawableUsd = withdrawableMicros / MICRO_PER_DOLLAR;
  if (withdrawableUsd < deps.minWithdrawUsd) {
    return { status: "below_min", withdrawableUsd: round2(withdrawableUsd), minUsd: deps.minWithdrawUsd };
  }

  // Transfer only whole cents; the sub-cent remainder stays withdrawable (never
  // over-record a payout).
  const amountCents = Math.floor(withdrawableMicros / MICRO_PER_CENT);
  const paidMicros = amountCents * MICRO_PER_CENT;

  // The idempotency high-water mark: cumulative GROSS earned (monotonic). Two
  // withdrawals at different earning levels get different keys (both settle); a
  // retry/double-click at the SAME level gets the same key (Stripe returns the
  // first transfer — no second money movement).
  const grossMicros = nonNegMicros(await deps.getGrossEarnedMicros(orgId));
  const idempotencyKey = `payout:${orgId}:${grossMicros}`;

  const { transferId } = await deps.createTransfer({
    orgId,
    amountCents,
    destinationAccountId: account.stripeAccountId,
    idempotencyKey,
  });

  // Only AFTER the transfer succeeds: record the ledger row (dedupe on transferId).
  await deps.recordPayout({ orgId, amountMicros: paidMicros, transferId });

  return { status: "paid", amountUsd: round2(paidMicros / MICRO_PER_DOLLAR), transferId };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd packages/crm && node --import tsx --test tests/unit/build/payout.spec.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/build/payout.ts tests/unit/build/payout.spec.ts
git commit -m "feat(payout): pure requestPayout — flag/connect/min gates + idempotent transfer→record (TDD)"
```

---

### Task 3: The bearer route + the real Stripe/ledger deps factory

**Files:**
- Create: `src/lib/build/payout-deps.ts`
- Create: `src/app/api/v1/build/payout/route.ts`

**Interfaces:**
- Consumes: `requestPayout` + `RequestPayoutDeps` + `MIN_WITHDRAW_USD` (Task 2); `isBillingEnabled` from `@/lib/marketplace/billing/billing-mode`; `getStripeClient` from `@/lib/proposals/stripe-connect`; `getWithdrawableEarningsMicros` + `getBuilderEarningsMicros` + `recordBuilderPayout` (Task 1); `stripeConnections` from `@/db/schema`; `guardApiRequest` from `@/lib/api/guard`.
- Produces: `buildPayoutDeps(): RequestPayoutDeps`; `POST /api/v1/build/payout` → `PayoutResult` JSON.

> **No unit test in this task** (mirrors the shipped, untested `wallet/topup/route.ts` + `wallet-topup-deps.ts` — thin glue over the pure core). The money logic is fully covered in Task 2; this task is verified by `tsc` + `pnpm build`. The route's flag-off/bad-bearer behavior is exercised in the Task 7 verify gate.

- [ ] **Step 1: Write the deps factory**

Create `src/lib/build/payout-deps.ts`:

```ts
// payout — the REAL (production) deps for requestPayout. Kept out of the pure
// module (and out of the "use server" action) so the unit tests never import a
// Stripe client. Mirrors wallet-topup-deps.ts.
//
// INERT WITHOUT A KEY: getStripeClient() returns null → getConnectedAccount
// returns null → requestPayout answers connect_required and NO transfer is ever
// created. The Connect account is read from the SAME stripe_connections table the
// proposal onboarding writes (reuse, no new onboarding).

import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/db";
import { stripeConnections } from "@/db/schema";
import { getStripeClient } from "@/lib/proposals/stripe-connect";
import { isBillingEnabled } from "@/lib/marketplace/billing/billing-mode";
import {
  getWithdrawableEarningsMicros,
  getBuilderEarningsMicros,
  recordBuilderPayout,
} from "@/lib/build/wallet-store";
import { MIN_WITHDRAW_USD, type RequestPayoutDeps } from "@/lib/build/payout";

/** The narrow Stripe seam this feature needs — accounts.retrieve (payouts_enabled)
 *  + transfers.create. Typed against the SDK so the call sites can't drift. */
type PayoutStripeSeam = {
  accounts: { retrieve(id: string): Promise<Stripe.Account> };
  transfers: {
    create(
      params: Stripe.TransferCreateParams,
      options?: Stripe.RequestOptions,
    ): Promise<Pick<Stripe.Transfer, "id">>;
  };
};

/** Read the org's active Connect account + its payouts_enabled from Stripe. Null
 *  when there's no active row or no Stripe key (→ connect_required, no transfer). */
async function readConnectedAccount(
  orgId: string,
  stripe: PayoutStripeSeam | null,
): Promise<{ stripeAccountId: string; payoutsEnabled: boolean } | null> {
  if (!stripe) return null;
  const [row] = await db
    .select({ stripeAccountId: stripeConnections.stripeAccountId })
    .from(stripeConnections)
    .where(and(eq(stripeConnections.orgId, orgId), eq(stripeConnections.isActive, true)))
    .limit(1);
  if (!row?.stripeAccountId) return null;
  try {
    const account = await stripe.accounts.retrieve(row.stripeAccountId);
    return { stripeAccountId: row.stripeAccountId, payoutsEnabled: account.payouts_enabled === true };
  } catch {
    // Account deleted/unreadable → treat as not connected (no transfer).
    return null;
  }
}

/** Build the production deps. Inert without a Stripe key (seam → null). */
export function buildPayoutDeps(): RequestPayoutDeps {
  const stripe = getStripeClient() as unknown as PayoutStripeSeam | null;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.seldonframe.com";
  return {
    billingEnabled: isBillingEnabled(process.env as Record<string, string | undefined>),
    minWithdrawUsd: MIN_WITHDRAW_USD,
    getConnectedAccount: (orgId) => readConnectedAccount(orgId, stripe),
    getWithdrawableMicros: (orgId) => getWithdrawableEarningsMicros(orgId),
    getGrossEarnedMicros: (orgId) => getBuilderEarningsMicros(orgId),
    createTransfer: async (i) => {
      if (!stripe) throw new Error("stripe_unconfigured"); // unreachable: connect_required gates first
      const transfer = await stripe.transfers.create(
        { amount: i.amountCents, currency: "usd", destination: i.destinationAccountId },
        { idempotencyKey: i.idempotencyKey },
      );
      return { transferId: transfer.id };
    },
    recordPayout: async (i) => {
      await recordBuilderPayout(i);
    },
    onboardingUrl: async () => `${baseUrl}/build/wallet`,
  };
}
```

- [ ] **Step 2: Write the route**

Create `src/app/api/v1/build/payout/route.ts`:

```ts
// POST /api/v1/build/payout — withdraw the caller's accrued marketplace earnings
// to their connected bank (a Stripe Connect Transfer). Bearer-authed (wst_) so the
// CLI + agents can call it. Thin wrapper over the PURE requestPayout with the real
// deps (payout-deps.ts) — money-safe by construction: flag-gated, inert without a
// Stripe key, idempotent, min-withdraw enforced. THE ONLY money-OUT endpoint.

import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/guard";
import { requestPayout } from "@/lib/build/payout";
import { buildPayoutDeps } from "@/lib/build/payout-deps";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;
  const orgId = guard.orgId;
  if (!orgId) {
    return NextResponse.json({ status: "disabled" }, { status: 401 });
  }

  const result = await requestPayout({ orgId }, buildPayoutDeps());
  return NextResponse.json(result);
}
```

- [ ] **Step 3: Typecheck + build the route**

Run: `cd packages/crm && npx tsc --noEmit`
Expected: PASS (0 errors).

- [ ] **Step 4: Commit**

```bash
git add src/lib/build/payout-deps.ts src/app/api/v1/build/payout/route.ts
git commit -m "feat(payout): bearer-authed POST /api/v1/build/payout + real Stripe Transfer deps (inert without key)"
```

---

### Task 4: Builder-block `payout_status` (PURE, TDD) + workspace-state wiring

**Files:**
- Modify: `src/lib/build/builder-ladder.ts:185-231` (the `LifecycleView` type + `buildLifecycleView`)
- Modify: `tests/unit/build/builder-ladder.spec.ts` (extend the `buildLifecycleView` describe block)
- Modify: `src/app/api/v1/workspace-state/route.ts` (gather the payout signal, flag-gated; pass to `buildLifecycleView`)

**Interfaces:**
- Consumes: `isBillingEnabled` + `getWithdrawableEarningsMicros` + `stripeConnections` in the route.
- Produces:
  - `type PayoutStatus = "coming_soon" | "connect_stripe" | "below_min" | { available_usd: number }`
  - `buildLifecycleView` accepts an optional `payout?: { connected: boolean; withdrawableUsd: number; minUsd: number }`; `LifecycleView.earnings.payout_status: PayoutStatus`.

- [ ] **Step 1: Write the failing tests**

In `tests/unit/build/builder-ladder.spec.ts`, add these tests inside the existing `describe("buildLifecycleView", …)` block (after the last test, before its closing `});`):

```ts
  test("no payout signal → payout_status stays 'coming_soon' (flag-off / not wired)", () => {
    const v = buildLifecycleView({ agents: [AGENT], earningsAccruedUsd: 12.5, walletBalanceUsd: 5 });
    assert.equal(v.earnings.payout_status, "coming_soon");
  });

  test("payout signal, not connected → 'connect_stripe'", () => {
    const v = buildLifecycleView({
      agents: [AGENT], earningsAccruedUsd: 12.5, walletBalanceUsd: 5,
      payout: { connected: false, withdrawableUsd: 12.5, minUsd: 10 },
    });
    assert.equal(v.earnings.payout_status, "connect_stripe");
  });

  test("connected + withdrawable ≥ min → { available_usd }", () => {
    const v = buildLifecycleView({
      agents: [AGENT], earningsAccruedUsd: 12.5, walletBalanceUsd: 5,
      payout: { connected: true, withdrawableUsd: 12.5, minUsd: 10 },
    });
    assert.deepEqual(v.earnings.payout_status, { available_usd: 12.5 });
  });

  test("connected + withdrawable < min → 'below_min'", () => {
    const v = buildLifecycleView({
      agents: [AGENT], earningsAccruedUsd: 4, walletBalanceUsd: 5,
      payout: { connected: true, withdrawableUsd: 4, minUsd: 10 },
    });
    assert.equal(v.earnings.payout_status, "below_min");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/crm && node --import tsx --test tests/unit/build/builder-ladder.spec.ts`
Expected: FAIL — `payout` not accepted / `payout_status` is the literal `"coming_soon"`.

- [ ] **Step 3: Widen the type + compute the status**

In `src/lib/build/builder-ladder.ts`, replace the `LifecycleView` type (lines 185-189) with:

```ts
/** The payout status the builder-block surfaces. `coming_soon` = not wired / flag
 *  off; `connect_stripe` = no active Connect account; `below_min` = under the
 *  threshold; `{ available_usd }` = ready to withdraw. */
export type PayoutStatus =
  | "coming_soon"
  | "connect_stripe"
  | "below_min"
  | { available_usd: number };

export type LifecycleView = {
  earnings: { accrued_usd: number; payout_status: PayoutStatus };
  agents: AgentLifecycle[];
  fund_hint: string | null;
};
```

Add this helper just above `buildLifecycleView` (after the `agentStage` function, ~line 199):

```ts
/** The builder-block payout status. No signal (flag off / not wired) → coming_soon
 *  (honest "withdrawals coming soon"). Otherwise: not connected → connect_stripe;
 *  withdrawable ≥ min → available; else below_min. The AUTHORITATIVE payouts_enabled
 *  + transfer check happens at requestPayout time — this is the cheap display hint
 *  (no Stripe call on the hot get_workspace_state path). */
function payoutStatus(
  p: { connected: boolean; withdrawableUsd: number; minUsd: number } | undefined,
): PayoutStatus {
  if (!p) return "coming_soon";
  if (!p.connected) return "connect_stripe";
  if (p.withdrawableUsd >= p.minUsd) return { available_usd: Math.round(p.withdrawableUsd * 100) / 100 };
  return "below_min";
}
```

Change the `buildLifecycleView` signature to accept the optional `payout` field, and use `payoutStatus(...)` for `payout_status`. Replace the input type + the `earnings` object:

```ts
export function buildLifecycleView(input: {
  agents?: AgentLifecycleInput[];
  earningsAccruedUsd?: number;
  walletBalanceUsd?: number;
  payout?: { connected: boolean; withdrawableUsd: number; minUsd: number };
}): LifecycleView {
  const agentsIn = Array.isArray(input?.agents) ? input.agents : [];
  const balance = Number(input?.walletBalanceUsd);
  const lowBalance = Number.isFinite(balance) && balance < LOW_BALANCE_USD;
  const earningsUsd = Number(input?.earningsAccruedUsd);
  return {
    earnings: {
      accrued_usd: Number.isFinite(earningsUsd) ? earningsUsd : 0,
      payout_status: payoutStatus(input?.payout),
    },
    agents: agentsIn.map((a) => ({
```

(leave the rest of the function body — the `agents.map` and `fund_hint` — unchanged.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd packages/crm && node --import tsx --test tests/unit/build/builder-ladder.spec.ts`
Expected: PASS (existing + 4 new tests).

- [ ] **Step 5: Wire the signal in the workspace-state route**

In `src/app/api/v1/workspace-state/route.ts`:

First, ensure the imports include the readers + flag + table (add any missing):

```ts
import { isBillingEnabled } from "@/lib/marketplace/billing/billing-mode";
import { getWithdrawableEarningsMicros } from "@/lib/build/wallet-store";
import { stripeConnections } from "@/db/schema";
import { MIN_WITHDRAW_USD } from "@/lib/build/payout";
```

Then, immediately BEFORE the `const lifecycle = buildLifecycleView({` call (line ~257), gather the payout signal — flag-gated so the hot path stays free when billing is OFF (`db`, `and`, `eq` are already imported in this route):

```ts
  // Payout signal (additive) — only when marketplace billing is ON. Two cheap DB
  // reads (NO Stripe call on this hot path); the authoritative payouts_enabled +
  // transfer check happens at requestPayout time. Off → undefined → "coming_soon".
  let payoutSignal:
    | { connected: boolean; withdrawableUsd: number; minUsd: number }
    | undefined;
  if (isBillingEnabled(process.env as Record<string, string | undefined>)) {
    const [conn] = await db
      .select({ id: stripeConnections.id })
      .from(stripeConnections)
      .where(and(eq(stripeConnections.orgId, org.id), eq(stripeConnections.isActive, true)))
      .limit(1);
    const withdrawableMicros = await getWithdrawableEarningsMicros(org.id);
    payoutSignal = {
      connected: Boolean(conn),
      withdrawableUsd: Math.round((withdrawableMicros / 1_000_000) * 100) / 100,
      minUsd: MIN_WITHDRAW_USD,
    };
  }
```

Then add `payout: payoutSignal,` to the `buildLifecycleView({ … })` call (alongside `earningsAccruedUsd` / `walletBalanceUsd`):

```ts
    earningsAccruedUsd: Math.round((earningsMicros / 1_000_000) * 100) / 100,
    walletBalanceUsd: Math.round((walletMicros / 1_000_000) * 100) / 100,
    payout: payoutSignal,
  });
```

> Use the org-id variable already in scope at this call site. The snippet uses `org.id`; if the route names it differently (e.g. `orgId`), match the surrounding code.

- [ ] **Step 6: Typecheck**

Run: `cd packages/crm && npx tsc --noEmit`
Expected: PASS (0 errors).

- [ ] **Step 7: Commit**

```bash
git add src/lib/build/builder-ladder.ts tests/unit/build/builder-ladder.spec.ts src/app/api/v1/workspace-state/route.ts
git commit -m "feat(payout): builder-block payout_status (connect/available/below_min) + flag-gated workspace-state signal"
```

---

### Task 5: CLI `seldonframe payout`

**Files:**
- Modify: `packages/cli/src/lib/api-client.ts` (add `PayoutResult` + `payout()`; widen `WorkspaceState.builder.earnings.payout_status`)
- Create: `packages/cli/src/commands/payout.ts`
- Modify: `packages/cli/src/commands/status.ts:24` (render an object `payout_status`)
- Modify: `packages/cli/src/cli.ts` (route `case "payout"`)
- Modify: `packages/cli/src/lib/help.ts` (document `payout`)
- Test: `packages/cli/tests/payout.test.ts`

**Interfaces:**
- Consumes: `ApiClient` (Task 2's server `PayoutResult` shape); `Writer`, `ParsedArgs`.
- Produces: `ApiClient.payout(): Promise<PayoutResult>`; `runPayoutCommand(args, client, writer): Promise<number>`.

- [ ] **Step 1: Add the client type + method**

In `packages/cli/src/lib/api-client.ts`, add the `PayoutResult` type (near `WalletBalance`, ~line 68):

```ts
export type PayoutResult =
  | { status: "paid"; amountUsd: number; transferId: string }
  | { status: "connect_required"; onboardingUrl: string | null }
  | { status: "below_min"; withdrawableUsd: number; minUsd: number }
  | { status: "disabled" };
```

Widen the `WorkspaceState.builder.earnings` payout_status (line 76) to accept the object variant:

```ts
    earnings?: { accrued_usd: number; payout_status: string | { available_usd: number } };
```

Add the method after `walletTopup` (~line 191):

```ts
  async payout(): Promise<PayoutResult> {
    return this.request<PayoutResult>("POST", "/api/v1/build/payout");
  }
```

- [ ] **Step 2: Write the failing command test**

Create `packages/cli/tests/payout.test.ts`:

```ts
// runPayoutCommand — renders each PayoutResult status honestly (no money math in
// the CLI; it relays the server's verdict). Uses a real ApiClient with a fake
// fetch so the request wiring is exercised too.

import { test } from "node:test";
import assert from "node:assert/strict";

import { ApiClient } from "../src/lib/api-client.js";
import { runPayoutCommand } from "../src/commands/payout.js";
import type { ParsedArgs } from "../src/lib/args.js";

function fakeClient(payload: unknown) {
  return new ApiClient({
    baseUrl: "https://app.seldonframe.com",
    apiKey: "wst_test",
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    }),
  });
}

function capture() {
  const lines: string[] = [];
  const errs: string[] = [];
  return { writer: { out: (s: string) => lines.push(s), err: (s: string) => errs.push(s) }, lines, errs };
}

const ARGS = { command: "payout", subcommand: undefined, positionals: [], flags: {}, json: false } as unknown as ParsedArgs;

test("paid → success line with amount", async () => {
  const c = capture();
  const code = await runPayoutCommand(ARGS, fakeClient({ status: "paid", amountUsd: 25, transferId: "tr_1" }), c.writer);
  assert.equal(code, 0);
  assert.match(c.lines.join("\n"), /\$25/);
  assert.match(c.lines.join("\n"), /bank/i);
});

test("connect_required → prints the onboarding link", async () => {
  const c = capture();
  const code = await runPayoutCommand(
    ARGS,
    fakeClient({ status: "connect_required", onboardingUrl: "https://app.seldonframe.com/build/wallet" }),
    c.writer,
  );
  assert.equal(code, 0);
  assert.match(c.lines.join("\n"), /build\/wallet/);
});

test("below_min → explains the minimum", async () => {
  const c = capture();
  const code = await runPayoutCommand(ARGS, fakeClient({ status: "below_min", withdrawableUsd: 4, minUsd: 10 }), c.writer);
  assert.equal(code, 0);
  assert.match(c.lines.join("\n"), /\$10/);
});

test("disabled → honest not-enabled line, exit 1", async () => {
  const c = capture();
  const code = await runPayoutCommand(ARGS, fakeClient({ status: "disabled" }), c.writer);
  assert.equal(code, 1);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd packages/cli && node --import tsx --test tests/payout.test.ts`
Expected: FAIL — `Cannot find module '../src/commands/payout.js'`.

- [ ] **Step 4: Implement the command**

Create `packages/cli/src/commands/payout.ts`:

```ts
// payout — withdraw accrued marketplace earnings to the builder's bank. Calls the
// money-safe POST /api/v1/build/payout and renders the server's verdict honestly.
// The CLI does NO money math and opens no charge path — it relays the PayoutResult.

import type { ParsedArgs } from "../lib/args.js";
import type { Writer } from "../lib/output.js";
import type { ApiClient } from "../lib/api-client.js";
import { errorToMessage } from "../lib/io.js";

export async function runPayoutCommand(
  args: ParsedArgs,
  client: ApiClient,
  writer: Writer,
): Promise<number> {
  if (!client.hasKey()) {
    writer.err("No key yet. Run `seldonframe login`.");
    return 1;
  }

  let result;
  try {
    result = await client.payout();
  } catch (err) {
    writer.err(errorToMessage(err));
    return 1;
  }

  if (args.json) {
    writer.out(JSON.stringify(result, null, 2));
    return result.status === "paid" ? 0 : result.status === "disabled" ? 1 : 0;
  }

  switch (result.status) {
    case "paid":
      writer.out(`✓ Paid $${result.amountUsd.toFixed(2)} to your bank (arrives in ~2 business days).`);
      return 0;
    case "connect_required":
      writer.out("Connect your bank to withdraw your earnings:");
      writer.out(`  ${result.onboardingUrl ?? "https://app.seldonframe.com/build/wallet"}`);
      return 0;
    case "below_min":
      writer.out(
        `You have $${result.withdrawableUsd.toFixed(2)} — the minimum withdrawal is $${result.minUsd.toFixed(2)}. Earn a bit more, then withdraw.`,
      );
      return 0;
    case "disabled":
      writer.err("Withdrawals aren't enabled on this workspace yet.");
      return 1;
  }
}
```

- [ ] **Step 5: Render the object payout_status in `status`**

In `packages/cli/src/commands/status.ts`, replace line 24 (the `earnings:` line) with a version that renders the `{ available_usd }` object:

```ts
  const ps = b.earnings?.payout_status;
  const payoutLabel =
    typeof ps === "object" && ps !== null
      ? `$${ps.available_usd.toFixed(2)} ready to withdraw — run \`seldonframe payout\``
      : ps === "connect_stripe"
        ? "connect your bank to withdraw"
        : ps === "below_min"
          ? "below the $10 withdrawal minimum"
          : ps === "coming_soon" || !ps
            ? "withdrawals coming soon"
            : String(ps);
  writer.out(`  earnings: $${(b.earnings?.accrued_usd ?? 0).toFixed(2)} (${payoutLabel})`);
```

- [ ] **Step 6: Route the command + document it**

In `packages/cli/src/cli.ts`, add the import (with the other command imports, ~line 23):

```ts
import { runPayoutCommand } from "./commands/payout.js";
```

Add a case in the `switch (args.command)` (after `case "status":`):

```ts
    case "payout":
      return runPayoutCommand(args, buildClient(), writer);
```

In `packages/cli/src/lib/help.ts`, add a line to the `COMMANDS` block (right after the `status` line):

```
  payout                               Withdraw your earnings to your bank (Stripe)
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd packages/cli && node --import tsx --test tests/payout.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 8: Commit**

```bash
git add packages/cli/src/lib/api-client.ts packages/cli/src/commands/payout.ts packages/cli/src/commands/status.ts packages/cli/src/cli.ts packages/cli/src/lib/help.ts packages/cli/tests/payout.test.ts
git commit -m "feat(cli): seldonframe payout — withdraw earnings to bank; render available payout_status"
```

---

### Task 6: Dashboard Withdraw on `/build/wallet`

**Files:**
- Create: `src/lib/build/payout-action.ts` ("use server")
- Create: `src/components/build/wallet-withdraw-client.tsx`
- Modify: `src/app/build/wallet/page.tsx` (compute withdrawable + connected, mount the island, add `payout` to `KIND_LABEL`)

**Interfaces:**
- Consumes: `requestPayout` + `PayoutResult` (Task 2); `buildPayoutDeps` (Task 3); `getOrgId` from `@/lib/auth/helpers`; `getWithdrawableEarningsMicros` + `stripeConnections`; the existing `WalletTopupClient` as the client-island pattern to mirror.
- Produces: `requestPayoutAction(): Promise<PayoutResult>`; `WalletWithdrawClient` component.

> Verified by `pnpm check:use-server` + `pnpm build` (this is UI + a server action; mirrors the shipped `wallet-topup-action.ts` + `wallet-topup-client.tsx`). No unit test.

- [ ] **Step 1: Write the server action**

Create `src/lib/build/payout-action.ts` (mirrors `wallet-topup-action.ts` — cookie/session-authed sibling of the bearer route):

```ts
"use server";

// The dashboard (cookie-authed) entry to a payout — the session sibling of the
// bearer route. getOrgId() from the session, then the SAME pure requestPayout +
// real deps. Money-safe by construction (flag-gated, inert without a key,
// idempotent). Returns the PayoutResult for the Withdraw island to render.

import { getOrgId } from "@/lib/auth/helpers";
import { requestPayout, type PayoutResult } from "@/lib/build/payout";
import { buildPayoutDeps } from "@/lib/build/payout-deps";

export async function requestPayoutAction(): Promise<PayoutResult> {
  const orgId = await getOrgId();
  if (!orgId) return { status: "disabled" };
  return requestPayout({ orgId }, buildPayoutDeps());
}
```

- [ ] **Step 2: Write the Withdraw island**

Create `src/components/build/wallet-withdraw-client.tsx`:

```tsx
"use client";

// The Withdraw island on /build/wallet. Shows the withdrawable balance + a
// Withdraw button that calls the money-safe requestPayoutAction and renders the
// verdict. When not connected, links to Stripe Connect onboarding (reuses the
// proposal connect/start route — no new onboarding). No money math here; the
// server action is authoritative.

import { useState, useTransition } from "react";
import { requestPayoutAction } from "@/lib/build/payout-action";
import type { PayoutResult } from "@/lib/build/payout";

export function WalletWithdrawClient({
  withdrawableUsd,
  connected,
  minUsd,
}: {
  withdrawableUsd: number;
  connected: boolean;
  minUsd: number;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<PayoutResult | null>(null);
  const [connecting, setConnecting] = useState(false);

  function withdraw() {
    startTransition(async () => {
      setResult(await requestPayoutAction());
    });
  }

  async function connectBank() {
    setConnecting(true);
    try {
      const res = await fetch("/api/v1/proposals/connect/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string };
      if (data.url) window.location.href = data.url;
    } finally {
      setConnecting(false);
    }
  }

  const belowMin = withdrawableUsd < minUsd;
  const showConnect = !connected || result?.status === "connect_required";

  return (
    <div className="space-y-2 border-t border-border pt-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Withdrawable earnings</p>
          <p className="text-xl font-semibold tracking-tight text-foreground">
            ${withdrawableUsd.toFixed(2)}
          </p>
        </div>
        {showConnect ? (
          <button
            type="button"
            onClick={connectBank}
            disabled={connecting}
            className="crm-button-secondary h-9 px-4 text-sm disabled:opacity-60"
          >
            {connecting ? "Opening…" : "Connect your bank"}
          </button>
        ) : (
          <button
            type="button"
            onClick={withdraw}
            disabled={pending || belowMin}
            className="crm-button-primary h-9 px-4 text-sm disabled:opacity-60"
            title={belowMin ? `Minimum withdrawal is $${minUsd.toFixed(2)}` : undefined}
          >
            {pending ? "Withdrawing…" : "Withdraw"}
          </button>
        )}
      </div>

      {belowMin && !showConnect ? (
        <p className="text-xs text-muted-foreground">
          Minimum withdrawal is ${minUsd.toFixed(2)}. Earn a bit more, then withdraw.
        </p>
      ) : null}

      {result?.status === "paid" ? (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">
          ✓ Paid ${result.amountUsd.toFixed(2)} to your bank — arrives in ~2 business days.
        </p>
      ) : null}
      {result?.status === "below_min" ? (
        <p className="text-xs text-muted-foreground">
          You have ${result.withdrawableUsd.toFixed(2)} — the minimum is ${result.minUsd.toFixed(2)}.
        </p>
      ) : null}
      {result?.status === "disabled" ? (
        <p className="text-xs text-muted-foreground">Withdrawals aren&apos;t enabled on this workspace yet.</p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Wire the page**

In `src/app/build/wallet/page.tsx`:

Add `payout` to `KIND_LABEL` (line 34-38):

```ts
const KIND_LABEL: Record<string, string> = {
  topup: "Top-up",
  debit: "Run",
  earning: "Earning",
  payout: "Payout",
};
```

Add the imports (with the other imports at the top):

```ts
import { and, desc, eq } from "drizzle-orm";
import { stripeConnections } from "@/db/schema";
import { getWithdrawableEarningsMicros } from "@/lib/build/wallet-store";
import { isBillingEnabled } from "@/lib/marketplace/billing/billing-mode";
import { MIN_WITHDRAW_USD } from "@/lib/build/payout";
import { WalletWithdrawClient } from "@/components/build/wallet-withdraw-client";
```

(The file already imports `desc, eq` from `drizzle-orm`; extend that import to include `and` rather than duplicating it.)

After the `balanceMicros` read (line 85), gather the withdraw signal — only when billing is ON:

```ts
  const billingOn = isBillingEnabled(process.env as Record<string, string | undefined>);
  let withdraw: { withdrawableUsd: number; connected: boolean; minUsd: number } | null = null;
  if (billingOn) {
    const [conn] = await db
      .select({ id: stripeConnections.id })
      .from(stripeConnections)
      .where(and(eq(stripeConnections.orgId, orgId), eq(stripeConnections.isActive, true)))
      .limit(1);
    const withdrawableMicros = await getWithdrawableEarningsMicros(orgId);
    withdraw = {
      withdrawableUsd: Math.round((withdrawableMicros / 1_000_000) * 100) / 100,
      connected: Boolean(conn),
      minUsd: MIN_WITHDRAW_USD,
    };
  }
```

Mount the island inside the balance card, right after `<WalletTopupClient />` (line 110):

```tsx
        <WalletTopupClient />
        {withdraw ? (
          <WalletWithdrawClient
            withdrawableUsd={withdraw.withdrawableUsd}
            connected={withdraw.connected}
            minUsd={withdraw.minUsd}
          />
        ) : null}
```

- [ ] **Step 4: Verify use-server + build**

Run: `cd packages/crm && pnpm check:use-server && npx tsc --noEmit`
Expected: PASS (the action exports only an async function; 0 type errors).

- [ ] **Step 5: Commit**

```bash
git add src/lib/build/payout-action.ts src/components/build/wallet-withdraw-client.tsx src/app/build/wallet/page.tsx
git commit -m "feat(payout): /build/wallet Withdraw island + connect-bank CTA (session action over requestPayout)"
```

---

### Task 7: Full verify gate

**Files:** none (verification only).

- [ ] **Step 1: crm unit tests (new + changed specs)**

Run: `cd packages/crm && node --import tsx --test tests/unit/build/payout.spec.ts tests/unit/build/builder-ladder.spec.ts`
Expected: PASS (all).

- [ ] **Step 2: crm typecheck**

Run: `cd packages/crm && npx tsc --noEmit`
Expected: PASS (0 errors).

- [ ] **Step 3: crm use-server guard**

Run: `cd packages/crm && pnpm check:use-server`
Expected: PASS.

- [ ] **Step 4: crm build**

Run: `cd packages/crm && pnpm build`
Expected: PASS (route `/api/v1/build/payout` compiled; no type/lint failures).

- [ ] **Step 5: CLI tests + build**

Run: `cd packages/cli && npm test && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit (if the build produced tracked artifacts)**

```bash
git add -A
git commit -m "chore(payout): verify gate — crm tests+tsc+use-server+build, cli test+build green" || echo "nothing to commit"
```

---

## Self-Review

**1. Spec coverage:**
- Ledger `payout` kind + net reader → Task 1. ✓
- Pure `requestPayout` + idempotency-on-gross-earned + threshold + safe order → Task 2. ✓
- Reuse Express Connect (`stripe-connect.ts` + `stripeConnections`) + real Transfer deps → Task 3. ✓
- Bearer route `/api/v1/build/payout` → Task 3. ✓
- Builder-block `payout_status` (`coming_soon`/`connect_stripe`/`available`/`below_min`) → Task 4. ✓
- `seldonframe payout` CLI → Task 5. ✓
- `/studio/earnings` "Withdraw" → **relocated to `/build/wallet`** (Task 6): the withdrawable is the wallet-ledger earnings surfaced on `/build/wallet`; `/studio/earnings` shows a DIFFERENT number (marketplace-listing MRR via `computeListingEarnings`). Putting Withdraw next to the matching number is the honest choice. Noted here as a deliberate spec deviation.
- Money-safety (flag/test-mode/inert/idempotent/min/keys-by-Max) → Global Constraints + enforced in Tasks 2/3. ✓
- No migration (`kind` text) → Task 1. ✓

**2. Placeholder scan:** No TBD/TODO; every code step carries complete code. ✓

**3. Type consistency:** `PayoutResult` (Task 2) is reused verbatim by the route (Task 3), the action (Task 6), and mirrored in the CLI (Task 5). `RequestPayoutDeps` (Task 2) is built by `buildPayoutDeps` (Task 3). `getWithdrawableEarningsMicros`/`recordBuilderPayout` (Task 1) are consumed by Tasks 3/4/6. `PayoutStatus` (Task 4) is the `LifecycleView.earnings.payout_status` type; the CLI widens its mirror to `string | { available_usd: number }`. `MIN_WITHDRAW_USD` (Task 2) is the single source of the $10 threshold (Tasks 3/4/6). Consistent. ✓

**One open cross-task note for the executor:** in Task 4 Step 5, confirm the workspace-state route's in-scope org-id variable name (`org.id` vs `orgId`) and the presence of `and`/`eq`/`db` imports; match the surrounding code.
