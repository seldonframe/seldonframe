// llm_call step dispatcher.
// SLICE 11 C2 per audit §5.1 + Max's gate-resolution prompt
// (G-11-6 minimum viable instrumentation).
//
// THE LAUNCH-BLOCKER FIX. Until this dispatcher ships, the SLICE 9
// PR 2 cost recorder has zero call sites — every workflow_run cost
// column reads $0. This dispatcher is the first (and only, for v1)
// place that calls `recordLlmUsage` from a workflow execution
// context.
//
// Flow:
//   1. Resolve interpolations in user_prompt + system_prompt against
//      the run's variableScope + captureScope (G-4 parity with
//      mcp_tool_call args + await_event predicates).
//   2. Invoke Claude SDK via the injected `invokeClaude` callable
//      (RuntimeContext binds this to the production Anthropic
//      client; tests inject a stub).
//   3. Record usage via `recordLlmUsage(runId, model, usage)`.
//      Uses the response.model (what was actually billed) rather
//      than the step.model (what was requested) — Anthropic may
//      return a more specific date-stamped variant.
//   4. If `step.capture` is set: bind `response.text` to the capture
//      name in the run's captureScope via the NextAction's capture
//      field.
//   5. Advance to step.next.
//
// Failure semantics:
//   - Invoker throws (Anthropic timeout / rate limit / etc.):
//     return `fail` action with the error message. No usage data
//     to record; cost remains 0 for this step's contribution.
//   - Recorder throws (DB down): per L-22, log + swallow. The
//     workflow continues. Cost capture is observability, never
//     blocks execution. (The recorder helper itself already
//     swallows; this dispatcher catches anything that escapes as
//     a defense-in-depth.)
//   - Empty response text + capture set: capture binds to "".
//     Downstream handles empty as the LLM's signal.

import type { LlmCallStep } from "../../agents/validator";
import type { NextAction, StoredRun } from "../types";

// ---------------------------------------------------------------------
// Public types — pluggable Claude invoker for test injection
// ---------------------------------------------------------------------

export type ClaudeInvokerArgs = {
  model: string;
  systemPrompt?: string;
  userPrompt: string;
  maxTokens: number;
};

export type ClaudeInvokerResult = {
  /** Concatenated text response (sum of all text content blocks). */
  text: string;
  /** Model id Anthropic actually used (may be more specific than the requested model). */
  model: string;
  /** Token usage from the response. Either field undefined if missing. */
  usage: {
    inputTokens: number | undefined;
    outputTokens: number | undefined;
  };
};

export type ClaudeInvoker = (args: ClaudeInvokerArgs) => Promise<ClaudeInvokerResult>;

export type LlmCallDispatchContext = {
  invokeClaude: ClaudeInvoker;
  recordLlmUsage: (input: {
    runId: string;
    model: string;
    inputTokens: number | undefined;
    outputTokens: number | undefined;
  }) => Promise<void>;
};

// ---------------------------------------------------------------------
// Interpolation helper (mirrors await-event.ts pattern)
// ---------------------------------------------------------------------

const INTERPOLATION_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

function resolveString(value: string, run: StoredRun): string {
  return value.replace(INTERPOLATION_RE, (raw, bodyRaw) => {
    const body = String(bodyRaw).trim();
    const [varName, ...pathSegs] = body.split(".");
    if (Object.prototype.hasOwnProperty.call(run.variableScope, varName)) {
      let current: unknown = run.variableScope[varName];
      for (const seg of pathSegs) {
        if (current && typeof current === "object" && seg in (current as Record<string, unknown>)) {
          current = (current as Record<string, unknown>)[seg];
        } else {
          return raw;
        }
      }
      return String(current);
    }
    if (Object.prototype.hasOwnProperty.call(run.captureScope, varName)) {
      let current: unknown = run.captureScope[varName];
      for (const seg of pathSegs) {
        if (current && typeof current === "object" && seg in (current as Record<string, unknown>)) {
          current = (current as Record<string, unknown>)[seg];
        } else {
          return raw;
        }
      }
      return String(current);
    }
    return raw;
  });
}

// ---------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------

const DEFAULT_MAX_TOKENS = 4096;

export async function dispatchLlmCall(
  run: StoredRun,
  step: LlmCallStep,
  ctx: LlmCallDispatchContext,
): Promise<NextAction> {
  // Resolve interpolations.
  const userPrompt = resolveString(step.user_prompt, run);
  const systemPrompt =
    step.system_prompt !== undefined ? resolveString(step.system_prompt, run) : undefined;

  // Invoke Claude. Failure surfaces as fail action; no recorder call.
  let response: ClaudeInvokerResult;
  try {
    response = await ctx.invokeClaude({
      model: step.model,
      userPrompt,
      systemPrompt,
      maxTokens: step.max_tokens ?? DEFAULT_MAX_TOKENS,
    });
  } catch (err) {
    return {
      kind: "fail",
      reason: `llm_call "${step.id}" invoker failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Record usage. Use response.model (what was actually billed) not
  // step.model (what was requested). Per L-22 / SLICE 9 PR 2 C4
  // discipline: cost capture must NEVER block the workflow. The
  // recorder helper itself swallows; this catch is defense-in-depth.
  try {
    await ctx.recordLlmUsage({
      runId: run.id,
      model: response.model,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[llm-call dispatcher] recordLlmUsage threw despite swallow", {
      runId: run.id,
      stepId: step.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Build the advance action. If capture is set, bind the response
  // text into the run's captureScope via NextAction.capture.
  if (step.capture !== undefined) {
    return {
      kind: "advance",
      next: step.next,
      capture: { name: step.capture, value: response.text },
    };
  }
  return { kind: "advance", next: step.next };
}
