// Voice tool bridge — adapts the existing text-chatbot AgentTool registry
// (src/lib/agents/tools.ts) into OpenAI Realtime's function-calling wire
// format and executes a single tool call safely.
//
// This is the one piece of the voice agent that is valid in EVERY possible
// architecture (direct-SIP or LiveKit-middleware, Fluid Compute or a
// dedicated worker): "convert our tools to Realtime format + run one tool
// call without throwing." It is credential-independent and transport-
// independent — no WebSocket, no webhook, no OpenAI client, no DB schema.
//
// Two pure-ish functions:
//   1. toRealtimeFunctionTools — pure, no I/O. Reshapes each AgentTool into
//      OpenAI Realtime's GA function-tool wire shape.
//   2. executeVoiceToolCall — parses the JSON the model hands back in
//      `response.function_call_arguments.done`, validates it against the
//      tool's Zod schema, runs execute(), and ALWAYS resolves (never throws)
//      to a discriminated { ok } result ready to feed back as a
//      `function_call_output` conversation item.
//
// The voice path passes the SAME ToolExecuteContext shape the text runtime
// uses (orgId, orgSlug, agentId, conversationId, testMode), so the tools
// behave identically across text and voice — same source of truth, same
// workspace scoping, same guardrails.

import { findTool as defaultFindTool, type AgentTool, type ToolExecuteContext } from "../tools";

/**
 * OpenAI Realtime's GA function-tool wire shape. Tools are declared on the
 * session with top-level `name` / `description` / `parameters` (NOT the older
 * Chat-Completions-style `{ type:"function", function:{...} }` nesting).
 *
 * `parameters` is a raw JSON Schema object — exactly what our AgentTool
 * already carries in its `jsonSchema` field (the same object the text runtime
 * feeds to Anthropic's `input_schema`). We pass it through verbatim rather
 * than re-deriving it from Zod, so the voice and text surfaces stay in lockstep.
 */
export type RealtimeFunctionTool = {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

/**
 * Convert our AgentTool[] into OpenAI Realtime function tools.
 *
 * Pure + total: no I/O, no throwing, empty in → empty out. Each tool's
 * pre-computed `jsonSchema` is shallow-cloned into `parameters` so callers
 * can't accidentally mutate the shared source schema.
 */
export function toRealtimeFunctionTools(
  tools: AgentTool[],
): RealtimeFunctionTool[] {
  return tools.map((tool) => ({
    type: "function" as const,
    name: tool.name,
    description: tool.description,
    // Shallow clone — the source jsonSchema is a shared module-level object;
    // handing out a copy keeps toRealtimeFunctionTools side-effect free.
    parameters: { ...tool.jsonSchema },
  }));
}

/** Discriminated result of a single voice tool call. Always resolved, never
 *  thrown — the caller serializes it into a Realtime `function_call_output`
 *  conversation item ({ type:"function_call_output", call_id, output }). The
 *  `call_id` is transport-level (it rides on the Realtime event), so it is
 *  intentionally NOT this function's concern; we only produce the `output`. */
export type VoiceToolCallResult =
  | { ok: true; result: unknown; output: string }
  | { ok: false; error: string };

export type ExecuteVoiceToolCallDeps = {
  /** Tool lookup. Defaults to the real registry's findTool. Injectable so
   *  tests can exercise the unknown-tool / throwing-tool paths without module
   *  mocking (this codebase prefers DI over node:test mock.module — tsx's CJS
   *  interop makes module mocking unreliable). */
  findTool: (name: string) => AgentTool | undefined;
};

const DEFAULT_DEPS: ExecuteVoiceToolCallDeps = {
  findTool: defaultFindTool,
};

/**
 * Execute one tool call coming back from OpenAI Realtime.
 *
 * @param opts.name          The function name from the Realtime function_call.
 * @param opts.argumentsJson The raw JSON string of arguments the model emits
 *                           in `response.function_call_arguments.done`. An
 *                           empty string is treated as a no-arg call ({}).
 * @param opts.ctx           Workspace-scoped execution context (same shape the
 *                           text runtime builds).
 * @param opts.deps          Optional dependency injection (findTool).
 *
 * Failure modes (all return { ok: false }, never throw):
 *   - malformed JSON arguments        → error mentions JSON/parse
 *   - arguments not a JSON object     → error "invalid_arguments"
 *   - unknown tool name               → error "unknown_tool"
 *   - args fail the tool's Zod schema → error "input_validation_failed: ..."
 *   - tool execute() throws           → error is the thrown message
 */
export async function executeVoiceToolCall(opts: {
  name: string;
  argumentsJson: string;
  ctx: ToolExecuteContext;
  deps?: ExecuteVoiceToolCallDeps;
}): Promise<VoiceToolCallResult> {
  const findTool = opts.deps?.findTool ?? DEFAULT_DEPS.findTool;

  // 1. Parse arguments. OpenAI Realtime sends "" for zero-parameter calls;
  //    normalize that to an empty object before parsing.
  let parsedArgs: unknown;
  const raw = opts.argumentsJson?.trim() ?? "";
  if (raw === "") {
    parsedArgs = {};
  } else {
    try {
      parsedArgs = JSON.parse(raw);
    } catch (err) {
      return {
        ok: false,
        error: `invalid_arguments_json: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // Tool inputs are always objects. Reject bare scalars / arrays / null so a
  // tool's Zod schema isn't handed something it can't reason about.
  if (
    parsedArgs === null ||
    typeof parsedArgs !== "object" ||
    Array.isArray(parsedArgs)
  ) {
    return { ok: false, error: "invalid_arguments" };
  }

  // 2. Resolve the tool.
  const tool = findTool(opts.name);
  if (!tool) {
    return { ok: false, error: "unknown_tool" };
  }

  // 3. Validate against the tool's Zod schema (mirrors the text runtime's
  //    harness-layer validation — same source of truth).
  const validation = tool.inputSchema.safeParse(parsedArgs);
  if (!validation.success) {
    return {
      ok: false,
      error: `input_validation_failed: ${validation.error.message}`,
    };
  }

  // 4. Execute. Any throw (Error or otherwise) is caught and surfaced as a
  //    failure result — a phone call must never crash on a tool error.
  try {
    const result = await (tool as AgentTool<unknown, unknown>).execute(
      validation.data,
      opts.ctx,
    );
    return {
      ok: true,
      result,
      // Pre-serialized payload for the Realtime function_call_output item.
      // `?? null` mirrors the text runtime's JSON.stringify(output ?? null).
      output: JSON.stringify(result ?? null),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
