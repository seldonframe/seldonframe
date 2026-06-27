// Agent Eval Harness — E6: eval a LIVE DEPLOYED agent via the REAL runtime, MONEY-SAFE.
//
// runDeployedAgentEvals(args, deps) loads a deployed agent, REFUSES to run if it
// isn't safe (not found, or has connectors that bypass testMode), and otherwise
// delegates to the E5 core with a per-scenario adapter that drives the REAL
// executeTurn against a THROWAWAY status:"test" conversation. Every dependency is
// injected, so these tests use plain fakes — no network, no LLM, no DB.
//
// These tests pin the contract:
//   • the summary reflects the right passRate over the scored scenarios;
//   • a FAILING scenario records a Brain lesson (via the injected store);
//   • one scenario whose TURN throws doesn't kill the run (fail-soft per scenario);
//   • THE SEND-STUB: the adapter only ever drives executeTurn against the throwaway
//     conversation it created — a "real external send" fake is NEVER called;
//   • SAFETY GATE: an agent with connectors → guard "agent_has_connectors_unsafe",
//     and NOTHING runs (no conversation created, executeTurn never called);
//   • a missing agent → guard "agent_not_found";
//   • makeDeployedAgentReply maps the latest customer line → executeTurn's
//     userMessage, lazily creates + REUSES one conversation, and is fail-soft.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  runDeployedAgentEvals,
  makeDeployedAgentReply,
  makeScenarioAwareDeployedReply,
  deployedAgentIsConnectorSafe,
  type DeployedAgentInfo,
  type DeployedEvalDeps,
  type ExecuteTurnFn,
} from "../../../../src/lib/agents/evals/run-deployed-agent-evals";
import type { ScenarioGenerator } from "../../../../src/lib/agents/evals/generate-scenarios";
import type { SimCustomerReply } from "../../../../src/lib/agents/evals/run-scenario";
import type { EvalGrader } from "../../../../src/lib/agents/evals/score";
import type {
  AgentMemoryEntry,
  AgentMemoryStore,
} from "../../../../src/lib/agents/memory/agent-memory";
import type { AgentBlueprint } from "../../../../src/db/schema/agents";

// ─── fixtures + fakes ──────────────────────────────────────────────────────────

const BLUEPRINT: AgentBlueprint = {
  archetype: "website-chatbot",
  capabilities: [],
  greeting: "Hi!",
};

const DEPLOYED_AGENT: DeployedAgentInfo = {
  agentId: "agent-1",
  orgId: "org-1",
  blueprint: BLUEPRINT,
  agentVersion: 3,
};

/** A generator that returns a fixed scenario list (title + opening are the
 *  load-bearing fields the normalizer needs). */
function fixedGenerator(
  scenarios: Array<{
    title: string;
    opening: string;
    successCriteria?: string[];
    mustNotDo?: string[];
  }>,
): ScenarioGenerator {
  return async () => scenarios;
}

/** A sim that says one line then is done — bounds every scenario to a short loop. */
const oneLineThenDone: SimCustomerReply = async () => ({ text: "thanks!", done: true });

/** A grader that marks the given criteria strings as MISSED (everything else met). */
function graderMissing(missed: string[]): EvalGrader {
  return async () => ({ met: [], missed });
}

/** An in-memory AgentMemoryStore that captures appends (keyed by path). */
function fakeMemoryStore(): {
  store: AgentMemoryStore;
  appends: Array<{ key: string; entry: AgentMemoryEntry }>;
} {
  const data = new Map<string, AgentMemoryEntry[]>();
  const appends: Array<{ key: string; entry: AgentMemoryEntry }> = [];
  const store: AgentMemoryStore = {
    read: async (key) => data.get(key) ?? [],
    append: async (key, entry) => {
      appends.push({ key, entry });
      const list = data.get(key) ?? [];
      list.push(entry);
      data.set(key, list);
    },
  };
  return { store, appends };
}

/** A spy harness for the DB-touching deployed lifecycle. Records every call and
 *  hands back synthetic conversation ids — NO database is touched. A separate
 *  `realSend` spy stands in for the external-send side (sendSmsFromApi / a real
 *  booking); a money-safe eval must NEVER trip it. */
function fakeDeployedDeps(opts?: {
  agent?: DeployedAgentInfo | null;
  /** Make a turn return a degraded result for testing fail-soft. */
  turnImpl?: ExecuteTurnFn;
  /** Make loadAgent throw, to test the guard's own try/catch. */
  loadThrows?: boolean;
}): {
  deps: DeployedEvalDeps;
  calls: {
    created: Array<{ agentId: string; scenarioId: string }>;
    turns: Array<{ conversationId: string; userMessage: string }>;
    cleaned: string[];
    realSends: number;
  };
} {
  const calls = {
    created: [] as Array<{ agentId: string; scenarioId: string }>,
    turns: [] as Array<{ conversationId: string; userMessage: string }>,
    cleaned: [] as string[],
    realSends: 0,
  };
  let seq = 0;

  // The external-send fake. testMode short-circuits the write tools BEFORE this
  // would ever be reached, so in a money-safe eval it is NEVER called. The turn
  // impl below NEVER calls it (mirroring testMode tools returning synthetic).
  const realSend = () => {
    calls.realSends += 1;
  };
  void realSend; // referenced for intent; assertions read calls.realSends.

  const defaultTurn: ExecuteTurnFn = async ({ conversationId, userMessage }) => {
    calls.turns.push({ conversationId, userMessage });
    // A REAL deployed agent in testMode returns the assistant text WITHOUT any
    // external send (book_appointment/take_message short-circuit). We model that:
    // no realSend() here.
    return { ok: true, assistantMessage: "How can I help you today?" };
  };

  const deps: DeployedEvalDeps = {
    loadAgent: async () => {
      if (opts?.loadThrows) throw new Error("db down");
      return opts?.agent === undefined ? DEPLOYED_AGENT : opts.agent;
    },
    createEvalConversation: async ({ agentId, scenarioId }) => {
      seq += 1;
      const conversationId = `conv-${seq}`;
      calls.created.push({ agentId, scenarioId });
      return { conversationId };
    },
    cleanupEvalConversation: async ({ conversationId }) => {
      calls.cleaned.push(conversationId);
    },
    executeTurn: opts?.turnImpl ?? defaultTurn,
  };

  return { deps, calls };
}

// ─── deployedAgentIsConnectorSafe — the pure gate predicate ─────────────────────

describe("deployedAgentIsConnectorSafe — connectors bypass testMode", () => {
  test("no connectors → safe", () => {
    assert.equal(deployedAgentIsConnectorSafe({ capabilities: [] }), true);
    assert.equal(deployedAgentIsConnectorSafe({ capabilities: [], connectors: [] }), true);
  });
  test("any connector bound → NOT safe", () => {
    const bp = {
      capabilities: [],
      connectors: [
        {
          kind: "vetted" as const,
          serviceName: "slack",
          endpoint: "https://x",
          enabledTools: ["post"],
        },
      ],
    } as unknown as AgentBlueprint;
    assert.equal(deployedAgentIsConnectorSafe(bp), false);
  });
});

// ─── runDeployedAgentEvals — summary + passRate ─────────────────────────────────

describe("runDeployedAgentEvals — summary reflects the passRate (real-runtime path)", () => {
  test("two clean scenarios → ok:true, passRate 1.0, and the throwaway conversations were driven + cleaned", async () => {
    const { store } = fakeMemoryStore();
    const { deps, calls } = fakeDeployedDeps();

    const res = await runDeployedAgentEvals(
      { agentId: "agent-1", orgId: "org-1" },
      {
        ...deps,
        generator: fixedGenerator([
          { title: "Happy path", opening: "Hi, can you help?" },
          { title: "Another easy one", opening: "Quick question…" },
        ]),
        simCustomer: oneLineThenDone,
        lessonsStore: store,
        maxTurns: 2,
      },
    );

    assert.equal(res.ok, true);
    if (!res.ok) return; // narrow
    assert.equal(res.summary.total, 2);
    assert.equal(res.summary.passed, 2);
    assert.equal(res.summary.passRate, 1);

    // The REAL runtime path was exercised: a throwaway conversation per scenario,
    // each driven via executeTurn, all cleaned up afterwards.
    assert.equal(calls.created.length, 2, "one throwaway conversation per scenario");
    assert.ok(calls.turns.length >= 2, "executeTurn was driven for each scenario");
    assert.equal(calls.cleaned.length, 2, "both throwaway conversations cleaned up");
    // SEND-STUB: no real external send happened anywhere in the run.
    assert.equal(calls.realSends, 0, "no real SMS / booking / external send occurred");
  });

  test("a mix: one clean + one tripping the always-on firm-price safety gate → passRate 0.5", async () => {
    const { store } = fakeMemoryStore();
    // The deployed agent (its executeTurn) answers differently per scenario by
    // discriminating on the customer's opening message. On the price-trap scenario
    // it states a firm "$<digit>" price → trips the deterministic safety floor.
    const { deps } = fakeDeployedDeps({
      turnImpl: async ({ userMessage }) => {
        if (userMessage.includes("How much exactly")) {
          return { ok: true, assistantMessage: "It will cost exactly $500, guaranteed." };
        }
        return { ok: true, assistantMessage: "Happy to help — what works best?" };
      },
    });

    const res = await runDeployedAgentEvals(
      { agentId: "agent-1", orgId: "org-1" },
      {
        ...deps,
        generator: fixedGenerator([
          { title: "Clean scenario", opening: "Hello there!" },
          { title: "Price-trap scenario", opening: "How much exactly?" },
        ]),
        simCustomer: oneLineThenDone,
        lessonsStore: store,
        maxTurns: 2,
      },
    );

    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.summary.total, 2);
    assert.equal(res.summary.passed, 1, "only the clean scenario passes the safety floor");
    assert.equal(res.summary.passRate, 0.5);
    const failed = res.results.find((r) => !r.score.passed);
    assert.ok(failed, "expected a failed scenario");
    assert.equal(failed!.scenario.title, "Price-trap scenario");
  });
});

// ─── runDeployedAgentEvals — a failing scenario records a lesson ─────────────────

describe("runDeployedAgentEvals — a failing scenario records a Brain lesson", () => {
  test("a missed success criterion (grader) → the failure is recorded via the store", async () => {
    const { store, appends } = fakeMemoryStore();
    const { deps } = fakeDeployedDeps();

    const res = await runDeployedAgentEvals(
      { agentId: "agent-1", orgId: "org-1" },
      {
        ...deps,
        generator: fixedGenerator([
          {
            title: "Books the emergency visit",
            opening: "My furnace died!",
            successCriteria: ["books an emergency visit"],
          },
        ]),
        simCustomer: oneLineThenDone,
        grader: graderMissing(["books an emergency visit"]),
        lessonsStore: store,
        maxTurns: 2,
      },
    );

    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.summary.passed, 0);
    assert.equal(res.summary.total, 1);
    // recordEvalLessons → recordGeneratorLesson → store.append exactly once.
    assert.equal(appends.length, 1, "one lesson recorded for the one failure");
    const entry = appends[0].entry;
    assert.equal(entry.kind, "generator_lesson");
    const lesson = entry.data as { pattern?: string; correction?: string };
    assert.equal(lesson.pattern, "Books the emergency visit");
    assert.ok(
      typeof lesson.correction === "string" &&
        lesson.correction.includes("books an emergency visit"),
      "the correction carries the demanded success criteria",
    );
  });

  test("an all-passing run records NO lessons", async () => {
    const { store, appends } = fakeMemoryStore();
    const { deps } = fakeDeployedDeps();
    await runDeployedAgentEvals(
      { agentId: "agent-1", orgId: "org-1" },
      {
        ...deps,
        generator: fixedGenerator([{ title: "Easy", opening: "Hi!" }]),
        simCustomer: oneLineThenDone,
        lessonsStore: store,
        maxTurns: 2,
      },
    );
    assert.equal(appends.length, 0, "no failures → no lessons");
  });
});

// ─── runDeployedAgentEvals — fail-soft on a throwing turn ────────────────────────

describe("runDeployedAgentEvals — a throwing executeTurn → the run still completes", () => {
  test("executeTurn throws → the scenario ends gracefully, the run completes (never throws)", async () => {
    const { store } = fakeMemoryStore();
    const { deps, calls } = fakeDeployedDeps({
      turnImpl: async () => {
        throw new Error("runtime exploded");
      },
    });

    const res = await runDeployedAgentEvals(
      { agentId: "agent-1", orgId: "org-1" },
      {
        ...deps,
        generator: fixedGenerator([
          { title: "Scenario one", opening: "Hi!" },
          { title: "Scenario two", opening: "Hello?" },
        ]),
        simCustomer: oneLineThenDone,
        lessonsStore: store,
        maxTurns: 2,
      },
    );

    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.results.length, 2, "both scenarios recorded despite the turn throwing");
    assert.equal(res.summary.total, 2);
    // Even when the turn throws, no external send leaked.
    assert.equal(calls.realSends, 0, "no real send on the failing path");
  });

  test("a degraded turn ({ ok:false }) → empty reply, scenario still scored, run completes", async () => {
    const { store } = fakeMemoryStore();
    const { deps } = fakeDeployedDeps({
      turnImpl: async () => ({ ok: false, reason: "llm_not_configured" }),
    });

    const res = await runDeployedAgentEvals(
      { agentId: "agent-1", orgId: "org-1" },
      {
        ...deps,
        generator: fixedGenerator([{ title: "Degraded", opening: "Hi!" }]),
        simCustomer: oneLineThenDone,
        lessonsStore: store,
        maxTurns: 2,
      },
    );

    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.summary.total, 1);
  });
});

// ─── runDeployedAgentEvals — the SAFETY GATE ─────────────────────────────────────

describe("runDeployedAgentEvals — refuses unsafe agents (money-safety)", () => {
  test("an agent with connectors → guard 'agent_has_connectors_unsafe', NOTHING runs", async () => {
    const { store } = fakeMemoryStore();
    const connectorAgent: DeployedAgentInfo = {
      ...DEPLOYED_AGENT,
      blueprint: {
        ...BLUEPRINT,
        connectors: [
          {
            kind: "vetted",
            serviceName: "slack",
            endpoint: "https://example",
            enabledTools: ["post_message"],
          },
        ],
      } as unknown as AgentBlueprint,
    };
    const { deps, calls } = fakeDeployedDeps({ agent: connectorAgent });

    let generatorCalled = false;
    const res = await runDeployedAgentEvals(
      { agentId: "agent-1", orgId: "org-1" },
      {
        ...deps,
        generator: async () => {
          generatorCalled = true;
          return [{ title: "x", opening: "y" }];
        },
        simCustomer: oneLineThenDone,
        lessonsStore: store,
        maxTurns: 2,
      },
    );

    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.guard, "agent_has_connectors_unsafe");
    // The gate fires BEFORE any work: no scenarios authored, no conversation
    // created, no turn driven, and CRUCIALLY no real send.
    assert.equal(generatorCalled, false, "no scenarios authored for an unsafe agent");
    assert.equal(calls.created.length, 0, "no throwaway conversation created");
    assert.equal(calls.turns.length, 0, "executeTurn never called");
    assert.equal(calls.realSends, 0, "no real send for an unsafe agent");
  });

  test("a missing agent → guard 'agent_not_found'", async () => {
    const { store } = fakeMemoryStore();
    const { deps } = fakeDeployedDeps({ agent: null });
    const res = await runDeployedAgentEvals(
      { agentId: "nope", orgId: "org-1" },
      { ...deps, simCustomer: oneLineThenDone, lessonsStore: store },
    );
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.guard, "agent_not_found");
  });

  test("loadAgent throwing → guard 'agent_not_found' (never throws)", async () => {
    const { store } = fakeMemoryStore();
    const { deps } = fakeDeployedDeps({ loadThrows: true });
    const res = await runDeployedAgentEvals(
      { agentId: "agent-1", orgId: "org-1" },
      { ...deps, simCustomer: oneLineThenDone, lessonsStore: store },
    );
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.guard, "agent_not_found");
  });
});

// ─── makeDeployedAgentReply — the adapter ────────────────────────────────────────

describe("makeDeployedAgentReply — drives executeTurn against ONE throwaway conversation", () => {
  test("maps the latest customer line → userMessage; lazily creates + REUSES one conversation", async () => {
    const created: Array<{ scenarioId: string }> = [];
    const turns: Array<{ conversationId: string; userMessage: string }> = [];
    let seq = 0;

    const reply = makeDeployedAgentReply({
      agent: DEPLOYED_AGENT,
      scenarioId: "eval-s1",
      deps: {
        createEvalConversation: async ({ scenarioId }) => {
          seq += 1;
          created.push({ scenarioId });
          return { conversationId: `conv-${seq}` };
        },
        executeTurn: async ({ conversationId, userMessage }) => {
          turns.push({ conversationId, userMessage });
          return { ok: true, assistantMessage: "Sure — what's your address?" };
        },
      },
    });

    // Turn 1.
    const out1 = await reply({
      turns: [{ role: "customer", text: "My furnace died." }],
    });
    assert.equal(out1.text, "Sure — what's your address?");

    // Turn 2 — the latest customer line is what executeTurn receives.
    const out2 = await reply({
      turns: [
        { role: "customer", text: "My furnace died." },
        { role: "agent", text: "Oh no! What's your address?" },
        { role: "customer", text: "123 Main St — can someone come tonight?" },
      ],
    });
    assert.equal(out2.text, "Sure — what's your address?");

    // ONE conversation created (lazy on turn 1), REUSED on turn 2.
    assert.equal(created.length, 1, "exactly one throwaway conversation for the scenario");
    assert.equal(turns.length, 2);
    assert.equal(turns[0].conversationId, turns[1].conversationId, "same conversation reused");
    // executeTurn got the NEWEST customer line each time (not the agent line).
    assert.equal(turns[0].userMessage, "My furnace died.");
    assert.equal(turns[1].userMessage, "123 Main St — can someone come tonight?");
  });

  test("empty / no-customer turns → { text:'' } WITHOUT creating a conversation", async () => {
    let createCalled = false;
    const reply = makeDeployedAgentReply({
      agent: DEPLOYED_AGENT,
      scenarioId: "eval-s1",
      deps: {
        createEvalConversation: async () => {
          createCalled = true;
          return { conversationId: "conv-x" };
        },
        executeTurn: async () => ({ ok: true, assistantMessage: "x" }),
      },
    });
    // No customer line yet.
    const out = await reply({ turns: [{ role: "agent", text: "hello" }] });
    assert.deepEqual(out, { text: "" });
    assert.equal(createCalled, false, "no customer line → no conversation created");
  });

  test("a degraded turn ({ ok:false }) → { text:'' } (fail-soft)", async () => {
    const reply = makeDeployedAgentReply({
      agent: DEPLOYED_AGENT,
      scenarioId: "eval-s1",
      deps: {
        createEvalConversation: async () => ({ conversationId: "conv-1" }),
        executeTurn: async () => ({ ok: false, reason: "llm_not_configured" }),
      },
    });
    const out = await reply({ turns: [{ role: "customer", text: "hi" }] });
    assert.deepEqual(out, { text: "" });
  });

  test("a throwing executeTurn → { text:'' } (never throws)", async () => {
    const reply = makeDeployedAgentReply({
      agent: DEPLOYED_AGENT,
      scenarioId: "eval-s1",
      deps: {
        createEvalConversation: async () => ({ conversationId: "conv-1" }),
        executeTurn: async () => {
          throw new Error("boom");
        },
      },
    });
    const out = await reply({ turns: [{ role: "customer", text: "hi" }] });
    assert.deepEqual(out, { text: "" });
  });

  test("a failed conversation create → { text:'' } and never retries the create", async () => {
    let createCalls = 0;
    const reply = makeDeployedAgentReply({
      agent: DEPLOYED_AGENT,
      scenarioId: "eval-s1",
      deps: {
        createEvalConversation: async () => {
          createCalls += 1;
          return { conversationId: "" }; // create "failed" (no id)
        },
        executeTurn: async () => ({ ok: true, assistantMessage: "x" }),
      },
    });
    const a = await reply({ turns: [{ role: "customer", text: "hi" }] });
    const b = await reply({ turns: [{ role: "customer", text: "still there?" }] });
    assert.deepEqual(a, { text: "" });
    assert.deepEqual(b, { text: "" });
    assert.equal(createCalls, 1, "create attempted once, not retry-spammed");
  });
});

// ─── makeScenarioAwareDeployedReply — fresh conversation per scenario ────────────

describe("makeScenarioAwareDeployedReply — isolates conversations across scenarios", () => {
  test("a NEW scenario (opening-only transcript) binds a FRESH conversation", async () => {
    const created: string[] = [];
    const turns: Array<{ conversationId: string }> = [];
    let seq = 0;

    const reply = makeScenarioAwareDeployedReply({
      agent: DEPLOYED_AGENT,
      deps: {
        createEvalConversation: async ({ scenarioId }) => {
          seq += 1;
          created.push(scenarioId);
          return { conversationId: `conv-${seq}` };
        },
        executeTurn: async ({ conversationId }) => {
          turns.push({ conversationId });
          return { ok: true, assistantMessage: "ok" };
        },
      },
    });

    // Scenario A: opening, then a follow-up (same conversation).
    await reply({ turns: [{ role: "customer", text: "A-open" }] });
    await reply({
      turns: [
        { role: "customer", text: "A-open" },
        { role: "agent", text: "ok" },
        { role: "customer", text: "A-followup" },
      ],
    });
    // Scenario B starts fresh (opening-only transcript again).
    await reply({ turns: [{ role: "customer", text: "B-open" }] });

    assert.equal(created.length, 2, "two scenarios → two throwaway conversations");
    // First two turns share conv-1; the third (new scenario) is conv-2.
    assert.equal(turns[0].conversationId, "conv-1");
    assert.equal(turns[1].conversationId, "conv-1", "scenario A reuses its conversation");
    assert.equal(turns[2].conversationId, "conv-2", "scenario B gets a fresh conversation");
  });
});
