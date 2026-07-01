# Builder Payout — manual withdraw to bank via Stripe Connect (Design)

**Date:** 2026-07-01
**Status:** Approved (brainstorm). Next: implementation plan.
**Related:** the earnings ledger (`src/db/schema/wallet.ts` `wallet_transactions`, `WalletTransactionKind`; `getBuilderEarningsMicros` / `accrueBuilderEarning` in `wallet-store.ts`); Stripe Connect Express onboarding (`src/lib/proposals/stripe-connect.ts`) + the `stripeConnections` table (`src/db/schema/payments.ts` — `orgId`, `stripeAccountId`, `isActive`); the IDE-native lifecycle (the `builder` block's `payout_status: "coming_soon"`, the `seldonframe` CLI). This is the roadmap fast-follow after the lifecycle surface+funding.

## The one line
Turn **"$X earned · withdrawals coming soon"** into **"$X in your bank."** A builder connects their Stripe once, then withdraws their accrued 95% on demand — a Stripe **Transfer** from SF's platform balance to their connected account, recorded as a `payout` ledger row so the netting and idempotency are airtight.

## MONEY-SAFETY (this is the only money-OUT path — non-negotiable)
- **Flag-gated** (`SF_MARKETPLACE_BILLING`) + **test-mode default** + **inert without a Stripe key** (no real transfer reachable in dev/test/eval).
- **Idempotent on BOTH sides:** the Stripe Transfer carries an **idempotency key**; the `payout` ledger row carries the wallet ledger's **UNIQUE dedupe key** (`payout:<transferId>`). A mid-failure retry can NEVER double-pay.
- **Only ever transfer net-positive ≥ threshold**, and only to a connected account with `payouts_enabled`.
- **Safe order:** create the Transfer (idempotent) → THEN record the ledger row (idempotent). If the process dies between, a retry re-uses the same idempotency key (Stripe returns the same transfer, no second money movement) and the ledger dedupe prevents a double record.
- **Max enters all Stripe keys himself.** No key values ever handled by the assistant.

## Locked decisions
1. **Manual withdraw, v1** (builder-triggered). Auto-sweep is a v2 that calls the same `requestPayout` on a cron. NOT in this spec.
2. **Stripe Transfer** (platform balance → connected Express account); Stripe then auto-pays the account to its bank on its normal schedule. (Not a manual Payout.)
3. **$10 minimum** withdrawal (avoid dust + transfer inefficiency).
4. **Reuse the existing Express Connect onboarding** (`stripe-connect.ts` + `stripeConnections`). No new onboarding flow.
5. **Additive, no migration:** `kind` is a text column — add `"payout"` to the union; net it out in the earnings read. No schema change.

## The money flow
SF holds the funds (renter top-ups sit in SF's Stripe balance). Earnings accrue as `kind:"earning"` ledger rows (the seller's 95%). A payout:
1. Reads **net withdrawable = Σ earning − Σ payout** for the seller org.
2. Verifies a connected account with `payouts_enabled`.
3. If net ≥ $10 → creates a **Stripe Transfer** (amount = net, destination = `stripeAccountId`, idempotency key).
4. Records a **`kind:"payout"`** ledger row (amount = withdrawable, dedupe key `payout:<transferId>`) → so the next `getWithdrawableEarningsMicros` returns the reduced net (gross "earned" is unchanged — you earned it; you've now withdrawn some).

## The design

### 1. Ledger: the `payout` kind + a net-withdrawable reader
- Add `"payout"` to `WalletTransactionKind` (`wallet.ts`). No migration (text column).
- **Keep `getBuilderEarningsMicros` as GROSS** (Σ earning). It feeds the lifecycle surface's "$X earned" (a cumulative figure that must not shrink after a withdrawal) and — crucially — the payout **idempotency high-water mark** (§3). Add a sibling **`getWithdrawableEarningsMicros(orgId) = Σ earning − Σ payout`** — the amount actually transferable, and what the threshold checks. Two readers, two honest meanings: *earned* (lifetime) vs *withdrawable* (net of what's been paid out).
- Add `recordBuilderPayout({ orgId, amountMicros, transferId })` to `wallet-store.ts` — inserts the `payout` row with dedupe key `payout:<transferId>` (idempotent; a duplicate is a no-op, mirroring the existing `earning:<runId>` pattern).

### 2. Connect status (reuse)
- `getBuilderConnectedAccount(orgId)` → reads the active `stripeConnections` row; retrieves the Stripe account to check `payouts_enabled`. Returns `{ stripeAccountId, payoutsEnabled } | null`.
- Onboarding link: reuse the `stripe-connect.ts` account-link creation (the proposal flow) to return an onboarding URL when the builder has no connected/enabled account.

### 3. `requestPayout` (pure orchestration, injected deps → no real Stripe in tests)
```ts
type RequestPayoutDeps = {
  billingEnabled: boolean;
  minWithdrawUsd: number; // 10
  getConnectedAccount: (orgId: string) => Promise<{ stripeAccountId: string; payoutsEnabled: boolean } | null>;
  getWithdrawableMicros: (orgId: string) => Promise<number>; // Σ earning − Σ payout — the amount to transfer
  getGrossEarnedMicros: (orgId: string) => Promise<number>;  // Σ earning — the idempotency high-water mark
  createTransfer: (i: { orgId: string; amountCents: number; destinationAccountId: string; idempotencyKey: string }) => Promise<{ transferId: string }>;
  recordPayout: (i: { orgId: string; amountMicros: number; transferId: string }) => Promise<void>;
  onboardingUrl: (orgId: string) => Promise<string | null>;
};
type PayoutResult =
  | { status: "paid"; amountUsd: number; transferId: string }
  | { status: "connect_required"; onboardingUrl: string | null }
  | { status: "below_min"; withdrawableUsd: number; minUsd: number }
  | { status: "disabled" };
```
Flow: `!billingEnabled` → `disabled`; no account or `!payoutsEnabled` → `connect_required`; withdrawable < min → `below_min`; else `createTransfer` → `recordPayout` → `paid`. Pure; deterministic given deps.

**The idempotency key is the money-safety crux.** It is **`payout:<orgId>:<grossEarnedMicros>`** — the builder's *cumulative* earned at request time, which only ever increases. Two withdrawals at different earning levels get different keys (both go through); a retry or double-click at the *same* earning level gets the *same* key (Stripe returns the first transfer — no second money movement). Keying on the *amount* would be a bug: a $10 withdrawal now and another $10 after new earnings would collide and the second would be silently dropped. The `payout` ledger row then dedupes on `payout:<transferId>` — so even if `recordPayout` is retried after a mid-flight crash, one Stripe transfer maps to exactly one ledger row.

### 4. Route + surfaces
- **`POST /api/v1/build/payout`** — `guardApiRequest` (wst_ bearer) → `requestPayout` with the real deps → the `PayoutResult` as JSON. Money-safe (deps enforce flag/key/idempotency).
- **`builder` block `payout_status`** (in `get_workspace_state`) — compute from connected-account + net: `"coming_soon"` stays until this ships, then → `"connect_stripe"` / `{ status: "available", usd }` / `"below_min"`.
- **`seldonframe payout`** CLI — GET the status; if `connect_required` print the onboarding link; if available, confirm + POST → `"✓ paid $X to your bank (arrives in ~2 days)"`.
- **`/studio/earnings` "Withdraw" button** — a server action calling the same `requestPayout`.

## Testing
- **`requestPayout` (pure):** disabled (flag off) → `disabled`, no transfer; no account → `connect_required` + link; account not payouts-enabled → `connect_required`; withdrawable < min → `below_min`, no transfer; withdrawable ≥ min → `createTransfer` called once with the right amount, then `recordPayout`, returns `paid`; a `createTransfer` that throws → surfaces an error, `recordPayout` NOT called (no phantom ledger row).
- **idempotency-key stability (the money-safety property):** two requests at the *same* gross-earned level produce the SAME `createTransfer` idempotencyKey (same level can't double-pay); a request after *additional* earnings produces a DIFFERENT key (new earnings are withdrawable).
- **`recordBuilderPayout` idempotency:** two calls with the same `transferId` → one row, balance reduced once (mirror the existing earning-dedupe test).
- **net earnings:** `earning` rows minus `payout` rows = withdrawable (a store test).
- **route:** flag-off → `disabled`; bad `wst_` bearer → 401.
- **CLI:** `payout` renders each status; `connect_required` prints the link; `available` → POST + success line (fake fetch).

## Error handling
- Transfer fails (Stripe error, insufficient platform balance) → return an error status; do NOT record the ledger row; the builder retries (same idempotency key → safe).
- Account exists but `payouts_enabled=false` (KYC incomplete) → `connect_required` with the onboarding link to finish.
- Concurrent double-click → the Stripe idempotency key + ledger dedupe collapse it to one payout.

## Out of scope (explicit)
- **Auto-sweep / scheduled payouts** — v2 (a cron over `requestPayout`).
- **The deploy verb** and **trust/reputation** — separate roadmap specs.
- Per-agent earnings breakdown on withdrawal (the payout is a single net transfer of the org's earnings).
- Multi-currency / tax forms beyond what Stripe Connect Express handles natively.

## Open items (resolve in the plan)
- Confirm `stripe-connect.ts`'s exact exports (account creation + account-link) to reuse for `getConnectedAccount` + `onboardingUrl`.
- The exact `builder.payout_status` shape the CLI + `/studio/earnings` consume (a small union — `"coming_soon"` | `"connect_stripe"` | `{ available: usd }` | `"below_min"` — pin the field names in the plan).
