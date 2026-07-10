// The recap-panel interview chat — one LLM turn at a time. Given the current
// FlowModel + the conversation so far, answers the operator's message and
// reports what open questions remain. DI'd `TraceLlm`, same as
// trace-compiler.ts / merge-traces.ts — this module never imports the
// Anthropic SDK directly.

import type { FlowModel, TraceLlm, TraceLlmRequest } from "./trace-schema";

export type InterviewTurn = { role: "user" | "seldon"; text: string };

export type InterviewTurnResult =
  | { ok: true; reply: string; openQuestions: string[] }
  | { ok: false; error: string };

const INTERVIEW_MAX_TOKENS = 800;

const INTERVIEW_SYSTEM_PROMPT = `You are Seldon, interviewing an operator about a workflow you just watched them
record. You are given their current FlowModel (the workflow as understood so far, including remaining open
questions) and the interview conversation so far. The operator just sent you a new message — answer it plainly,
incorporate anything it clarifies, and report which open questions remain (some may now be resolved; new ones
may surface). Output MUST be valid JSON only, matching exactly this shape — no markdown, no fences, no prose:
{ "reply": string, "openQuestions": string[] }`;

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

function isValidInterviewResponse(
  value: unknown,
): value is { reply: string; openQuestions?: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { reply?: unknown }).reply === "string"
  );
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/**
 * Runs one interview turn. No retry-on-validation-error here (unlike
 * trace-compiler/merge-traces) — a malformed reply just surfaces as
 * `ok:false` and the caller can let the operator retry their message, which
 * is a much cheaper recovery than a second LLM call for a chat turn.
 */
export async function interviewTurn(params: {
  model: FlowModel;
  interviewLog: InterviewTurn[];
  message: string;
  llm: TraceLlm;
}): Promise<InterviewTurnResult> {
  const user = buildInterviewUserContent(params);
  const response = await params.llm({
    system: INTERVIEW_SYSTEM_PROMPT,
    user,
    maxTokens: INTERVIEW_MAX_TOKENS,
  });

  if (!isValidInterviewResponse(response)) {
    return { ok: false, error: "malformed interview response: missing string 'reply'" };
  }

  return {
    ok: true,
    reply: response.reply,
    openQuestions: asStringArray(response.openQuestions),
  };
}
