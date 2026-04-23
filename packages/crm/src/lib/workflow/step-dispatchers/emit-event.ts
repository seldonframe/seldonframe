// emit_event step dispatcher — fires a SeldonEvent without wrapping
// it in a tool call. SLICE 3 C3 per audit §3.3 + G-3-2.
//
// Contract:
//   - Data values walked + interpolations resolved (strings only;
//     non-string primitives pass through).
//   - Emitter is `context.emitSeldonEvent` — injected for testability.
//     Production wiring assigns `emitSeldonEvent` from
//     lib/events/bus.ts. Missing emitter → fail with clear wiring
//     message.
//   - Uses `run.orgId` for the emission's orgId (SLICE 1-a required
//     orgId; matches the bus's signature).
//   - Emitter throws → fail NextAction.

import type { EmitEventStep } from "../../agents/validator";
import type { NextAction, RuntimeContext, StoredRun } from "../types";

const INTERPOLATION_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

function resolveInterpolationsInValue(value: unknown, run: StoredRun): unknown {
  if (typeof value === "string") {
    return value.replace(INTERPOLATION_RE, (raw, bodyRaw) => {
      const body = String(bodyRaw).trim();
      const [varName, ...pathSegs] = body.split(".");
      if (Object.prototype.hasOwnProperty.call(run.variableScope, varName)) {
        return String(run.variableScope[varName]);
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
  if (Array.isArray(value)) {
    return value.map((v) => resolveInterpolationsInValue(v, run));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = resolveInterpolationsInValue(v, run);
    }
    return out;
  }
  return value;
}

export async function dispatchEmitEvent(
  run: StoredRun,
  step: EmitEventStep,
  context: RuntimeContext,
): Promise<NextAction> {
  if (!context.emitSeldonEvent) {
    return {
      kind: "fail",
      reason: "emit_event dispatcher requires context.emitSeldonEvent (wire the bus emitter into RuntimeContext)",
    };
  }

  const resolvedData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(step.data)) {
    resolvedData[key] = resolveInterpolationsInValue(value, run);
  }

  try {
    await context.emitSeldonEvent(step.event, resolvedData, { orgId: run.orgId });
    return { kind: "advance", next: step.next };
  } catch (err) {
    return {
      kind: "fail",
      reason: `emit_event dispatch failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
