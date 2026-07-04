// 2026-07-04 — Server-side PostHog capture of agent-runtime LLM calls
// ($ai_generation spans), Task 12 of the win-ladder plan. Sibling of
// mcp-capture.ts — same fire-and-forget / fail-silent / no-op-without-key
// posture, same lazy getPosthogClient() singleton from ./capture.
//
// EVENT TAXONOMY (matched to @posthog/ai so PostHog's own LLM-analytics
// product — the $ai_generation dashboards — recognizes these events):
//   Scratch-installed @posthog/ai@8.2.2 into the scratchpad (never added as
//   a crm dependency: `npm i @posthog/ai` in a throwaway temp folder) and
//   read its source. The event name and property keys are hard-coded in
//   node_modules/@posthog/ai/dist/anthropic/index.mjs, in the
//   `captureAiGeneration()` function that every @posthog/ai provider wrapper
//   (OpenAI/Anthropic/Gemini/...) funnels through:
//     event name:  $ai_generation           (AIEvent.Generation, line ~239)
//     properties used here (subset — see PRIVACY below for what we omit):
//       $ai_model            — the model string actually used for the call
//       $ai_provider          — "anthropic" (this runtime only calls Anthropic)
//       $ai_input_tokens      — usage.inputTokens
//       $ai_output_tokens     — usage.outputTokens
//       $ai_latency           — call duration in SECONDS in the real SDK
//                                 (options.latency is documented/used as
//                                 seconds elsewhere in @posthog/ai's own
//                                 wrappers, e.g. `(Date.now() - start) / 1000`).
//                                 We deliberately deviate: our input is
//                                 `latencyMs` (milliseconds, matching how the
//                                 runtime already times the call) and we
//                                 convert to seconds before emitting, so the
//                                 property VALUE still lands in the same
//                                 unit PostHog's dashboards expect.
//       $ai_trace_id          — options.traceId (we pass conversationId)
//   We do NOT use the @posthog/ai Anthropic wrapper class itself — it
//   expects to *construct* and own the Anthropic client (`new Anthropic({...})`
//   wrapped by their `Anthropic` proxy class) so it can intercept
//   `.messages.create()` internally. This runtime already owns its Anthropic
//   client via getAIClient()/BYOK resolution, so instead this module calls
//   `posthog.captureImmediate()` directly with the SAME event name + property
//   keys @posthog/ai's captureAiGeneration() emits, so the dashboards key off
//   it identically without requiring us to swap client construction.
//   NOT emitted here (present in the package's shape but out of scope for
//   this call site): $ai_lib/$ai_lib_version (we're not literally running
//   their SDK), $ai_http_status, $ai_base_url, $ai_model_parameters,
//   $ai_stop_reason, $ai_tools, $ai_completion_id, cache/reasoning/web-search
//   token breakdowns, cost fields — none of these are threaded through the
//   runtime loop today; add them later if the dashboards need them.
//
// PRIVACY (hard rule from the brief — THE TYPE IS THE PRIVACY FENCE): the
// input type below has NO string field that could carry prompt or
// completion CONTENT. In particular we never emit @posthog/ai's own
// `$ai_input` / `$ai_output_choices` properties (those carry the actual
// prompt/completion text) — only token COUNTS, timing, model name, and ids.
// `model` is a model identifier string (e.g. "claude-sonnet-4-5-20250929"),
// never user-authored text.
//
// DELIVERY + FAIL-SILENT: identical posture to mcp-capture.ts — serverless-
// safe captureImmediate, fire-and-forget with a .catch swallow, complete
// no-op when NEXT_PUBLIC_POSTHOG_KEY is absent, and any construction error
// is caught so a capture bug can never affect the agent runtime loop.

import { getPosthogClient } from "@/lib/analytics/capture";

const AI_GENERATION_EVENT = "$ai_generation";
const PROP_MODEL = "$ai_model";
const PROP_PROVIDER = "$ai_provider";
const PROP_INPUT_TOKENS = "$ai_input_tokens";
const PROP_OUTPUT_TOKENS = "$ai_output_tokens";
const PROP_LATENCY = "$ai_latency";
const PROP_TRACE_ID = "$ai_trace_id";
const ANTHROPIC_PROVIDER = "anthropic";

/**
 * Input for one $ai_generation capture. THE TYPE IS THE PRIVACY FENCE: every
 * field is a number, a model/trace identifier, or an enum — there is no
 * string field wide enough to carry prompt or completion content. Callers
 * must never widen this type with free-text fields.
 */
export interface CaptureLlmGenerationInput {
  /** Stable, non-PII distinct id — the org id (never raw user content). */
  distinctId: string;
  /** The workspace/org this call ran against, when resolvable. */
  orgId?: string | null;
  /** The model identifier actually used for this call (never prompt text). */
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Wall-clock duration of the anthropic.messages.create call, in ms. */
  latencyMs: number;
  /** Groups repeated calls within one turn/conversation — conversationId. */
  traceId: string;
  /** Which runtime surface issued the call. */
  surface: "agent" | "copilot" | "extraction";
}

/**
 * Capture one LLM generation event to PostHog, matching @posthog/ai's
 * `$ai_generation` taxonomy (see provenance above). Fire-and-silent: never
 * throws, never awaited by the caller (this function returns void), no-ops
 * entirely when NEXT_PUBLIC_POSTHOG_KEY is absent. Callers should only
 * invoke this for SUCCESSFUL anthropic.messages.create responses — skip on
 * the error path, which the agent runtime already handles separately.
 */
export function captureLlmGeneration(input: CaptureLlmGenerationInput): void {
  try {
    const ph = getPosthogClient();
    if (!ph) return;

    const properties: Record<string, unknown> = {
      [PROP_PROVIDER]: ANTHROPIC_PROVIDER,
      [PROP_MODEL]: input.model,
      [PROP_INPUT_TOKENS]: input.inputTokens,
      [PROP_OUTPUT_TOKENS]: input.outputTokens,
      [PROP_LATENCY]: input.latencyMs / 1000,
      [PROP_TRACE_ID]: input.traceId,
      llm_surface: input.surface,
    };
    if (input.orgId) {
      properties.org_id = input.orgId;
    } else {
      // No identified org → don't mint a person profile (matches
      // @posthog/ai's own $process_person_profile guard when distinctId is
      // absent, and mcp-capture.ts's identical posture for anonymous calls).
      properties.$process_person_profile = false;
    }

    void ph
      .captureImmediate({
        distinctId: input.distinctId,
        event: AI_GENERATION_EVENT,
        properties,
      })
      .catch(() => {
        // Swallow — a capture failure must be invisible to the agent runtime.
      });
  } catch {
    // Never let a capture-construction bug reach the agent runtime loop.
  }
}
