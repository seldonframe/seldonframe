# IDE-Native Builder Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give humans and agents ONE lifecycle surface (build→test→eval→run→sell→fund) plus IDE-native Stripe funding — a `seldonframe status`, an extended `get_workspace_state` `builder` block, and a `wallet topup` verb.

**Architecture:** Extend the pure `builder-ladder.ts` with a `buildLifecycleView` composer (earnings + per-agent lifecycle + a low-balance fund hint). Add those fields *additively* to the `builder` block in the workspace-state route, and add a bearer-authed `POST /api/v1/build/wallet/topup` that reuses the shipped `createWalletTopupCheckout` helper. Add `status` + `wallet topup` to the CLI over the existing `ApiClient`.

**Tech Stack:** TypeScript, Next.js 16 route handlers, Drizzle, `node --import tsx --test`, the zero-dep `@seldonframe/cli`.

## Global Constraints
- **Money-safe:** no new charge path. Reuse the shipped wallet rail (`createWalletTopupCheckout` is the ONLY money-IN call; it self-gates on `SF_MARKETPLACE_BILLING` + a Stripe key). No migration.
- **Additive only** on `get_workspace_state`: `next_steps`, `counts`, `integrations`, and the existing `builder` fields stay byte-for-byte; only NEW keys are added.
- **Honesty:** earnings display carries `payout_status: "coming_soon"` until the Connect payout ships.
- **Worktree/branch:** work in `…/.claude/worktrees/icp3-wedge`; per-task commits; push to `main` via `git push origin HEAD:main`.
- **Test/verify gate (run before each commit that touches it):** `node --import tsx --test <changed spec>`; for CRM route changes also `pnpm build` from `packages/crm`; for CLI `npm test` + `npm run build` from `packages/cli`.

---

### Task 1: Pure lifecycle view (`buildLifecycleView` + fund hint)

**Files:**
- Modify: `packages/crm/src/lib/build/builder-ladder.ts` (append; do not touch `buildBuilderLadder`/`deriveBuilderSignals`)
- Test: `packages/crm/tests/unit/build/builder-ladder.spec.ts` (append a `describe`)

**Interfaces:**
- Consumes: nothing new (pure).
- Produces:
  - `type AgentLifecycle = { name: string; slug: string; stage: "build" | "test" | "eval" | "list" | "price" | "live"; eval_pass_rate: number | null; live: boolean }`
  - `type LifecycleView = { earnings: { accrued_usd: number; payout_status: "coming_soon" }; agents: AgentLifecycle[]; fund_hint: string | null }`
  - `function buildLifecycleView(input: { agents: AgentLifecycleInput[]; earningsAccruedUsd: number; walletBalanceUsd: number }): LifecycleView`
  - `type AgentLifecycleInput = { name: string; slug: string; status: string; eval_total: number; eval_meets_publish_gate: boolean | null; listed: boolean; priced: boolean }`

- [ ] **Step 1: Write the failing test** — append to `builder-ladder.spec.ts`:

```ts
import { buildLifecycleView } from "../../../src/lib/build/builder-ladder";

describe("buildLifecycleView", () => {
  const AGENT = {
    name: "Ace",
    slug: "ace",
    status: "live",
    eval_total: 11,
    eval_meets_publish_gate: true,
    listed: true,
    priced: true,
  };

  test("maps an agent to its furthest stage (live) + surfaces eval rate", () => {
    const v = buildLifecycleView({ agents: [AGENT], earningsAccruedUsd: 12.5, walletBalanceUsd: 5 });
    assert.equal(v.agents[0]!.stage, "live");
    assert.equal(v.agents[0]!.live, true);
    assert.equal(v.earnings.accrued_usd, 12.5);
    assert.equal(v.earnings.payout_status, "coming_soon");
  });

  test("a listed-but-unpriced agent is at the price stage; a built-only agent is at build/test", () => {
    const listed = buildLifecycleView({
      agents: [{ ...AGENT, status: "test", priced: false }],
      earningsAccruedUsd: 0,
      walletBalanceUsd: 5,
    });
    assert.equal(listed.agents[0]!.stage, "price");
    const built = buildLifecycleView({
      agents: [{ ...AGENT, status: "draft", eval_total: 0, eval_meets_publish_gate: null, listed: false, priced: false }],
      earningsAccruedUsd: 0,
      walletBalanceUsd: 5,
    });
    assert.equal(built.agents[0]!.stage, "eval"); // has an agent, no eval yet → next is eval; "test" is the soft precursor
  });

  test("fund_hint fires only when the balance is low (< $1); it is a note, never blocking", () => {
    assert.match(buildLifecycleView({ agents: [AGENT], earningsAccruedUsd: 0, walletBalanceUsd: 0 }).fund_hint!, /wallet topup/);
    assert.equal(buildLifecycleView({ agents: [AGENT], earningsAccruedUsd: 0, walletBalanceUsd: 5 }).fund_hint, null);
  });

  test("tolerates empty/malformed input", () => {
    // @ts-expect-error — jsonb edge
    const v = buildLifecycleView({});
    assert.deepEqual(v.agents, []);
    assert.equal(v.earnings.accrued_usd, 0);
    assert.equal(v.fund_hint, null);
  });
});
```

- [ ] **Step 2: Run to verify it fails**
Run: `cd packages/crm && node --import tsx --test tests/unit/build/builder-ladder.spec.ts`
Expected: FAIL — `buildLifecycleView` is not exported.

- [ ] **Step 3: Implement** — append to `builder-ladder.ts`:

```ts
// ── the full lifecycle view (superset of the sell ladder; consumed by the
// get_workspace_state `builder` block + `seldonframe status`) ──────────────────

export type AgentLifecycleInput = {
  name: string;
  slug: string;
  status: string;
  eval_total: number;
  eval_meets_publish_gate: boolean | null;
  listed: boolean;
  priced: boolean;
};

export type AgentLifecycle = {
  name: string;
  slug: string;
  stage: BuilderRungKind;
  eval_pass_rate: number | null;
  live: boolean;
};

export type LifecycleView = {
  earnings: { accrued_usd: number; payout_status: "coming_soon" };
  agents: AgentLifecycle[];
  /** A NON-blocking note shown when the balance is low — never the next_action. */
  fund_hint: string | null;
};

/** Balance floor (USD) under which we surface the (informational) top-up note. */
const LOW_BALANCE_USD = 1;

function agentStage(a: AgentLifecycleInput): BuilderRungKind {
  if (a?.status === "live") return "live" as BuilderRungKind; // "observe" rung — live is its terminal
  if (a?.listed && !a?.priced) return "price";
  if (a?.listed) return "list";
  if (a?.eval_meets_publish_gate === true) return "list";
  if ((a?.eval_total ?? 0) > 0) return "eval";
  return "eval"; // has an agent, no eval yet → the gate is the next real step
}

export function buildLifecycleView(input: {
  agents: AgentLifecycleInput[];
  earningsAccruedUsd: number;
  walletBalanceUsd: number;
}): LifecycleView {
  const agentsIn = Array.isArray(input?.agents) ? input.agents : [];
  const balance = Number(input?.walletBalanceUsd);
  const lowBalance = Number.isFinite(balance) && balance < LOW_BALANCE_USD;
  return {
    earnings: {
      accrued_usd: Number.isFinite(input?.earningsAccruedUsd) ? input.earningsAccruedUsd : 0,
      payout_status: "coming_soon",
    },
    agents: agentsIn.map((a) => ({
      name: a.name,
      slug: a.slug,
      stage: agentStage(a),
      eval_pass_rate:
        (a?.eval_total ?? 0) > 0 && typeof a?.eval_meets_publish_gate === "boolean"
          ? (a.eval_meets_publish_gate ? 1 : 0)
          : null,
      live: a?.status === "live",
    })),
    fund_hint: lowBalance
      ? "Low balance — run `seldonframe wallet topup` to run marketplace tools/agents. (Not needed just to build and sell.)"
      : null,
  };
}
```

Note: `AgentLifecycle.stage` reuses `BuilderRungKind`; `"live"` is not a rung kind, so widen via `as BuilderRungKind` only there, OR extend `BuilderRungKind` — simplest: change `stage`'s type to `BuilderRungKind | "live"` and drop the cast. Use `stage: BuilderRungKind | "live"` in the type and `return "live"` without a cast.

Apply that correction: set `stage: BuilderRungKind | "live"` in `AgentLifecycle`, and in `agentStage` return type `BuilderRungKind | "live"`, removing the `as` cast.

- [ ] **Step 4: Run to verify it passes**
Run: `cd packages/crm && node --import tsx --test tests/unit/build/builder-ladder.spec.ts`
Expected: PASS (all `buildBuilderLadder` + `buildLifecycleView` tests).

- [ ] **Step 5: Commit**
```bash
git add packages/crm/src/lib/build/builder-ladder.ts packages/crm/tests/unit/build/builder-ladder.spec.ts
git commit -m "feat(build): buildLifecycleView — earnings + per-agent lifecycle + fund hint (pure)"
```

---

### Task 2: Additive `builder` lifecycle fields + the topup route

**Files:**
- Modify: `packages/crm/src/app/api/v1/workspace-state/route.ts` (extend the `builder` block; fold `getBuilderEarningsMicros` into the existing `Promise.all`)
- Create: `packages/crm/src/app/api/v1/build/wallet/topup/route.ts`

**Interfaces:**
- Consumes: `buildLifecycleView` (Task 1); `getBuilderEarningsMicros(orgId)`, `getWalletBalanceMicros(orgId)` from `@/lib/build/wallet-store`; `createWalletTopupCheckout({ orgId, amountCents }, deps)` + `buildWalletTopupCheckoutDeps()` from `@/lib/build/wallet-topup*`; `guardApiRequest`.
- Produces: the `builder` block gains `earnings`, `agents`, `fund_hint`; a new route `POST /api/v1/build/wallet/topup` returning `{ ok: true, checkoutUrl: string } | { ok: false, reason: string }`.

- [ ] **Step 1: Extend the builder block.** In `workspace-state/route.ts`:
  1. Add import: `import { buildBuilderLadder, deriveBuilderSignals, buildLifecycleView } from "@/lib/build/builder-ladder";` and add `getBuilderEarningsMicros` to the existing `wallet-store` import.
  2. Add `getBuilderEarningsMicros(orgId).catch(() => 0)` as a 6th element of the existing `Promise.all` (the one already returning `[..., marketplaceStatuses, walletMicros]`), capturing `earningsMicros`.
  3. Right after `const listingLinks = …`, add:
```ts
  const lifecycle = buildLifecycleView({
    agents: agentStats.map((a, i) => ({
      name: a.name,
      slug: a.slug,
      status: a.status,
      eval_total: a.stats.eval_total,
      eval_meets_publish_gate: a.stats.eval_meets_publish_gate,
      listed: Boolean(marketplaceStatuses[i]?.listed),
      priced: ["per_usage", "per_outcome"].includes(String(marketplaceStatuses[i]?.priceModel ?? "")),
    })),
    earningsAccruedUsd: Math.round((earningsMicros / 1_000_000) * 100) / 100,
    walletBalanceUsd: Math.round((walletMicros / 1_000_000) * 100) / 100,
  });
```
  Note: `marketplaceStatuses` is keyed per-org, not per-agent-index — if `agentStats[i]` and `marketplaceStatuses[i]` are not guaranteed aligned, match by slug instead: `marketplaceStatuses.find((m) => m.slug === a.slug)`. Use the slug match (safer).
  4. In the `builder: { … }` object, ADD three keys after `listing_links`:
```ts
      earnings: lifecycle.earnings,
      agents: lifecycle.agents,
      fund_hint: lifecycle.fund_hint,
```

- [ ] **Step 2: Verify the route compiles + operator path unchanged** — there is no unit test harness for this DB route; verify via the build gate in Step 5. Manually confirm `next_steps`/`counts`/`integrations` and the existing `builder.*` keys are untouched (only additions).

- [ ] **Step 3: Create the topup route** — `packages/crm/src/app/api/v1/build/wallet/topup/route.ts`:

```ts
// POST /api/v1/build/wallet/topup — start a Stripe Checkout that funds the
// caller's prepaid wallet. Bearer-authed (wst_) so the CLI + agents can call it.
// Reuses the SHIPPED createWalletTopupCheckout helper (the only money-IN call;
// self-gates on SF_MARKETPLACE_BILLING + a Stripe key → inert otherwise). The
// per-run path never touches Stripe.

import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/guard";
import { createWalletTopupCheckout } from "@/lib/build/wallet-topup";
import { buildWalletTopupCheckoutDeps } from "@/lib/build/wallet-topup-deps";

export async function POST(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;
  const orgId = guard.orgId;
  if (!orgId) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { amountUsd?: unknown };
  const amountUsd = Number(body?.amountUsd);
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    return NextResponse.json({ ok: false, reason: "invalid_amount" }, { status: 400 });
  }
  const amountCents = Math.floor(amountUsd * 100);

  const result = await createWalletTopupCheckout(
    { orgId, amountCents },
    buildWalletTopupCheckoutDeps(),
  );

  if (result.ok && result.url) {
    return NextResponse.json({ ok: true, checkoutUrl: result.url });
  }
  // Flag off / no Stripe key / helper skip → inert, honest reason (no charge path).
  return NextResponse.json(
    { ok: false, reason: result.ok ? "no_checkout_url" : result.reason },
    { status: result.ok ? 200 : 200 },
  );
}
```
  Note: confirm `createWalletTopupCheckout`'s return shape in `src/lib/build/wallet-topup.ts` matches `{ ok: true; url?: string } | { ok: false; reason: string }` (the shipped `topUpWalletAction` uses exactly `result.ok`, `result.url`, `result.reason`). Mirror it.

- [ ] **Step 4: Build gate**
Run: `cd packages/crm && pnpm typecheck 2>&1 | grep -v "\.next/types" ; pnpm build`
Expected: typecheck shows only stale `.next/types/validator.ts` artifacts (no `src/` errors); `pnpm build` exits 0.

- [ ] **Step 5: Commit**
```bash
git add packages/crm/src/app/api/v1/workspace-state/route.ts packages/crm/src/app/api/v1/build/wallet/topup/route.ts
git commit -m "feat(build): builder-block lifecycle fields + bearer-authed wallet topup route"
```

---

### Task 3: CLI — `status` + `wallet topup` + `pollUntilFunded`

**Files:**
- Modify: `packages/cli/src/lib/api-client.ts` (add `workspaceState()` + `walletTopup()`)
- Create: `packages/cli/src/commands/status.ts`
- Modify: `packages/cli/src/commands/marketplace.ts` (extend `runWalletCommand` for the `topup` subcommand) + `packages/cli/src/lib/poll.ts` (new)
- Modify: `packages/cli/src/cli.ts` (dispatch `status`), `packages/cli/src/lib/help.ts`
- Test: `packages/cli/tests/lifecycle.spec.ts` (new)

**Interfaces:**
- Consumes: `ApiClient`, `Writer`, `ParsedArgs`.
- Produces: `ApiClient.workspaceState(): Promise<WorkspaceState>`, `ApiClient.walletTopup(amountUsd): Promise<{ ok: boolean; checkoutUrl?: string; reason?: string }>`; `pollUntilFunded(deps): Promise<boolean>`; `runStatusCommand(args, client, writer)`.

- [ ] **Step 1: Write the failing test** — `packages/cli/tests/lifecycle.spec.ts`:

```ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { pollUntilFunded } from "../src/lib/poll.js";

describe("pollUntilFunded", () => {
  test("resolves true once the balance rises above the start", async () => {
    const balances = [10, 10, 30]; // rises on the 3rd read
    let i = 0;
    const ok = await pollUntilFunded({
      startUsd: 10,
      getBalanceUsd: async () => balances[Math.min(i++, balances.length - 1)]!,
      sleep: async () => {},
      maxAttempts: 5,
    });
    assert.equal(ok, true);
  });

  test("resolves false after maxAttempts if the balance never rises", async () => {
    const ok = await pollUntilFunded({
      startUsd: 10,
      getBalanceUsd: async () => 10,
      sleep: async () => {},
      maxAttempts: 3,
    });
    assert.equal(ok, false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**
Run: `cd packages/cli && node --import tsx --test tests/lifecycle.spec.ts`
Expected: FAIL — `../src/lib/poll.js` not found.

- [ ] **Step 3: Implement `pollUntilFunded`** — `packages/cli/src/lib/poll.ts`:

```ts
// poll — wait until a value crosses a threshold, with injected effects so it's
// unit-tested with zero timers. Used by `wallet topup` to confirm the Stripe
// webhook credited the wallet.

export type PollDeps = {
  startUsd: number;
  getBalanceUsd: () => Promise<number>;
  sleep: (ms: number) => Promise<void>;
  maxAttempts: number;
  intervalMs?: number;
};

/** Poll the balance; resolve true the first time it exceeds `startUsd`, or false
 *  after `maxAttempts`. Never throws (a failed read counts as "unchanged"). */
export async function pollUntilFunded(deps: PollDeps): Promise<boolean> {
  for (let attempt = 0; attempt < deps.maxAttempts; attempt++) {
    if (attempt > 0) await deps.sleep(deps.intervalMs ?? 3000);
    let current = deps.startUsd;
    try {
      current = await deps.getBalanceUsd();
    } catch {
      current = deps.startUsd;
    }
    if (current > deps.startUsd) return true;
  }
  return false;
}
```

- [ ] **Step 4: Run to verify it passes**
Run: `cd packages/cli && node --import tsx --test tests/lifecycle.spec.ts`
Expected: PASS.

- [ ] **Step 5: Add the ApiClient methods** — in `packages/cli/src/lib/api-client.ts`, add types + methods:

```ts
export type WorkspaceState = {
  ok: boolean;
  workspace?: { name?: string };
  builder?: {
    next_action?: string;
    progress?: { done: number; total: number };
    earnings?: { accrued_usd: number; payout_status: string };
    agents?: { name: string; slug: string; stage: string; live: boolean }[];
    wallet_balance_usd?: number;
    fund_hint?: string | null;
  };
};
```
Add methods to the `ApiClient` class:
```ts
  async workspaceState(): Promise<WorkspaceState> {
    return this.request<WorkspaceState>("GET", "/api/v1/workspace-state");
  }

  async walletTopup(amountUsd: number): Promise<{ ok: boolean; checkoutUrl?: string; reason?: string }> {
    return this.request<{ ok: boolean; checkoutUrl?: string; reason?: string }>(
      "POST",
      "/api/v1/build/wallet/topup",
      { amountUsd },
    );
  }
```

- [ ] **Step 6: Add `runStatusCommand`** — `packages/cli/src/commands/status.ts`:

```ts
import type { ApiClient, WorkspaceState } from "../lib/api-client.js";
import type { Writer } from "../lib/output.js";
import type { ParsedArgs } from "../lib/args.js";

/** `seldonframe status` — render the builder lifecycle view for a human. The
 *  agent reads the same `builder` block over MCP; this is the human twin. */
export async function runStatusCommand(args: ParsedArgs, client: ApiClient, writer: Writer): Promise<number> {
  if (!client.hasKey()) {
    writer.err("No key yet. Run `seldonframe login`.");
    return 1;
  }
  const state = await client.workspaceState();
  const b = state.builder;
  if (args.json) {
    writer.out(JSON.stringify(state.builder ?? {}, null, 2));
    return 0;
  }
  if (!b) {
    writer.out("No builder state yet — run `seldonframe login`, then ask your agent to build an agent.");
    return 0;
  }
  writer.out("SeldonFrame — your builder lifecycle");
  for (const a of b.agents ?? []) {
    writer.out(`  • ${a.name} (${a.slug}) — ${a.live ? "live" : a.stage}`);
  }
  writer.out(`  earnings: $${(b.earnings?.accrued_usd ?? 0).toFixed(2)} (${b.earnings?.payout_status === "coming_soon" ? "withdrawals coming soon" : b.earnings?.payout_status})`);
  writer.out(`  balance:  $${(b.wallet_balance_usd ?? 0).toFixed(2)}`);
  if (b.fund_hint) writer.out(`  ${b.fund_hint}`);
  if (b.next_action) writer.out(`\n→ Next: ${b.next_action}`);
  return 0;
}
```

- [ ] **Step 7: Extend `runWalletCommand` for `topup`** — in `packages/cli/src/commands/marketplace.ts`, in `runWalletCommand`, branch on `args.subcommand`. Add a `topup` branch (keep `balance` as the default):

```ts
  if (args.subcommand === "topup") {
    const amountUsd = Number(args.flags.amount);
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      writer.err("Usage: seldonframe wallet topup --amount <usd>  (e.g. --amount 20)");
      return 1;
    }
    const res = await client.walletTopup(amountUsd);
    if (!res.ok || !res.checkoutUrl) {
      writer.err(`Top-up unavailable (${res.reason ?? "unknown"}). Fund at https://app.seldonframe.com/build/wallet.`);
      return 1;
    }
    const start = (await client.walletBalance()).balance.value;
    writer.out(`Open this to pay $${amountUsd.toFixed(2)}:\n  ${res.checkoutUrl}`);
    writer.out("Waiting for payment…");
    const funded = await pollUntilFunded({
      startUsd: start,
      getBalanceUsd: async () => (await client.walletBalance()).balance.value,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      maxAttempts: 40,
    });
    writer.out(funded ? `✓ funded $${amountUsd.toFixed(2)}.` : "Still processing — check https://app.seldonframe.com/build/wallet.");
    return 0;
  }
```
Add the import `import { pollUntilFunded } from "../lib/poll.js";` to `marketplace.ts`. Confirm `walletBalance()` returns `{ balance: { value: number } }` (the `WalletBalance` type) — it does.

- [ ] **Step 8: Wire `status` into dispatch + help** — in `packages/cli/src/cli.ts` add `import { runStatusCommand } from "./commands/status.js";` and a case `case "status": return runStatusCommand(args, buildClient(), writer);`. In `packages/cli/src/lib/help.ts` add under COMMANDS: `  status                               Your lifecycle: agents · earnings · balance · next action` and under `wallet balance`: `  wallet topup --amount <usd>          Fund your prepaid wallet (Stripe Checkout)`.

- [ ] **Step 9: Full CLI gate**
Run: `cd packages/cli && npm test && npm run build`
Expected: all tests pass (existing 91 + the new `pollUntilFunded` tests); `tsc` exits 0.

- [ ] **Step 10: Commit**
```bash
git add packages/cli/src packages/cli/tests/lifecycle.spec.ts
git commit -m "feat(cli): seldonframe status + wallet topup (poll-to-funded)"
```

---

### Task 4: Final verification + push

- [ ] **Step 1: CRM build gate** — `cd packages/crm && pnpm check:use-server && pnpm build` → both green.
- [ ] **Step 2: CLI gate** — `cd packages/cli && npm test && npm run build` → green.
- [ ] **Step 3: Push** — `git fetch origin && git push origin HEAD:main` (fast-forward; if diverged, stop and reconcile — the icp3-wedge worktree is shared).
- [ ] **Step 4: Report** — the surface + funding shipped; deploy verb + Connect payout remain as the named fast-follows.

---

## Self-review notes
- **Spec coverage:** unified surface (Task 1 view + Task 2 builder-block fields + Task 3 `status`) ✓; funding (Task 2 topup route + Task 3 `wallet topup` + poll) ✓; money-safety (reuse `createWalletTopupCheckout`, no migration) ✓; honesty (`payout_status: "coming_soon"`) ✓.
- **fund_hint** simplified to a low-balance (<$1) NON-blocking note (the spec's `hasConsumed` gate is deferred YAGNI — the note is informational, never the `next_action`, so it does not nag pure sellers). Documented in Task 1.
- **Type consistency:** `AgentLifecycleInput`/`AgentLifecycle`/`LifecycleView`/`buildLifecycleView` used identically in Tasks 1–3; `WorkspaceState.builder` mirrors the route's `builder` block keys.
- **Open item resolved:** the topup route reuses `createWalletTopupCheckout` (the pure helper the shipped `topUpWalletAction` wraps), NOT the cookie-based action — because the route is bearer-authed.
