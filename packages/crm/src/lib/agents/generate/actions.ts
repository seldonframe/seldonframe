// Agent Loop — L4 Generate-by-Default — Task T3: the server action.
//
// generateAgentDraftAction is the thin "use server" wrapper around the pure
// runGenerateAgentDraft orchestrator (run-generate.ts). The orchestration +
// every decision is unit-tested there with in-memory fakes; this file only:
//   • assertWritable() (demo-mode write guard, like every other action),
//   • supplies the REAL deps — getOrgId (session), llmClassify (Anthropic),
//     and a `create` that reuses the EXISTING createAgentTemplate +
//     updateAgentTemplate write path (no new insert),
//   • revalidates the Studio agents surfaces.
//
// WHY a NEW module (not lib/agent-templates/actions.ts): that file already
// exports a DIFFERENT generateAgentDraftAction (the BYOK-gated
// { prompt, surface } → { patch } refiner for the Studio editor). This is the
// generate-by-DEFAULT action ({ sentence } → a CREATED template), a distinct
// surface — so it gets its own "use server" module to avoid the name clash.
//
// "use server" RULE: this file exports ONLY async functions (the types live in
// run-generate.ts). scripts/check-use-server.sh + next build both enforce that.

"use server";

import { revalidatePath } from "next/cache";
import type { AgentBlueprint } from "@/db/schema/agents";
import { getOrgId } from "@/lib/auth/helpers";
import { assertWritable } from "@/lib/demo/server";
import { llmClassify } from "@/lib/agents/generate/classify-llm";
import { makeLlmAgentGrader } from "@/lib/agents/generate/judge-llm";
import {
  runGenerateAgentDraft,
  type GenerateDeps,
  type GenerateAgentDraftOutput,
} from "@/lib/agents/generate/run-generate";
import {
  createAgentTemplate,
  updateAgentTemplate,
  type TemplateBlueprintPatch,
} from "@/lib/agent-templates/store";

/**
 * Generate-by-default: turn ONE English sentence into a created, safe agent
 * template owned by the operator's org. The LLM only CLASSIFIES the sentence
 * (fail-soft to a heuristic); SF's deterministic assembler wires the trigger +
 * verify rubric + guardrails + skill prose, so even a misclassified sentence
 * yields a guard-railed, verified agent. Never blocks on the LLM.
 *
 * Returns the new template id + any "before you go live" warnings (e.g. "set
 * your review URL"), or `{ ok:false, error }`.
 *
 * `_deps` is an injection seam for tests ONLY — production passes nothing and
 * the real getOrgId/llmClassify/create are used.
 */
export async function generateAgentDraftAction(
  input: { sentence: string; reviewUrl?: string },
  _deps?: Partial<GenerateDeps>,
): Promise<GenerateAgentDraftOutput> {
  assertWritable();

  const deps: GenerateDeps = {
    getOrgId: _deps?.getOrgId ?? getOrgId,
    classify: _deps?.classify ?? llmClassify,
    // Maker≠checker judge: default ON, trivially disablable via
    // SF_GENERATOR_JUDGE=off. Fail-open by construction — a missing ANTHROPIC
    // key makes the grader return {ok:true,issues:[]} and generation proceeds.
    judge:
      _deps && "judge" in _deps
        ? _deps.judge
        : process.env.SF_GENERATOR_JUDGE === "off"
          ? undefined
          : makeLlmAgentGrader(),
    create: _deps?.create ?? defaultCreate,
  };

  const result = await runGenerateAgentDraft(deps, {
    sentence: input.sentence,
    reviewUrl: input.reviewUrl,
  });

  if (result.ok) {
    // Mirror the other template actions: refresh both Studio agent surfaces.
    revalidatePath("/studio/agents");
    revalidatePath("/agents");
  }

  return result;
}

/**
 * The real `create` seam: reuse the EXISTING template write path. First
 * createAgentTemplate (resolves a per-builder-unique slug + inserts the row with
 * a sane default blueprint), then updateAgentTemplate to apply the bundle's full
 * blueprint. We pass the assembled AgentBlueprint as the merge patch: the merge
 * (mergeTemplateBlueprint) persists EVERY field generically, so the bundle's
 * trigger + verify + guardrails + reviewUrl + customSkillMd all land — even
 * though TemplateBlueprintPatch's static type lists only the editor's subset.
 * Kept here (not in run-generate.ts) so the orchestrator stays DB-free + testable.
 */
async function defaultCreate(input: {
  builderOrgId: string;
  name: string;
  description: string;
  type: import("@/lib/agent-templates/store").AgentTemplateType;
  blueprint: AgentBlueprint;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const template = await createAgentTemplate({
      builderOrgId: input.builderOrgId,
      name: input.name,
      type: input.type,
    });

    // Apply the full assembled blueprint. The bundle blueprint is a SUPERSET of
    // TemplateBlueprintPatch (it also carries verify/guardrails/reviewUrl); the
    // generic merge loop persists them all, so we widen the type deliberately.
    const saved = await updateAgentTemplate({
      id: template.id,
      patch: input.blueprint as unknown as TemplateBlueprintPatch,
    });
    if (!saved.ok) return { ok: false, error: saved.error };

    return { ok: true, id: template.id };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "create_failed",
    };
  }
}
