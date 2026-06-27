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

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import type { AgentBlueprint } from "@/db/schema/agents";
import { getOrgId } from "@/lib/auth/helpers";
import { assertWritable } from "@/lib/demo/server";
import { getAIClient } from "@/lib/ai/client";
import { getAgentTemplate } from "./store";
import { resolveStudioBuildGate, NEEDS_BYOK_MESSAGE } from "./studio-build-gate";
import { makeBrainMemoryStoreForOrg } from "@/lib/agents/memory/brain-memory-store";
import { makeLlmScenarioGenerator } from "@/lib/agents/evals/generate-scenarios";
import { makeLlmCustomerSim } from "@/lib/agents/evals/sim-llm";
import { makeLlmEvalGrader } from "@/lib/agents/evals/score-llm";
import {
  runAgentEvals,
  makeStatelessAgentReply,
} from "@/lib/agents/evals/run-agent-evals";

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

export type RunAgentEvalsActionResult =
  | {
      ok: true;
      summary: { passed: number; total: number; passRate: number };
      scenarios: RunAgentEvalsScenarioResult[];
      /** How many scenarios FAILED — the count recorded as Brain lessons. */
      lessonsRecorded: number;
    }
  | {
      ok: false;
      error: "unauthorized" | "template_not_found" | "no_llm_key";
      message?: string;
    };

/**
 * Run the conversation eval for an agent template (org-guarded; BYOK-gated; money-
 * safe). Returns the pass-rate summary + a per-scenario ✓/✗ with the failed check
 * names, plus how many failures were recorded as Brain lessons. Thin wrapper — see
 * the file header; the work is in runAgentEvals.
 */
export async function runAgentEvalsAction(
  agentTemplateId: string,
): Promise<RunAgentEvalsActionResult> {
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

  // Assemble the PRODUCTION deps. The sim / grader / generator all reuse the
  // operator's BYOK client (so the whole run bills the operator, not the platform),
  // and the agent-reply adapter drives the template's real brain in testMode.
  const getClient = () => client;
  const { results, summary } = await runAgentEvals(
    {
      blueprint,
      orgId,
      // Stable agent key for the Brain lesson namespace — the template id.
      agentKey: template.id,
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

  return { ok: true, summary, scenarios, lessonsRecorded };
}
