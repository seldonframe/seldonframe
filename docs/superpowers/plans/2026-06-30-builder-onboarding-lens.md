# Builder Onboarding — the Builder Lens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a builder connects the MCP, the first `get_workspace_state` response carries a builder-framed **build→sell ladder** (current rung + the one next action) and the rewritten SKILL.md acts as the onboarding host — so a builder is never mis-oriented into the SMB operator view.

**Architecture:** Thin harness, fat skill (spec `docs/superpowers/specs/2026-06-30-builder-onboarding-lens-design.md`, approach B additive). A pure `builder-ladder.ts` computes the ladder from cheap signals; `get_workspace_state` attaches it as an **additive** `builder` block (operator path byte-for-byte unchanged); the SKILL.md is the lens that directs the agent to follow the block and ignore CRM furniture. No migration, no new MCP tool, no persisted flag.

**Tech Stack:** TypeScript, Next.js App Router (route handler), Drizzle, `node --import tsx --test` (node:test + `node:assert/strict`), pnpm workspace. All new logic is PURE (no DB/clock/`"use server"`) and unit-tested; the route change is additive wiring verified by typecheck + build.

---

## File Structure

- **Create** `packages/crm/src/lib/build/builder-ladder.ts` — pure: `BuilderSignals`/`BuilderRung`/`BuilderLadder` types, `buildBuilderLadder(signals)` (the 6-rung ladder + current rung + next action), and `deriveBuilderSignals(input)` (maps the route's already-computed data → signals). One responsibility: the ladder logic. No I/O.
- **Create** `packages/crm/tests/unit/build/builder-ladder.spec.ts` — exhaustive rung-transition tests.
- **Modify** `packages/crm/src/app/api/v1/workspace-state/route.ts` — additive: fold two cheap reads into the existing `Promise.all`, derive signals, attach a `builder` block. `next_steps`/`counts`/`integrations` untouched.
- **Modify** `packages/crm/src/lib/build/skill-md.ts` — add the "Start here" director section (call `get_workspace_state` first, read the `builder` block, ignore counts/operator next_steps, 401→reconnect); the ladder tools already appear from prior work.
- **Modify** `packages/crm/tests/unit/build/skill-md.spec.ts` — pin the new director instructions.
- **Modify (Task 4, flagged)** `packages/crm/src/lib/build/skill-md.ts` + `developer-key.ts` + `src/app/docs/getting-started/connect-claude-code/page.tsx` + `QUICKSTART.md` — unify on ONE working connect recipe after a deployment check.

---

## Task 1: The pure builder ladder

**Files:**
- Create: `packages/crm/src/lib/build/builder-ladder.ts`
- Test: `packages/crm/tests/unit/build/builder-ladder.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/crm/tests/unit/build/builder-ladder.spec.ts`:

```ts
// The builder onboarding ladder — pure rung logic (spec 2026-06-30-builder-
// onboarding-lens). Pins each transition build→test→eval→list→price→observe,
// the current-rung = first-not-done rule, the soft test rung, and the load-
// bearing next-action copy the SKILL surfaces.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  buildBuilderLadder,
  deriveBuilderSignals,
  type BuilderSignals,
} from "../../../src/lib/build/builder-ladder";

const EMPTY: BuilderSignals = {
  hasAgent: false,
  evalHasRun: false,
  evalPassesGate: false,
  hasListing: false,
  hasPrice: false,
};

describe("buildBuilderLadder", () => {
  test("empty workspace → current rung is Build, next action asks to describe", () => {
    const l = buildBuilderLadder(EMPTY);
    assert.equal(l.currentRung, "build");
    assert.match(l.nextAction, /describe/i);
    assert.equal(l.progress.done, 0);
    assert.equal(l.progress.total, 6);
    assert.equal(l.rungs.length, 6);
  });

  test("has an agent, nothing else → current rung is Test (send_conversation_turn)", () => {
    const l = buildBuilderLadder({ ...EMPTY, hasAgent: true });
    assert.equal(l.currentRung, "test");
    assert.equal(l.rungs.find((r) => r.kind === "build")?.status, "done");
    assert.equal(l.rungs.find((r) => r.kind === "test")?.tool, "send_conversation_turn");
  });

  test("an eval has run but the gate is not met → current rung is Eval", () => {
    // Test is SOFT: it flips to done once an eval has run, so progression lands
    // on the real gate.
    const l = buildBuilderLadder({ ...EMPTY, hasAgent: true, evalHasRun: true });
    assert.equal(l.currentRung, "eval");
    assert.equal(l.rungs.find((r) => r.kind === "test")?.status, "done");
    assert.equal(l.rungs.find((r) => r.kind === "eval")?.tool, "run_agent_evals");
  });

  test("gate met, not listed → current rung is List (the self-adapt case)", () => {
    const l = buildBuilderLadder({ ...EMPTY, hasAgent: true, evalPassesGate: true });
    assert.equal(l.currentRung, "list");
    assert.equal(l.rungs.find((r) => r.kind === "eval")?.status, "done");
  });

  test("listed, not priced → current rung is Price", () => {
    const l = buildBuilderLadder({
      ...EMPTY,
      hasAgent: true,
      evalPassesGate: true,
      hasListing: true,
    });
    assert.equal(l.currentRung, "price");
    assert.equal(l.rungs.find((r) => r.kind === "price")?.tool, "set_usage_price");
  });

  test("all done → current rung is Observe & earn, progress 6/6", () => {
    const l = buildBuilderLadder({
      hasAgent: true,
      evalHasRun: true,
      evalPassesGate: true,
      hasListing: true,
      hasPrice: true,
    });
    assert.equal(l.currentRung, "observe");
    assert.match(l.nextAction, /wallet|earn|brain/i);
    assert.equal(l.progress.done, 6);
  });

  test("is deterministic and tolerates a malformed signal object", () => {
    const a = buildBuilderLadder(EMPTY);
    const b = buildBuilderLadder(EMPTY);
    assert.deepEqual(a, b);
    // @ts-expect-error — exercise the jsonb-edge tolerance
    assert.equal(buildBuilderLadder(undefined).currentRung, "build");
  });
});

describe("deriveBuilderSignals", () => {
  test("maps agent/eval/listing data to signals", () => {
    const s = deriveBuilderSignals({
      agentCount: 1,
      agentStats: [{ eval_total: 11, eval_meets_publish_gate: true }],
      marketplaceStatuses: [{ listed: true, priceModel: "per_usage" }],
    });
    assert.deepEqual(s, {
      hasAgent: true,
      evalHasRun: true,
      evalPassesGate: true,
      hasListing: true,
      hasPrice: true,
    });
  });

  test("a listed-but-unpriced (onetime/free) listing is not hasPrice", () => {
    const s = deriveBuilderSignals({
      agentCount: 1,
      agentStats: [{ eval_total: 0, eval_meets_publish_gate: null }],
      marketplaceStatuses: [{ listed: true, priceModel: "onetime" }],
    });
    assert.equal(s.hasListing, true);
    assert.equal(s.hasPrice, false);
    assert.equal(s.evalHasRun, false);
  });

  test("tolerates empty/malformed input", () => {
    // @ts-expect-error — jsonb edge
    const s = deriveBuilderSignals({});
    assert.equal(s.hasAgent, false);
    assert.equal(s.hasListing, false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/crm && node --import tsx --test tests/unit/build/builder-ladder.spec.ts`
Expected: FAIL — `Cannot find module '.../builder-ladder'`.

- [ ] **Step 3: Write the implementation**

Create `packages/crm/src/lib/build/builder-ladder.ts`:

```ts
// builder-ladder.ts — the builder onboarding LADDER (pure; no DB, no I/O, no
// clock, no "use server"). Mirror of buildOnboardingSteps (the buyer wizard
// engine): turns a small signal object about the builder's progress into the
// ordered build→sell rungs with the CURRENT rung + the ONE next action. The
// get_workspace_state route gathers the signals (deriveBuilderSignals) and
// attaches the result as the response's additive `builder` block; SKILL.md (the
// lens) directs the agent to follow it and ignore the operator furniture.

export type BuilderRungKind =
  | "build"
  | "test"
  | "eval"
  | "list"
  | "price"
  | "observe";

export type BuilderRungStatus = "done" | "current" | "todo";

export type BuilderRung = {
  kind: BuilderRungKind;
  label: string;
  status: BuilderRungStatus;
  /** The narrated next-action copy (load-bearing — the SKILL surfaces it). */
  action: string;
  /** The MCP tool for this rung. */
  tool: string;
};

/** The signals the ladder needs — all cheaply derivable in the route. */
export type BuilderSignals = {
  hasAgent: boolean;
  /** Any agent has ≥1 recorded eval (drives the SOFT "test done"). */
  evalHasRun: boolean;
  /** Any agent meets the ≥87.5% publish gate. */
  evalPassesGate: boolean;
  hasListing: boolean;
  /** A listing carries a usage price (per_usage | per_outcome). */
  hasPrice: boolean;
};

export type BuilderLadder = {
  rungs: BuilderRung[];
  currentRung: BuilderRungKind;
  nextAction: string;
  progress: { done: number; total: number };
};

// The six rungs, in order, with their copy + tool. `action` strings are
// load-bearing (the SKILL surfaces them; tests pin their intent).
const RUNGS: { kind: BuilderRungKind; label: string; action: string; tool: string }[] = [
  {
    kind: "build",
    label: "Build",
    action:
      "Describe the agent you want to sell (e.g. a 24/7 receptionist that books jobs). I'll build it from one sentence.",
    tool: "create_agent",
  },
  {
    kind: "test",
    label: "Test",
    action: "Try it like a customer before you sell it.",
    tool: "send_conversation_turn",
  },
  {
    kind: "eval",
    label: "Eval",
    action: "Run its evals — publishing a live agent needs a ≥87.5% pass rate.",
    tool: "run_agent_evals",
  },
  {
    kind: "list",
    label: "List",
    action: "List it on the marketplace so buyers and other agents can find it.",
    tool: "publish_agent",
  },
  {
    kind: "price",
    label: "Price",
    action:
      "Set your price — per call or per outcome. Listing is free; you keep 95%.",
    tool: "set_usage_price",
  },
  {
    kind: "observe",
    label: "Observe & earn",
    action:
      "Live on the marketplace. Watch runs with tail_agent_conversations, earnings at /build/wallet. The Brain logs every run and feeds the lessons into your next build.",
    tool: "tail_agent_conversations",
  },
];

/**
 * Compute the builder's ladder from the signals. Pure; never throws (a
 * malformed/undefined signal object degrades to the Build rung).
 *
 * HARD gates drive progression: build (hasAgent) → eval (evalPassesGate) → list
 * (hasListing) → price (hasPrice) → observe (all done). "Test" is SOFT: it never
 * blocks — it's `done` once an eval has run (you test before you eval) and is
 * otherwise the recommended action right after build. Current = first not-`done`
 * rung; its `action` is the single next action.
 */
export function buildBuilderLadder(signals: BuilderSignals): BuilderLadder {
  const s = (signals ?? {}) as Partial<BuilderSignals>;
  const done: Record<BuilderRungKind, boolean> = {
    build: Boolean(s.hasAgent),
    test: Boolean(s.evalHasRun || s.evalPassesGate),
    eval: Boolean(s.evalPassesGate),
    list: Boolean(s.hasListing),
    price: Boolean(s.hasPrice),
    observe: Boolean(s.hasAgent && s.evalPassesGate && s.hasListing && s.hasPrice),
  };

  const rungs: BuilderRung[] = RUNGS.map((r) => ({
    kind: r.kind,
    label: r.label,
    action: r.action,
    tool: r.tool,
    status: done[r.kind] ? "done" : "todo",
  }));

  const firstTodo = rungs.find((r) => r.status === "todo");
  const current = firstTodo ?? rungs[rungs.length - 1]!;
  current.status = "current";

  const doneCount = rungs.filter((r) => r.status === "done").length;

  return {
    rungs,
    currentRung: current.kind,
    nextAction: current.action,
    progress: { done: doneCount, total: rungs.length },
  };
}

/** The route's already-computed shapes the signals are derived from. */
export type BuilderSignalInput = {
  agentCount: number;
  agentStats: { eval_total: number; eval_meets_publish_gate: boolean | null }[];
  marketplaceStatuses: { listed: boolean; priceModel: string }[];
};

/** Usage-priced models (set by set_usage_price) — presence ⇒ hasPrice. */
const USAGE_PRICED = new Set(["per_usage", "per_outcome"]);

/**
 * Map the route's already-computed data (agent stats + marketplace statuses)
 * onto `BuilderSignals`. Pure; shape-tolerant. Keeps the route a thin gatherer.
 */
export function deriveBuilderSignals(input: BuilderSignalInput): BuilderSignals {
  const stats = Array.isArray(input?.agentStats) ? input.agentStats : [];
  const statuses = Array.isArray(input?.marketplaceStatuses)
    ? input.marketplaceStatuses
    : [];
  return {
    hasAgent: (input?.agentCount ?? 0) > 0,
    evalHasRun: stats.some((a) => (a?.eval_total ?? 0) > 0),
    evalPassesGate: stats.some((a) => a?.eval_meets_publish_gate === true),
    hasListing: statuses.some((l) => l?.listed === true),
    hasPrice: statuses.some(
      (l) => l?.listed === true && USAGE_PRICED.has(l?.priceModel),
    ),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/crm && node --import tsx --test tests/unit/build/builder-ladder.spec.ts`
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/lib/build/builder-ladder.ts packages/crm/tests/unit/build/builder-ladder.spec.ts
git commit -m "feat(build): pure builder onboarding ladder (build→sell rungs)"
```

---

## Task 2: Attach the additive `builder` block in get_workspace_state

**Files:**
- Modify: `packages/crm/src/app/api/v1/workspace-state/route.ts` (the `Promise.all` at ~183-199; the response object at ~227-269)

This task is additive route wiring — verified by typecheck + build (the repo does not DB-unit-test routes; the ladder logic it depends on is fully unit-tested in Task 1).

- [ ] **Step 1: Add the imports**

At the top of `route.ts`, alongside the existing imports, add:

```ts
import { buildBuilderLadder, deriveBuilderSignals } from "@/lib/build/builder-ladder";
import { loadAgentMarketplaceStatusForOrg } from "@/lib/marketplace/agent-marketplace-status";
import { getWalletBalanceMicros } from "@/lib/build/wallet-store";
```

- [ ] **Step 2: Fold the two builder reads into the existing `Promise.all`**

Replace the counts `Promise.all` (currently `const [contactsCount, bookingsCount, dealsCount] = await Promise.all([...])`) so the two builder reads run concurrently with the counts (no added latency). The builder reads are fail-soft — a throw degrades to empty/zero so the block still renders:

```ts
const [contactsCount, bookingsCount, dealsCount, marketplaceStatuses, walletMicros] =
  await Promise.all([
    db
      .select({ n: count() })
      .from(contacts)
      .where(eq(contacts.orgId, orgId))
      .then((r) => Number(r[0]?.n ?? 0)),
    db
      .select({ n: count() })
      .from(bookings)
      .where(eq(bookings.orgId, orgId))
      .then((r) => Number(r[0]?.n ?? 0)),
    db
      .select({ n: count() })
      .from(deals)
      .where(eq(deals.orgId, orgId))
      .then((r) => Number(r[0]?.n ?? 0)),
    // Builder-lens reads (fail-soft → the block still renders on error).
    loadAgentMarketplaceStatusForOrg(orgId)
      .then((m) => [...m.values()])
      .catch(() => [] as { listed: boolean; priceModel: string }[]),
    getWalletBalanceMicros(orgId).catch(() => 0),
  ]);
```

Note (confirmed signatures): `loadAgentMarketplaceStatusForOrg(orgId): Promise<Map<string, AgentMarketplaceStatus>>`, so `[...m.values()]` yields the per-listing `AgentMarketplaceStatus[]` (each has `listed`, `priceModel`, `slug`). `getWalletBalanceMicros(orgId): Promise<number>` (defaults to test-mode balance).

- [ ] **Step 3: Compute the builder block before the response**

Immediately before the `return NextResponse.json({...})`, add:

```ts
const builderSignals = deriveBuilderSignals({
  agentCount: agentRows.length,
  agentStats: agentStats.map((a) => ({
    eval_total: a.stats.eval_total,
    eval_meets_publish_gate: a.stats.eval_meets_publish_gate,
  })),
  marketplaceStatuses: marketplaceStatuses.map((l) => ({
    listed: Boolean(l?.listed),
    priceModel: String(l?.priceModel ?? "onetime"),
  })),
});
const builderLadder = buildBuilderLadder(builderSignals);
const listingLinks = marketplaceStatuses
  .filter((l) => l?.listed && (l as { slug?: string }).slug)
  .map((l) => `/marketplace/${(l as { slug?: string }).slug}`);
```

- [ ] **Step 4: Attach the `builder` block to the response (additive)**

Inside the `NextResponse.json({ ... })`, after the existing `next_steps: composeNextSteps({...})`, add a trailing `builder` key (leave every other field untouched):

```ts
    builder: {
      goal: "Build and sell an AI agent — from your IDE.",
      current_rung: builderLadder.currentRung,
      next_action: builderLadder.nextAction,
      progress: builderLadder.progress,
      rungs: builderLadder.rungs,
      wallet_balance_usd: Math.round((walletMicros / 1_000_000) * 100) / 100,
      listing_links: listingLinks,
    },
```

- [ ] **Step 5: Verify typecheck + build**

Run: `cd packages/crm && pnpm typecheck 2>&1 | grep -v "\.next/types" | grep -E "workspace-state|builder-ladder" || echo "no errors in touched files"`
Expected: no errors in the touched files (pre-existing `.next/types/validator.ts` staleness is filtered out and cleared by the real build).

- [ ] **Step 6: Commit**

```bash
git add packages/crm/src/app/api/v1/workspace-state/route.ts
git commit -m "feat(build): attach additive builder-lens block to get_workspace_state"
```

---

## Task 3: SKILL.md becomes the lens (director)

**Files:**
- Modify: `packages/crm/src/lib/build/skill-md.ts`
- Test: `packages/crm/tests/unit/build/skill-md.spec.ts`

- [ ] **Step 1: Write the failing test (add pins)**

In `packages/crm/tests/unit/build/skill-md.spec.ts`, add this test inside the `describe("buildSkillMd", ...)` block:

```ts
  test("is the builder LENS: call get_workspace_state first, read the builder block, ignore operator furniture", () => {
    // The director instructions — a builder-agent must orient to the ladder, not
    // the SMB dashboard, and must recover from the stale-key 401.
    assert.match(md, /get_workspace_state/);
    assert.match(md, /builder\b/i);
    assert.match(md, /ignore|not for builders|operator/i);
    assert.match(md, /next_steps|counts/);
    assert.match(md, /401|reconnect/i);
    // The build→sell arc names its rung tools.
    for (const tool of ["create_agent", "send_conversation_turn", "run_agent_evals", "publish_agent", "set_usage_price", "tail_agent_conversations"]) {
      assert.ok(md.includes(tool), `SKILL.md should name ${tool}`);
    }
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/crm && node --import tsx --test tests/unit/build/skill-md.spec.ts`
Expected: FAIL — the new test fails on `/get_workspace_state/` (not yet in SKILL.md).

- [ ] **Step 3: Add the "Start here" director section**

In `packages/crm/src/lib/build/skill-md.ts`, inside the `buildSkillMd()` template, insert this section immediately AFTER the intro blockquote and BEFORE `## 1. Connect the SeldonFrame MCP` (so it is the first instruction the agent reads):

```ts
## Start here — you are the builder's guide

The moment you're connected, call **\`get_workspace_state\`** and read its
**\`builder\`** block. It tells you the builder's current rung on the build→sell
ladder and the ONE next action. **Follow the \`builder\` block. Ignore the
\`counts\` (contacts / bookings / deals) and the operator \`next_steps\` — those
are for SMB operators, not builders.** Your job is to help the human **build an
agent to SELL**, one rung at a time:

> **build → test → eval → list → price → observe & earn**

Move one rung at a time, narrate what each step does and what it costs or earns,
and don't touch the CRM tools unless the human explicitly asks. If
\`get_workspace_state\` returns **401**, the key didn't load into the MCP process
— tell the human to reconnect (\`/mcp\` → reconnect, or restart the IDE), then
retry.
```

(The rung tools — `create_agent`, `send_conversation_turn`, `run_agent_evals`, `publish_agent`, `set_usage_price`, `tail_agent_conversations` — already appear in sections 3–6 from prior work; leave them.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/crm && node --import tsx --test tests/unit/build/skill-md.spec.ts`
Expected: PASS — the new pin + all existing pins green.

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/lib/build/skill-md.ts packages/crm/tests/unit/build/skill-md.spec.ts
git commit -m "feat(build): SKILL.md is the builder lens — orient to the ladder, ignore operator furniture"
```

---

## Task 4: One canonical connect recipe (VERIFY-then-unify — may defer)

**Context:** The builder connected via **stdio** (`claude mcp add seldonframe -e SELDONFRAME_API_KEY=wst_… -- npx -y @seldonframe/mcp@latest`), but SKILL.md + `/build` document **hosted HTTP** (`https://mcp.seldonframe.com/v1 --header "Authorization: Bearer wst_…"`). Two recipes = confusion. **Do not guess which is canonical — verify which endpoint is actually deployed first.**

**Files (once the working recipe is known):**
- Modify: `packages/crm/src/lib/build/skill-md.ts` (`SKILL_MD_MCP_URL` + the connect block)
- Modify: `packages/crm/src/lib/build/developer-key.ts` (`buildMcpConnectSnippet`)
- Modify: `packages/crm/src/app/docs/getting-started/connect-claude-code/page.tsx`
- Modify: `QUICKSTART.md`

- [ ] **Step 1: Verify the deployed transport**

Run: `curl -s -o /dev/null -w "%{http_code}" https://mcp.seldonframe.com/v1` (expect a non-000 HTTP status if the hosted MCP is deployed). Confirm with the user which recipe they want as canonical if both work. **If the hosted endpoint is NOT deployed, the canonical is the stdio `npx @seldonframe/mcp` recipe** — standardize on that and demote hosted-HTTP to "coming soon."

- [ ] **Step 2: Unify the surfaces on the confirmed recipe**

Edit the four files above so all show the SAME one command; add a one-line footnote for the alternative. (Exact strings depend on Step 1's outcome — do not pre-write them.)

- [ ] **Step 3: Update pins + commit**

Update `skill-md.spec.ts` / `landing-content.spec.ts` connect assertions to match the confirmed recipe. Run the build specs (`node --import tsx --test tests/unit/build/*.spec.ts`), then:

```bash
git add packages/crm/src QUICKSTART.md
git commit -m "docs(build): one canonical MCP connect recipe"
```

> If Step 1 can't be resolved in this session (endpoint status unknown), **defer Task 4** — Tasks 1–3 deliver the builder lens independently. Note the deferral in the review section.

---

## Task 5: Full verify gate

**Files:** none (verification only)

- [ ] **Step 1: Run the touched specs**

Run: `cd packages/crm && node --import tsx --test tests/unit/build/builder-ladder.spec.ts tests/unit/build/skill-md.spec.ts tests/unit/build/landing-content.spec.ts tests/unit/build/render-build-markdown.spec.ts`
Expected: all green.

- [ ] **Step 2: Typecheck**

Run: `cd packages/crm && pnpm typecheck 2>&1 | grep -v "\.next/types/validator" || echo "clean (only stale .next artifacts, cleared by build)"`
Expected: no errors outside `.next/types/validator.ts`.

- [ ] **Step 3: use-server guard**

Run: `cd packages/crm && pnpm check:use-server`
Expected: `✓ All 'use server' files export only async functions / types.`

- [ ] **Step 4: Full build (the real gate — regenerates the validator)**

Run: `cd packages/crm && pnpm build`
Expected: exit 0; the route tree prints `/build`, `/build/keys`, etc.

- [ ] **Step 5: Push to main**

```bash
git push origin HEAD:main
```

---

## Review

**Executed inline 2026-06-30.** Tasks 1–3 landed (per-task commits); Task 4 **deferred**; Task 5 verify passed.

- **Task 1** — `builder-ladder.ts` (`buildBuilderLadder` + `deriveBuilderSignals`), 10 tests. TDD caught a real bug: flipping the terminal `observe` rung to "current" dropped it from the status-based done count (5/6 not 6/6) → fixed by counting from the `done` map before the flip.
- **Task 2** — additive `builder` block on `get_workspace_state`; the marketplace-status + wallet reads fold into the existing `Promise.all` (no added latency, fail-soft); `counts`/`integrations`/`next_steps` untouched.
- **Task 3** — SKILL.md "Start here" director section: call `get_workspace_state` first, follow the `builder` block, ignore counts/operator next_steps, 401→reconnect.
- **Task 4 — DEFERRED.** `mcp.seldonframe.com/v1` probes **404** on a bare GET (ambiguous — MCP Streamable-HTTP endpoints often 404 without a POST handshake), while the builder connected successfully via **npx stdio** (`npx @seldonframe/mcp`). Rewriting the connect docs on a guess risks documenting a non-working recipe — needs a call on which transport works end-to-end, then unify SKILL.md + developer-key + docs + QUICKSTART. **Open.**
- **Task 5** — 44 build specs pass, typecheck clean (only stale `.next/validator`), check:use-server clean, `pnpm build` green.

**Live-smoke (owner):** paste `set up https://seldonframe.com/SKILL.md` into a Claude Code OUTSIDE the repo → the agent should read the `builder` block and drive the ladder (build → … → observe), not the operator dashboard.
