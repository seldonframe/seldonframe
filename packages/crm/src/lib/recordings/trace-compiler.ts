// Trace compiler — turns one recording's raw capture (keyframes + transcript)
// into a validated WorkflowTrace. Mirrors soul-compiler's two-call pattern
// (soul-compiler/service.ts + anthropic.ts): a cheap routing/classification
// call first, then a heavier extraction call that produces the structured
// JSON, with a single retry-on-validation-error using the Zod error text as
// feedback (soul-compiler's VALIDATION_ERROR prefix convention).
//
// Pure w.r.t. I/O: the LLM is DI'd in as a `TraceLlm` (trace-schema.ts) so
// this module never imports @anthropic-ai/sdk directly — only trace-llm.ts
// does. Offline-testable with a fake queue of canned responses.

import { WorkflowTraceSchema, type TranscriptSegment, type TraceLlm, type TraceLlmRequest, type WorkflowTrace } from "./trace-schema";

export type CompileTraceResult = { ok: true; trace: WorkflowTrace } | { ok: false; error: string };

const ROUTE_MAX_TOKENS = 500;
const EXTRACT_MAX_TOKENS = 4000;

const ROUTE_SYSTEM_PROMPT = `You are the routing step of SeldonFrame's record-to-agent trace compiler.
You will be told how many transcript segments and keyframes a screen recording produced.
Classify the recording. Return ONLY JSON: {"jobKind": string, "confidence": number (0-1), "needsFramesReview": boolean}.
"jobKind" is a short label for the kind of workflow being recorded (e.g. "email-to-crm", "invoice-creation").
Set "needsFramesReview" true whenever there are any keyframes to look at.`;

const EXTRACT_SYSTEM_PROMPT = `You are the extraction step of SeldonFrame's record-to-agent trace compiler.
You are shown a sequence of transcript lines (what the operator said, with timestamps) interleaved with
screenshot keyframes of a workflow they performed on their computer. Reconstruct the workflow as a single
WorkflowTrace. Output MUST be valid JSON only, matching exactly this shape — no markdown, no fences, no prose:
{
  "title": string,
  "goal": string,
  "apps": string[],            // every distinct app touched by a step, MUST include every steps[].app
  "steps": [
    { "index": number (0-based, strictly ascending), "app": string, "action": string, "intent": string,
      "dataIn": string[], "dataOut": string[], "checks": string[], "decision"?: string }
  ],
  "variables": string[],       // values that vary run-to-run
  "constants": string[],       // values that stay fixed
  "branches": [ { "condition": string, "behavior": string } ],
  "openQuestions": string[]    // anything ambiguous or under-specified from this recording
}
If you receive a message starting with "VALIDATION_ERROR:", fix the JSON to satisfy the stated error and
return ONLY the corrected JSON.`;

function buildRouteUserContent(params: {
  frameCount: number;
  transcriptCount: number;
  label?: string | null;
}): TraceLlmRequest["user"] {
  return [
    {
      type: "text",
      text: `Transcript segments: ${params.transcriptCount}. Keyframes: ${params.frameCount}. Label: ${params.label ?? "none"}.`,
    },
  ];
}

function buildExtractUserContent(params: {
  frames: Array<{ base64: string }>;
  transcript: TranscriptSegment[];
  label?: string | null;
  priorAnswers?: string[];
}): TraceLlmRequest["user"] {
  const content: TraceLlmRequest["user"] = [];

  if (params.label) {
    content.push({ type: "text", text: `Recording label: ${params.label}` });
  }

  if (params.priorAnswers && params.priorAnswers.length > 0) {
    content.push({
      type: "text",
      text: `Prior interview answers (use these to resolve ambiguity):\n${params.priorAnswers.join("\n")}`,
    });
  }

  // Interleave transcript timestamp markers with the keyframes so the model
  // can line up "what was said" with "what was on screen" without a shared
  // clock format — the marker text carries atMs verbatim.
  for (const segment of params.transcript) {
    content.push({ type: "text", text: `[t=${segment.atMs}ms] ${segment.text}` });
  }

  for (const frame of params.frames) {
    content.push({ type: "image", mediaType: "image/jpeg", base64: frame.base64 });
  }

  return content;
}

/**
 * Compiles one recording's frames + transcript into a validated
 * WorkflowTrace. Never silently passes on empty input — an empty recording
 * (no frames AND no transcript) returns `{ok:false}` without calling the LLM
 * at all (Optimistic Path rule: nothing to compile is an explicit error, not
 * a vacuous trace).
 */
export async function compileTrace(params: {
  frames: Array<{ base64: string }>;
  transcript: TranscriptSegment[];
  label?: string | null;
  priorAnswers?: string[];
  llm: TraceLlm;
}): Promise<CompileTraceResult> {
  const { frames, transcript, label, priorAnswers, llm } = params;

  if (frames.length === 0 && transcript.length === 0) {
    return { ok: false, error: "nothing to compile" };
  }

  // Call 1: cheap routing/classification (text-only). Result isn't consumed
  // by the caller today (Task 4 scope is just trace extraction) but the call
  // mirrors soul-compiler's two-call shape and gives us a jobKind hook later
  // without another interface change.
  await llm({
    system: ROUTE_SYSTEM_PROMPT,
    user: buildRouteUserContent({ frameCount: frames.length, transcriptCount: transcript.length, label }),
    maxTokens: ROUTE_MAX_TOKENS,
  });

  // Call 2: extraction.
  const extractUser = buildExtractUserContent({ frames, transcript, label, priorAnswers });
  const firstAttempt = await llm({ system: EXTRACT_SYSTEM_PROMPT, user: extractUser, maxTokens: EXTRACT_MAX_TOKENS });
  const firstParsed = WorkflowTraceSchema.safeParse(firstAttempt);
  if (firstParsed.success) {
    return { ok: true, trace: firstParsed.data };
  }

  // Single retry, with the Zod error text appended (soul-compiler's
  // VALIDATION_ERROR: convention).
  const retryUser: TraceLlmRequest["user"] = [
    ...extractUser,
    {
      type: "text",
      text: `VALIDATION_ERROR: ${firstParsed.error.message}`,
    },
  ];
  const retryAttempt = await llm({ system: EXTRACT_SYSTEM_PROMPT, user: retryUser, maxTokens: EXTRACT_MAX_TOKENS });
  const retryParsed = WorkflowTraceSchema.safeParse(retryAttempt);
  if (retryParsed.success) {
    return { ok: true, trace: retryParsed.data };
  }

  return { ok: false, error: `Trace extraction failed validation after retry: ${retryParsed.error.message}` };
}
