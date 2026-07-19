// The recap-panel interview chat — one LLM turn at a time. Given the current
// FlowModel + the conversation so far, answers the operator's message and
// reports what open questions remain. DI'd `TraceLlm`, same as
// trace-compiler.ts / merge-traces.ts — this module never imports the
// Anthropic SDK directly.

import { z } from "zod";
import { FlowModelSchema, type FlowModel, type TraceLlm, type TraceLlmRequest } from "./trace-schema";
import { coverFlowModel } from "./coverage";

export type InterviewTurn = { role: "user" | "seldon"; text: string };

const INTERVIEW_APPLY_FAILED_REPLY =
  "I wasn't able to fully apply that to the workflow — could you rephrase it, or answer one question at a time?";

/** One decomposed {question, answer} pair — the Learned stage's Q&A record
 *  persists these verbatim (agent lifecycle slice). */
export type AnsweredPair = { question: string; answer: string };

export type InterviewTurnResult =
  | {
      ok: true;
      reply: string;
      model: FlowModel;
      openQuestions: string[];
      applied: boolean;
      /** Set only when the operator's message was decomposed into >=2
       *  per-question answers and at least one applied — the pairs that
       *  DID apply (partial-failure pairs are excluded). Absent on the
       *  direct (non-decomposed) path — callers fall back to
       *  `{question: null, answer: message}` for that shape. */
      appliedPairs?: AnsweredPair[];
    }
  | { ok: false; error: string };

/** Only decompose when the operator has multiple open questions to answer at
 *  once — a single open question is always the direct path (cheaper: one
 *  llm call instead of decompose + N merges, and there's nothing to split). */
const DECOMPOSE_MIN_OPEN_QUESTIONS = 2;
/** Only apply the decomposed path when the LLM actually split the message
 *  into >=2 pairs — a decompose response with 0 or 1 pair carries no benefit
 *  over the direct path (and risks a spurious per-pair reply for what was
 *  really one answer), so it falls back to direct instead. */
const DECOMPOSE_MIN_PAIRS = 2;

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

type ValidatedTurn =
  | { ok: true; reply: string; model: FlowModel; openQuestions: string[] }
  | { ok: false; error: string; retryable: boolean; reply?: string };

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
    return { ok: false, error: parsed.error.message, retryable: true, reply: response.reply };
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
 * Runs ONE merge attempt: answers a message AND merges whatever it learned
 * back into the FlowModel — what Seldon says it learned is what compiles (a
 * never-lies requirement; the prior version only returned {reply,
 * openQuestions} and silently dropped every answer). This is the "single-
 * merge machinery" both the direct path AND the per-pair decomposed path
 * (below) reuse — each application gets its own retry.
 *
 * The model is Zod-gated with a single retry-on-validation-error, mirroring
 * merge-traces.ts's pattern exactly. `recordingsSeen` is always
 * force-preserved from the caller's input model (never trusted from the
 * LLM), and coverage is always recomputed from the validated model — never
 * passed through from the LLM's response.
 *
 * If the model-merge still fails FlowModelSchema validation after the
 * retry, this fails soft rather than dropping the turn: it returns
 * `ok: true, applied: false` with an honest "couldn't apply that" reply and
 * the INPUT model/openQuestions unchanged, so the operator's turn is never
 * lost to a 422 and the flow is never half-merged. `ok: false` is reserved
 * for the case where the LLM call itself produced no usable reply at all.
 */
async function runSingleMerge(params: {
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
  if (firstValidated.ok) {
    return { ...firstValidated, applied: true };
  }
  if (!firstValidated.retryable) {
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
    return { ...retryValidated, applied: true };
  }

  // The reply itself came through fine on at least one attempt but the
  // model-merge failed FlowModelSchema validation twice — fail soft instead
  // of a 422: tell the operator honestly that their answer wasn't applied,
  // and hand back the INPUT model/openQuestions unchanged (never a
  // half-merged or invented model). Only the true no-reply-at-all case
  // (the LLM response was unusable on both attempts) stays ok:false.
  if (retryValidated.retryable) {
    return {
      ok: true,
      reply: INTERVIEW_APPLY_FAILED_REPLY,
      model: params.model,
      openQuestions: params.model.openQuestions,
      applied: false,
    };
  }

  return { ok: false, error: `Interview turn failed validation after retry: ${retryValidated.error}` };
}

// ─── decomposition ────────────────────────────────────────────────────────

const DECOMPOSE_MAX_TOKENS = 500;

const DECOMPOSE_SYSTEM_PROMPT = `You are splitting one operator message into separate answers to separate
open questions from a workflow interview. You are given the list of open questions and the operator's message,
which plausibly answers more than one of them at once. Output MUST be valid JSON only, matching exactly this
shape — no markdown, no fences, no prose:
{ "pairs": [ { "question": string, "answer": string } ] }
Each "question" MUST be copied verbatim from the open-questions list. Only include a pair when the message
actually answers that question — do not invent an answer for a question the message doesn't address. If the
message doesn't cleanly split (it's really one answer, or doesn't address multiple questions), return
{ "pairs": [] } or a single pair.`;

const DecomposedPairsSchema = z.object({
  pairs: z.array(z.object({ question: z.string(), answer: z.string() })),
});

export type DecomposeAnswersResult = { pairs: AnsweredPair[] };

/**
 * Splits an operator message that plausibly answers MULTIPLE open questions
 * into individually-addressable {question, answer} pairs — one LLM call,
 * Zod-gated, via the SAME DI `llm` seam as runSingleMerge/interviewTurn.
 * Never throws: a malformed response, a non-object response, or the llm call
 * itself throwing all resolve to `null` — the caller (interviewTurn) treats
 * `null` exactly like "nothing to decompose" and falls back to the direct
 * single-merge path, so a decompose hiccup never loses the operator's turn.
 */
export async function decomposeAnswers(
  deps: { llm: TraceLlm },
  params: { message: string; openQuestions: string[] },
): Promise<DecomposeAnswersResult | null> {
  try {
    const response = await deps.llm({
      system: DECOMPOSE_SYSTEM_PROMPT,
      user: [
        {
          type: "text",
          text:
            `Open questions:\n${params.openQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}\n\n` +
            `Operator says: ${params.message}`,
        },
      ],
      maxTokens: DECOMPOSE_MAX_TOKENS,
    });
    const parsed = DecomposedPairsSchema.safeParse(response);
    if (!parsed.success) return null;
    return { pairs: parsed.data.pairs };
  } catch {
    return null;
  }
}

/** Compose the honest summary reply for a decomposed multi-answer turn —
 *  names which questions were applied and, when some weren't, says so
 *  plainly rather than implying everything landed (never-lies). */
function composeDecomposedReply(applied: AnsweredPair[], skipped: AnsweredPair[]): string {
  const appliedLine =
    applied.length > 0
      ? `Got it — I've updated the workflow for: ${applied.map((p) => p.question).join("; ")}.`
      : "";
  const skippedLine =
    skipped.length > 0
      ? `I couldn't apply your answer for: ${skipped.map((p) => p.question).join("; ")} — could you rephrase that one?`
      : "";
  return [appliedLine, skippedLine].filter(Boolean).join(" ") || INTERVIEW_APPLY_FAILED_REPLY;
}

/**
 * Applies decomposed pairs SEQUENTIALLY through runSingleMerge (each pair
 * gets its own retry), threading the model/interviewLog forward so later
 * pairs merge onto earlier pairs' results. A pair whose merge doesn't apply
 * is skipped (not fatal) — `applied` on the overall result is true as long
 * as at least one pair applied; the reply names both the applied and the
 * skipped questions honestly. `ok:false` only if every pair's llm call fails
 * outright with no usable reply.
 */
async function applyDecomposedPairs(params: {
  model: FlowModel;
  interviewLog: InterviewTurn[];
  pairs: AnsweredPair[];
  llm: TraceLlm;
}): Promise<InterviewTurnResult> {
  let currentModel = params.model;
  let currentOpenQuestions = params.model.openQuestions;
  const appliedPairs: AnsweredPair[] = [];
  const skippedPairs: AnsweredPair[] = [];
  let lastHardError: string | null = null;

  for (const pair of params.pairs) {
    const result = await runSingleMerge({
      model: currentModel,
      interviewLog: params.interviewLog,
      message: pair.answer,
      llm: params.llm,
    });
    if (!result.ok) {
      // The llm call itself produced no usable reply for this pair — skip it
      // (not fatal to the whole turn) and remember the error in case EVERY
      // pair fails this way.
      skippedPairs.push(pair);
      lastHardError = result.error;
      continue;
    }
    if (result.applied) {
      currentModel = result.model;
      currentOpenQuestions = result.openQuestions;
      appliedPairs.push(pair);
    } else {
      skippedPairs.push(pair);
    }
  }

  if (appliedPairs.length === 0) {
    if (lastHardError && skippedPairs.length === params.pairs.length) {
      return { ok: false, error: `All decomposed pairs failed: ${lastHardError}` };
    }
    return {
      ok: true,
      reply: INTERVIEW_APPLY_FAILED_REPLY,
      model: params.model,
      openQuestions: params.model.openQuestions,
      applied: false,
    };
  }

  return {
    ok: true,
    reply: composeDecomposedReply(appliedPairs, skippedPairs),
    model: currentModel,
    openQuestions: currentOpenQuestions,
    applied: true,
    appliedPairs,
  };
}

/**
 * Runs one interview turn: answers the operator's message AND merges
 * whatever it learned back into the FlowModel.
 *
 * When the model has >=2 open questions, the operator's message might be
 * answering several at once ("no email? call them. invoices go through the
 * office manager.") — this first tries `decomposeAnswers` to split it into
 * per-question pairs, then applies each pair sequentially via the existing
 * single-merge machinery (`applyDecomposedPairs`, each pair gets its own
 * retry). Decompose failure (null) or fewer than 2 pairs falls straight
 * through to the existing direct single-merge path, UNCHANGED — a single
 * open question never even attempts decompose (no wasted llm call).
 */
export async function interviewTurn(params: {
  model: FlowModel;
  interviewLog: InterviewTurn[];
  message: string;
  llm: TraceLlm;
}): Promise<InterviewTurnResult> {
  if (params.model.openQuestions.length >= DECOMPOSE_MIN_OPEN_QUESTIONS) {
    const decomposed = await decomposeAnswers(
      { llm: params.llm },
      { message: params.message, openQuestions: params.model.openQuestions },
    );
    if (decomposed && decomposed.pairs.length >= DECOMPOSE_MIN_PAIRS) {
      return applyDecomposedPairs({
        model: params.model,
        interviewLog: params.interviewLog,
        pairs: decomposed.pairs,
        llm: params.llm,
      });
    }
  }

  return runSingleMerge(params);
}
