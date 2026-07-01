# Voice Deploy + Metered Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The 3-tier voice model — Tier 0 SF-managed number ($1.50/mo + $0.15/min, Twilio subaccount per org), Tier 1 BYO-Twilio ($0.15/min), Tier 2 BYO-everything ($0) — with all metered money as prepaid-wallet ledger debits (zero new Stripe calls).

**Architecture:** Pure metering math + DI'd metering orchestration (the payout `requestPayout` pattern) → thin webhook wiring; Tier-0 provisioning composes the existing idempotent `provisionVoiceNumber` state machine with a new subaccount layer; rent is a monthly cron over a pure planner; Tier 2 is a per-org webhook route reusing the already-secret-parameterized verifier.

**Tech Stack:** Next.js 16 route handlers, Drizzle+Neon (neon-http, no interactive tx), `node --import tsx --test`, Twilio REST (fetch + Basic auth), the shipped wallet ledger.

## Global Constraints
- **ZERO new Stripe calls.** Money-in stays the ONE existing top-up Checkout. Minutes + rent are wallet-ledger debits only.
- **Flag `SF_VOICE_MANAGED`** (`"1"`/`"true"`); off ⇒ every new path inert, existing voice behavior byte-for-byte unchanged. Separate from `SF_DEPLOY_ENABLED`.
- **Inert without keys:** no `TWILIO_MASTER_ACCOUNT_SID`/`TWILIO_MASTER_AUTH_TOKEN` ⇒ no subaccount/provisioning path reachable. Max enters all keys in Vercel (also `OPENAI_SIP_ORIGINATION_URI`, already known).
- **Idempotency keys (exact):** `voice:<callId>` (one debit per call, ever) · `rent:<deploymentId>:<YYYY-MM>` (UTC month).
- **Rates (env-overridable):** `SF_VOICE_RATE_MICROS_PER_MIN` default `150_000` ($0.15/min) · `SF_NUMBER_RENT_MICROS` default `1_500_000` ($1.50/mo). Accept floor `1_000_000` micros ($1); Tier-0 readiness floor `5_000_000` micros ($5).
- **Never-negative wallet:** long call ⇒ drain `LEAST(balance, amount)` + suspend; rent ⇒ refuse + suspend. No negative balances, no bad debt.
- **Legacy untouched:** the workspace-fallback voice path is NEVER metered; metering applies ONLY to deployment-resolved calls on the platform webhook, only when the flag is on. Tier 2 (per-org webhook) is never metered.
- **Schema additive, NO migration:** new `WalletTransactionKind` values `"voice_debit"`/`"number_rent"` (text col); new `numberOrigin` value `"sf_managed"` (text col); org jsonb `integrations.sfTelephony` + `integrations.openaiVoice`; deployment jsonb `delinquentSince` marker.
- **Pinned real seams (verified — do not re-derive, but DO read each file before composing and report any drift):** cron auth = `process.env.CRON_SECRET` + `authorization === \`Bearer ${secret}\`` (copy `src/app/api/cron/automations/route.ts:7-14`), schedules in `packages/crm/vercel.json` `"crons"[]`; `verifyOpenAiWebhook(params: { payload; headers; secret: string | undefined; nowSeconds? })` (`src/lib/agents/voice/openai-webhook-verify.ts:126` — ALREADY secret-parameterized); deploy orchestrator types `RunDeployDeps`/`runDeploy` (`src/lib/deployments/deploy-orchestrator.ts:105,155`); top-up apply layer `src/lib/build/wallet-webhook-apply.ts` (used by `app/api/v1/marketplace/stripe/webhook/route.ts`); number release predicate `existing.numberOrigin === "provisioned" && phoneNumberSid` (`src/lib/deployments/actions.ts:743-753`); platform-key seam `voiceApiKey = depKey?.apiKey ?? apiKey` (`app/api/v1/voice/openai/webhook/route.ts` ~:305-314); Twilio client DI `createTwilioTelephonyClient({accountSid, authToken})` + optional-method precedent `configureSmsUrl?` (`src/lib/telephony/twilio-client.ts`); wallet store patterns `insertLedgerRow` (private, `onConflictDoNothing` on UNIQUE `idempotencyKey`) + guarded decrement + rollback-on-insufficient (`src/lib/build/wallet-store.ts:88-250`).
- **Glue-task rule (lesson from the deploy build):** any task composing existing actions/routes must READ the real signatures first and adapt — the brief's snippets are intent, the repo is truth; report every deviation. Money/orchestration logic must be covered by DI unit tests, not just route glue + tsc.
- Worktree `.claude/worktrees/icp3-wedge`, branch `feature/chatgpt-app-submission`. Paths relative to `packages/crm/` unless noted. Per-task commits; do NOT `git add -A` (stage named files only); do NOT push until the final review.
- Verify per task: the named specs via `node --import tsx --test`, `npx tsc --noEmit` → 0, `pnpm check:use-server` when a `"use server"` file is touched; `pnpm build` in the final gate.

---

## Phase 1 — metering rails (pure + wallet)

### Task 1: Pure metering math — `voice-metering.ts` (TDD)

**Files:**
- Create: `src/lib/telephony/voice-metering.ts`
- Test: `tests/unit/telephony/voice-metering.spec.ts`

**Interfaces:**
- Produces (later tasks import these exactly): `voiceRateMicrosPerMin(env)`, `numberRentMicros(env)`, `ceilMinutes(seconds: number): number`, `voiceDebitMicros(seconds: number, rateMicros: number): number`, `voiceDebitKey(callId: string): string`, `rentMonthKey(date: Date): string`, `ACCEPT_FLOOR_MICROS = 1_000_000`, `TIER0_READY_FLOOR_MICROS = 5_000_000`, `shouldAcceptMeteredCall(balanceMicros: number): boolean`, `voiceManagedEnabled(env): boolean`.

- [ ] **Step 1: Write the failing test** — `tests/unit/telephony/voice-metering.spec.ts`:
```ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  ceilMinutes, voiceDebitMicros, voiceDebitKey, rentMonthKey,
  shouldAcceptMeteredCall, voiceRateMicrosPerMin, numberRentMicros,
  voiceManagedEnabled, ACCEPT_FLOOR_MICROS, TIER0_READY_FLOOR_MICROS,
} from "../../../src/lib/telephony/voice-metering";

describe("voice-metering (pure)", () => {
  test("ceilMinutes: rounds up, min 1 for any answered call, 0 only for 0s", () => {
    assert.equal(ceilMinutes(0), 0);
    assert.equal(ceilMinutes(1), 1);
    assert.equal(ceilMinutes(59), 1);
    assert.equal(ceilMinutes(60), 1);
    assert.equal(ceilMinutes(61), 2);
    assert.equal(ceilMinutes(299.4), 5);
    assert.equal(ceilMinutes(-5), 0);   // malformed → no charge
    assert.equal(ceilMinutes(NaN), 0);
  });
  test("voiceDebitMicros: minutes × rate; 0s → 0", () => {
    assert.equal(voiceDebitMicros(61, 150_000), 300_000);  // 2 min × $0.15
    assert.equal(voiceDebitMicros(0, 150_000), 0);
  });
  test("keys: exact formats", () => {
    assert.equal(voiceDebitKey("call_abc"), "voice:call_abc");
    assert.equal(rentMonthKey(new Date(Date.UTC(2026, 6, 31, 23, 59))), "2026-07");
    assert.equal(rentMonthKey(new Date(Date.UTC(2026, 0, 1))), "2026-01"); // zero-pad
  });
  test("accept floor: $1 boundary inclusive", () => {
    assert.equal(shouldAcceptMeteredCall(ACCEPT_FLOOR_MICROS), true);
    assert.equal(shouldAcceptMeteredCall(999_999), false);
    assert.equal(TIER0_READY_FLOOR_MICROS, 5_000_000);
  });
  test("env rates: defaults + override + garbage-tolerant", () => {
    assert.equal(voiceRateMicrosPerMin({}), 150_000);
    assert.equal(voiceRateMicrosPerMin({ SF_VOICE_RATE_MICROS_PER_MIN: "200000" }), 200_000);
    assert.equal(voiceRateMicrosPerMin({ SF_VOICE_RATE_MICROS_PER_MIN: "junk" }), 150_000);
    assert.equal(numberRentMicros({}), 1_500_000);
  });
  test("flag: '1'/'true' on, everything else off", () => {
    assert.equal(voiceManagedEnabled({ SF_VOICE_MANAGED: "1" }), true);
    assert.equal(voiceManagedEnabled({ SF_VOICE_MANAGED: "true" }), true);
    assert.equal(voiceManagedEnabled({}), false);
    assert.equal(voiceManagedEnabled({ SF_VOICE_MANAGED: "0" }), false);
  });
});
```

- [ ] **Step 2: Run — FAIL** (module not found): `cd packages/crm && node --import tsx --test tests/unit/telephony/voice-metering.spec.ts`

- [ ] **Step 3: Implement** — `src/lib/telephony/voice-metering.ts`:
```ts
// Voice metering — the PURE math for the 3-tier voice billing (spec
// 2026-07-01-voice-deploy-metered-billing). No I/O. Rates are env-overridable;
// keys mirror the wallet's debit:<runId> idempotency convention. Ceil-to-minute
// matches how Twilio bills SF, so builder-billing and SF COGS use the same unit.

type Env = Record<string, string | undefined>;

export const ACCEPT_FLOOR_MICROS = 1_000_000;       // $1 ≈ 6 min headroom to accept a metered call
export const TIER0_READY_FLOOR_MICROS = 5_000_000;  // $5 to provision an SF-managed number

const DEFAULT_RATE_MICROS_PER_MIN = 150_000;   // $0.15/min
const DEFAULT_RENT_MICROS = 1_500_000;         // $1.50/mo

function envInt(env: Env, key: string, fallback: number): number {
  const v = Number(env[key]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

export function voiceRateMicrosPerMin(env: Env): number {
  return envInt(env, "SF_VOICE_RATE_MICROS_PER_MIN", DEFAULT_RATE_MICROS_PER_MIN);
}
export function numberRentMicros(env: Env): number {
  return envInt(env, "SF_NUMBER_RENT_MICROS", DEFAULT_RENT_MICROS);
}
export function voiceManagedEnabled(env: Env): boolean {
  return env.SF_VOICE_MANAGED === "1" || env.SF_VOICE_MANAGED === "true";
}

/** Whole billed minutes: ceil(seconds/60); 0/negative/NaN → 0 (never charge a non-call). */
export function ceilMinutes(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.ceil(seconds / 60);
}

export function voiceDebitMicros(seconds: number, rateMicros: number): number {
  return ceilMinutes(seconds) * rateMicros;
}

export function voiceDebitKey(callId: string): string {
  return `voice:${callId}`;
}

/** UTC month key for rent idempotency: "YYYY-MM". */
export function rentMonthKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function shouldAcceptMeteredCall(balanceMicros: number): boolean {
  return balanceMicros >= ACCEPT_FLOOR_MICROS;
}
```

- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit** — `git add src/lib/telephony/voice-metering.ts tests/unit/telephony/voice-metering.spec.ts && git commit -m "feat(voice-billing): pure metering math — rates, ceil-minutes, keys, floors (TDD)"`

### Task 2: Wallet store — `voice_debit`/`number_rent` kinds + drain SQL

**Files:**
- Modify: `src/db/schema/wallet.ts` (extend `WalletTransactionKind` union + the doc comments, exactly like `"payout"` was added)
- Modify: `src/lib/build/wallet-store.ts` (three new exports)
- Test: `tests/unit/build/wallet-voice.spec.ts` (the drain arithmetic via an extracted pure helper)

**Interfaces:**
- Consumes: the private `insertLedgerRow`, `nonNegMicros`, the guarded-decrement patterns already in `wallet-store.ts`.
- Produces:
  - `debitVoiceUsage(args: { orgId: string; callId: string; amountMicros: number; stripeMode?: MarketplaceStripeMode }): Promise<{ ok: true; applied: boolean; duplicate: boolean; drainedMicros: number; shortfallMicros: number }>` — full debit when covered; **on insufficient, drains `LEAST(balance, amount)` instead of refusing** (minutes were consumed). One `voice_debit` row per call (`voice:<callId>`) recording the amount actually taken. Duplicate ⇒ no-op.
  - `debitNumberRent(args: { orgId: string; deploymentId: string; monthKey: string; amountMicros: number; stripeMode?: MarketplaceStripeMode }): Promise<WalletApplyResult>` — EXACTLY the `debitWalletForRun` shape/semantics (insert `number_rent` row keyed `rent:<deploymentId>:<monthKey>` → guarded decrement → on insufficient DELETE the row + `{ ok:false, reason:"insufficient" }`). Rent, unlike minutes, is refusable.
  - `splitVoiceDrain(balanceMicros: number, amountMicros: number): { drainedMicros: number; shortfallMicros: number }` — exported PURE helper (the drain arithmetic), unit-tested.

- [ ] **Step 1: Write the failing test** — `tests/unit/build/wallet-voice.spec.ts`:
```ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { splitVoiceDrain } from "../../../src/lib/build/wallet-store";

describe("splitVoiceDrain (pure)", () => {
  test("covered: drain = full amount, shortfall 0", () => {
    assert.deepEqual(splitVoiceDrain(1_000_000, 300_000), { drainedMicros: 300_000, shortfallMicros: 0 });
  });
  test("short: drain = whole balance, shortfall = remainder", () => {
    assert.deepEqual(splitVoiceDrain(200_000, 300_000), { drainedMicros: 200_000, shortfallMicros: 100_000 });
  });
  test("empty wallet: drain 0, shortfall = amount", () => {
    assert.deepEqual(splitVoiceDrain(0, 300_000), { drainedMicros: 0, shortfallMicros: 300_000 });
  });
  test("garbage-tolerant: negative/NaN inputs clamp to 0", () => {
    assert.deepEqual(splitVoiceDrain(-5, 300_000), { drainedMicros: 0, shortfallMicros: 300_000 });
    assert.deepEqual(splitVoiceDrain(NaN, NaN), { drainedMicros: 0, shortfallMicros: 0 });
  });
});
```

- [ ] **Step 2: Run — FAIL** (`splitVoiceDrain` not exported).

- [ ] **Step 3: Implement.** In `wallet.ts`: `export type WalletTransactionKind = "topup" | "debit" | "earning" | "payout" | "voice_debit" | "number_rent";` + extend the kind/idempotency doc comments (`voice_debit: voice:<callId>`, `number_rent: rent:<deploymentId>:<YYYY-MM>`). In `wallet-store.ts` add (mirroring the house style — full JSDoc like the siblings):
```ts
/** Pure drain split: how much of a voice debit the balance can cover. */
export function splitVoiceDrain(
  balanceMicros: number,
  amountMicros: number,
): { drainedMicros: number; shortfallMicros: number } {
  const bal = nonNegMicros(balanceMicros);
  const amt = nonNegMicros(amountMicros);
  const drained = Math.min(bal, amt);
  return { drainedMicros: drained, shortfallMicros: amt - drained };
}
```
`debitVoiceUsage`: validate callId/amount (amount ≤ 0 ⇒ `{ok:true, applied:false, duplicate:false, drainedMicros:0, shortfallMicros:0}`); `ensureWallet`; read balance; `const { drainedMicros, shortfallMicros } = splitVoiceDrain(balance, amount)`; `insertLedgerRow({ kind:"voice_debit", amountMicros: drainedMicros === 0 ? amount /* record the owed amount even on empty-wallet drain? NO — record what was TAKEN */ : drainedMicros, idempotencyKey: voice key, runId: callId })` — **record `drainedMicros`** (the ledger states money movement, not debt; the shortfall is the return value the caller acts on by suspending). Duplicate ⇒ return current state with `duplicate:true, drainedMicros:0, shortfallMicros:0`. Fresh insert + `drainedMicros > 0` ⇒ guarded decrement `WHERE balance >= drained` (drained ≤ balance-at-read; under a race the guard can still fail — then re-read + retry ONCE with the re-split, else delete the row and return `drainedMicros:0` with full shortfall). Fresh insert + `drainedMicros === 0` (empty wallet) ⇒ keep the 0-amount row? NO — `insertLedgerRow` with amount 0 is noise; instead skip the insert entirely when `drainedMicros === 0` and return `{applied:false, shortfallMicros: amt}` (idempotency unneeded — nothing moved; the suspend that follows prevents repeats). `debitNumberRent`: copy `debitWalletForRun`'s body with kind `number_rent`, key `rent:${deploymentId}:${monthKey}`, no runId.
> These are neon-http DB fns; per house precedent (`accrueBuilderEarning`, `recordBuilderPayout`) they ship tsc-verified with the arithmetic pure-tested. Keep every mutation inside the existing two-primitive money-safety model (UNIQUE-insert first, guarded UPDATE second).

- [ ] **Step 4: Run the spec — PASS**; `npx tsc --noEmit` → 0.
- [ ] **Step 5: Commit** — `git add src/db/schema/wallet.ts src/lib/build/wallet-store.ts tests/unit/build/wallet-voice.spec.ts && git commit -m "feat(voice-billing): voice_debit/number_rent wallet kinds + drain-on-shortfall (never negative)"`

### Task 3: DI metering orchestration (TDD — the money brain)

**Files:**
- Create: `src/lib/telephony/voice-metering-orchestration.ts`
- Test: `tests/unit/telephony/voice-metering-orchestration.spec.ts`

**Interfaces:**
- Consumes: Task 1 pure fns; deps are injected (Task 4 wires the real `getWalletBalanceMicros`/`debitVoiceUsage`/`suspendBuilderSubaccount`).
- Produces:
```ts
export type GateDeps = { env: Record<string, string | undefined>; getBalanceMicros(orgId: string): Promise<number> };
export type GateResult = { accept: true } | { accept: false; reason: "flag_off_unmetered" | "low_balance" };
export function gateMeteredAccept(orgId: string, deps: GateDeps): Promise<GateResult>;
// flag off ⇒ { accept:true, ... } is WRONG — flag off means the call is NOT metered at all;
// the caller only invokes the gate when metering applies. So: gate assumes metering; returns
// low_balance below the floor, accept otherwise. (The flag check lives in the caller's
// isMeteredCall discriminator — tested here too.)
export type MeterEndDeps = {
  env: Record<string, string | undefined>;
  debitVoiceUsage(a: { orgId: string; callId: string; amountMicros: number }): Promise<{ ok: true; applied: boolean; duplicate: boolean; drainedMicros: number; shortfallMicros: number }>;
  onShortfall(orgId: string): Promise<void>; // suspend/delinquent hook — fail-soft inside
};
export type MeterEndResult = { metered: false } | { metered: true; amountMicros: number; shortfallMicros: number };
export function meterCallEnd(a: { orgId: string; callId: string; seconds: number }, deps: MeterEndDeps): Promise<MeterEndResult>;
export function isMeteredCall(a: { env: Record<string, string | undefined>; viaDeployment: boolean; perOrgWebhook: boolean }): boolean;
// = voiceManagedEnabled(env) && viaDeployment && !perOrgWebhook  (legacy workspace path: viaDeployment=false → never metered)
```

- [ ] **Step 1: Write the failing test** — full matrix, fakes only:
```ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { gateMeteredAccept, meterCallEnd, isMeteredCall } from "../../../src/lib/telephony/voice-metering-orchestration";

const ENV_ON = { SF_VOICE_MANAGED: "1" };

describe("isMeteredCall", () => {
  test("metered only: flag on + deployment path + platform webhook", () => {
    assert.equal(isMeteredCall({ env: ENV_ON, viaDeployment: true, perOrgWebhook: false }), true);
    assert.equal(isMeteredCall({ env: {}, viaDeployment: true, perOrgWebhook: false }), false);       // flag off
    assert.equal(isMeteredCall({ env: ENV_ON, viaDeployment: false, perOrgWebhook: false }), false);  // legacy workspace
    assert.equal(isMeteredCall({ env: ENV_ON, viaDeployment: true, perOrgWebhook: true }), false);    // Tier 2
  });
});

describe("gateMeteredAccept", () => {
  test("accepts at/above the $1 floor, refuses below", async () => {
    assert.deepEqual(await gateMeteredAccept("o1", { env: ENV_ON, getBalanceMicros: async () => 1_000_000 }), { accept: true });
    assert.deepEqual(await gateMeteredAccept("o1", { env: ENV_ON, getBalanceMicros: async () => 999_999 }), { accept: false, reason: "low_balance" });
  });
  test("balance-read failure fails OPEN (never drop a call to a metering hiccup)", async () => {
    assert.deepEqual(await gateMeteredAccept("o1", { env: ENV_ON, getBalanceMicros: async () => { throw new Error("db"); } }), { accept: true });
  });
});

describe("meterCallEnd", () => {
  const base = (over?: Partial<Parameters<typeof meterCallEnd>[1]>) => {
    const calls: unknown[] = []; const suspended: string[] = [];
    const deps = {
      env: ENV_ON,
      debitVoiceUsage: async (a: { orgId: string; callId: string; amountMicros: number }) => {
        calls.push(a); return { ok: true as const, applied: true, duplicate: false, drainedMicros: a.amountMicros, shortfallMicros: 0 };
      },
      onShortfall: async (o: string) => { suspended.push(o); },
      ...over,
    };
    return { deps, calls, suspended };
  };
  test("debits ceil-minutes × rate, no shortfall → no suspend", async () => {
    const { deps, calls, suspended } = base();
    const r = await meterCallEnd({ orgId: "o1", callId: "c1", seconds: 61 }, deps);
    assert.deepEqual(r, { metered: true, amountMicros: 300_000, shortfallMicros: 0 });
    assert.equal((calls[0] as { amountMicros: number }).amountMicros, 300_000);
    assert.deepEqual(suspended, []);
  });
  test("0-second call → metered:false, NO debit call", async () => {
    const { deps, calls } = base();
    assert.deepEqual(await meterCallEnd({ orgId: "o1", callId: "c1", seconds: 0 }, deps), { metered: false });
    assert.equal(calls.length, 0);
  });
  test("shortfall → onShortfall fired once with the org", async () => {
    const { deps, suspended } = base({
      debitVoiceUsage: async (a) => ({ ok: true as const, applied: true, duplicate: false, drainedMicros: 100_000, shortfallMicros: a.amountMicros - 100_000 }),
    });
    const r = await meterCallEnd({ orgId: "o1", callId: "c1", seconds: 61 }, deps);
    assert.deepEqual(r, { metered: true, amountMicros: 300_000, shortfallMicros: 200_000 });
    assert.deepEqual(suspended, ["o1"]);
  });
  test("debit throws → swallowed (fail-soft), metered:false returned, no suspend", async () => {
    const { deps, suspended } = base({ debitVoiceUsage: async () => { throw new Error("db down"); } });
    assert.deepEqual(await meterCallEnd({ orgId: "o1", callId: "c1", seconds: 61 }, deps), { metered: false });
    assert.deepEqual(suspended, []);
  });
  test("onShortfall throwing never propagates", async () => {
    const { deps } = base({
      debitVoiceUsage: async (a) => ({ ok: true as const, applied: true, duplicate: false, drainedMicros: 0, shortfallMicros: a.amountMicros }),
      onShortfall: async () => { throw new Error("twilio down"); },
    });
    const r = await meterCallEnd({ orgId: "o1", callId: "c1", seconds: 30 }, deps);
    assert.equal(r.metered, true);
  });
});
```

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** to the exact contracts above (`gateMeteredAccept` wraps the balance read in try/catch → fail-OPEN `{accept:true}`; `meterCallEnd` computes `voiceDebitMicros(seconds, voiceRateMicrosPerMin(deps.env))`, returns `{metered:false}` for 0 micros, try/catches the debit → `{metered:false}` on throw, fires `onShortfall` (own try/catch) when `shortfallMicros > 0`).
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit** — `git add src/lib/telephony/voice-metering-orchestration.ts tests/unit/telephony/voice-metering-orchestration.spec.ts && git commit -m "feat(voice-billing): DI metering orchestration — gate, meter-at-end, shortfall hook (TDD)"`

---

## Phase 2 — Tier 1 live (webhook wiring)

### Task 4: Platform webhook — accept gate + hang-up debit + platform-key forcing

**Files:**
- Modify: `app/api/v1/voice/openai/webhook/route.ts` (the deployment path ONLY — ~:218-335)

**Interfaces:**
- Consumes: `isMeteredCall`/`gateMeteredAccept`/`meterCallEnd` (Task 3) with real deps (`getWalletBalanceMicros`, `debitVoiceUsage` from Task 2; `onShortfall` = a stub logger until Task 5 supplies `suspendBuilderSubaccount` — wire the import then).
- Produces: metered Tier-0/1 calls gated + debited; platform key forced on metered calls.

- [ ] **Step 1: READ the route** (deployment branch: `resolveDeploymentByNumber` hit → `loadDeploymentVoiceContext` → `resolveDeploymentRuntimeKey` → `runVoiceCall`). Locate the exact accept point and the `voiceApiKey = depKey?.apiKey ?? apiKey` line (~:305-314).
- [ ] **Step 2: Wire the gate.** After the deployment resolves and BEFORE accepting: `const metered = isMeteredCall({ env: process.env, viaDeployment: true, perOrgWebhook: false });` if `metered`, `const gate = await gateMeteredAccept(deployment.builderOrgId, { env: process.env, getBalanceMicros: getWalletBalanceMicros });` — on `{accept:false}` do NOT accept (fall through exactly as an unmatched/rejected call does today so missed-call handling still fires; log `voice_low_balance`).
- [ ] **Step 3: Force the platform key on metered calls:** `const voiceApiKey = metered ? apiKey : (depKey?.apiKey ?? apiKey);` (skip `resolveDeploymentRuntimeKey` entirely when metered — it would fail cross-project anyway).
- [ ] **Step 4: Debit at hang-up.** Around the `runVoiceCall(...)` await in the `after()` callback: capture `const meteredCallStartedAt = Date.now();` immediately before; after it resolves (and in a `finally` so a thrown call-loop still meters the elapsed time), when `metered`: `await meterCallEnd({ orgId: deployment.builderOrgId, callId, seconds: (Date.now() - meteredCallStartedAt) / 1000 }, { env: process.env, debitVoiceUsage, onShortfall: async (o) => console.warn("[voice-billing] shortfall", o) });` — fail-soft is inside `meterCallEnd`; nothing here may throw into the call path. Workspace-fallback branch: UNTOUCHED.
- [ ] **Step 5: Verify** — `npx tsc --noEmit` → 0; `node --import tsx --test tests/unit/telephony/voice-metering.spec.ts tests/unit/telephony/voice-metering-orchestration.spec.ts` still green. Flag off ⇒ diff-inspect that every new branch is behind `metered`.
- [ ] **Step 6: Commit** — `git add app/api/v1/voice/openai/webhook/route.ts && git commit -m "feat(voice-billing): Tier-1 live — accept gate, hang-up debit, platform-key forcing (flag-gated)"`

---

## Phase 3 — Tier 0 (subaccounts + rent + suspend)

### Task 5: Subaccount layer — `sf-managed.ts` + Twilio client additions (TDD on pure matcher + fake client)

**Files:**
- Modify: `src/lib/telephony/twilio-client.ts` — add optional interface methods (the `configureSmsUrl?` precedent): `createSubaccount?({friendlyName}): Promise<{sid, authToken}>`, `findSubaccountByFriendlyName?({friendlyName}): Promise<{sid, authToken} | null>`, `setSubaccountStatus?({subaccountSid, status: "suspended"|"active"|"closed"}): Promise<void>`, `listTrunksWithOrigination?(): Promise<Array<{trunkSid, originationUris: string[]}>>`, `createTrunkWithOrigination?({friendlyName, originationSipUri}): Promise<{trunkSid}>` + concrete fetch impls (v2010 `/Accounts` for sub-CRUD with MASTER creds; `trunking.twilio.com/v1` for trunk ops — these run on a client built with the SUBACCOUNT creds).
- Create: `src/lib/telephony/sf-managed.ts`
- Test: `tests/unit/telephony/sf-managed.spec.ts`

**Interfaces:**
- Produces:
```ts
export function resolveMasterTwilio(env): { accountSid: string; authToken: string } | null;  // both present or null (inert)
export function pickTrunkWithOrigination(trunks: Array<{trunkSid: string; originationUris: string[]}>, uri: string): string | null; // PURE
export async function ensureBuilderSubaccount(orgId: string, deps): Promise<{ ok: true; subaccountSid: string; authToken: string } | { ok: false; error: "not_configured" | "twilio_error" }>;
// idempotent: read integrations.sfTelephony → else findSubaccountByFriendlyName(orgId) → else create; persist encrypted (same "v1." scheme as BYO twilio token)
export async function ensureSubaccountTrunk(subCreds, deps): Promise<{ ok: true; trunkSid: string } | { ok: false; error: "not_configured" | "twilio_error" }>;
// SUBACCOUNT-cred client (the trunking-subdomain rule); pickTrunkWithOrigination(list, OPENAI_SIP_ORIGINATION_URI) → reuse, else create; persist trunkSid
export async function suspendBuilderSubaccount(orgId: string, deps): Promise<void>;   // master creds; fail-soft no-throw
export async function reactivateBuilderSubaccount(orgId: string, deps): Promise<void>;
```
All deps injected (org-integrations read/write, the Twilio clients, env) — unit-tested with fakes; the real deps builder lives in the same file (non-exported or a `buildSfManagedDeps()` export).

- [ ] **Step 1: Failing tests** — `pickTrunkWithOrigination` (match/no-match/multi/empty; exact-string URI match), `ensureBuilderSubaccount` with fakes (already-persisted ⇒ no Twilio calls; found-by-friendly-name ⇒ persisted + no create; created ⇒ one create + persisted; no master creds ⇒ `not_configured`, zero calls), `ensureSubaccountTrunk` (existing matching trunk reused — NO create; else exactly one create with the right URI; persisted), suspend/reactivate (fires `setSubaccountStatus` with the right status; a throwing client never propagates).
- [ ] **Step 2: FAIL → Step 3: Implement → Step 4: PASS**; `npx tsc --noEmit` → 0.
- [ ] **Step 5: Commit** — `git add src/lib/telephony/twilio-client.ts src/lib/telephony/sf-managed.ts tests/unit/telephony/sf-managed.spec.ts && git commit -m "feat(voice-billing): Tier-0 subaccount layer — ensure/suspend/reactivate + trunk (TDD, inert without master creds)"`

### Task 6: SF-managed provisioning path + release + top-up reactivate hook

**Files:**
- Create: `src/lib/telephony/provision-sf-managed.ts` — `provisionSfManagedNumber({ deployment, areaCode }, deps)`: (1) `debitNumberRent` for `rentMonthKey(now)` FIRST — insufficient ⇒ `{ ok:false, error:"insufficient_balance" }`, buy NOTHING; (2) `ensureBuilderSubaccount` → (3) `ensureSubaccountTrunk` → (4) the EXISTING `provisionVoiceNumber` state machine with `createTwilioTelephonyClient(subCreds)` + the subaccount trunkSid, patching `numberOrigin: "sf_managed"` (extend the state machine's persist patch — READ `provision-voice-number.ts:131-135` and thread the origin value as a param defaulting to `"provisioned"` so BYO callers are untouched).
- Modify: `src/lib/deployments/actions.ts` — `cancelDeploymentAction`'s release predicate (~:743): also release when `numberOrigin === "sf_managed"` (client from the org's `sfTelephony` subaccount creds).
- Modify: `src/lib/build/wallet-webhook-apply.ts` — after a successful top-up credit, fail-soft: if the org has a `delinquentSince` marker on any sf_managed deployment, `reactivateBuilderSubaccount(orgId)` + clear the markers. (READ the file first; keep the hook additive + try/caught — a reactivation failure must never break the credit.)
- Test: `tests/unit/telephony/provision-sf-managed.spec.ts` — fakes: rent-refused ⇒ zero Twilio calls; happy path ⇒ rent row THEN subaccount THEN trunk THEN state machine, origin `sf_managed`; idempotent re-run resumes (state machine semantics preserved).

- [ ] Steps: failing test → FAIL → implement → PASS → `npx tsc --noEmit` → 0 → `pnpm check:use-server` (actions.ts touched) → commit `git add src/lib/telephony/provision-sf-managed.ts src/lib/telephony/provision-voice-number.ts src/lib/deployments/actions.ts src/lib/build/wallet-webhook-apply.ts tests/unit/telephony/provision-sf-managed.spec.ts && git commit -m "feat(voice-billing): SF-managed provisioning — rent-before-buy, sf_managed origin, release + reactivate hooks"`

### Task 7: Rent cron — pure planner (TDD) + route + schedule

**Files:**
- Create: `src/lib/telephony/rent-planner.ts` — PURE: `planMonthlyRent(input: { monthKey: string; deployments: Array<{ deploymentId: string; orgId: string; provisionMonthKey: string; delinquentSince: string | null; suspended: boolean }>; now: Date }): { charge: Array<{deploymentId, orgId}>; skipProvisionMonth: string[]; release: Array<{deploymentId, orgId}> }` — charge every active sf_managed deployment except its provision month; release those `delinquentSince` ≥ 30 days before `now`.
- Create: `app/api/cron/voice-rent/route.ts` — copy the `automations` cron auth verbatim (`CRON_SECRET` bearer, `automations/route.ts:7-14`); iterate the plan: `debitNumberRent` (paid ⇒ clear marker + `reactivateBuilderSubaccount` if suspended; insufficient ⇒ `suspendBuilderSubaccount` + stamp `delinquentSince` if unset); for `release`: reuse the cancel/release path. Idempotent per month key — safe to re-run.
- Modify: `packages/crm/vercel.json` — add `{ "path": "/api/cron/voice-rent", "schedule": "0 6 1 * *" }` (1st of the month, 06:00 UTC).
- Test: `tests/unit/telephony/rent-planner.spec.ts` — provision-month skip; normal charge; 29-days-delinquent NOT released / 30+ released; empty input.

- [ ] Steps: failing planner test → FAIL → implement planner → PASS → route + vercel.json → `npx tsc --noEmit` → commit `git add src/lib/telephony/rent-planner.ts app/api/cron/voice-rent/route.ts vercel.json tests/unit/telephony/rent-planner.spec.ts && git commit -m "feat(voice-billing): monthly rent cron — pure planner, suspend on insufficient, release at 30d delinquent"`
> Note: the deployments query for the cron (active + `numberOrigin='sf_managed'`, join org) is a small store read — add `listSfManagedDeploymentsForRent()` to `src/lib/deployments/store.ts` in this task (house query style; include it in the commit).

---

## Phase 4 — Tier 2 (BYO OpenAI project)

### Task 8: Per-org webhook route + `integrations.openaiVoice` storage (TDD on the auth decision)

**Files:**
- Create: `src/lib/agents/voice/tier2-auth.ts` — PURE: `decideTier2Call(input: { orgId: string; verified: boolean; deploymentBuilderOrgId: string | null; storedKeyPresent: boolean }): { ok: true } | { ok: false; status: 401 | 403 | 404; reason: string }` (not verified ⇒ 401; no deployment ⇒ 404; `deploymentBuilderOrgId !== orgId` ⇒ 403 cross-org; no stored key ⇒ 403 not_configured).
- Create: `src/lib/telephony/openai-voice-store.ts` — `getOrgOpenAiVoice(orgId)` / `setOrgOpenAiVoice(orgId, { projectId, apiKey, webhookSecret })` reading/writing `integrations.openaiVoice` with the same encryption used for the BYO Twilio token (READ `src/lib/telephony/config.ts` for the exact encrypt/decrypt helpers and mirror them).
- Create: `app/api/v1/voice/openai/webhook/[orgId]/route.ts` — same body-driving flow as the platform route's deployment path, EXCEPT: verify with `verifyOpenAiWebhook({ payload, headers, secret: org.webhookSecret })` (the verifier is ALREADY secret-parameterized — `openai-webhook-verify.ts:126`); `decideTier2Call` gate; accept STRICTLY on the org's stored voice key (no platform fallback); NEVER metered (`perOrgWebhook: true`); `runtime = "nodejs"`.
- Test: `tests/unit/agents/voice/tier2-auth.spec.ts` — all four rejection branches + the happy path.

- [ ] Steps: failing auth test → FAIL → implement pure + storage + route (READ the platform route first; factor shared call-driving ONLY if trivial — duplication of the thin wiring is acceptable here, a shared-extraction refactor is NOT in scope) → PASS → `npx tsc --noEmit` → commit `git add src/lib/agents/voice/tier2-auth.ts src/lib/telephony/openai-voice-store.ts "app/api/v1/voice/openai/webhook/[orgId]/route.ts" tests/unit/agents/voice/tier2-auth.spec.ts && git commit -m "feat(voice-billing): Tier-2 per-org webhook — org whsec verify, cross-org guard, strict builder key, never metered"`

### Task 9: Tier-2 wizard step + trunk-to-their-project

**Files:**
- Create: `src/lib/telephony/connect-openai-voice.ts` — `"use server"` action `connectOpenAiVoiceAction({ projectId, apiKey, webhookSecret })`: `getOrgId()` guard → validate shapes (`proj_` prefix, `whsec_` prefix, non-empty key) → `setOrgOpenAiVoice` → if the org has BYO Twilio creds (`resolveBuilderTelephony`), `ensureSubaccountTrunk`-style trunk ensure on THEIR creds pointed at `sip:${projectId}@sip.api.openai.com;transport=tls` (reuse Task 5's trunk helpers parameterized by creds+URI) → return `{ ok: true, webhookUrl: \`${appUrl}/api/v1/voice/openai/webhook/${orgId}\` }` or typed errors.
- Modify: the buyer setup wizard — add a `connect_openai_voice` step component (`src/components/buyer/steps/connect-openai-voice-step.tsx`) shown for voice deployments as the Tier-2 opt-in ("$0 SF fees — bring your own OpenAI project"): displays the 3 dashboard instructions + the org's webhook URL, collects the 3 values, calls the action. READ `phone-step.tsx` + `setup-wizard-client.tsx` for the step-wiring pattern and mirror it (optional step, never required).

- [ ] Steps: implement (no new pure logic — validation is trivial; the action mirrors `connectBuilderTwilioAction`-style shape) → `npx tsc --noEmit` → `pnpm check:use-server` → commit `git add src/lib/telephony/connect-openai-voice.ts src/components/buyer/steps/connect-openai-voice-step.tsx <wizard wiring files> && git commit -m "feat(voice-billing): Tier-2 connect wizard — paste project/whsec/key, trunk to their project SIP"`

---

## Phase 5 — deploy-verb integration + gate

### Task 10: Tier-0 readiness + `runDeploy` SF-managed provision + surfaces

**Files:**
- Modify: `src/lib/deployments/deploy-readiness.ts` + `deploy-readiness-deps.ts` — telephony requirement met when BYO connected **or** Tier-0 available (`voiceManagedEnabled(env)` + master creds + balance ≥ `TIER0_READY_FLOOR_MICROS`); unmet copy: `"Top up your wallet for an instant SF number, or connect your own Twilio."`
- Modify: `src/lib/deployments/deploy-orchestrator.ts` + `app/api/v1/build/deploy/route.ts` — the provision path: no BYO creds but Tier-0 available ⇒ `provisionSfManagedNumber` instead of `needs_telephony`. READ `RunDeployDeps` (`deploy-orchestrator.ts:105`) and extend the phone dep — keep the external `DeployResult` JSON contract byte-for-byte (the CLI + MCP tool depend on it; a new failure reason `"insufficient_balance"` rides the existing `{ok:false, reason}` shape).
- Modify: builder-block (`app/api/v1/workspace-state/route.ts`) + CLI `status` — surface `low_balance` / `suspended` on voice deployments (additive, fail-soft, same pattern as `deploy_readiness`).
- Test: EXTEND `tests/unit/deployments/deploy-orchestrator.spec.ts` (the deploy-build lesson — orchestration tests are non-negotiable): funded wallet + no BYO ⇒ SF-managed path invoked ⇒ `live`; unfunded + no BYO ⇒ `needs_connect` (telephony unmet, both options in copy); rent-refused inside provisioning ⇒ `{ok:false, reason:"insufficient_balance"}`; flag off ⇒ prior behavior byte-identical. EXTEND `tests/unit/deployments/deploy-readiness.spec.ts` for the Tier-0-available input.

- [ ] Steps: failing orchestrator+readiness tests → FAIL → implement → PASS → `npx tsc --noEmit` → `pnpm check:use-server` → commit `git add <named files> && git commit -m "feat(voice-billing): deploy-verb payoff — funded wallet ⇒ instant SF number ⇒ live"`

### Task 11: Full verify gate + report
- [ ] `cd packages/crm && node --import tsx --test tests/unit/telephony/*.spec.ts tests/unit/build/wallet-voice.spec.ts tests/unit/agents/voice/tier2-auth.spec.ts tests/unit/deployments/deploy-orchestrator.spec.ts tests/unit/deployments/deploy-readiness.spec.ts` → all pass.
- [ ] `npx tsc --noEmit` → 0; `pnpm check:use-server` → passes; `pnpm build` → succeeds.
- [ ] `cd packages/cli && npm test && npm run build` → green (CLI touched only if Task 10 changed `status` rendering).
- [ ] Report: gate results + the activation checklist (Max sets `SF_VOICE_MANAGED`, `TWILIO_MASTER_ACCOUNT_SID/AUTH_TOKEN`, confirms `OPENAI_SIP_ORIGINATION_URI` + `CRON_SECRET` in Vercel) + the two live smokes (one real Tier-0 call end-to-end wallet-debited-once; cached-input-rate verification on real usage metrics). Commit nothing.

---

## Self-Review notes (addressed)
- **Spec coverage:** §1 wallet rail → T1-T3; §2 webhook metering/gate/key-forcing → T4; §3 Tier-0 provisioning → T5-T6; §4 rent cron + suspend + 30d release → T7 (+T6 release/reactivate); §5 Tier 2 → T8-T9; §6 deploy-verb + surfaces → T10; error handling distributed per component; live smokes + activation → T11. Legacy-never-metered pinned in T3's `isMeteredCall` test + T4's scope rule.
- **Type consistency:** `debitVoiceUsage` return shape identical in T2 (producer) and T3 (consumer dep); `voiceDebitKey`/`rentMonthKey` used by T2/T6/T7 as defined in T1; `suspendBuilderSubaccount(orgId, deps)` from T5 consumed by T4 (via the shortfall hook once available), T6, T7; `TIER0_READY_FLOOR_MICROS` from T1 consumed by T10.
- **Placeholder scan:** clean — glue tasks carry the pinned-seam rule + exact wiring points instead of full code, per the deploy-build lesson (verify signatures in-task, report drift).
- **Orchestration-test rule honored:** the money brain (T3), the drain arithmetic (T2), subaccount idempotency (T5), rent planning (T7), Tier-2 auth (T8), and the deploy path (T10) all carry unit tests; route files stay thin wiring.
