// Agent Eval Harness — E5: the agent-reply adapter + the run orchestration.
//
// This is where the pure E1–E4 core meets the REAL agent. Two pieces:
//
//   1. `makeStatelessAgentReply` — the AgentReply adapter that drives the agent
//      under test. It wraps `runStatelessAgentTurn` (lib/agents/stateless-turn.ts),
//      the SAME loop the Studio test panel uses: it composes the agent's REAL
//      system prompt from the template's blueprint and exposes the blueprint's
//      REAL tool allowlist, looping LLM↔tools to a final reply. Two deliberate
//      properties make it safe to run as an eval:
//        • testMode: true → every native WRITE tool (book_appointment,
//          escalate_to_human, take_message, …) short-circuits to a synthetic
//          result and writes NOTHING (no bookings, no Twilio, no DB). Read-only
//          tools still run, so the agent demonstrates realistic behaviour.
//        • sandboxConnectors: true (H1 hotfix, 2026-07-11) → testMode alone does
//          NOT sandbox bound Composio/MCP connector tools (they execute for real
//          regardless of testMode — supervised-run relies on that). This adapter
//          additionally sets sandboxConnectors so a Gmail/etc.-bound TEMPLATE
//          under eval can never send a real email or touch a real inbox.
//          MONEY-SAFE by construction (both flags together).
//        • identity-neutral → a TEMPLATE is a reusable product the builder sells to
//          OTHER businesses, so (mirroring testAgentTemplateTurn) we pass soul:null
//          and orgName:"your business" — the agent is driven purely by the
//          template's own blueprint, exactly what a deployed client would get.
//      The eval layer speaks `role:"customer"|"agent"` + `text`; the runtime speaks
//      `role:"user"|"assistant"` + `content`. The adapter maps customer↔user /
//      agent↔assistant + text↔content and feeds the WHOLE transcript so far as the
//      stateless history (the stateless turn keeps no thread of its own).
//
//      WHY stateless (not a throwaway executeTurn conversation): the action's input
//      is an agentTemplateId — a template has NO `agents` row and NO org of its own
//      (only builderOrgId). Exercising executeTurn would mean creating throwaway
//      `agents` + `agentConversations` rows that persist to the DB and pollute the
//      builder's workspace. runStatelessAgentTurn is the existing, zero-persistence,
//      real-tool-loop path purpose-built for "test a template", so it's the right
//      seam here. A full-persistence executeTurn eval against a LIVE deployed agent
//      (booking writes, activity bridge, validator-regen) is a clean follow-up.
//
//   2. `runAgentEvals` — the plain, dependency-injected orchestration:
//        generateScenariosForAgent → for each scenario runEvalScenario (sim ↔
//        agentReply) → scoreEvalTranscript → collect {scenario, transcript, score}
//        → recordEvalLessons (failures → Brain). Returns {results, summary}. PER-
//        SCENARIO FAIL-SOFT: one scenario throwing is caught and recorded as a
//        failed result (so the run still completes and the summary reflects it).
//
// NOT "use server": a plain module of pure-ish async fns the "use server" action
// injects (it exports a factory + the orchestration; both must stay non-async-only-
// export-clean per scripts/check-use-server.sh, so this is intentionally a plain
// module). All I/O — the sim, the grader, the scenario generator, the agent's LLM
// client, the Brain store — is injected, so the unit tests run with plain fakes:
// no network, no Anthropic, no Postgres.

import type Anthropic from "@anthropic-ai/sdk";
import type { OrgSoul } from "@/lib/soul/types";
import type { AgentBlueprint } from "@/db/schema/agents";
import {
  runStatelessAgentTurn,
  type RunStatelessAgentTurnInput,
} from "@/lib/agents/stateless-turn";
import type { AgentMemoryStore } from "@/lib/agents/memory/agent-memory";
import { generateScenariosForAgent, type ScenarioGenerator } from "./generate-scenarios";
import { runEvalScenario, type AgentReply, type SimCustomerReply } from "./run-scenario";
import { scoreEvalTranscript, type EvalGrader } from "./score";
import { recordEvalLessons } from "./eval-lessons";
import type { EvalScenario, EvalScore, EvalTranscript, EvalTurn } from "./eval-types";

// ─── the agent-reply adapter ─────────────────────────────────────────────────

/** The workspace context a stateless agent turn legitimately needs. A TEMPLATE is
 *  identity-neutral, so soul/orgName are deliberately NOT taken from the builder's
 *  business (the adapter pins soul:null + a neutral orgName); orgId/orgSlug/timezone
 *  are still real (the read-only availability tool + temporal grounding need a
 *  workspace + a clock). */
export type StatelessAgentReplyContext = {
  orgId: string;
  orgSlug: string;
  timezone: string;
  /** The TEMPLATE blueprint the agent's brain is built from (verbatim). */
  blueprint: AgentBlueprint;
  /** The resolved Anthropic client (the builder's BYOK key, per the action's
   *  Studio build gate). The agent under test runs on the OPERATOR's key. */
  client: Anthropic;
  /** Optional wall-clock override for temporal grounding (tests pin it). */
  now?: Date;
  /** DI seam for the stateless turn itself — defaults to the real
   *  runStatelessAgentTurn; tests inject a fake to avoid the LLM/tool loop. */
  runTurn?: (input: RunStatelessAgentTurnInput) => Promise<
    | { ok: true; reply: string; toolCalls: unknown[] }
    | { ok: false; reason: string; message: string }
  >;
};

/** Neutral persona name — a template is NOT the builder's own front office, so we
 *  never leak the builder org's real name into the prompt (mirrors
 *  testAgentTemplateTurn's "your business"). */
const NEUTRAL_ORG_NAME = "your business";

/** Map the eval transcript (customer/agent + text) → the stateless chat history
 *  (user/assistant + content): customer→user, agent→assistant, text→content. Drops
 *  empty-text turns (a blank line carries nothing for the agent + would waste a
 *  message slot). Pure; never throws. */
function turnsToStatelessHistory(
  turns: EvalTurn[],
): { role: "user" | "assistant"; content: string }[] {
  const list: EvalTurn[] = Array.isArray(turns) ? turns : [];
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const t of list) {
    if (!t || typeof t.text !== "string") continue;
    const content = t.text.trim();
    if (!content) continue;
    out.push({ role: t.role === "agent" ? "assistant" : "user", content: t.text });
  }
  return out;
}

/**
 * Build an {@link AgentReply} that drives the REAL agent brain for a template,
 * sandboxed (testMode) + identity-neutral. Given the eval transcript so far, it
 * maps the turns to the stateless history, runs ONE stateless agent turn, and
 * returns the assistant's final text as `{ text }`.
 *
 * FAIL-SOFT: a degraded stateless turn ({ ok:false }) or an empty history yields
 * `{ text: "" }` — runEvalScenario treats an empty agent reply as "nothing to add"
 * and ends the loop after two in a row, so a wedged agent can't spin. The adapter
 * itself never throws (runEvalScenario also guards a throw, belt + suspenders).
 */
export function makeStatelessAgentReply(ctx: StatelessAgentReplyContext): AgentReply {
  const runTurn = ctx.runTurn ?? runStatelessAgentTurn;

  return async ({ turns }): Promise<{ text: string }> => {
    const messages = turnsToStatelessHistory(turns);
    // No customer line yet → nothing for the agent to answer. (runEvalScenario
    // always seeds the customer opening first, so this is just defensive.)
    if (messages.length === 0) return { text: "" };

    try {
      const result = await runTurn({
        orgId: ctx.orgId,
        orgSlug: ctx.orgSlug,
        // Identity-neutral: a template is a product, not the builder's own
        // business. The template's own customSkillMd persona drives identity.
        orgName: NEUTRAL_ORG_NAME,
        soul: null as OrgSoul | null,
        timezone: ctx.timezone || "UTC",
        blueprint: ctx.blueprint,
        messages,
        testMode: true, // sandbox EVERY native write tool — money-safe.
        // H1 hotfix (2026-07-11 prod incident) — connector (Composio/MCP)
        // tools do NOT respect testMode (by design — supervised-run needs
        // them to execute for real). Evals must never touch a real inbox,
        // so this ADDITIONALLY sandboxes every connector tool call.
        sandboxConnectors: true,
        client: ctx.client,
        ...(ctx.now ? { now: ctx.now } : {}),
      });
      if (!result.ok) return { text: "" };
      return { text: result.reply ?? "" };
    } catch {
      // A thrown agent turn ends this scenario gracefully (empty reply → the loop
      // stops after two empties). NEVER throws to runEvalScenario.
      return { text: "" };
    }
  };
}

// ─── the orchestration ───────────────────────────────────────────────────────

/** One scenario's full eval record: the scenario, the transcript it produced, and
 *  its score. */
export type AgentEvalResult = {
  scenario: EvalScenario;
  transcript: EvalTranscript;
  score: EvalScore;
};

/** The run summary: how many scenarios passed the hard gates, out of how many, and
 *  the fraction. `passRate` is 0 when nothing ran. */
export type AgentEvalSummary = {
  passed: number;
  total: number;
  passRate: number;
};

export type RunAgentEvalsResult = {
  results: AgentEvalResult[];
  summary: AgentEvalSummary;
};

/** The DI'd I/O the orchestration needs — every external dependency, so the unit
 *  tests run with plain fakes (no network, no Anthropic, no Postgres). */
export type RunAgentEvalsDeps = {
  /** Authors the scenarios (E4). Optional — generateScenariosForAgent falls back
   *  to a built-in default set when absent, so evals ALWAYS have something to run. */
  generator?: ScenarioGenerator;
  /** Plays the customer (E5 sim). */
  simCustomer: SimCustomerReply;
  /** Drives the agent under test (the stateless adapter above, or a fake). */
  agentReply: AgentReply;
  /** Grades the transcript against successCriteria (E3). Optional — scoring falls
   *  back to the deterministic floor when absent. */
  grader?: EvalGrader;
  /** Brain memory store for recording lessons on failed scenarios (E3). */
  lessonsStore: AgentMemoryStore;
  /** Cap on scenarios generated/run (default = generateScenariosForAgent's). */
  count?: number;
  /** Per-scenario agent-turn cap, forwarded to runEvalScenario. */
  maxTurns?: number;
};

/**
 * Run the conversation eval for an agent: generate realistic customer scenarios,
 * play each one against the REAL agent (sim ↔ agentReply), score the transcript,
 * and record a Brain lesson for every failure. Returns every per-scenario record
 * plus a pass/total/passRate summary.
 *
 * Flow:
 *   1. `generateScenariosForAgent(blueprint, { generator, count })` (E4) — the LLM
 *      authors scenarios, or the built-in default set if it produced nothing.
 *   2. For each scenario, FAIL-SOFT in isolation:
 *        a. `runEvalScenario(scenario, { simCustomer, agentReply, maxTurns })` (E2)
 *           → an EvalTranscript;
 *        b. `scoreEvalTranscript(transcript, scenario, { grader })` (E3) → an
 *           EvalScore.
 *      A scenario that throws is caught and recorded as a FAILED result with an
 *      explanatory note + a synthetic all-fail score, so one bad scenario never
 *      kills the run and the summary still reflects it.
 *   3. `recordEvalLessons(store, { orgId, agentKey, results })` (E3) — failures →
 *      `recordGeneratorLesson` so the author + judge compound on ground truth.
 *      Best-effort: it already swallows store errors (never throws).
 *
 * PURE ORCHESTRATION — the only I/O is the injected deps. Never throws.
 */
export async function runAgentEvals(
  args: { blueprint: AgentBlueprint; orgId: string; agentKey: string },
  deps: RunAgentEvalsDeps,
): Promise<RunAgentEvalsResult> {
  // 1. Author (or fall back to default) scenarios. generateScenariosForAgent is
  //    fail-soft + never throws, but guard defensively anyway.
  let scenarios: EvalScenario[] = [];
  try {
    scenarios = await generateScenariosForAgent(args.blueprint, {
      ...(deps.generator ? { generator: deps.generator } : {}),
      ...(typeof deps.count === "number" ? { count: deps.count } : {}),
    });
  } catch {
    scenarios = [];
  }

  // 2. Run + score each scenario, FAIL-SOFT per scenario.
  const results: AgentEvalResult[] = [];
  for (const scenario of scenarios) {
    try {
      const transcript = await runEvalScenario(scenario, {
        simCustomer: deps.simCustomer,
        agentReply: deps.agentReply,
        ...(typeof deps.maxTurns === "number" ? { maxTurns: deps.maxTurns } : {}),
      });
      const score = await scoreEvalTranscript(transcript, scenario, {
        ...(deps.grader ? { grader: deps.grader } : {}),
      });
      results.push({ scenario, transcript, score });
    } catch (err) {
      // One scenario blew up (e.g. a fake/buggy sim throwing OUTSIDE the loop's
      // own guard). Record it as a failed result so the run completes + the
      // summary reflects it. A failed score makes recordEvalLessons capture it.
      const detail = err instanceof Error ? err.message : String(err);
      results.push({
        scenario,
        transcript: { scenarioId: scenario.id, turns: [] },
        score: {
          scenarioId: scenario.id,
          passed: false,
          score: 0,
          checks: [],
          notes: `eval error: ${detail}`,
        },
      });
    }
  }

  // 3. Record Brain lessons for the failures (best-effort; never throws).
  await recordEvalLessons(deps.lessonsStore, {
    orgId: args.orgId,
    agentKey: args.agentKey,
    results: results.map((r) => ({ scenario: r.scenario, score: r.score })),
  });

  // 4. Summarize.
  const total = results.length;
  const passed = results.filter((r) => r.score.passed === true).length;
  const passRate = total === 0 ? 0 : passed / total;

  return { results, summary: { passed, total, passRate } };
}
