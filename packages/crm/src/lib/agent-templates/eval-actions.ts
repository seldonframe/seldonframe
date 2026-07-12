// Agent Eval Harness — E5: the "Run evals" server action.
//
// `runAgentEvalsAction` runs the CONVERSATION eval for an agent TEMPLATE: it
// authors realistic customer scenarios, plays each against the template's REAL
// agent brain (a simulated customer ↔ the agent's real prompt + real tools), scores
// the transcripts, and records each FAILURE as a Brain lesson the self-improving
// generator learns from. The operator sees a pass rate + exactly which scenarios
// failed and on which checks.
//
// This action is INTENTIONALLY THIN — all the logic lives in the tested, pure-ish
// `runAgentEvals` orchestration (lib/agents/evals/run-agent-evals.ts). The action
// only: guards (demo write-block + org ownership + the Studio BYOK gate), loads the
// template's blueprint + the workspace context, assembles the PRODUCTION deps (the
// real LLM-backed scenario generator + customer-sim + grader, the stateless agent-
// reply adapter, and the org's Brain memory store), calls runAgentEvals, and shapes
// the result for the UI.
//
// MONEY-SAFE: every LLM call here is LLM-ONLY and runs on the OPERATOR's own BYOK
// key (the Studio build gate requires mode === "byok", exactly like testAgentTemplate
// Turn). The agent under test runs in testMode, so every WRITE tool (book / escalate
// / take-message) returns a synthetic result and writes NOTHING — no real bookings,
// no Twilio, no DB writes, no deployment. The sim/grader/generator reuse that same
// BYOK client so the whole run bills the operator, never the platform.
//
// MIRRORS testAgentTemplateTurn's auth + identity handling (see that file's header):
// a template is identity-neutral, so the stateless agent-reply adapter pins
// soul:null + a neutral orgName — the agent is driven purely by the template's own
// blueprint, exactly what a deployed client would get.
//
// "use server": only async functions are exported here (the result TYPE is exported
// as a `type`, which the use-server guard allows). The orchestration + adapters live
// in the plain modules this action imports.

"use server";

import type Anthropic from "@anthropic-ai/sdk";
import { after } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { agentTemplates, organizations } from "@/db/schema";
import { evalRunJobs, type EvalRunJob } from "@/db/schema/eval-run-jobs";
import type { AgentBlueprint } from "@/db/schema/agents";
import { getOrgId } from "@/lib/auth/helpers";
import { assertWritable } from "@/lib/demo/server";
import { getAIClient } from "@/lib/ai/client";
import { getAgentTemplate } from "./store";
import { resolveStudioBuildGate, NEEDS_BYOK_MESSAGE } from "./studio-build-gate";
import { makeBrainMemoryStoreForOrg } from "@/lib/agents/memory/brain-memory-store";
import { makeLlmScenarioGenerator } from "@/lib/agents/evals/generate-scenarios";
import { makeLlmCustomerSim } from "@/lib/agents/evals/sim-llm";
import { makeLlmEvalGrader, DEFAULT_EVAL_MODEL } from "@/lib/agents/evals/score-llm";
import {
  runAgentEvals,
  makeStatelessAgentReply,
} from "@/lib/agents/evals/run-agent-evals";
import { recordEvalRun } from "@/lib/agents/evals/eval-runs-store";
import { persistTemplateEvalRun } from "@/lib/agents/evals/persist-template-run";

/** One scenario's verdict, shaped for the UI: did it pass the hard gates, and if
 *  not, which check NAMES failed (safety / mustNotDo / criteria — the gates, not
 *  the soft mustDo heuristics). */
export type RunAgentEvalsScenarioResult = {
  id: string;
  title: string;
  passed: boolean;
  /** The names of the hard-gate checks that FAILED (empty when passed). */
  failedChecks: string[];
  /** Any human-readable note from scoring (e.g. "no agent turns", an eval error). */
  notes?: string;
};

export type RunAgentEvalsOk = {
  ok: true;
  summary: { passed: number; total: number; passRate: number };
  scenarios: RunAgentEvalsScenarioResult[];
  /** How many scenarios FAILED — the count recorded as Brain lessons. */
  lessonsRecorded: number;
};

/** Legacy synchronous result shape — kept as the TYPE the job's `result`
 *  column stores, and as the poll action's success shape (the UI already
 *  knows how to render it, unchanged, see run-evals.tsx). */
export type RunAgentEvalsActionResult =
  | RunAgentEvalsOk
  | {
      ok: false;
      error: "unauthorized" | "template_not_found" | "no_llm_key";
      message?: string;
    };

/**
 * H2 hotfix (2026-07-11 prod incident) — starting an eval run RETURNS
 * IMMEDIATELY with a jobId; the real work (author scenarios, simulate N
 * customers, grade N transcripts — a genuinely multi-minute LLM workload)
 * runs OUT OF REQUEST via `after()`. Before this fix, the synchronous "Run
 * evals" POST held the request open long enough to hit Vercel's function
 * ceiling (a live 504) and, because Next.js queues server actions PER TAB,
 * froze every other click (Run/Deploy) on that tab behind it. The client
 * polls `getEvalRunJobAction(jobId)` — same pattern the Run stage's
 * supervised-run poll already uses.
 */
export type StartEvalRunResult =
  | { ok: true; jobId: string; status: "running" }
  | {
      ok: false;
      error: "unauthorized" | "template_not_found" | "no_llm_key";
      message?: string;
    };

/**
 * Run the conversation eval for an agent template (org-guarded; BYOK-gated; money-
 * safe). Guards run synchronously (fast); the eval itself + persistence run inside
 * `after()`. Thin wrapper — see the file header; the work is in runAgentEvals.
 */
export async function runAgentEvalsAction(agentTemplateId: string): Promise<StartEvalRunResult> {
  assertWritable();

  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  // Ownership guard: only the builder that owns the template may eval it (mirrors
  // testAgentTemplateTurn).
  const template = await getAgentTemplate(agentTemplateId);
  if (!template || template.builderOrgId !== orgId) {
    return { ok: false, error: "template_not_found" };
  }

  // BYOK gate: running evals is the unbounded-COGS build/test work, so it requires
  // the operator's OWN key (mode === "byok"). The platform allowance powers the
  // free first workspace, NOT arbitrary eval runs. Also rejects a null client
  // (e.g. an OpenAI-only BYOK key — the agent runtime is Anthropic-only).
  const resolution = await getAIClient({ orgId });
  const gate = resolveStudioBuildGate(resolution.mode);
  if (!gate.ok || !resolution.client) {
    return { ok: false, error: "no_llm_key", message: NEEDS_BYOK_MESSAGE };
  }
  const client = resolution.client;

  // Workspace context the agent-reply adapter needs: slug (read-only availability
  // tool) + timezone (temporal grounding). We do NOT load name/soul — a template is
  // identity-neutral (the adapter pins soul:null + a neutral orgName).
  const [org] = await db
    .select({ slug: organizations.slug, timezone: organizations.timezone })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) return { ok: false, error: "unauthorized" };

  const blueprint = (template.blueprint ?? {}) as AgentBlueprint;

  const [job] = await db
    .insert(evalRunJobs)
    .values({ orgId, templateId: template.id, status: "running" })
    .returning({ id: evalRunJobs.id });

  after(async () => {
    try {
      const evalResult = await runEvalsAndPersist({ orgId, templateId: template.id, blueprint, client, org });
      await db
        .update(evalRunJobs)
        .set({ status: "succeeded", result: evalResult, finishedAt: new Date() })
        .where(eq(evalRunJobs.id, job.id));
    } catch (err) {
      await db
        .update(evalRunJobs)
        .set({
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
          finishedAt: new Date(),
        })
        .where(eq(evalRunJobs.id, job.id));
    }
  });

  return { ok: true, jobId: job.id, status: "running" };
}

/**
 * The actual eval work — author scenarios, run them against the real agent
 * brain (sandboxed: testMode + sandboxConnectors, see H1), grade, persist.
 * Extracted so `runAgentEvalsAction` can call it from inside `after()`.
 * Never throws the way runAgentEvals/persistTemplateEvalRun are already
 * fail-soft internally, but the ONE new possible throw (the job-row DB
 * writes around it) is caught by the caller.
 */
async function runEvalsAndPersist(args: {
  orgId: string;
  templateId: string;
  blueprint: AgentBlueprint;
  client: Anthropic;
  org: { slug: string; timezone: string | null };
}): Promise<RunAgentEvalsOk> {
  const { orgId, templateId, blueprint, client, org } = args;

  // Assemble the PRODUCTION deps. The sim / grader / generator all reuse the
  // operator's BYOK client (so the whole run bills the operator, not the platform),
  // and the agent-reply adapter drives the template's real brain in testMode.
  const getClient = () => client;
  const { results, summary } = await runAgentEvals(
    {
      blueprint,
      orgId,
      // Stable agent key for the Brain lesson namespace — the template id.
      agentKey: templateId,
    },
    {
      generator: makeLlmScenarioGenerator({ getClient }),
      simCustomer: makeLlmCustomerSim({ getClient }),
      grader: makeLlmEvalGrader({ getClient }),
      agentReply: makeStatelessAgentReply({
        orgId,
        orgSlug: org.slug,
        timezone: org.timezone ?? "UTC",
        blueprint,
        client,
      }),
      lessonsStore: makeBrainMemoryStoreForOrg(orgId),
      // Give multi-step scenarios room to RESOLVE (greet → triage → collect
      // details → propose slot → read back → confirm). Matches DEFAULT_MAX_TURNS
      // but is passed explicitly so the run's turn budget is unmistakable here.
      // Early termination (sim `done` / empty-streak) still ends a resolved
      // conversation sooner.
      maxTurns: 10,
    },
  );

  // Shape per-scenario verdicts for the UI: only the hard-gate checks (safety /
  // mustNotDo / criteria) explain a failure — the soft mustDo heuristics never gate.
  const scenarios: RunAgentEvalsScenarioResult[] = results.map((r) => {
    const failedChecks = r.score.checks
      .filter(
        (c) =>
          !c.passed &&
          (c.name.startsWith("safety:") ||
            c.name.startsWith("mustNotDo:") ||
            c.name.startsWith("criteria:")),
      )
      .map((c) => c.name);
    return {
      id: r.scenario.id,
      title: r.scenario.title,
      passed: r.score.passed,
      failedChecks,
      ...(r.score.notes ? { notes: r.score.notes } : {}),
    };
  });

  const lessonsRecorded = results.filter((r) => r.score.passed === false).length;

  // Persist the run + revive agent_templates.eval_score (Task 3, improve verb
  // + trust rail: docs/superpowers/plans/2026-07-02-improve-verb-trust-rail.md).
  // FAIL-SOFT: persistTemplateEvalRun never throws (it logs + swallows any
  // failure internally) — the operator's result below is computed either way,
  // so a persistence hiccup can never turn a successful eval run into a
  // failed job. graderModel mirrors the EXACT resolution
  // makeLlmEvalGrader/score-llm.ts uses at call time (env override else the
  // Haiku default) so the persisted row reflects the model that actually
  // graded this run, not a guess.
  await persistTemplateEvalRun(
    {
      orgId,
      templateId,
      result: { results, summary },
      graderModel: process.env.ANTHROPIC_EVAL_MODEL?.trim() || DEFAULT_EVAL_MODEL,
    },
    {
      recordEvalRun,
      updateTemplateEvalScore,
    },
  );

  return { ok: true, summary, scenarios, lessonsRecorded };
}

export type GetEvalRunJobResult =
  | { ok: true; status: EvalRunJob["status"]; result: RunAgentEvalsOk | null; error: string | null }
  | { ok: false; error: "unauthorized" | "not_found" };

/** Org-scoped poll read for an eval run job — the "Run evals" button's
 *  ~2s poll while `status === "running"` (mirrors getSupervisedRunAction). */
export async function getEvalRunJobAction(jobId: string): Promise<GetEvalRunJobResult> {
  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  const [row] = await db
    .select()
    .from(evalRunJobs)
    .where(and(eq(evalRunJobs.id, jobId), eq(evalRunJobs.orgId, orgId)))
    .limit(1);
  if (!row) return { ok: false, error: "not_found" };

  return {
    ok: true,
    status: row.status as EvalRunJob["status"],
    result: (row.result as RunAgentEvalsOk | null) ?? null,
    error: row.error,
  };
}

/**
 * Org-scoped `agent_templates.eval_score` write — the real
 * `updateTemplateEvalScore` dependency `persistTemplateEvalRun` calls.
 * Scoped by BOTH `id` and `builderOrgId` (defense in depth: the action
 * already checked ownership before running the eval, but a persistence-layer
 * write should never rely solely on an earlier guard having run).
 */
async function updateTemplateEvalScore(args: {
  orgId: string;
  templateId: string;
  evalScore: number;
}): Promise<void> {
  await db
    .update(agentTemplates)
    .set({ evalScore: args.evalScore })
    .where(
      and(
        eq(agentTemplates.id, args.templateId),
        eq(agentTemplates.builderOrgId, args.orgId),
      ),
    );
}
