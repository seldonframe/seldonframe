// Merges a newly-compiled WorkflowTrace into the running FlowModel. The
// first recording is a deterministic promotion (no LLM call — there's
// nothing to merge against yet); every subsequent recording is diffed
// against the current model with one LLM call (DI'd TraceLlm), Zod-gated
// with a single retry-on-validation-error, same shape as trace-compiler.ts.

import { FlowModelSchema, type FlowModel, type WorkflowTrace, type TraceLlm, type TraceLlmRequest } from "./trace-schema";

export type MergeResult =
  | { ok: true; model: FlowModel; whatChanged: string[]; openQuestions: string[] }
  | { ok: false; error: string };

const MERGE_MAX_TOKENS = 4000;

const MERGE_SYSTEM_PROMPT = `You are the merge step of SeldonFrame's record-to-agent trace compiler.
You are given the CURRENT FlowModel (built from recordings seen so far) and a NEW WorkflowTrace (from a
recording just captured, e.g. an edge case). Merge the new trace into the model:
- New branches/edge cases discovered by the new recording become entries in "branches".
- Steps whose values differ across recordings (values that varied, not the workflow itself) move to
  "variables"; values that stayed the same stay in "constants".
- Steps that are genuinely new or reordered should be reconciled into a single coherent "steps" list,
  reindexed 0-based ascending.
- "apps" must list every app used by any step.
Output MUST be valid JSON only, matching exactly this shape — no markdown, no fences, no prose:
{
  "model": { "title": string, "goal": string, "apps": string[], "steps": [...], "variables": string[],
             "constants": string[], "branches": [...], "openQuestions": string[],
             "recordingsSeen": number, "coverage": [] },
  "whatChanged": string[],
  "openQuestions": string[]
}
Set "coverage" to [] in "model" — coverage is computed separately after the merge. You do not need to get
"recordingsSeen" right; it is overwritten by the caller.
If you receive a message starting with "VALIDATION_ERROR:", fix the JSON to satisfy the stated error and
return ONLY the corrected JSON.`;

function buildMergeUserContent(params: { model: FlowModel; trace: WorkflowTrace }): TraceLlmRequest["user"] {
  return [
    {
      type: "text",
      text: `Current FlowModel:\n${JSON.stringify(params.model)}\n\nNew WorkflowTrace:\n${JSON.stringify(params.trace)}`,
    },
  ];
}

type RawMergeResponse = { model?: unknown; whatChanged?: unknown; openQuestions?: unknown };

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/**
 * Merges `trace` into `model`. When `model` is null (first recording), this
 * is a deterministic promotion — no LLM call, no ambiguity to resolve yet.
 * Otherwise runs one LLM merge call, Zod-validates the returned model, and
 * force-overwrites `recordingsSeen` to `model.recordingsSeen + 1` server-side
 * regardless of what the LLM returned (never trust the LLM's counter).
 */
export async function mergeIntoFlowModel(params: {
  model: FlowModel | null;
  trace: WorkflowTrace;
  llm: TraceLlm;
}): Promise<MergeResult> {
  const { model, trace, llm } = params;

  if (model === null) {
    const promoted: FlowModel = {
      ...trace,
      recordingsSeen: 1,
      coverage: [],
    };
    const parsed = FlowModelSchema.safeParse(promoted);
    if (!parsed.success) {
      return { ok: false, error: `First-recording promotion failed validation: ${parsed.error.message}` };
    }
    return {
      ok: true,
      model: parsed.data,
      whatChanged: [`Learned the happy path: ${trace.title}`],
      openQuestions: trace.openQuestions,
    };
  }

  const nextRecordingsSeen = model.recordingsSeen + 1;
  const user = buildMergeUserContent({ model, trace });

  const firstAttempt = await llm({ system: MERGE_SYSTEM_PROMPT, user, maxTokens: MERGE_MAX_TOKENS });
  const firstValidated = validateMergeResponse(firstAttempt, nextRecordingsSeen);
  if (firstValidated.ok) {
    return firstValidated;
  }

  const retryUser: TraceLlmRequest["user"] = [
    ...user,
    { type: "text", text: `VALIDATION_ERROR: ${firstValidated.error}` },
  ];
  const retryAttempt = await llm({ system: MERGE_SYSTEM_PROMPT, user: retryUser, maxTokens: MERGE_MAX_TOKENS });
  const retryValidated = validateMergeResponse(retryAttempt, nextRecordingsSeen);
  if (retryValidated.ok) {
    return retryValidated;
  }

  return { ok: false, error: `Flow-model merge failed validation after retry: ${retryValidated.error}` };
}

function validateMergeResponse(response: unknown, forcedRecordingsSeen: number): MergeResult {
  const raw = (typeof response === "object" && response !== null ? response : {}) as RawMergeResponse;
  const modelCandidate = {
    ...(typeof raw.model === "object" && raw.model !== null ? raw.model : {}),
    // Never trust the LLM's own counter — always force it server-side.
    recordingsSeen: forcedRecordingsSeen,
  };

  const parsed = FlowModelSchema.safeParse(modelCandidate);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }

  return {
    ok: true,
    model: parsed.data,
    whatChanged: asStringArray(raw.whatChanged),
    openQuestions: asStringArray(raw.openQuestions),
  };
}
