// Improve verb + trust rail (2026-07-02) — Task 8: the run ORCHESTRATOR.
//
// `runImproveForAgent` is the FIFTH stage of the improve pipeline (design
// doc: docs/superpowers/specs/2026-07-02-improve-verb-trust-rail-design.md) —
// the piece that composes T4 (sourcing) → T5 (scenario conversion) → the
// baseline eval replay → T2 (persistence) → T6 (clustering) → T7 (proposer +
// guardrail) → the shadow-candidate replay → the proposal row. It is PURE
// COMPOSITION: every external effect arrives via `ImproveRunDeps`, so the
// unit spec drives the whole pipeline with plain fakes (no network, no
// Anthropic, no Postgres). It NEVER throws — every stage is try/caught to a
// typed `{ ok: false, reason }` or a documented fail-soft degradation — and
// it can NEVER apply anything: nothing here imports `updateAgentBlueprint`;
// the only writes are the two eval_runs rows and the propose-only proposal
// row (status "proposed" — `applyImproveProposal` is the sole apply gate,
// per the plan's Global Constraints).
//
// ─── The injected `runEvals` seam ─────────────────────────────────────────
//
// The orchestrator NEVER touches `runDeployedAgentEvals` directly. T9's
// real-deps assembly implements `deps.runEvals` by calling it with a
// `loadAgent` dep that returns `shadowBlueprint` in place of the live
// blueprint when one is provided — the runner itself stays untouched, and
// the orchestrator stays ignorant of HOW a replay happens. Baseline and
// candidate replay the IDENTICAL scenario list (same array), which is what
// makes the paired-flips arithmetic meaningful.
//
// ─── Scenario assembly (deterministic first, capped) ──────────────────────
//
// Samples are stable-partitioned CRITICAL-first (`hadCriticalValidatorFailure`)
// before conversion, so deterministic validator-failure scenarios always
// precede LLM-converted ones in the replay list. T4's 3-tier sampler already
// returns critical conversations first, but the guarantee is re-asserted
// here so it doesn't depend on the injected loader's ordering. `toScenario`
// is called sequentially and STOPS at `env.maxScenarios` — no wasted LLM
// conversions past the cap. A throwing/null conversion skips that sample
// (per-sample fail-soft); a duplicate scenario id is skipped defensively
// (the paired join below is keyed by id). The per-sample deterministic-vs-
// LLM branch choice itself lives in the injected `toScenario` (T9 composes
// `scenarioFromValidatorFailure` first, then the LLM converter).
//
// ─── Clustering inputs are DERIVED, names-only ────────────────────────────
//
// The eval runner's results carry NO `failedChecks` field — the orchestrator
// derives it exactly like T2's `summarizeRunForPersistence` does:
// `score.checks.filter(c => !c.passed).map(c => c.name)` — check NAMES only,
// never `detail`, never transcripts. A passing scenario (or one with all
// checks passing) is never sent anywhere near the clusterer. Per T6's
// composition note, `bucketByValidator`'s `remainder` carries scenarioIds
// ONLY — they are joined back to `{ scenarioId, title, failedChecks }` here
// before `deps.clusterFailures` (the LLM labeler) sees them. An empty
// remainder never invokes the labeler at all; a THROWING labeler fails soft
// to ONE "other" cluster wrapping the whole remainder (T6's own "a failure
// the human needs to see can never simply vanish" floor, re-applied at the
// seam boundary).
//
// ─── criticalRegressed — the EXACT criterion (documented per the plan) ────
//
// A scenario is CRITICAL iff its SOURCE ConversationSample had
// `hadCriticalValidatorFailure === true`, tracked at assembly time — these
// are exactly the scenarios whose `mustNotDo` prohibitions derive from
// critical validator failures (T4 gates that flag on critical severity; T5's
// deterministic branch maps the failed validator names into `mustNotDo`).
// `criticalRegressed` is true iff at least one critical scenario, present in
// BOTH runs by scenario id, EITHER:
//   (a) flips its overall hard-gate `passed` true→false (scenario-level —
//       under the real scorer `passed` is exactly the safety+mustNotDo hard
//       gates, so any overall regression on a critical scenario means a hard
//       gate broke), OR
//   (b) has a check named `mustNotDo: <p>` — where `<p>` is one of THAT
//       scenario's own assembled mustNotDo prohibitions, and the name format
//       is the deterministic scorer's own (`score-deterministic.ts` names
//       mustNotDo checks exactly `` `mustNotDo: ${phrase}` ``) — that passed
//       in baseline and fails in candidate (check-level, per the amended
//       plan's letter; catches a runner whose overall verdict didn't flip).
// The union is deliberately conservative in one direction only: it can veto
// "better" (downgrading to "inconclusive"), never manufacture it.
//
// ─── Verdict (small-N honesty, research addendum §2) ──────────────────────
//
// At N≈24 scenarios only large effects are real (a 3pp delta needs ~969
// samples at 80% power), so: "better" ONLY if (improved - regressed) >= 3
// AND !criticalRegressed; (improved - regressed) <= -3 → "worse"; else
// "inconclusive". `null` when no candidate ran. The verdict is DISPLAY
// honesty — it never gates persistence (propose-only: the human decides).
//
// ─── Persistence choices ──────────────────────────────────────────────────
//
// Baseline row: kind "improve_baseline", blueprintVersion =
// agent.currentVersion. Candidate row: kind "improve_candidate", SAME
// blueprintVersion — the candidate is a SHADOW of the current version
// (`{ ...blueprint, ...patch }`); no new agent version exists unless/until
// `applyImproveProposal` creates one, so the row records the version the
// shadow was derived FROM (the kind + the proposal row's basedOnVersion make
// the provenance unambiguous). `graderModel` is recorded as the same
// call-time resolution every eval-tier LLM module uses
// (`ANTHROPIC_EVAL_MODEL || claude-haiku-4-5`) — best-effort provenance for
// the grader the injected replay seam will have used (T9 builds it via the
// same resolution). The proposal row's `rationale.clusters` maps T6's
// `FailureCluster.mode` onto the schema's `taxonomy` field (derived evidence
// sentences only — `exampleScenarioIds` stay in the returned result, not the
// row). ANY persistence failure → `{ ok: false, reason: "persist_failed" }`,
// never a throw.
//
// NOT "use server": a plain lib module (mirrors run-agent-evals.ts) that a
// "use server" action/route (T9/T10) imports and supplies real deps to.

import type { AgentBlueprint } from "@/db/schema/agents";
import type { agentImproveProposals, NewEvalRun } from "@/db/schema/eval-runs";
import type { ImproveProposalRationale } from "@/db/schema/eval-runs";
import { summarizeRunForPersistence } from "@/lib/agents/evals/eval-runs-store";
import type { EvalScenario } from "@/lib/agents/evals/eval-types";
import type {
  AgentEvalResult,
  RunAgentEvalsResult,
} from "@/lib/agents/evals/run-agent-evals";
import {
  bucketByValidator,
  type FailureCluster,
} from "@/lib/agents/improve/cluster-failures";
import { validateProposedPatch } from "@/lib/agents/improve/propose-patch";
import type {
  ConversationSample,
  loadRealConversationsForAgent,
} from "@/lib/agents/improve/source-conversations";

// ─── types (binding shape per the amended plan) ───────────────────────────

export type ImproveRunDeps = {
  loadConversations: typeof loadRealConversationsForAgent;
  /** Converts ONE sample → a scenario (or null to skip it). The
   *  deterministic-vs-LLM branch choice per sample is composed by the
   *  real-deps assembly (T9); the orchestrator owns ORDERING (critical-
   *  sample scenarios first) and the cap. */
  toScenario: (s: ConversationSample) => Promise<EvalScenario | null>;
  /** The INJECTED replay seam — see the module header. Baseline omits
   *  `shadowBlueprint`; the candidate passes the patched shadow. */
  runEvals: (args: {
    agentId: string;
    orgId: string;
    scenarios: EvalScenario[];
    shadowBlueprint?: AgentBlueprint;
  }) => Promise<{ ok: true; result: RunAgentEvalsResult } | { ok: false; guard: string }>;
  /** The LLM failure labeler (T6's makeLlmFailureClusterer) — receives ONLY
   *  the remainder bucketByValidator couldn't map, already joined back to
   *  {scenarioId, title, failedChecks}. */
  clusterFailures: (args: {
    failed: Array<{ scenarioId: string; title: string; failedChecks: string[] }>;
  }) => Promise<FailureCluster[]>;
  proposePatch: (args: {
    blueprint: AgentBlueprint;
    clusters: FailureCluster[];
    lessons: string[];
  }) => Promise<{ patch: Partial<AgentBlueprint>; rationale: string } | null>;
  loadAgent: (args: {
    agentId: string;
    orgId: string;
  }) => Promise<{ blueprint: AgentBlueprint; currentVersion: number } | null>;
  loadLessons: (agentId: string) => Promise<string[]>;
  persistRun: (row: NewEvalRun) => Promise<{ id: string }>;
  persistProposal: (
    row: Omit<typeof agentImproveProposals.$inferInsert, "id" | "createdAt">,
  ) => Promise<{ id: string }>;
  env: { sampleSize: number; maxScenarios: number; patchMaxBytes: number };
};

export type ImproveRunResult =
  | {
      ok: true;
      proposalId: string | null;
      baseline: { passRate: number; total: number };
      candidate: { passRate: number; total: number } | null;
      /** Research addendum §1: per-scenario flips between baseline and
       *  candidate on the IDENTICAL scenario set (paired differences —
       *  arxiv 2411.00640). null when no candidate ran. */
      paired: {
        improved: number;
        regressed: number;
        unchanged: number;
        criticalRegressed: boolean;
      } | null;
      /** Research addendum §2 small-N honesty: "better" ONLY when
       *  improved-regressed >= 3 AND !criticalRegressed; net <= -3 →
       *  "worse"; else "inconclusive". null when no candidate ran. */
      verdict: "better" | "inconclusive" | "worse" | null;
      clusters: FailureCluster[];
      note?: string;
    }
  | { ok: false; reason: "agent_not_found" | "no_conversations" | "no_scenarios" | string };

/** Same eval-tier model knob every improve/eval LLM module resolves at call
 *  time (score-llm.ts, cluster-failures.ts, propose-patch.ts, …) — recorded
 *  on the persisted rows as best-effort grader provenance. */
const DEFAULT_EVAL_MODEL = "claude-haiku-4-5";

// ─── small pure helpers ───────────────────────────────────────────────────

/** Failed check NAMES only — the same derivation (and the same privacy
 *  boundary) as T2's `summarizeRunForPersistence`: never `detail`, never
 *  transcript text. */
function failedCheckNames(score: AgentEvalResult["score"] | undefined): string[] {
  const checks = Array.isArray(score?.checks) ? score.checks : [];
  return checks.filter((c) => c && c.passed === false).map((c) => c.name);
}

/** Per-scenario assembly metadata the paired computation needs: was this
 *  scenario derived from a critical-validator-failure conversation, and what
 *  are its own mustNotDo prohibitions (for the check-level criterion). */
type ScenarioMeta = { critical: boolean; mustNotDo: string[] };

function passedById(result: RunAgentEvalsResult): Map<string, boolean> {
  const map = new Map<string, boolean>();
  for (const r of Array.isArray(result?.results) ? result.results : []) {
    const id = r?.scenario?.id ?? r?.score?.scenarioId;
    if (typeof id === "string" && id.length > 0) map.set(id, r?.score?.passed === true);
  }
  return map;
}

function checkOutcomesById(result: RunAgentEvalsResult): Map<string, Map<string, boolean>> {
  const map = new Map<string, Map<string, boolean>>();
  for (const r of Array.isArray(result?.results) ? result.results : []) {
    const id = r?.scenario?.id ?? r?.score?.scenarioId;
    if (typeof id !== "string" || id.length === 0) continue;
    const checks = new Map<string, boolean>();
    for (const c of Array.isArray(r?.score?.checks) ? r.score.checks : []) {
      if (c && typeof c.name === "string") checks.set(c.name, c.passed === true);
    }
    map.set(id, checks);
  }
  return map;
}

/**
 * PURE. Paired per-scenario flips between the baseline and candidate replays
 * of the IDENTICAL scenario list, joined by scenario id. Only ids present in
 * BOTH runs contribute (the seam contract replays the same list; a runner
 * that somehow dropped a scenario contributes nothing rather than skewing a
 * flip count). `criticalRegressed` per the module-header criterion.
 */
function computePairedFlips(args: {
  baseline: RunAgentEvalsResult;
  candidate: RunAgentEvalsResult;
  scenarioMeta: Map<string, ScenarioMeta>;
}): { improved: number; regressed: number; unchanged: number; criticalRegressed: boolean } {
  const basePassed = passedById(args.baseline);
  const candPassed = passedById(args.candidate);
  const baseChecks = checkOutcomesById(args.baseline);
  const candChecks = checkOutcomesById(args.candidate);

  let improved = 0;
  let regressed = 0;
  let unchanged = 0;
  let criticalRegressed = false;

  for (const [id, before] of basePassed) {
    const after = candPassed.get(id);
    if (after === undefined) continue;

    if (!before && after) improved += 1;
    else if (before && !after) regressed += 1;
    else unchanged += 1;

    const meta = args.scenarioMeta.get(id);
    if (!meta?.critical || criticalRegressed) continue;

    // (a) scenario-level: a critical scenario regressing overall.
    if (before && !after) {
      criticalRegressed = true;
      continue;
    }
    // (b) check-level: its validator-derived `mustNotDo: <p>` check flipped
    // pass→fail even though the overall verdict didn't.
    const bc = baseChecks.get(id);
    const cc = candChecks.get(id);
    for (const prohibition of meta.mustNotDo) {
      const name = `mustNotDo: ${prohibition}`;
      if (bc?.get(name) === true && cc?.get(name) === false) {
        criticalRegressed = true;
        break;
      }
    }
  }

  return { improved, regressed, unchanged, criticalRegressed };
}

/** The small-N honesty rule — see the module header. */
function verdictFor(paired: {
  improved: number;
  regressed: number;
  criticalRegressed: boolean;
}): "better" | "inconclusive" | "worse" {
  const net = paired.improved - paired.regressed;
  if (net >= 3 && !paired.criticalRegressed) return "better";
  if (net <= -3) return "worse";
  return "inconclusive";
}

/** T6's fail-soft floor, re-applied at the SEAM boundary: if the injected
 *  labeler itself throws, the whole remainder collapses to ONE "other"
 *  cluster — a failure the human needs to see is never dropped. Evidence is
 *  short derived text (<= 200 chars by construction: id + check names). */
function otherClusterFloor(
  remainder: Array<{ scenarioId: string; title: string; failedChecks: string[] }>,
): FailureCluster[] {
  if (remainder.length === 0) return [];
  return [
    {
      mode: "other",
      count: remainder.length,
      exampleScenarioIds: remainder.map((r) => r.scenarioId),
      evidence: remainder.map((r) =>
        `Scenario ${r.scenarioId} failed: ${r.failedChecks.join(", ") || "unspecified check"}.`.slice(0, 200),
      ),
    },
  ];
}

function summaryStats(result: RunAgentEvalsResult): { passRate: number; total: number } {
  return {
    passRate: result?.summary?.passRate ?? 0,
    total: result?.summary?.total ?? 0,
  };
}

// ─── the orchestrator ─────────────────────────────────────────────────────

/**
 * Run one full improve cycle for a deployed agent: source real conversations
 * → assemble a scenario list (deterministic-first, capped) → BASELINE replay
 * → persist → cluster failures → propose a patch → guardrail-validate it
 * against the CURRENT blueprint → CANDIDATE replay on the shadow blueprint →
 * persist the candidate run + the propose-only proposal row → paired flips +
 * the small-N verdict. NEVER throws; NEVER applies anything.
 */
export async function runImproveForAgent(
  args: { agentId: string; orgId: string },
  deps: ImproveRunDeps,
): Promise<ImproveRunResult> {
  const { agentId, orgId } = args;

  // 1. Load the agent (blueprint + version).
  let agent: { blueprint: AgentBlueprint; currentVersion: number } | null;
  try {
    agent = await deps.loadAgent({ agentId, orgId });
  } catch {
    agent = null;
  }
  if (!agent) return { ok: false, reason: "agent_not_found" };

  // 2. Source real conversations (candidate pool = env.sampleSize).
  let samples: ConversationSample[];
  try {
    samples = await deps.loadConversations({ agentId, orgId, limit: deps.env.sampleSize });
  } catch {
    samples = [];
  }
  if (!Array.isArray(samples) || samples.length === 0) {
    return { ok: false, reason: "no_conversations" };
  }

  // 3. Assemble scenarios: critical samples first (stable partition), then
  //    the rest; convert sequentially; stop at the cap; skip null/throwing
  //    conversions and duplicate ids.
  const ordered = [
    ...samples.filter((s) => s?.hadCriticalValidatorFailure === true),
    ...samples.filter((s) => s?.hadCriticalValidatorFailure !== true),
  ];
  const scenarios: EvalScenario[] = [];
  const scenarioMeta = new Map<string, ScenarioMeta>();
  for (const s of ordered) {
    if (scenarios.length >= deps.env.maxScenarios) break;
    let scenario: EvalScenario | null;
    try {
      scenario = await deps.toScenario(s);
    } catch {
      scenario = null;
    }
    if (!scenario || typeof scenario.id !== "string" || scenario.id.length === 0) continue;
    if (scenarioMeta.has(scenario.id)) continue;
    scenarios.push(scenario);
    scenarioMeta.set(scenario.id, {
      critical: s?.hadCriticalValidatorFailure === true,
      mustNotDo: Array.isArray(scenario.mustNotDo) ? scenario.mustNotDo : [],
    });
  }
  if (scenarios.length === 0) return { ok: false, reason: "no_scenarios" };

  // 4. BASELINE replay (no shadow — the live blueprint).
  let baselineRes: Awaited<ReturnType<ImproveRunDeps["runEvals"]>>;
  try {
    baselineRes = await deps.runEvals({ agentId, orgId, scenarios });
  } catch {
    return { ok: false, reason: "eval_run_failed" };
  }
  if (!baselineRes.ok) return { ok: false, reason: baselineRes.guard };
  const baseline = baselineRes.result;
  const baselineStats = summaryStats(baseline);

  const graderModel = process.env.ANTHROPIC_EVAL_MODEL?.trim() || DEFAULT_EVAL_MODEL;

  // 5. Persist the baseline run (kind improve_baseline, current version).
  let baselineRunId: string;
  try {
    const row = summarizeRunForPersistence({
      orgId,
      subjectKind: "agent",
      subjectId: agentId,
      kind: "improve_baseline",
      result: baseline,
      graderModel,
      blueprintVersion: agent.currentVersion,
    });
    baselineRunId = (await deps.persistRun(row)).id;
  } catch {
    return { ok: false, reason: "persist_failed" };
  }

  // 6. Cluster the FAILED scenarios. failedChecks is DERIVED here (names
  //    only) — see the module header; passing scenarios never reach this.
  const failed = (Array.isArray(baseline.results) ? baseline.results : [])
    .filter((r) => r?.score?.passed !== true)
    .map((r) => ({
      scenarioId: r?.scenario?.id ?? r?.score?.scenarioId ?? "",
      title: r?.scenario?.title ?? "",
      failedChecks: failedCheckNames(r?.score),
    }))
    .filter((f) => f.scenarioId.length > 0);

  const { bucketed, remainder } = bucketByValidator(
    failed.map(({ scenarioId, failedChecks }) => ({ scenarioId, failedChecks })),
  );

  let llmClusters: FailureCluster[] = [];
  if (remainder.length > 0) {
    // Join the remainder ids back to {scenarioId, title, failedChecks} —
    // bucketByValidator's remainder carries ids ONLY (T6 composition note).
    const failedById = new Map(failed.map((f) => [f.scenarioId, f]));
    const remainderItems = remainder
      .map((id) => failedById.get(id))
      .filter((f): f is (typeof failed)[number] => f !== undefined);
    try {
      const labeled = await deps.clusterFailures({ failed: remainderItems });
      llmClusters = Array.isArray(labeled) ? labeled : otherClusterFloor(remainderItems);
    } catch {
      llmClusters = otherClusterFloor(remainderItems);
    }
  }
  const clusters: FailureCluster[] = [...bucketed, ...llmClusters];

  // 7. Perfect baseline → nothing to improve; no proposal, no candidate.
  if (baseline.summary?.passRate === 1) {
    return {
      ok: true,
      proposalId: null,
      baseline: baselineStats,
      candidate: null,
      paired: null,
      verdict: null,
      clusters,
      note: "nothing to improve",
    };
  }

  // 8. Standing Brain lessons (enrichment — a failure degrades to []).
  let lessons: string[];
  try {
    const loaded = await deps.loadLessons(agentId);
    lessons = Array.isArray(loaded) ? loaded : [];
  } catch {
    lessons = [];
  }

  // 9. Propose a patch (fail-soft to null — "nothing proposed" is always a
  //    valid, safe improve outcome).
  let proposal: { patch: Partial<AgentBlueprint>; rationale: string } | null;
  try {
    proposal = await deps.proposePatch({ blueprint: agent.blueprint, clusters, lessons });
  } catch {
    proposal = null;
  }
  if (!proposal) {
    return {
      ok: true,
      proposalId: null,
      baseline: baselineStats,
      candidate: null,
      paired: null,
      verdict: null,
      clusters,
      note: "no patch proposed",
    };
  }

  // 10. Guardrail — T7's proposer does NOT validate its own output; the
  //     orchestrator runs the PURE gate against the CURRENT blueprint before
  //     any candidate replay. An invalid patch never reaches a shadow run or
  //     a persisted row.
  const validation = validateProposedPatch({
    patch: proposal.patch,
    currentBlueprint: agent.blueprint,
    maxBytes: deps.env.patchMaxBytes,
  });
  if (!validation.ok) {
    return {
      ok: true,
      proposalId: null,
      baseline: baselineStats,
      candidate: null,
      paired: null,
      verdict: null,
      clusters,
      note: `patch rejected: ${validation.reason}`,
    };
  }

  // 11. CANDIDATE replay — the IDENTICAL scenario list on the shadow
  //     blueprint (shallow merge, exactly what applyImproveProposal would
  //     produce).
  const shadowBlueprint: AgentBlueprint = { ...agent.blueprint, ...validation.patch };
  let candidateRes: Awaited<ReturnType<ImproveRunDeps["runEvals"]>>;
  try {
    candidateRes = await deps.runEvals({ agentId, orgId, scenarios, shadowBlueprint });
  } catch {
    return { ok: false, reason: "eval_run_failed" };
  }
  if (!candidateRes.ok) return { ok: false, reason: candidateRes.guard };
  const candidate = candidateRes.result;

  // 12. Persist the candidate run — kind improve_candidate, SAME
  //     blueprintVersion (a shadow has no version of its own; see header).
  let candidateRunId: string;
  try {
    const row = summarizeRunForPersistence({
      orgId,
      subjectKind: "agent",
      subjectId: agentId,
      kind: "improve_candidate",
      result: candidate,
      graderModel,
      blueprintVersion: agent.currentVersion,
    });
    candidateRunId = (await deps.persistRun(row)).id;
  } catch {
    return { ok: false, reason: "persist_failed" };
  }

  // 13. Persist the propose-only proposal row (status "proposed" — only
  //     applyImproveProposal may ever move it beyond that). rationale maps
  //     T6's `mode` onto the schema's `taxonomy` (derived evidence only).
  let proposalId: string;
  try {
    const rationale: ImproveProposalRationale = {
      clusters: clusters.map((c) => ({
        taxonomy: c.mode,
        count: c.count,
        evidence: c.evidence,
      })),
    };
    const inserted = await deps.persistProposal({
      orgId,
      agentId,
      basedOnVersion: agent.currentVersion,
      patch: validation.patch,
      rationale,
      baselineRunId,
      candidateRunId,
      status: "proposed",
    });
    proposalId = inserted.id;
  } catch {
    return { ok: false, reason: "persist_failed" };
  }

  // 14. Paired flips + the small-N verdict.
  const paired = computePairedFlips({ baseline, candidate, scenarioMeta });
  const verdict = verdictFor(paired);

  return {
    ok: true,
    proposalId,
    baseline: baselineStats,
    candidate: summaryStats(candidate),
    paired,
    verdict,
    clusters,
  };
}
