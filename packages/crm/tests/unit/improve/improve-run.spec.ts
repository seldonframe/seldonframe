// Improve verb + trust rail (2026-07-02) — Task 8: the improve-run ORCHESTRATOR.
//
// TDD focus: `runImproveForAgent` is a PURE-composition orchestrator — every
// external effect (agent load, conversation sourcing, scenario conversion,
// eval replay, clustering LLM, patch proposer, lessons, persistence) arrives
// via `ImproveRunDeps`, so this spec drives the WHOLE pipeline with plain
// fakes: no network, no Anthropic, no Postgres.
//
// The binding behaviors under test (brief + amended plan):
//   - happy path persists exactly 2 eval runs (kinds `improve_baseline` then
//     `improve_candidate`, BOTH with blueprintVersion = agent.currentVersion —
//     the candidate is a SHADOW of the current version, it has no version of
//     its own) + 1 proposal row (basedOnVersion = currentVersion, status
//     "proposed", linked to both run ids);
//   - baseline and candidate replay the IDENTICAL scenario list; the candidate
//     call carries `shadowBlueprint = { ...blueprint, ...patch }`;
//   - PAIRED FLIPS: per-scenario flips joined by scenario id across the two
//     runs → `paired { improved, regressed, unchanged, criticalRegressed }`;
//   - VERDICT (small-N honesty, research addendum §2): "better" ONLY when
//     (improved - regressed) >= 3 AND !criticalRegressed; net <= -3 → "worse";
//     else "inconclusive"; null when no candidate ran;
//   - criticalRegressed criterion (documented in improve-run.ts): a scenario
//     whose SOURCE sample had `hadCriticalValidatorFailure === true` (tracked
//     at assembly time — these are exactly the scenarios whose mustNotDo
//     prohibitions derive from critical validator failures) counts as a
//     critical regression when EITHER its overall hard-gate `passed` flips
//     true→false, OR a check named `mustNotDo: <one of its prohibitions>`
//     flips passed→failed between baseline and candidate;
//   - perfect baseline (passRate === 1) → ok + note "nothing to improve", NO
//     proposal, NO candidate run;
//   - proposer null / guardrail rejection → ok with proposalId null + note,
//     candidate NEVER runs on an invalid patch;
//   - runEvals guard → ok:false with that guard as the reason;
//   - no conversations → "no_conversations"; 0 scenarios → "no_scenarios";
//     missing agent → "agent_not_found";
//   - scenario assembly: deterministic (critical-sample) scenarios FIRST, then
//     LLM-converted, capped at env.maxScenarios;
//   - persistence failure → ok:false, NEVER a throw;
//   - clustering inputs are DERIVED (coordinator note): failedChecks =
//     score.checks.filter(!passed).map(name) — names only, never `detail`; a
//     result whose checks all pass (a passing scenario) is never sent to the
//     clusterer; validator-named failures go to bucketByValidator's buckets,
//     and ONLY the remainder — joined back to {scenarioId, title,
//     failedChecks} — reaches deps.clusterFailures.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  runImproveForAgent,
  type ImproveRunDeps,
} from "@/lib/agents/improve/improve-run";
import type { AgentBlueprint } from "@/db/schema/agents";
import type { ConversationSample } from "@/lib/agents/improve/source-conversations";
import type { FailureCluster } from "@/lib/agents/improve/cluster-failures";
import type { EvalScenario } from "@/lib/agents/evals/eval-types";
import type { RunAgentEvalsResult } from "@/lib/agents/evals/run-agent-evals";

// ─── fixtures ─────────────────────────────────────────────────────────────

const AGENT_ID = "agent-1";
const ORG_ID = "org-1";

/** The critical-validator-derived prohibition the fake deterministic branch
 *  stamps on critical-sample scenarios (mirrors T5's VALIDATOR_PROHIBITIONS
 *  value for quotes_only_from_soul_pricing — the exact string is irrelevant
 *  to the orchestrator, which reads it back off the ASSEMBLED scenario). */
const CRIT_PROHIBITION =
  "Quote a specific dollar amount that isn't in the operator's authorized pricing.";

function blueprint(overrides: Partial<AgentBlueprint> = {}): AgentBlueprint {
  return {
    archetype: "receptionist",
    greeting: "Hi, how can I help?",
    faq: [{ q: "What are your hours?", a: "9-5 Mon-Fri" }],
    capabilities: ["book_appointment"],
    connectors: [],
    trigger: { kind: "inbound" } as unknown as AgentBlueprint["trigger"],
    ...overrides,
  };
}

function sample(conversationId: string, critical = false): ConversationSample {
  return {
    conversationId,
    outcome: "other",
    hadCriticalValidatorFailure: critical,
    failedValidatorNames: critical ? ["quotes_only_from_soul_pricing"] : [],
    turns: [{ role: "user", content: "hi there" }],
  };
}

/** Fake toScenario mirroring T9's real composition: critical samples take the
 *  deterministic branch (id `real-<cid>`, validator-derived mustNotDo), the
 *  rest take the LLM branch (id `real-llm-<cid>`). */
async function fakeToScenario(s: ConversationSample): Promise<EvalScenario | null> {
  if (s.hadCriticalValidatorFailure) {
    return {
      id: `real-${s.conversationId}`,
      title: `Real conversation regression — ${s.conversationId}`,
      persona: "critical customer",
      opening: "hi",
      successCriteria: [],
      mustDo: [],
      mustNotDo: [CRIT_PROHIBITION],
    };
  }
  return {
    id: `real-llm-${s.conversationId}`,
    title: `LLM-derived — ${s.conversationId}`,
    persona: "regular customer",
    opening: "hi",
    successCriteria: [],
    mustDo: [],
    mustNotDo: ["Ignore the customer's question."],
  };
}

type ResultSpec = {
  id: string;
  passed: boolean;
  failedChecks?: string[];
  passedChecks?: string[];
};

/** Build a RunAgentEvalsResult whose per-scenario checks carry the given
 *  names — `failedChecks` become failing EvalChecks (each with a `detail`
 *  that must NEVER leak into clustering inputs), `passedChecks` passing. */
function runResult(specs: ResultSpec[]): RunAgentEvalsResult {
  const results = specs.map((s) => ({
    scenario: {
      id: s.id,
      title: `title-${s.id}`,
      persona: "p",
      opening: "o",
      successCriteria: [],
      mustDo: [],
      mustNotDo: [],
    },
    transcript: { scenarioId: s.id, turns: [] },
    score: {
      scenarioId: s.id,
      passed: s.passed,
      score: s.passed ? 1 : 0,
      checks: [
        ...(s.passedChecks ?? []).map((name) => ({ name, passed: true })),
        ...(s.failedChecks ?? []).map((name) => ({
          name,
          passed: false,
          detail: "raw detail that must never reach the clusterer",
        })),
      ],
    },
  }));
  const passed = specs.filter((s) => s.passed).length;
  const total = specs.length;
  return {
    results,
    summary: { passed, total, passRate: total === 0 ? 0 : passed / total },
  };
}

const okRun = (specs: ResultSpec[]) =>
  ({ ok: true, result: runResult(specs) }) as const;

// ─── the deps harness ─────────────────────────────────────────────────────

type RunEvalsOutcome =
  | { ok: true; result: RunAgentEvalsResult }
  | { ok: false; guard: string };

type MakeDepsOpts = {
  agent?: { blueprint: AgentBlueprint; currentVersion: number } | null;
  samples?: ConversationSample[];
  runEvalsQueue?: RunEvalsOutcome[];
  toScenario?: ImproveRunDeps["toScenario"];
  clusterFailures?: ImproveRunDeps["clusterFailures"];
  proposePatch?: ImproveRunDeps["proposePatch"];
  loadLessons?: ImproveRunDeps["loadLessons"];
  persistRun?: ImproveRunDeps["persistRun"];
  persistProposal?: ImproveRunDeps["persistProposal"];
  env?: Partial<ImproveRunDeps["env"]>;
};

function makeDeps(opts: MakeDepsOpts = {}) {
  const recorded = {
    loadConversationsArgs: [] as Array<{ agentId: string; orgId: string; limit: number }>,
    toScenarioSamples: [] as ConversationSample[],
    runEvalsArgs: [] as Array<{
      agentId: string;
      orgId: string;
      scenarios: EvalScenario[];
      shadowBlueprint?: AgentBlueprint;
    }>,
    clusterFailuresArgs: [] as Array<{
      failed: Array<{ scenarioId: string; title: string; failedChecks: string[] }>;
    }>,
    proposePatchArgs: [] as Array<{
      blueprint: AgentBlueprint;
      clusters: FailureCluster[];
      lessons: string[];
    }>,
    persistRunRows: [] as Array<Parameters<ImproveRunDeps["persistRun"]>[0]>,
    persistProposalRows: [] as Array<Parameters<ImproveRunDeps["persistProposal"]>[0]>,
    loadLessonsAgentIds: [] as string[],
  };

  const queue = [...(opts.runEvalsQueue ?? [])];
  let runCounter = 0;

  const deps: ImproveRunDeps = {
    loadAgent: async () =>
      opts.agent !== undefined
        ? opts.agent
        : { blueprint: blueprint(), currentVersion: 7 },
    loadConversations: async (args) => {
      recorded.loadConversationsArgs.push(args);
      return opts.samples ?? [sample("c1", true), sample("c2"), sample("c3")];
    },
    toScenario: async (s) => {
      recorded.toScenarioSamples.push(s);
      return (opts.toScenario ?? fakeToScenario)(s);
    },
    runEvals: async (args) => {
      recorded.runEvalsArgs.push(args);
      const next = queue.shift();
      if (!next) throw new Error("runEvals called more times than the fixture queued");
      return next;
    },
    clusterFailures: async (args) => {
      recorded.clusterFailuresArgs.push(args);
      if (opts.clusterFailures) return opts.clusterFailures(args);
      return [
        {
          mode: "tone",
          count: args.failed.length,
          exampleScenarioIds: args.failed.map((f) => f.scenarioId),
          evidence: ["labeled by fake clusterer"],
        },
      ];
    },
    proposePatch: async (args) => {
      recorded.proposePatchArgs.push(args);
      if (opts.proposePatch) return opts.proposePatch(args);
      return {
        patch: { greeting: "A clearer greeting." },
        rationale: "Clearer greeting reduces confusion.",
      };
    },
    loadLessons: async (agentId) => {
      recorded.loadLessonsAgentIds.push(agentId);
      if (opts.loadLessons) return opts.loadLessons(agentId);
      return ["Always confirm the service address."];
    },
    persistRun: async (row) => {
      if (opts.persistRun) return opts.persistRun(row);
      recorded.persistRunRows.push(row);
      runCounter += 1;
      return { id: `run-${runCounter}` };
    },
    persistProposal: async (row) => {
      if (opts.persistProposal) return opts.persistProposal(row);
      recorded.persistProposalRows.push(row);
      return { id: "proposal-1" };
    },
    env: {
      sampleSize: 50,
      maxScenarios: 24,
      patchMaxBytes: 8192,
      ...opts.env,
    },
  };

  return { deps, recorded };
}

const run = (deps: ImproveRunDeps) =>
  runImproveForAgent({ agentId: AGENT_ID, orgId: ORG_ID }, deps);

// ─── happy path ───────────────────────────────────────────────────────────

describe("runImproveForAgent — happy path", () => {
  test("persists 2 runs + 1 proposal with correct kinds/versions and returns better", async () => {
    const samples = [sample("c1", true), sample("c2"), sample("c3"), sample("c4"), sample("c5")];
    const baseline = okRun([
      { id: "real-c1", passed: false, failedChecks: ["quotes_only_from_soul_pricing"] },
      {
        id: "real-llm-c2",
        passed: false,
        failedChecks: ["custom: hallucinated availability"],
        passedChecks: ["safety: no placeholder"],
      },
      { id: "real-llm-c3", passed: false, failedChecks: ["custom: rude tone"] },
      { id: "real-llm-c4", passed: true, passedChecks: ["safety: no placeholder"] },
      { id: "real-llm-c5", passed: true },
    ]);
    const candidate = okRun([
      { id: "real-c1", passed: true },
      { id: "real-llm-c2", passed: true },
      { id: "real-llm-c3", passed: true },
      { id: "real-llm-c4", passed: true },
      { id: "real-llm-c5", passed: true },
    ]);
    const { deps, recorded } = makeDeps({ samples, runEvalsQueue: [baseline, candidate] });

    const res = await run(deps);

    assert.equal(res.ok, true);
    if (!res.ok) throw new Error("unreachable");

    // Result surface.
    assert.equal(res.proposalId, "proposal-1");
    assert.deepEqual(res.baseline, { passRate: 0.4, total: 5 });
    assert.deepEqual(res.candidate, { passRate: 1, total: 5 });
    assert.deepEqual(res.paired, {
      improved: 3,
      regressed: 0,
      unchanged: 2,
      criticalRegressed: false,
    });
    assert.equal(res.verdict, "better");
    assert.equal(res.note, undefined);

    // Both replays ran the IDENTICAL scenario list; candidate carried the shadow.
    assert.equal(recorded.runEvalsArgs.length, 2);
    const ids = (call: number) => recorded.runEvalsArgs[call].scenarios.map((s) => s.id);
    assert.deepEqual(ids(0), ["real-c1", "real-llm-c2", "real-llm-c3", "real-llm-c4", "real-llm-c5"]);
    assert.deepEqual(ids(1), ids(0));
    assert.equal(recorded.runEvalsArgs[0].agentId, AGENT_ID);
    assert.equal(recorded.runEvalsArgs[0].orgId, ORG_ID);
    assert.equal(recorded.runEvalsArgs[0].shadowBlueprint, undefined);
    assert.deepEqual(recorded.runEvalsArgs[1].shadowBlueprint, {
      ...blueprint(),
      greeting: "A clearer greeting.",
    });

    // Persisted runs: baseline then candidate, both stamped with the CURRENT
    // version (the candidate is a shadow of it — no new version exists yet).
    assert.equal(recorded.persistRunRows.length, 2);
    const [baseRow, candRow] = recorded.persistRunRows;
    assert.equal(baseRow.kind, "improve_baseline");
    assert.equal(baseRow.orgId, ORG_ID);
    assert.equal(baseRow.subjectKind, "agent");
    assert.equal(baseRow.subjectId, AGENT_ID);
    assert.equal(baseRow.blueprintVersion, 7);
    assert.equal(baseRow.passRate, 40);
    assert.equal(baseRow.scenarioCount, 5);
    assert.equal(baseRow.passedCount, 2);
    assert.equal(candRow.kind, "improve_candidate");
    assert.equal(candRow.blueprintVersion, 7);
    assert.equal(candRow.passRate, 100);
    assert.ok(typeof baseRow.graderModel === "string" && baseRow.graderModel.length > 0);

    // The proposal row: propose-only lifecycle, linked to both run ids, with
    // the T6 clusters mapped mode→taxonomy for the rationale jsonb.
    assert.equal(recorded.persistProposalRows.length, 1);
    const prop = recorded.persistProposalRows[0];
    assert.equal(prop.orgId, ORG_ID);
    assert.equal(prop.agentId, AGENT_ID);
    assert.equal(prop.basedOnVersion, 7);
    assert.equal(prop.status, "proposed");
    assert.equal(prop.baselineRunId, "run-1");
    assert.equal(prop.candidateRunId, "run-2");
    assert.deepEqual(prop.patch, { greeting: "A clearer greeting." });
    assert.deepEqual(
      prop.rationale.clusters.map((c) => ({ taxonomy: c.taxonomy, count: c.count })),
      [
        { taxonomy: "pricing", count: 1 },
        { taxonomy: "tone", count: 2 },
      ],
    );

    // Result clusters: the deterministic pricing bucket first, then the LLM
    // cluster over the remainder.
    assert.equal(res.clusters.length, 2);
    assert.equal(res.clusters[0].mode, "pricing");
    assert.deepEqual(res.clusters[0].exampleScenarioIds, ["real-c1"]);
    assert.equal(res.clusters[1].mode, "tone");
    assert.deepEqual(res.clusters[1].exampleScenarioIds, ["real-llm-c2", "real-llm-c3"]);

    // The proposer saw the clusters + the Brain lessons + the CURRENT blueprint.
    assert.equal(recorded.proposePatchArgs.length, 1);
    assert.deepEqual(recorded.proposePatchArgs[0].blueprint, blueprint());
    assert.deepEqual(recorded.proposePatchArgs[0].clusters, res.clusters);
    assert.deepEqual(recorded.proposePatchArgs[0].lessons, [
      "Always confirm the service address.",
    ]);
    assert.deepEqual(recorded.loadLessonsAgentIds, [AGENT_ID]);

    // Sourcing used env.sampleSize as the candidate-pool limit.
    assert.deepEqual(recorded.loadConversationsArgs, [
      { agentId: AGENT_ID, orgId: ORG_ID, limit: 50 },
    ]);
  });
});

// ─── clustering derivation (coordinator note) ────────────────────────────

describe("runImproveForAgent — clustering inputs are derived, names-only", () => {
  test("passing scenarios are never clustered; validator-named failures bucket; only the remainder (joined to scenarioId/title/failedChecks) reaches the clusterer", async () => {
    const samples = [sample("c1"), sample("c2"), sample("c3")];
    const baseline = okRun([
      // All checks passing → failedChecks would be [] — never sent anywhere.
      { id: "real-llm-c1", passed: true, passedChecks: ["safety: ok", "mustDo: greet"] },
      // Deterministically bucketable (bare validator name) → pricing bucket,
      // NOT sent to the LLM clusterer.
      {
        id: "real-llm-c2",
        passed: false,
        failedChecks: ["quotes_only_from_soul_pricing"],
        passedChecks: ["safety: ok"],
      },
      // Unmapped names → the remainder, joined back to {scenarioId, title,
      // failedChecks} with FAILED check names only (no passed names, no detail).
      {
        id: "real-llm-c3",
        passed: false,
        failedChecks: ["custom: odd tone"],
        passedChecks: ["mustDo: greet"],
      },
    ]);
    const { deps, recorded } = makeDeps({
      samples,
      runEvalsQueue: [baseline],
      proposePatch: async () => null, // end the run after clustering
    });

    const res = await run(deps);
    assert.equal(res.ok, true);
    if (!res.ok) throw new Error("unreachable");

    assert.equal(recorded.clusterFailuresArgs.length, 1);
    assert.deepEqual(recorded.clusterFailuresArgs[0].failed, [
      {
        scenarioId: "real-llm-c3",
        title: "title-real-llm-c3",
        failedChecks: ["custom: odd tone"],
      },
    ]);

    assert.equal(res.clusters.length, 2);
    assert.equal(res.clusters[0].mode, "pricing");
    assert.deepEqual(res.clusters[0].exampleScenarioIds, ["real-llm-c2"]);
    assert.equal(res.clusters[1].mode, "tone");
    assert.deepEqual(res.clusters[1].exampleScenarioIds, ["real-llm-c3"]);
  });

  test("a throwing clusterFailures fails soft to one 'other' cluster over the remainder — failures are never dropped", async () => {
    const samples = [sample("c1"), sample("c2")];
    const baseline = okRun([
      { id: "real-llm-c1", passed: false, failedChecks: ["custom: a"] },
      { id: "real-llm-c2", passed: false, failedChecks: ["custom: b"] },
    ]);
    const { deps } = makeDeps({
      samples,
      runEvalsQueue: [baseline],
      clusterFailures: async () => {
        throw new Error("LLM down");
      },
      proposePatch: async () => null,
    });

    const res = await run(deps);
    assert.equal(res.ok, true);
    if (!res.ok) throw new Error("unreachable");
    assert.equal(res.clusters.length, 1);
    assert.equal(res.clusters[0].mode, "other");
    assert.equal(res.clusters[0].count, 2);
    assert.deepEqual(res.clusters[0].exampleScenarioIds, ["real-llm-c1", "real-llm-c2"]);
  });
});

// ─── short-circuit + guard paths ──────────────────────────────────────────

describe("runImproveForAgent — short circuits and guards", () => {
  test("perfect baseline → ok + note 'nothing to improve', no proposal, no candidate run", async () => {
    const baseline = okRun([
      { id: "real-c1", passed: true },
      { id: "real-llm-c2", passed: true },
      { id: "real-llm-c3", passed: true },
    ]);
    const { deps, recorded } = makeDeps({ runEvalsQueue: [baseline] });

    const res = await run(deps);
    assert.equal(res.ok, true);
    if (!res.ok) throw new Error("unreachable");
    assert.equal(res.note, "nothing to improve");
    assert.equal(res.proposalId, null);
    assert.equal(res.candidate, null);
    assert.equal(res.paired, null);
    assert.equal(res.verdict, null);
    assert.deepEqual(res.clusters, []);
    assert.deepEqual(res.baseline, { passRate: 1, total: 3 });

    // Exactly ONE replay + ONE persisted run (the baseline); nothing else fired.
    assert.equal(recorded.runEvalsArgs.length, 1);
    assert.equal(recorded.persistRunRows.length, 1);
    assert.equal(recorded.persistRunRows[0].kind, "improve_baseline");
    assert.equal(recorded.clusterFailuresArgs.length, 0);
    assert.equal(recorded.proposePatchArgs.length, 0);
    assert.equal(recorded.persistProposalRows.length, 0);
  });

  test("proposer returns null → ok with proposalId null + note, no candidate run", async () => {
    const baseline = okRun([
      { id: "real-llm-c2", passed: false, failedChecks: ["custom: x"] },
      { id: "real-llm-c3", passed: true },
    ]);
    const { deps, recorded } = makeDeps({
      samples: [sample("c2"), sample("c3")],
      runEvalsQueue: [baseline],
      proposePatch: async () => null,
    });

    const res = await run(deps);
    assert.equal(res.ok, true);
    if (!res.ok) throw new Error("unreachable");
    assert.equal(res.proposalId, null);
    assert.equal(res.note, "no patch proposed");
    assert.equal(res.candidate, null);
    assert.equal(res.paired, null);
    assert.equal(res.verdict, null);
    assert.ok(res.clusters.length > 0);
    assert.equal(recorded.runEvalsArgs.length, 1);
    assert.equal(recorded.persistRunRows.length, 1);
    assert.equal(recorded.persistProposalRows.length, 0);
  });

  test("a throwing proposer is treated like null (fail-soft), never a throw", async () => {
    const baseline = okRun([
      { id: "real-llm-c2", passed: false, failedChecks: ["custom: x"] },
    ]);
    const { deps, recorded } = makeDeps({
      samples: [sample("c2")],
      runEvalsQueue: [baseline],
      proposePatch: async () => {
        throw new Error("proposer exploded");
      },
    });

    const res = await run(deps);
    assert.equal(res.ok, true);
    if (!res.ok) throw new Error("unreachable");
    assert.equal(res.proposalId, null);
    assert.equal(res.note, "no patch proposed");
    assert.equal(recorded.runEvalsArgs.length, 1);
  });

  test("guardrail rejection (patch touches connectors) → ok with note, candidate NEVER runs", async () => {
    const baseline = okRun([
      { id: "real-llm-c2", passed: false, failedChecks: ["custom: x"] },
    ]);
    const { deps, recorded } = makeDeps({
      samples: [sample("c2")],
      runEvalsQueue: [baseline],
      proposePatch: async () => ({
        patch: { connectors: [] } as Partial<AgentBlueprint>,
        rationale: "rewire the tools",
      }),
    });

    const res = await run(deps);
    assert.equal(res.ok, true);
    if (!res.ok) throw new Error("unreachable");
    assert.equal(res.proposalId, null);
    assert.ok(res.note?.startsWith("patch rejected:"));
    assert.match(res.note ?? "", /connectors/);
    assert.equal(res.candidate, null);
    assert.equal(res.paired, null);
    assert.equal(res.verdict, null);
    // The invalid patch never reached a shadow replay or persistence.
    assert.equal(recorded.runEvalsArgs.length, 1);
    assert.equal(recorded.persistRunRows.length, 1);
    assert.equal(recorded.persistProposalRows.length, 0);
  });

  test("baseline runEvals guard → ok:false with the guard as the reason, nothing persisted", async () => {
    const { deps, recorded } = makeDeps({
      runEvalsQueue: [{ ok: false, guard: "agent_has_connectors_unsafe" }],
    });

    const res = await run(deps);
    assert.equal(res.ok, false);
    if (res.ok) throw new Error("unreachable");
    assert.equal(res.reason, "agent_has_connectors_unsafe");
    assert.equal(recorded.persistRunRows.length, 0);
    assert.equal(recorded.clusterFailuresArgs.length, 0);
    assert.equal(recorded.proposePatchArgs.length, 0);
  });

  test("agent not found → ok:false 'agent_not_found', nothing else runs", async () => {
    const { deps, recorded } = makeDeps({ agent: null });
    const res = await run(deps);
    assert.equal(res.ok, false);
    if (res.ok) throw new Error("unreachable");
    assert.equal(res.reason, "agent_not_found");
    assert.equal(recorded.loadConversationsArgs.length, 0);
  });

  test("no conversations → ok:false 'no_conversations', runEvals never called", async () => {
    const { deps, recorded } = makeDeps({ samples: [] });
    const res = await run(deps);
    assert.equal(res.ok, false);
    if (res.ok) throw new Error("unreachable");
    assert.equal(res.reason, "no_conversations");
    assert.equal(recorded.toScenarioSamples.length, 0);
    assert.equal(recorded.runEvalsArgs.length, 0);
  });

  test("every sample converting to null → ok:false 'no_scenarios'", async () => {
    const { deps, recorded } = makeDeps({
      samples: [sample("c1", true), sample("c2")],
      toScenario: async () => null,
    });
    const res = await run(deps);
    assert.equal(res.ok, false);
    if (res.ok) throw new Error("unreachable");
    assert.equal(res.reason, "no_scenarios");
    assert.equal(recorded.runEvalsArgs.length, 0);
  });
});

// ─── scenario assembly ────────────────────────────────────────────────────

describe("runImproveForAgent — scenario assembly", () => {
  test("deterministic (critical-sample) scenarios precede LLM-converted ones regardless of input order", async () => {
    const samples = [sample("c2"), sample("c1", true), sample("c3"), sample("c4", true)];
    const baseline = okRun([
      { id: "real-c1", passed: true },
      { id: "real-c4", passed: true },
      { id: "real-llm-c2", passed: true },
      { id: "real-llm-c3", passed: true },
    ]);
    const { deps, recorded } = makeDeps({ samples, runEvalsQueue: [baseline] });

    const res = await run(deps);
    assert.equal(res.ok, true);
    assert.deepEqual(
      recorded.runEvalsArgs[0].scenarios.map((s) => s.id),
      ["real-c1", "real-c4", "real-llm-c2", "real-llm-c3"],
    );
  });

  test("the scenario cap (env.maxScenarios) is enforced and conversion stops at the cap", async () => {
    const samples = [
      sample("c1", true),
      sample("c2", true),
      sample("c3"),
      sample("c4"),
      sample("c5"),
      sample("c6"),
    ];
    const baseline = okRun([
      { id: "real-c1", passed: true },
      { id: "real-c2", passed: true },
      { id: "real-llm-c3", passed: true },
    ]);
    const { deps, recorded } = makeDeps({
      samples,
      runEvalsQueue: [baseline],
      env: { maxScenarios: 3 },
    });

    const res = await run(deps);
    assert.equal(res.ok, true);
    assert.deepEqual(
      recorded.runEvalsArgs[0].scenarios.map((s) => s.id),
      ["real-c1", "real-c2", "real-llm-c3"],
    );
    // Conversion stopped AT the cap — no wasted LLM calls past it.
    assert.equal(recorded.toScenarioSamples.length, 3);
  });

  test("a throwing toScenario skips that sample and the run proceeds with the rest", async () => {
    const samples = [sample("c1", true), sample("c2"), sample("c3")];
    const baseline = okRun([
      { id: "real-c1", passed: true },
      { id: "real-llm-c3", passed: true },
    ]);
    const { deps, recorded } = makeDeps({
      samples,
      runEvalsQueue: [baseline],
      toScenario: async (s) => {
        if (s.conversationId === "c2") throw new Error("converter exploded");
        return fakeToScenario(s);
      },
    });

    const res = await run(deps);
    assert.equal(res.ok, true);
    assert.deepEqual(
      recorded.runEvalsArgs[0].scenarios.map((s) => s.id),
      ["real-c1", "real-llm-c3"],
    );
  });
});

// ─── persistence failures ─────────────────────────────────────────────────

describe("runImproveForAgent — persistence failure is a typed result, never a throw", () => {
  test("persistRun throwing on the baseline row → ok:false 'persist_failed'", async () => {
    const baseline = okRun([{ id: "real-llm-c2", passed: false, failedChecks: ["custom: x"] }]);
    const { deps } = makeDeps({
      samples: [sample("c2")],
      runEvalsQueue: [baseline],
      persistRun: async () => {
        throw new Error("db down");
      },
    });

    const res = await run(deps);
    assert.equal(res.ok, false);
    if (res.ok) throw new Error("unreachable");
    assert.equal(res.reason, "persist_failed");
  });

  test("persistProposal throwing → ok:false 'persist_failed' after both runs persisted", async () => {
    const baseline = okRun([{ id: "real-llm-c2", passed: false, failedChecks: ["custom: x"] }]);
    const candidate = okRun([{ id: "real-llm-c2", passed: true }]);
    const { deps, recorded } = makeDeps({
      samples: [sample("c2")],
      runEvalsQueue: [baseline, candidate],
      persistProposal: async () => {
        throw new Error("db down");
      },
    });

    const res = await run(deps);
    assert.equal(res.ok, false);
    if (res.ok) throw new Error("unreachable");
    assert.equal(res.reason, "persist_failed");
    assert.equal(recorded.persistRunRows.length, 2);
  });
});

// ─── paired flips + verdict ───────────────────────────────────────────────

describe("runImproveForAgent — paired flips and the small-N verdict", () => {
  test("2 improved / 1 regressed / 5 unchanged → net 1 → 'inconclusive'", async () => {
    const samples = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"].map((id) => sample(id));
    const ids = samples.map((s) => `real-llm-${s.conversationId}`);
    const baseline = okRun([
      { id: ids[0], passed: false, failedChecks: ["custom: a"] }, // → improved
      { id: ids[1], passed: false, failedChecks: ["custom: a"] }, // → improved
      { id: ids[2], passed: true }, // → regressed
      { id: ids[3], passed: true },
      { id: ids[4], passed: true },
      { id: ids[5], passed: true },
      { id: ids[6], passed: false, failedChecks: ["custom: b"] }, // fail→fail
      { id: ids[7], passed: false, failedChecks: ["custom: b"] }, // fail→fail
    ]);
    const candidate = okRun([
      { id: ids[0], passed: true },
      { id: ids[1], passed: true },
      { id: ids[2], passed: false, failedChecks: ["custom: new"] },
      { id: ids[3], passed: true },
      { id: ids[4], passed: true },
      { id: ids[5], passed: true },
      { id: ids[6], passed: false, failedChecks: ["custom: b"] },
      { id: ids[7], passed: false, failedChecks: ["custom: b"] },
    ]);
    const { deps } = makeDeps({ samples, runEvalsQueue: [baseline, candidate] });

    const res = await run(deps);
    assert.equal(res.ok, true);
    if (!res.ok) throw new Error("unreachable");
    assert.deepEqual(res.paired, {
      improved: 2,
      regressed: 1,
      unchanged: 5,
      criticalRegressed: false,
    });
    assert.equal(res.verdict, "inconclusive");
    // Propose-only: the proposal is still recorded; the verdict is display honesty.
    assert.equal(res.proposalId, "proposal-1");
  });

  test("a critical scenario regressing overall → criticalRegressed, never 'better' even at net >= 3", async () => {
    const samples = [sample("c1", true), ...["c2", "c3", "c4", "c5", "c6"].map((id) => sample(id))];
    const baseline = okRun([
      {
        id: "real-c1",
        passed: true,
        passedChecks: [`mustNotDo: ${CRIT_PROHIBITION}`],
      },
      { id: "real-llm-c2", passed: false, failedChecks: ["custom: x"] },
      { id: "real-llm-c3", passed: false, failedChecks: ["custom: x"] },
      { id: "real-llm-c4", passed: false, failedChecks: ["custom: x"] },
      { id: "real-llm-c5", passed: false, failedChecks: ["custom: x"] },
      { id: "real-llm-c6", passed: true },
    ]);
    const candidate = okRun([
      {
        id: "real-c1",
        passed: false,
        failedChecks: [`mustNotDo: ${CRIT_PROHIBITION}`],
      },
      { id: "real-llm-c2", passed: true },
      { id: "real-llm-c3", passed: true },
      { id: "real-llm-c4", passed: true },
      { id: "real-llm-c5", passed: true },
      { id: "real-llm-c6", passed: true },
    ]);
    const { deps } = makeDeps({ samples, runEvalsQueue: [baseline, candidate] });

    const res = await run(deps);
    assert.equal(res.ok, true);
    if (!res.ok) throw new Error("unreachable");
    assert.deepEqual(res.paired, {
      improved: 4,
      regressed: 1,
      unchanged: 1,
      criticalRegressed: true,
    });
    // net = 3 would qualify as "better" — the critical regression vetoes it.
    assert.equal(res.verdict, "inconclusive");
  });

  test("a critical mustNotDo CHECK flipping pass→fail sets criticalRegressed even when the scenario still passes overall", async () => {
    const samples = [sample("c1", true), ...["c2", "c3", "c4", "c5"].map((id) => sample(id))];
    const baseline = okRun([
      { id: "real-c1", passed: true, passedChecks: [`mustNotDo: ${CRIT_PROHIBITION}`] },
      { id: "real-llm-c2", passed: false, failedChecks: ["custom: x"] },
      { id: "real-llm-c3", passed: false, failedChecks: ["custom: x"] },
      { id: "real-llm-c4", passed: false, failedChecks: ["custom: x"] },
      { id: "real-llm-c5", passed: true },
    ]);
    const candidate = okRun([
      // Overall still "passed" (a fake/lenient runner) but the critical
      // validator-derived check itself flipped — the honesty rule catches it.
      { id: "real-c1", passed: true, failedChecks: [`mustNotDo: ${CRIT_PROHIBITION}`] },
      { id: "real-llm-c2", passed: true },
      { id: "real-llm-c3", passed: true },
      { id: "real-llm-c4", passed: true },
      { id: "real-llm-c5", passed: true },
    ]);
    const { deps } = makeDeps({ samples, runEvalsQueue: [baseline, candidate] });

    const res = await run(deps);
    assert.equal(res.ok, true);
    if (!res.ok) throw new Error("unreachable");
    assert.deepEqual(res.paired, {
      improved: 3,
      regressed: 0,
      unchanged: 2,
      criticalRegressed: true,
    });
    assert.equal(res.verdict, "inconclusive");
  });

  test("net <= -3 → 'worse'", async () => {
    const samples = ["c1", "c2", "c3", "c4", "c5", "c6"].map((id) => sample(id));
    const ids = samples.map((s) => `real-llm-${s.conversationId}`);
    const baseline = okRun([
      { id: ids[0], passed: true },
      { id: ids[1], passed: true },
      { id: ids[2], passed: true },
      { id: ids[3], passed: false, failedChecks: ["custom: x"] },
      { id: ids[4], passed: false, failedChecks: ["custom: x"] },
      { id: ids[5], passed: false, failedChecks: ["custom: x"] },
    ]);
    const candidate = okRun([
      { id: ids[0], passed: false, failedChecks: ["custom: y"] },
      { id: ids[1], passed: false, failedChecks: ["custom: y"] },
      { id: ids[2], passed: false, failedChecks: ["custom: y"] },
      { id: ids[3], passed: false, failedChecks: ["custom: x"] },
      { id: ids[4], passed: false, failedChecks: ["custom: x"] },
      { id: ids[5], passed: false, failedChecks: ["custom: x"] },
    ]);
    const { deps } = makeDeps({ samples, runEvalsQueue: [baseline, candidate] });

    const res = await run(deps);
    assert.equal(res.ok, true);
    if (!res.ok) throw new Error("unreachable");
    assert.deepEqual(res.paired, {
      improved: 0,
      regressed: 3,
      unchanged: 3,
      criticalRegressed: false,
    });
    assert.equal(res.verdict, "worse");
  });
});

// ─── ancillary fail-soft ──────────────────────────────────────────────────

describe("runImproveForAgent — ancillary fail-soft", () => {
  test("a throwing loadLessons degrades to [] and the proposer still runs", async () => {
    const baseline = okRun([{ id: "real-llm-c2", passed: false, failedChecks: ["custom: x"] }]);
    const candidate = okRun([{ id: "real-llm-c2", passed: true }]);
    const { deps, recorded } = makeDeps({
      samples: [sample("c2")],
      runEvalsQueue: [baseline, candidate],
      loadLessons: async () => {
        throw new Error("brain offline");
      },
    });

    const res = await run(deps);
    assert.equal(res.ok, true);
    assert.equal(recorded.proposePatchArgs.length, 1);
    assert.deepEqual(recorded.proposePatchArgs[0].lessons, []);
  });
});
