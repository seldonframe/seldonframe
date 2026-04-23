// Shared interpolation helper.
//
// Shipped in SLICE 3 PR 1 C4 as a pure extraction from
// step-dispatchers/mcp-tool-call.ts:24 (the original resolver since
// 2c). Consumed by four dispatchers today:
//   - mcp_tool_call (was the original home)
//   - read_state (SLICE 3 C1)
//   - write_state (SLICE 3 C2)
//   - emit_event  (SLICE 3 C3)
//
// STRICT BEHAVIOR PRESERVATION per audit §4.5 + §7.7. NO new
// capabilities introduced in C4:
//   - Variables: name-only resolution, NO sub-path access.
//   - Captures: dotted-path walk; miss → raw token preserved.
//   - Reserved namespaces (trigger/contact/agent/workspace): left raw.
//   - `{{now}}` / date helpers: NOT supported.
//   - Array indexing (`items[0]`): NOT supported.
//   - Result always `String(current)` — numbers / booleans stringify.
//   - Recurses through arrays + objects.
//
// Any functional change to this helper MUST preserve the exact
// pre-extraction semantics. The mcp-tool-call test suite + the
// dispatcher tests pin the invariants.

import type { StoredRun } from "./types";

const INTERPOLATION_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

/**
 * Walk `value` recursively and replace `{{var.path}}` tokens with
 * values from the run's scope. Returns a NEW value when
 * interpolation applies; primitives pass through unchanged.
 */
export function resolveInterpolations(value: unknown, run: StoredRun): unknown {
  if (typeof value === "string") {
    return resolveTokensInString(value, run);
  }
  if (Array.isArray(value)) {
    return value.map((v) => resolveInterpolations(v, run));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = resolveInterpolations(v, run);
    }
    return out;
  }
  return value;
}

/**
 * Convenience variant that forces string output. Equivalent to
 * `String(resolveInterpolations(s, run))` when the input is a
 * string; useful for path resolution where the caller needs a
 * string regardless of token content.
 */
export function resolveInterpolationsInString(s: string, run: StoredRun): string {
  return resolveTokensInString(s, run);
}

function resolveTokensInString(s: string, run: StoredRun): string {
  return s.replace(INTERPOLATION_RE, (raw, bodyRaw) => {
    const body = String(bodyRaw).trim();
    const [varName, ...pathSegs] = body.split(".");
    // 1. Variable scope — resolves by name; sub-path segments
    // are IGNORED (matches the legacy mcp-tool-call resolver
    // behavior; see audit §7.7 clarification — the inline
    // comment said "path access unsupported" but the code
    // silently resolves anyway and drops the sub-path).
    if (Object.prototype.hasOwnProperty.call(run.variableScope, varName)) {
      return String(run.variableScope[varName]);
    }
    // 2. Capture scope — dotted path walk via own-property check.
    if (Object.prototype.hasOwnProperty.call(run.captureScope, varName)) {
      let current: unknown = run.captureScope[varName];
      for (const seg of pathSegs) {
        if (
          current &&
          typeof current === "object" &&
          seg in (current as Record<string, unknown>)
        ) {
          current = (current as Record<string, unknown>)[seg];
        } else {
          return raw;
        }
      }
      return String(current);
    }
    // 3. Reserved namespaces + unknown roots — pass-through raw.
    return raw;
  });
}
