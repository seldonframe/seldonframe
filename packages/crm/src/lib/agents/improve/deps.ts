// Improve verb + trust rail (2026-07-02) — Task 9: real deps assembly +
// the propose-only apply/dismiss core.
//
// Two independent halves live here:
//
//   1. `buildImproveDeps` — assembles the REAL `ImproveRunDeps` (improve-
//      run.ts) for one agent: the BYOK gate + `getClient` exactly per
//      eval-actions.ts's resolveStudioBuildGate/NEEDS_BYOK_MESSAGE pattern,
//      `runEvals` wrapping `runDeployedAgentEvals` (run-deployed-agent-
//      evals.ts) with a `loadAgent` that swaps in `shadowBlueprint` when
//      given one, `toScenario` composing T5's deterministic branch
//      (scenarioFromValidatorFailure) first and falling back to the LLM
//      converter (makeLlmConvoScenarioConverter), `clusterFailures` /
//      `proposePatch` wrapping T6/T7's LLM factories, `loadLessons` reading
//      the org's Brain memory store, and `persistRun`/`persistProposal`
//      writing the two eval_runs/agent_improve_proposals tables.
//
//   2. `applyImproveProposal` / `dismissImproveProposal` — the PROPOSE-ONLY
//      apply gate. Per the plan's Global Constraints, nothing but
//      `applyImproveProposal` may ever call `updateAgentBlueprint` for this
//      feature, and only when the proposal is `status: "proposed"` AND org-
//      scoped. Every external effect arrives via `ApplyProposalDeps` /
//      `DismissProposalDeps`, so `apply-proposal.spec.ts` drives the whole
//      lifecycle with plain fakes — no network, no Postgres. Apply RE-
//      VALIDATES the patch against the CURRENT blueprint (it may have moved
//      since the proposal was created) before calling `updateBlueprint`;
//      version drift (`basedOnVersion !== currentVersion`) does NOT block —
//      it only annotates the return with `note: "applied over vN"`. Dismiss
//      ONLY flips status — it never touches the blueprint.
//
// NOT "use server": a plain lib module (mirrors eval-actions.ts's own
// pattern of importing plain-module assembly helpers) that actions.ts
// ("use server") imports and calls with the org-scoped ids from the
// session. `buildImproveDeps` itself performs I/O (DB reads, the Anthropic
// client resolution), but stays DI-friendly under the hood — the unit spec
// exercises `applyImproveProposal`/`dismissImproveProposal` only, over
// fakes; `buildImproveDeps`'s own real wiring is exercised by actions.ts's
// callers at runtime (mirrors the eval-actions.ts / run-agent-evals.ts
// split: the orchestrator is unit-tested, the real-deps assembly is not).

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, agentVersions, organizations } from "@/db/schema";
import type { AgentBlueprint } from "@/db/schema/agents";
import type { ImproveProposal, NewEvalRun } from "@/db/schema/eval-runs";
import { agentImproveProposals } from "@/db/schema/eval-runs";
import { getAIClient, getAnthropicClient } from "@/lib/ai/client";
import { resolveStudioBuildGate, NEEDS_BYOK_MESSAGE } from "@/lib/agent-templates/studio-build-gate";
import { recallAgentMemory, recordAgentMemory } from "@/lib/agents/memory/agent-memory";
import { makeBrainMemoryStoreForOrg } from "@/lib/agents/memory/brain-memory-store";
import {
  runDeployedAgentEvals,
  defaultDeployedEvalDeps,
  type RunDeployedAgentEvalsResult,
} from "@/lib/agents/evals/run-deployed-agent-evals";
import { makeLlmCustomerSim } from "@/lib/agents/evals/sim-llm";
import { makeLlmEvalGrader, DEFAULT_EVAL_MODEL } from "@/lib/agents/evals/score-llm";
import { recordEvalRun } from "@/lib/agents/evals/eval-runs-store";
import {
  scenarioFromValidatorFailure,
  makeLlmConvoScenarioConverter,
} from "@/lib/agents/improve/convo-to-scenario";
import { makeLlmFailureClusterer } from "@/lib/agents/improve/cluster-failures";
import { makeLlmPatchProposer, validateProposedPatch } from "@/lib/agents/improve/propose-patch";
import type { ImproveRunDeps } from "@/lib/agents/improve/improve-run";
import type { ConversationSample } from "@/lib/agents/improve/source-conversations";
import { defaultSourceConversationsDeps, loadRealConversationsForAgent } from "@/lib/agents/improve/source-conversations";

// ─── env resolution (call-time, matches the repo's process.env.X?.trim() ||
// DEFAULT convention — e.g. source-conversations.ts's resolveDefaultSampleSize) ──

const DEFAULT_SAMPLE_SIZE = 50;
const DEFAULT_MAX_SCENARIOS = 24;
const DEFAULT_PATCH_MAX_BYTES = 8192;

function resolvePositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

/** The "lessons" subject key under the standing improve-loop Brain
 *  namespace, one per agent (keyed by agentKey = agentId). */
const LESSONS_SUBJECT_KEY = "improve_lessons";

// ─── buildImproveDeps (real ImproveRunDeps assembly) ──────────────────────

export type BuildImproveDepsResult =
  | { ok: true; deps: ImproveRunDeps }
  | { ok: false; error: "no_llm_key"; message: string };

/**
 * Assemble the REAL `ImproveRunDeps` for one agent, org-scoped. BYOK-gated
 * exactly like eval-actions.ts's runAgentEvalsAction: improve is unbounded-
 * COGS build/test work, so it requires the operator's OWN key (mode ===
 * "byok") — a null client (e.g. an OpenAI-only BYOK key) is also rejected,
 * since the agent runtime + every improve-pipeline LLM call is Anthropic-
 * only.
 *
 * `runEvals` wraps `runDeployedAgentEvals` (run-deployed-agent-evals.ts)
 * assembling its `DeployedEvalDeps` the same way that module's own
 * `defaultDeployedEvalDeps` does, EXCEPT `loadAgent` returns
 * `{ ...agent, blueprint: shadowBlueprint ?? agent.blueprint }` when a
 * shadow is provided — the runner itself is untouched; only the loaded
 * blueprint differs between the baseline and candidate calls. Scenarios are
 * injected via `runDeployedAgentEvals`'s `generator` seam as a pass-through
 * that returns exactly the scenario list the orchestrator assembled (never
 * asked to generate its own).
 */
export async function buildImproveDeps(args: {
  orgId: string;
  agentId: string;
}): Promise<BuildImproveDepsResult> {
  const { orgId, agentId } = args;

  const resolution = await getAIClient({ orgId });
  const gate = resolveStudioBuildGate(resolution.mode);
  if (!gate.ok || !resolution.client) {
    return { ok: false, error: "no_llm_key", message: NEEDS_BYOK_MESSAGE };
  }
  const client = resolution.client;
  const getClient = () => client;

  const lessonsStore = makeBrainMemoryStoreForOrg(orgId);
  const clusterFailures = makeLlmFailureClusterer({ getClient });
  const proposePatch = makeLlmPatchProposer({ getClient });
  const llmToScenario = makeLlmConvoScenarioConverter({ getClient });
  const simCustomer = makeLlmCustomerSim({ getClient });
  const grader = makeLlmEvalGrader({ getClient });

  const graderModel = process.env.ANTHROPIC_EVAL_MODEL?.trim() || DEFAULT_EVAL_MODEL;

  const deps: ImproveRunDeps = {
    loadConversations: (loadArgs) =>
      loadRealConversationsForAgent(loadArgs, undefined),

    // T5 composition: the deterministic branch first (free, no LLM call);
    // only samples it declines (hadCriticalValidatorFailure === false, or no
    // user turn to open on) fall through to the LLM branch.
    toScenario: async (s: ConversationSample) => {
      const deterministic = scenarioFromValidatorFailure(s);
      if (deterministic) return deterministic;
      return llmToScenario(s);
    },

    // The injected replay seam. loadAgent is the ONLY thing that differs
    // from run-deployed-agent-evals.ts's own defaultDeployedEvalDeps: it
    // swaps in shadowBlueprint (the candidate's shallow-merged patch) in
    // place of the live blueprint when one is provided. Scenarios arrive via
    // a pass-through generator so runDeployedAgentEvals replays EXACTLY the
    // list the orchestrator assembled (never authors its own).
    runEvals: async (runArgs) => {
      const base = await defaultDeployedEvalDeps();
      const loadAgent: (typeof base)["loadAgent"] = async (loadArgs) => {
        const agent = await base.loadAgent(loadArgs);
        if (!agent) return null;
        return {
          ...agent,
          blueprint: runArgs.shadowBlueprint ?? agent.blueprint,
        };
      };

      const result: RunDeployedAgentEvalsResult = await runDeployedAgentEvals(
        { agentId: runArgs.agentId, orgId: runArgs.orgId },
        {
          ...base,
          loadAgent,
          simCustomer,
          grader,
          lessonsStore,
          // Pass-through generator: the orchestrator already assembled the
          // scenario list (critical-first, capped) — replay it verbatim
          // rather than letting the eval harness author its own.
          generator: async () => runArgs.scenarios,
        },
      );

      if (!result.ok) return { ok: false, guard: result.guard };
      return { ok: true, result: { results: result.results, summary: result.summary } };
    },

    clusterFailures,
    proposePatch,

    loadAgent: async ({ agentId: id, orgId: org }) => {
      const [row] = await db
        .select({ blueprint: agents.blueprint, currentVersion: agents.currentVersion })
        .from(agents)
        .where(and(eq(agents.id, id), eq(agents.orgId, org)))
        .limit(1);
      if (!row) return null;
      return {
        blueprint: (row.blueprint ?? {}) as AgentBlueprint,
        currentVersion: row.currentVersion,
      };
    },

    loadLessons: async (key: string) => {
      const entries = await recallAgentMemory(lessonsStore, {
        orgId,
        agentKey: key,
        subjectKey: LESSONS_SUBJECT_KEY,
      });
      return entries.map((e) => e.summary).filter((s) => typeof s === "string" && s.length > 0);
    },

    persistRun: (row: NewEvalRun) => recordEvalRun(row),

    persistProposal: async (row) => {
      const [inserted] = await db
        .insert(agentImproveProposals)
        .values(row)
        .returning({ id: agentImproveProposals.id });
      if (!inserted) throw new Error("improve_proposal_insert_failed");
      return { id: inserted.id };
    },

    env: {
      sampleSize: resolvePositiveIntEnv("SF_IMPROVE_SAMPLE_SIZE", DEFAULT_SAMPLE_SIZE),
      maxScenarios: resolvePositiveIntEnv("SF_IMPROVE_MAX_SCENARIOS", DEFAULT_MAX_SCENARIOS),
      patchMaxBytes: resolvePositiveIntEnv("SF_IMPROVE_PATCH_MAX_BYTES", DEFAULT_PATCH_MAX_BYTES),
    },
  };

  return { ok: true, deps };
}

/** Best-effort: record a Brain lesson from an applied/dismissed proposal so
 *  a future improve run's `loadLessons` can see it. Never throws (mirrors
 *  recordAgentMemory's own swallow-on-failure posture) — used internally by
 *  actions.ts, not part of the DI'd apply/dismiss core below. */
export async function recordImproveLesson(args: {
  orgId: string;
  agentId: string;
  summary: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  const store = makeBrainMemoryStoreForOrg(args.orgId);
  await recordAgentMemory(store, {
    orgId: args.orgId,
    agentKey: args.agentId,
    subjectKey: LESSONS_SUBJECT_KEY,
    entry: {
      kind: "improve_outcome",
      summary: args.summary,
      ...(args.data ? { data: args.data } : {}),
    },
  });
}

// ─── applyImproveProposal / dismissImproveProposal (propose-only apply gate) ──

/** The DI'd I/O `applyImproveProposal` needs. Every dependency is injected
 *  so `apply-proposal.spec.ts` drives the whole lifecycle with plain fakes —
 *  no network, no Postgres. */
export type ApplyProposalDeps = {
  /** Load the proposal, scoped by id+orgId. Returns null when not found /
   *  not owned by this org — the caller then returns "not_found" cleanly. */
  loadProposal: (args: {
    proposalId: string;
    orgId: string;
  }) => Promise<ImproveProposal | null>;
  /** Load the agent's CURRENT blueprint + version (it may have moved since
   *  the proposal was created) — re-validation runs against THIS, not the
   *  version the proposal was based on. */
  loadCurrentAgent: (args: {
    agentId: string;
    orgId: string;
  }) => Promise<{ blueprint: AgentBlueprint; currentVersion: number } | null>;
  /** The store's `updateAgentBlueprint` (store.ts:227) — the ONLY write path
   *  this feature is allowed to reach, per the plan's Global Constraints. */
  updateBlueprint: (args: {
    agentId: string;
    orgId: string;
    patch: Partial<AgentBlueprint>;
    publishNotes?: string;
  }) => Promise<{ ok: true; version: number } | { ok: false; error: string }>;
  /** Flip the proposal row to status "applied" + resolvedAt. */
  markApplied: (args: { proposalId: string; orgId: string }) => Promise<void>;
};

export type ApplyProposalResult =
  | { ok: true; version: number; note?: string }
  | { ok: false; error: string };

/**
 * The PROPOSE-ONLY apply gate: load the proposal (org+id scoped, must be
 * status "proposed"), RE-VALIDATE its patch against the CURRENT blueprint
 * (validateProposedPatch — it may have moved since the proposal was
 * created), then `updateBlueprint` with publishNotes `"improve run
 * <proposalId>"`, and mark the proposal applied. Version drift
 * (`basedOnVersion !== currentVersion`) does NOT block — it only annotates
 * the return with `note: "applied over vN"` (vN = the CURRENT version at
 * apply time). NEVER calls `updateBlueprint` on any rejection path.
 */
export async function applyImproveProposal(
  args: { proposalId: string; orgId: string },
  deps: ApplyProposalDeps,
): Promise<ApplyProposalResult> {
  const proposal = await deps.loadProposal({ proposalId: args.proposalId, orgId: args.orgId });
  if (!proposal) return { ok: false, error: "not_found" };

  if (proposal.status !== "proposed") {
    return { ok: false, error: "not_proposed" };
  }

  const current = await deps.loadCurrentAgent({
    agentId: proposal.agentId,
    orgId: args.orgId,
  });
  if (!current) return { ok: false, error: "not_found" };

  const validation = validateProposedPatch({
    patch: proposal.patch,
    currentBlueprint: current.blueprint,
    // The guardrail's own byte cap is orchestrator-supplied per its header
    // note; re-validation reuses the SAME default the run assembly resolves
    // (SF_IMPROVE_PATCH_MAX_BYTES), never a hard-coded second constant.
    maxBytes: resolvePositiveIntEnv("SF_IMPROVE_PATCH_MAX_BYTES", DEFAULT_PATCH_MAX_BYTES),
  });
  if (!validation.ok) {
    return { ok: false, error: "revalidation_failed" };
  }

  const updateResult = await deps.updateBlueprint({
    agentId: proposal.agentId,
    orgId: args.orgId,
    patch: validation.patch,
    publishNotes: `improve run ${args.proposalId}`,
  });
  if (!updateResult.ok) {
    return { ok: false, error: updateResult.error };
  }

  // ORDERING TRADE-OFF (deliberate — do not "fix" into the unsafe direction):
  // updateBlueprint runs BEFORE markApplied. If markApplied throws after a
  // successful blueprint update, the proposal stays "proposed" and a retry
  // will double-bump the blueprint version — annoying but harmless (versions
  // are snapshots). The reverse order would risk a proposal marked "applied"
  // whose patch never landed: silent non-application. We fail toward
  // re-applyability.
  await deps.markApplied({ proposalId: args.proposalId, orgId: args.orgId });

  const driftNote =
    proposal.basedOnVersion !== current.currentVersion
      ? `applied over v${current.currentVersion}`
      : undefined;

  return {
    ok: true,
    version: updateResult.version,
    ...(driftNote ? { note: driftNote } : {}),
  };
}

/** The DI'd I/O `dismissImproveProposal` needs. */
export type DismissProposalDeps = {
  loadProposal: (args: {
    proposalId: string;
    orgId: string;
  }) => Promise<ImproveProposal | null>;
  /** Flip the proposal row to status "dismissed" + resolvedAt. */
  markDismissed: (args: { proposalId: string; orgId: string }) => Promise<void>;
};

export type DismissProposalResult = { ok: boolean };

/**
 * Dismiss ONLY flips the proposal's status — it NEVER touches the
 * blueprint. Org+id scoped; a proposal not found, not owned, or already
 * resolved (status "applied" or "dismissed") is an idempotent no-op
 * `{ ok: false }` (never throws, never double-marks).
 */
export async function dismissImproveProposal(
  args: { proposalId: string; orgId: string },
  deps: DismissProposalDeps,
): Promise<DismissProposalResult> {
  const proposal = await deps.loadProposal({ proposalId: args.proposalId, orgId: args.orgId });
  if (!proposal) return { ok: false };
  if (proposal.status !== "proposed") return { ok: false };

  await deps.markDismissed({ proposalId: args.proposalId, orgId: args.orgId });
  return { ok: true };
}

// ─── default (real) deps for actions.ts ───────────────────────────────────

/** Real `ApplyProposalDeps`, org-scoped Postgres reads/writes. Kept as a
 *  small factory (not exported at module scope as a const, per
 *  check-use-server.sh's ban on non-async-function exports from a "use
 *  server" file — actions.ts calls this factory, never imports raw db
 *  handles itself). */
export function defaultApplyProposalDeps(): ApplyProposalDeps {
  return {
    loadProposal: async ({ proposalId, orgId }) => {
      const [row] = await db
        .select()
        .from(agentImproveProposals)
        .where(and(eq(agentImproveProposals.id, proposalId), eq(agentImproveProposals.orgId, orgId)))
        .limit(1);
      return row ?? null;
    },
    loadCurrentAgent: async ({ agentId, orgId }) => {
      const [row] = await db
        .select({ blueprint: agents.blueprint, currentVersion: agents.currentVersion })
        .from(agents)
        .where(and(eq(agents.id, agentId), eq(agents.orgId, orgId)))
        .limit(1);
      if (!row) return null;
      return {
        blueprint: (row.blueprint ?? {}) as AgentBlueprint,
        currentVersion: row.currentVersion,
      };
    },
    updateBlueprint: async ({ agentId, orgId, patch, publishNotes }) => {
      const { updateAgentBlueprint } = await import("@/lib/agents/store");
      return updateAgentBlueprint({ agentId, orgId, patch, publishNotes });
    },
    markApplied: async ({ proposalId, orgId }) => {
      await db
        .update(agentImproveProposals)
        .set({ status: "applied", resolvedAt: new Date() })
        .where(and(eq(agentImproveProposals.id, proposalId), eq(agentImproveProposals.orgId, orgId)));
    },
  };
}

/** Real `DismissProposalDeps`, org-scoped Postgres reads/writes. */
export function defaultDismissProposalDeps(): DismissProposalDeps {
  return {
    loadProposal: async ({ proposalId, orgId }) => {
      const [row] = await db
        .select()
        .from(agentImproveProposals)
        .where(and(eq(agentImproveProposals.id, proposalId), eq(agentImproveProposals.orgId, orgId)))
        .limit(1);
      return row ?? null;
    },
    markDismissed: async ({ proposalId, orgId }) => {
      await db
        .update(agentImproveProposals)
        .set({ status: "dismissed", resolvedAt: new Date() })
        .where(and(eq(agentImproveProposals.id, proposalId), eq(agentImproveProposals.orgId, orgId)));
    },
  };
}
