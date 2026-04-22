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

const INTERPOLATION_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

function resolveInterpolations(value: unknown, run: StoredRun): unknown {
  if (typeof value === "string") {
    return value.replace(INTERPOLATION_RE, (raw, bodyRaw) => {
      const body = String(bodyRaw).trim();
      const [varName, ...pathSegs] = body.split(".");
      // 1. Variable scope (string-aliases; path access unsupported).
      if (Object.prototype.hasOwnProperty.call(run.variableScope, varName)) {
        return String(run.variableScope[varName]);
      }
      // 2. Capture scope (dotted path walk).
      if (Object.prototype.hasOwnProperty.call(run.captureScope, varName)) {
        let current: unknown = run.captureScope[varName];
        for (const seg of pathSegs) {
          if (current && typeof current === "object" && seg in (current as Record<string, unknown>)) {
            current = (current as Record<string, unknown>)[seg];
          } else {
            return raw; // leave unresolved — surfaces as literal string in args
          }
        }
        return String(current);
      }
      // 3. Reserved namespaces — runtime passes them through; the
      // tool handler receives the raw interpolation and decides
      // what to do. Synthesis-time validator confirms these pass
      // because reserved namespaces are whitelisted.
      return raw;
    });
  }
  if (Array.isArray(value)) return value.map((v) => resolveInterpolations(v, run));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = resolveInterpolations(v, run);
    }
    return out;
  }
  return value;
}

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
