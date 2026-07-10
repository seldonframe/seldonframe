// The recap-panel interview chat — one LLM turn at a time. Given the current
// FlowModel + the conversation so far, answers the operator's message and
// reports what open questions remain. DI'd `TraceLlm`, same as
// trace-compiler.ts / merge-traces.ts — this module never imports the
// Anthropic SDK directly.

import { FlowModelSchema, type FlowModel, type TraceLlm, type TraceLlmRequest } from "./trace-schema";
import { coverFlowModel } from "./coverage";

export type InterviewTurn = { role: "user" | "seldon"; text: string };

export type InterviewTurnResult =
  | { ok: true; reply: string; model: FlowModel; openQuestions: string[] }
  | { ok: false; error: string };

const INTERVIEW_MAX_TOKENS = 800;

const INTERVIEW_SYSTEM_PROMPT = `You are Seldon, interviewing an operator about a workflow you just watched them
record. You are given their current FlowModel (the workflow as understood so far, including remaining open
questions) and the interview conversation so far. The operator just sent you a new message — answer it plainly,
incorporate anything it clarifies into the FlowModel (new rules go in "constants", new edge cases go in
"branches", corrections update the relevant "steps"), and report which open questions remain (some may now be
resolved; new ones may surface). Output MUST be valid JSON only, matching exactly this shape — no markdown, no
fences, no prose:
{ "reply": string, "model": { "title": string, "goal": string, "apps": string[], "steps": [...],
  "variables": string[], "constants": string[], "branches": [...], "openQuestions": string[],
  "recordingsSeen": number, "coverage": [] }, "openQuestions": string[] }
Set "coverage" to [] in "model" — coverage is computed separately after this turn. You do not need to get
"recordingsSeen" right; it is overwritten by the caller. If nothing about the workflow changed, return the
model unchanged.
If you receive a message starting with "VALIDATION_ERROR:", fix the JSON to satisfy the stated error and
return ONLY the corrected JSON.`;

function buildInterviewUserContent(params: {
  model: FlowModel;
  interviewLog: InterviewTurn[];
  message: string;
}): TraceLlmRequest["user"] {
  const history = params.interviewLog.map((turn) => `${turn.role}: ${turn.text}`).join("\n");
  return [
    {
      type: "text",
      text:
        `Current FlowModel:\n${JSON.stringify(params.model)}\n\n` +
        `Interview so far:\n${history || "(none yet)"}\n\n` +
        `Operator says: ${params.message}`,
    },
  ];
}

type RawInterviewResponse = { reply?: unknown; model?: unknown; openQuestions?: unknown };

function isValidInterviewResponse(
  value: unknown,
): value is { reply: string; model?: unknown; openQuestions?: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { reply?: unknown }).reply === "string"
  );
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

type ValidatedTurn = { ok: true; reply: string; model: FlowModel; openQuestions: string[] } | { ok: false; error: string; retryable: boolean };

/**
 * Validates one LLM response for a turn. Two distinct failure modes:
 *   - the reply itself is missing/malformed → NOT retryable (same as before
 *     this fix: a malformed reply just surfaces as ok:false and the operator
 *     retries their message, cheaper than a second LLM call for a chat turn).
 *   - the reply is fine but `model` fails FlowModelSchema → retryable, same
 *     single-retry-on-zod-error pattern as merge-traces.ts.
 * `recordingsSeen` is force-overwritten from the INPUT model (never trusted
 * from the LLM) before validation, and coverage is recomputed from the
 * validated model on success (answers can change steps, so it's never
 * passed through from the LLM's response).
 */
function validateInterviewResponse(response: unknown, inputModel: FlowModel): ValidatedTurn {
  if (!isValidInterviewResponse(response)) {
    return { ok: false, error: "malformed interview response: missing string 'reply'", retryable: false };
  }
  const raw = response as RawInterviewResponse;

  const modelCandidate = {
    ...(typeof raw.model === "object" && raw.model !== null ? raw.model : {}),
    recordingsSeen: inputModel.recordingsSeen,
  };
  const parsed = FlowModelSchema.safeParse(modelCandidate);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message, retryable: true };
  }

  const model: FlowModel = { ...parsed.data, coverage: coverFlowModel(parsed.data) };

  return {
    ok: true,
    reply: response.reply,
    model,
    openQuestions: asStringArray(raw.openQuestions),
  };
}

/**
 * Runs one interview turn: answers the operator's message AND merges
 * whatever it learned back into the FlowModel — what Seldon says it
 * learned is what compiles (a never-lies requirement; the prior version
 * only returned {reply, openQuestions} and silently dropped every answer).
 *
 * The model is Zod-gated with a single retry-on-validation-error, mirroring
 * merge-traces.ts's pattern exactly. `recordingsSeen` is always
 * force-preserved from the caller's input model (never trusted from the
 * LLM), and coverage is always recomputed from the validated model — never
 * passed through from the LLM's response.
 */
export async function interviewTurn(params: {
  model: FlowModel;
  interviewLog: InterviewTurn[];
  message: string;
  llm: TraceLlm;
}): Promise<InterviewTurnResult> {
  const user = buildInterviewUserContent(params);

  const firstAttempt = await params.llm({
    system: INTERVIEW_SYSTEM_PROMPT,
    user,
    maxTokens: INTERVIEW_MAX_TOKENS,
  });
  const firstValidated = validateInterviewResponse(firstAttempt, params.model);
  if (firstValidated.ok || !firstValidated.retryable) {
    return firstValidated;
  }

  const retryUser: TraceLlmRequest["user"] = [
    ...user,
    { type: "text", text: `VALIDATION_ERROR: ${firstValidated.error}` },
  ];
  const retryAttempt = await params.llm({
    system: INTERVIEW_SYSTEM_PROMPT,
    user: retryUser,
    maxTokens: INTERVIEW_MAX_TOKENS,
  });
  const retryValidated = validateInterviewResponse(retryAttempt, params.model);
  if (retryValidated.ok) {
    return retryValidated;
  }

  return { ok: false, error: `Interview turn failed validation after retry: ${retryValidated.error}` };
}
