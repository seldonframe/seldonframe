// Agent Eval Harness — E6: eval a LIVE DEPLOYED agent through the REAL DB-bound
// runtime (executeTurn), MONEY-SAFE.
//
// E5 (run-agent-evals.ts) evals a TEMPLATE via runStatelessAgentTurn — zero
// persistence, identity-neutral, testMode. This module is the promised follow-up
// (see the E5 header note): a path that exercises the REAL runtime `executeTurn`
// (src/lib/agents/runtime.ts) against a DEPLOYED `agents` row — so the eval runs
// the agent EXACTLY as a customer would hit it: real conversation persistence
// (agent_turns rows), the validator-regen loop, conversation aggregates, and the
// activity bridge — but WITHOUT actually texting a customer or booking a real slot.
//
// ─── THE SEND-STUB SEAM (why this is money-safe) ──────────────────────────────
//
// executeTurn derives every tool's ToolExecuteContext.testMode from
// `conv.status === "test"` (runtime.ts: `testMode: conv.status === "test"`). So a
// throwaway conversation created with status:"test" makes EVERY native WRITE tool
// short-circuit to a synthetic result BEFORE any DB write or external send:
//   • book_appointment   → { ok:true, testMode:true, bookingId:"test-…" } (no submitBooking)
//   • escalate_to_human  → { ok:true, ticketId:"test-…" }                 (no portal/activity write)
//   • take_message       → { ok:true, spoken:… }                          (no contact upsert, no notifyOperator→sendSmsFromApi)
// The activity bridge is also gated `conv.status !== "test"`, so even the
// first-turn CRM activity is skipped. Read-only tools (look_up_availability) still
// run, so the agent demonstrates realistic behaviour. This is the SAME seam the
// Studio test panel + the eval-runner (eval-runner.ts) already rely on.
//
// ─── THE SAFETY BOUNDARY this module ENFORCES ─────────────────────────────────
//
// testMode covers the NATIVE write tools. Two surfaces are NOT covered by it, so
// this module refuses to run an eval that could reach them:
//   1. MCP-WRAPPED CONNECTOR TOOLS (blueprint.connectors). wrap-tool.ts never
//      inspects ctx.testMode — a bound connector tool would make a REAL external
//      call (Slack post, HubSpot write, …) even in a test conversation. So if the
//      deployed agent has ANY connectors bound, we FAIL-CLOSED (no eval) rather
//      than risk a real side-effect. (A future "stub the MCP transport" seam could
//      lift this; until then, native-only is the safe set.)
//   2. The PLUGGABLE CALENDAR BACKEND (executeTurn's bookingBinding → a real
//      Composio calendar). We deliberately pass NO bookingBinding, so booking stays
//      on the native path (which honours testMode). We also pass NO persona — the
//      agent is evaluated AS DEPLOYED from its own blueprint.
// Net: native tools + status:"test" + no connectors + no binding ⇒ provably no
// real SMS / booking / external send. That is the only configuration this module
// will run; anything else returns a guard error and runs nothing.
//
// ─── DI / TESTABILITY ─────────────────────────────────────────────────────────
//
// Mirrors the E5 split: this is a PLAIN module (no "use server"), and ALL I/O —
// executeTurn, the throwaway-conversation create/cleanup, the deployed-agent load,
// the sim/grader/lessons store — is injected via deps. `defaultDeployedEvalDeps()`
// lazily imports `@/db` + `./runtime` ONLY when called, so the unit tests inject
// fakes and never open a Postgres connection or hit Anthropic. Per-scenario
// fail-soft is inherited from runAgentEvals (the E5 core we delegate to).

import type { AgentBlueprint } from "@/db/schema/agents";
import type { AgentMemoryStore } from "@/lib/agents/memory/agent-memory";
import { runAgentEvals, type RunAgentEvalsResult } from "./run-agent-evals";
import type { AgentReply, SimCustomerReply } from "./run-scenario";
import type { EvalGrader } from "./score";
import type { ScenarioGenerator } from "./generate-scenarios";
import type { EvalTurn } from "./eval-types";

// ─── the executeTurn shape the adapter drives (structural, DB-free) ───────────
//
// We model ONLY what the adapter needs from runtime.ts's executeTurn so a fake can
// stand in without pulling `@/db`. The real executeTurn returns a richer union;
// this is the structural subset we read.
export type ExecuteTurnFn = (input: {
  conversationId: string;
  userMessage: string;
}) => Promise<
  | { ok: true; assistantMessage: string }
  | { ok: false; reason: string; fallbackMessage?: string }
>;

/** What we need to know about the deployed agent to (a) build a real eval against
 *  it and (b) prove it's safe to run (no connectors). */
export type DeployedAgentInfo = {
  agentId: string;
  orgId: string;
  /** The agent's LIVE blueprint — drives scenario generation (E4). */
  blueprint: AgentBlueprint;
  /** The agent version, stamped on the throwaway conversation row. */
  agentVersion: number;
};

/** The DB-touching lifecycle the adapter needs, injected so tests stay DB-free. */
export type DeployedEvalDeps = {
  /** Load the deployed agent (verifies it exists + belongs to the org). Returns
   *  null when not found / not owned — the run then guards out cleanly. */
  loadAgent: (args: {
    agentId: string;
    orgId: string;
  }) => Promise<DeployedAgentInfo | null>;
  /** Create ONE throwaway eval conversation (status:"test", source:"eval") and
   *  return its id. The status:"test" is what makes executeTurn sandbox the write
   *  tools — see the send-stub note above. */
  createEvalConversation: (args: {
    agentId: string;
    agentVersion: number;
    orgId: string;
    scenarioId: string;
  }) => Promise<{ conversationId: string }>;
  /** Mark/clean a finished eval conversation. Best-effort (must never throw the
   *  run); the default marks it ended (the rows stay status:"test", which
   *  tail_conversations already filters out of operator surfaces). */
  cleanupEvalConversation: (args: { conversationId: string }) => Promise<void>;
  /** The REAL runtime turn. Default = executeTurn from ./runtime (lazy-imported). */
  executeTurn: ExecuteTurnFn;
};

/** Guard error reasons surfaced when an eval CANNOT run safely. */
export type DeployedEvalGuard =
  | "agent_not_found"
  | "agent_has_connectors_unsafe";

// ─── the deployed-agent reply adapter ─────────────────────────────────────────

/** The latest customer line in the transcript so far — the single message
 *  executeTurn needs (the conversation history is persisted on the agent's own
 *  thread, so the adapter passes only the newest line, per run-scenario.ts). */
function latestCustomerText(turns: EvalTurn[]): string {
  const list: EvalTurn[] = Array.isArray(turns) ? turns : [];
  for (let i = list.length - 1; i >= 0; i--) {
    const t = list[i];
    if (t && t.role === "customer" && typeof t.text === "string") {
      return t.text;
    }
  }
  return "";
}

/**
 * Build an {@link AgentReply} that drives the REAL runtime `executeTurn` against a
 * single throwaway eval conversation, money-safe by construction (status:"test" →
 * every native write tool short-circuits; no connectors; no booking binding).
 *
 * Lifecycle: the conversation is created LAZILY on the first reply (so a scenario
 * that never reaches the agent costs nothing), then REUSED for every turn of that
 * scenario — executeTurn accumulates the real persisted history across turns. The
 * caller maps each customer line in; the adapter feeds executeTurn the LATEST
 * customer line as `userMessage` and returns the assistant's text as `{ text }`.
 *
 * FAIL-SOFT: a degraded turn ({ ok:false }), a failed conversation create, or any
 * throw yields `{ text:"" }` — runEvalScenario treats an empty reply as "nothing to
 * add" and ends the loop after two empties, so a wedged agent can't spin. NEVER
 * throws to runEvalScenario (belt + suspenders with that loop's own guard).
 *
 * NOTE: this adapter assumes the agent is already proven connector-free by
 * {@link runDeployedAgentEvals}'s guard. Used directly, it does not re-check —
 * always go through runDeployedAgentEvals for the safety gate.
 */
export function makeDeployedAgentReply(args: {
  agent: DeployedAgentInfo;
  scenarioId: string;
  deps: Pick<DeployedEvalDeps, "createEvalConversation" | "executeTurn">;
}): AgentReply {
  let conversationId: string | null = null;
  let createFailed = false;

  return async ({ turns }): Promise<{ text: string }> => {
    const userMessage = latestCustomerText(turns);
    // Nothing for the agent to answer yet (runEvalScenario always seeds the
    // customer opening first, so this is just defensive).
    if (userMessage.trim() === "") return { text: "" };
    // A prior create attempt failed — stay fail-soft, never retry-spam the DB.
    if (createFailed) return { text: "" };

    try {
      if (conversationId === null) {
        const created = await args.deps.createEvalConversation({
          agentId: args.agent.agentId,
          agentVersion: args.agent.agentVersion,
          orgId: args.agent.orgId,
          scenarioId: args.scenarioId,
        });
        conversationId = created?.conversationId ?? null;
        if (!conversationId) {
          createFailed = true;
          return { text: "" };
        }
      }

      const result = await args.deps.executeTurn({
        conversationId,
        userMessage,
      });
      if (!result.ok) return { text: "" };
      return { text: result.assistantMessage ?? "" };
    } catch {
      // A thrown turn ends this scenario gracefully (empty reply → the loop stops
      // after two empties). NEVER throws to runEvalScenario.
      return { text: "" };
    }
  };
}

// ─── the safety gate ───────────────────────────────────────────────────────────

/** A bound MCP connector tool does NOT honour testMode — running an eval against
 *  an agent that has connectors could fire a REAL external call. Fail-closed. */
export function deployedAgentIsConnectorSafe(blueprint: AgentBlueprint): boolean {
  const connectors = blueprint?.connectors;
  return !Array.isArray(connectors) || connectors.length === 0;
}

// ─── the run orchestration ───────────────────────────────────────────────────

export type RunDeployedAgentEvalsResult =
  | ({ ok: true } & RunAgentEvalsResult)
  | { ok: false; guard: DeployedEvalGuard };

/** The DI'd I/O the deployed run needs — the deployed lifecycle (DeployedEvalDeps)
 *  PLUS the same pure-core deps runAgentEvals takes (sim/grader/generator/lessons).
 *  Every dependency is injected, so the unit tests run with plain fakes — no
 *  network, no Anthropic, no Postgres. */
export type RunDeployedAgentEvalsDeps = DeployedEvalDeps & {
  /** Plays the customer (E5 sim). */
  simCustomer: SimCustomerReply;
  /** Grades against successCriteria (E3). Optional — falls back to the floor. */
  grader?: EvalGrader;
  /** Authors scenarios (E4). Optional — generateScenariosForAgent has a default. */
  generator?: ScenarioGenerator;
  /** Brain store for recording lessons on failed scenarios (E3). */
  lessonsStore: AgentMemoryStore;
  /** Cap on scenarios generated/run. */
  count?: number;
  /** Per-scenario agent-turn cap, forwarded to runEvalScenario. */
  maxTurns?: number;
};

/**
 * Run the conversation eval for a LIVE DEPLOYED agent through the REAL runtime,
 * money-safe. Loads the agent, REFUSES to run if it isn't safe (not found, or has
 * connectors that bypass testMode), and otherwise delegates to the E5 core
 * (runAgentEvals) with a per-scenario {@link makeDeployedAgentReply} adapter that
 * drives executeTurn against a fresh throwaway test conversation per scenario.
 *
 * Flow:
 *   1. `loadAgent` → the deployed agent's blueprint + version (or a guard).
 *   2. SAFETY GATE: `deployedAgentIsConnectorSafe` — connectors ⇒ guard
 *      "agent_has_connectors_unsafe", run NOTHING.
 *   3. `runAgentEvals({ blueprint, orgId, agentKey:agentId }, …)` with an
 *      `agentReply` that, PER SCENARIO, creates a throwaway status:"test"
 *      conversation and drives executeTurn. runAgentEvals owns generate→run→score→
 *      lessons + the per-scenario fail-soft; we only swap in the deployed adapter.
 *   4. Best-effort cleanup of every conversation created (rows stay status:"test").
 *
 * NEVER throws — a failure to load/guard returns `{ ok:false, guard }`; everything
 * else is fail-soft inside runAgentEvals.
 */
export async function runDeployedAgentEvals(
  args: { agentId: string; orgId: string },
  deps: RunDeployedAgentEvalsDeps,
): Promise<RunDeployedAgentEvalsResult> {
  // 1. Load the deployed agent.
  let agent: DeployedAgentInfo | null;
  try {
    agent = await deps.loadAgent({ agentId: args.agentId, orgId: args.orgId });
  } catch {
    agent = null;
  }
  if (!agent) return { ok: false, guard: "agent_not_found" };

  // 2. SAFETY GATE — connectors bypass testMode, so refuse to run.
  if (!deployedAgentIsConnectorSafe(agent.blueprint)) {
    return { ok: false, guard: "agent_has_connectors_unsafe" };
  }

  // Track every throwaway conversation so we can clean them up afterwards. The
  // per-scenario adapter creates lazily; we wrap createEvalConversation to record
  // the ids it mints (without changing its behaviour).
  const createdConversationIds: string[] = [];
  const trackingCreate: DeployedEvalDeps["createEvalConversation"] = async (
    createArgs,
  ) => {
    const created = await deps.createEvalConversation(createArgs);
    if (created?.conversationId) createdConversationIds.push(created.conversationId);
    return created;
  };

  // 3. Delegate to the E5 core. The ONLY thing we change vs the stateless path is
  //    the agentReply: a deployed adapter that drives the REAL executeTurn against
  //    a throwaway test conversation. runAgentEvals owns scenario generation,
  //    scoring, lessons, and the per-scenario fail-soft.
  //
  //    The adapter must be PER SCENARIO (a fresh conversation each), but runEval
  //    Scenario receives one agentReply for the whole scenario. So we build a
  //    factory keyed by the scenario id and let runAgentEvals' loop call it — but
  //    runAgentEvals takes a single agentReply, not a factory. We bridge this by
  //    making the adapter itself scenario-aware: it reads the scenarioId off the
  //    transcript's turns is not possible (turns carry no id), so instead we lazily
  //    (re)bind a new conversation whenever a NEW scenario opening is seen.
  const agentReply = makeScenarioAwareDeployedReply({
    agent,
    deps: { createEvalConversation: trackingCreate, executeTurn: deps.executeTurn },
  });

  const core = await runAgentEvals(
    { blueprint: agent.blueprint, orgId: args.orgId, agentKey: args.agentId },
    {
      ...(deps.generator ? { generator: deps.generator } : {}),
      simCustomer: deps.simCustomer,
      agentReply,
      ...(deps.grader ? { grader: deps.grader } : {}),
      lessonsStore: deps.lessonsStore,
      ...(typeof deps.count === "number" ? { count: deps.count } : {}),
      ...(typeof deps.maxTurns === "number" ? { maxTurns: deps.maxTurns } : {}),
    },
  );

  // 4. Best-effort cleanup. Never throws — a cleanup hiccup must not fail the run.
  for (const conversationId of createdConversationIds) {
    try {
      await deps.cleanupEvalConversation({ conversationId });
    } catch {
      // swallow — the rows are status:"test" and already filtered from operator
      // surfaces; an un-cleaned row is harmless.
    }
  }

  return { ok: true, ...core };
}

// ─── scenario-aware adapter ────────────────────────────────────────────────────
//
// runAgentEvals takes ONE agentReply for the whole run, but each scenario needs
// its OWN throwaway conversation (so transcripts don't bleed across scenarios).
// runEvalScenario always seeds turns[0] with the scenario opening, so a NEW
// scenario is detectable as "turns starts fresh with a single customer turn".
// This adapter starts a fresh conversation whenever it sees the start of a new
// scenario (turns.length === 1 and the only turn is the customer opening), and
// reuses that conversation for the rest of that scenario's turns.

function isFreshScenarioStart(turns: EvalTurn[]): boolean {
  return (
    Array.isArray(turns) &&
    turns.length === 1 &&
    turns[0]?.role === "customer"
  );
}

/** Wrap {@link makeDeployedAgentReply} so a fresh throwaway conversation is bound
 *  at the start of EACH scenario (detected by the opening-only transcript) and
 *  reused across that scenario's turns. Fail-soft like the underlying adapter. */
export function makeScenarioAwareDeployedReply(args: {
  agent: DeployedAgentInfo;
  deps: Pick<DeployedEvalDeps, "createEvalConversation" | "executeTurn">;
}): AgentReply {
  let current: AgentReply | null = null;
  let scenarioSeq = 0;

  return async ({ turns }): Promise<{ text: string }> => {
    if (isFreshScenarioStart(turns) || current === null) {
      scenarioSeq += 1;
      current = makeDeployedAgentReply({
        agent: args.agent,
        scenarioId: `eval-s${scenarioSeq}`,
        deps: args.deps,
      });
    }
    return current({ turns });
  };
}

// ─── default (real) deps — lazily import @/db + ./runtime so tests stay DB-free ──

/**
 * Build the REAL deployed-eval deps: loads agents/orgs from Postgres and drives the
 * real executeTurn. Imported LAZILY (only when called) so unit tests that inject
 * fakes never open a DB connection or pull the runtime. Mirrors the
 * defaultMcpDeps / defaultComposioWrapDeps lazy-import pattern in tools.ts.
 *
 * The throwaway conversation is created with status:"test" + channelMeta tagging
 * it as a deployed eval ({ source:"eval", eval_run:true, eval_deployed:true,
 * eval_scenario_id }), so (a) executeTurn sandboxes every write tool and (b)
 * tail_conversations filters it out of operator-facing surfaces.
 */
export async function defaultDeployedEvalDeps(): Promise<
  Pick<
    DeployedEvalDeps,
    "loadAgent" | "createEvalConversation" | "cleanupEvalConversation" | "executeTurn"
  >
> {
  const [{ db }, schema, { eq }, { executeTurn }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
    import("drizzle-orm"),
    import("../runtime"),
  ]);
  const { agents, agentConversations } = schema;

  return {
    loadAgent: async ({ agentId, orgId }) => {
      const [row] = await db
        .select({
          id: agents.id,
          orgId: agents.orgId,
          blueprint: agents.blueprint,
          currentVersion: agents.currentVersion,
        })
        .from(agents)
        .where(eq(agents.id, agentId))
        .limit(1);
      if (!row || row.orgId !== orgId) return null;
      return {
        agentId: row.id,
        orgId: row.orgId,
        blueprint: (row.blueprint ?? {}) as AgentBlueprint,
        agentVersion: row.currentVersion,
      };
    },

    createEvalConversation: async ({ agentId, agentVersion, orgId, scenarioId }) => {
      const [conv] = await db
        .insert(agentConversations)
        .values({
          agentId,
          agentVersion,
          orgId,
          // status:"test" is THE send-stub seam — executeTurn reads
          // testMode = (status === "test") and sandboxes every write tool.
          status: "test",
          channelMeta: {
            source: "eval",
            eval_run: true,
            eval_deployed: true,
            eval_scenario_id: scenarioId,
          },
        })
        .returning({ id: agentConversations.id });
      if (!conv) throw new Error("eval_conversation_create_failed");
      return { conversationId: conv.id };
    },

    cleanupEvalConversation: async ({ conversationId }) => {
      // Mark it ended (rows stay status:"test", already filtered by tail). We do
      // NOT delete — keeping the transcript lets an operator inspect the eval run.
      await db
        .update(agentConversations)
        .set({ endedAt: new Date() })
        .where(eq(agentConversations.id, conversationId));
    },

    executeTurn: async ({ conversationId, userMessage }) => {
      const result = await executeTurn({ conversationId, userMessage });
      return result;
    },
  };
}
