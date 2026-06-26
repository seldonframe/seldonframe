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
import { recordGeneratorLesson } from "@/lib/agents/generate/generator-lessons";
import { diffEditToLessons } from "@/lib/agents/generate/generator-edit-diff";
import { makeBrainMemoryStoreForOrg } from "@/lib/agents/memory/brain-memory-store";
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

  // Resolve the org ONCE here (the production getOrgId is a multi-source session
  // lookup), so we can build the org-scoped lessons store from the same id and
  // hand the orchestrator a memoized getOrgId — no double round-trip. Tests
  // inject their own getOrgId via _deps, in which case we never call the real one
  // and never build a real store (they pass their own lessonsStore, or none).
  const resolveOrgId = _deps?.getOrgId ?? getOrgId;
  const orgId = await resolveOrgId();

  const deps: GenerateDeps = {
    getOrgId: async () => orgId,
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
    // L5.3 self-improving loop: the org's Brain-backed generator loop-memory, so
    // past corrections are recalled into this generation and new judge fixes are
    // recorded for the next. Tests override via _deps; absent a resolved org
    // (unauthorized) there's nothing to scope to → omit it (the orchestrator
    // returns "unauthorized" before it would be read anyway). Fail-soft inside.
    lessonsStore:
      _deps && "lessonsStore" in _deps
        ? _deps.lessonsStore
        : orgId
          ? makeBrainMemoryStoreForOrg(orgId)
          : undefined,
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
 * L5.3 self-improving loop — capture a POST-GENERATE EDIT as a generator lesson.
 *
 * Fired by the editor the FIRST time an operator saves changes to a just-
 * generated agent (the `?new=1` hand-off). The operator fixing what we generated
 * is the strongest training signal there is — a human telling us the generator
 * got it wrong — so we record it under the org's generator loop-memory and the
 * NEXT generation recalls + honors it.
 *
 * We diff a SMALL, high-signal slice (`diffEditToLessons`: trigger / channel /
 * skill-presence — never the prose, exactly like the judge allow-list) and record
 * one `{pattern:"post-generate edit", mistake:<before>, correction:<after>}`
 * lesson per meaningful change. A no-op edit (no meaningful change) records
 * nothing.
 *
 * Best-effort + non-blocking by contract: assertWritable + an unauthorized org
 * are the only hard stops; everything after is wrapped so a Brain/store hiccup
 * NEVER surfaces to the caller. Returns void — the editor fires it
 * fire-and-forget alongside its real save.
 */
export async function recordGeneratorEditAction(input: {
  agentTemplateId: string;
  before: AgentBlueprint;
  after: AgentBlueprint;
}): Promise<void> {
  assertWritable();

  const orgId = await getOrgId();
  if (!orgId) return; // nothing to scope the lesson to.

  try {
    const lessons = diffEditToLessons(input.before, input.after);
    if (lessons.length === 0) return; // operator changed nothing we learn from.

    const store = makeBrainMemoryStoreForOrg(orgId);
    for (const lesson of lessons) {
      // recordGeneratorLesson already swallows store errors + dedupes; we await
      // so each settles, inside the try so an unexpected throw can't escape.
      await recordGeneratorLesson(store, { orgId, lesson });
    }
  } catch {
    // Best-effort: capturing an edit-lesson must never break the editor's save.
  }
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
