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

  // Count completion from the `done` map BEFORE flipping the current rung — when
  // every gate is met the terminal `observe` rung becomes "current" (ongoing) but
  // still counts as complete, so progress reads 6/6 (finished), not 5/6.
  const doneCount = Object.values(done).filter(Boolean).length;

  const firstTodo = rungs.find((r) => r.status === "todo");
  const current = firstTodo ?? rungs[rungs.length - 1]!;
  current.status = "current";

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

// ── the full lifecycle view (superset of the sell ladder) ─────────────────────
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
  stage: BuilderRungKind | "live";
  eval_pass_rate: number | null;
  live: boolean;
};
export type LifecycleView = {
  earnings: { accrued_usd: number; payout_status: "coming_soon" };
  agents: AgentLifecycle[];
  fund_hint: string | null;
};

const LOW_BALANCE_USD = 1;

function agentStage(a: AgentLifecycleInput): BuilderRungKind | "live" {
  if (a?.status === "live") return "live";
  if (a?.listed && !a?.priced) return "price";
  if (a?.listed) return "list";
  if (a?.eval_meets_publish_gate === true) return "list";
  return "eval";
}

export function buildLifecycleView(input: {
  agents?: AgentLifecycleInput[];
  earningsAccruedUsd?: number;
  walletBalanceUsd?: number;
}): LifecycleView {
  const agentsIn = Array.isArray(input?.agents) ? input.agents : [];
  const balance = Number(input?.walletBalanceUsd);
  const lowBalance = Number.isFinite(balance) && balance < LOW_BALANCE_USD;
  const earningsUsd = Number(input?.earningsAccruedUsd);
  return {
    earnings: {
      accrued_usd: Number.isFinite(earningsUsd) ? earningsUsd : 0,
      payout_status: "coming_soon",
    },
    agents: agentsIn.map((a) => ({
      name: a.name,
      slug: a.slug,
      stage: agentStage(a),
      eval_pass_rate:
        (a?.eval_total ?? 0) > 0 && typeof a?.eval_meets_publish_gate === "boolean"
          ? a.eval_meets_publish_gate
            ? 1
            : 0
          : null,
      live: a?.status === "live",
    })),
    fund_hint: lowBalance
      ? "Low balance — run `seldonframe wallet topup` to run marketplace tools/agents. (Not needed just to build and sell.)"
      : null,
  };
}
