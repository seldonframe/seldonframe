// mcp_tool_call step dispatcher — invokes a tool via the
// context-provided ToolInvoker, captures the result (unwrapping
// `data` if present per the archetype convention), and advances.
//
// The dispatcher is transport-agnostic: production cron passes a
// real HTTP invoker; tests pass a mock. Keeping the runtime layered
// this way means every state-machine test runs synchronously on
// in-memory fakes without touching Postgres or the MCP server.
//
// Interpolation resolution: args strings carrying {{capture.field}}
// or {{variable}} are resolved against the run's scope BEFORE calling
// the invoker. PR 2 implements the minimum resolver needed to drive
// Client Onboarding's flow (variables + captures + reserved
// namespaces). Rich path walking (capture.nested.field) already
// exists in validator.ts but that's a synthesis-time checker; the
// runtime has its own resolver because it needs to substitute
// literal values, not validate shapes.

import type { McpToolCallStep } from "../../agents/validator";
import type { NextAction, RuntimeContext, StoredRun } from "../types";
import { resolveInterpolations } from "../interpolate";

// Capture the tool result following the archetype convention: if the
// return shape is `{data: X}`, bind X; otherwise bind the full return.
function unwrapCapture(result: unknown): unknown {
  if (result && typeof result === "object" && "data" in result) {
    return (result as { data: unknown }).data;
  }
  return result;
}

export async function dispatchMcpToolCall(
  run: StoredRun,
  step: McpToolCallStep,
  context: RuntimeContext,
): Promise<NextAction> {
  try {
    const resolvedArgs = resolveInterpolations(step.args, run) as Record<string, unknown>;
    const result = await context.invokeTool(step.tool, resolvedArgs);
    const capture = step.capture
      ? { name: step.capture, value: unwrapCapture(result) }
      : undefined;
    return { kind: "advance", next: step.next, capture };
  } catch (err) {
    return {
      kind: "fail",
      reason: `mcp_tool_call "${step.tool}" threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
