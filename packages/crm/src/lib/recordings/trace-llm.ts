// The ONLY file in lib/recordings that imports @anthropic-ai/sdk — every other
// module in this directory takes a `TraceLlm` function via DI (trace-schema.ts)
// so it stays offline-testable with a fake queue. Mirrors the model/param
// choices from soul-compiler/anthropic.ts's L-05 note: Opus 4.7, adaptive
// thinking, NO sampling params (temperature/top_p/top_k/budget_tokens are gone
// on 4.6/4.7), structured output forced via tool_use + tool_choice (prefill is
// also removed on 4.6/4.7 — see tasks/lessons.md L-05).

import Anthropic from "@anthropic-ai/sdk";
import type { TraceLlm, TraceLlmRequest } from "./trace-schema";

const TRACE_LLM_MODEL = process.env.TRACE_LLM_MODEL?.trim() || "claude-opus-4-7";

// Forces a single structured JSON result back from the model — no free-text
// parsing, no prefill. The schema is intentionally permissive
// (additionalProperties: true); the CALLER validates the shape with the real
// Zod schema (WorkflowTraceSchema / the route-call shape) and retries on
// mismatch, so this tool schema only needs to force "emit one JSON object".
const EMIT_RESULT_TOOL = {
  name: "emit_result",
  description: "Emit the structured JSON result for this call. Always call this exactly once with the full result as the arguments.",
  input_schema: {
    type: "object" as const,
    additionalProperties: true,
  },
};

function toAnthropicContent(user: TraceLlmRequest["user"]) {
  return user.map((part) => {
    if (part.type === "text") {
      return { type: "text" as const, text: part.text };
    }
    return {
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: part.mediaType,
        data: part.base64,
      },
    };
  });
}

/**
 * Builds a `TraceLlm` backed by the real Anthropic SDK. Every call forces a
 * single `emit_result` tool_use block and returns its `input` (unknown —
 * validated by the caller with Zod). No sampling params; adaptive thinking.
 */
export function makeAnthropicTraceLlm(params: { apiKey: string }): TraceLlm {
  const apiKey = params.apiKey.trim();
  if (!apiKey) {
    throw new Error("makeAnthropicTraceLlm: apiKey is required");
  }

  const client = new Anthropic({ apiKey });

  return async (req: TraceLlmRequest): Promise<unknown> => {
    const response = await client.messages.create({
      model: TRACE_LLM_MODEL,
      max_tokens: req.maxTokens,
      thinking: { type: "adaptive" },
      system: req.system,
      messages: [{ role: "user", content: toAnthropicContent(req.user) }],
      tools: [EMIT_RESULT_TOOL],
      tool_choice: { type: "tool", name: EMIT_RESULT_TOOL.name },
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );

    if (!toolUse) {
      throw new Error("Trace LLM response did not contain a tool_use block");
    }

    return toolUse.input;
  };
}
