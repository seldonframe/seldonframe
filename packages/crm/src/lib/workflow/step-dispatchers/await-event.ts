// await_event step dispatcher — registers a wait and returns a
// PauseAction. The runtime applies the pause by inserting a
// workflow_waits row and setting the run's status to "waiting".
//
// G-4 resolution: predicate interpolations are resolved AT
// WAIT-REGISTRATION TIME (here), not at event-arrival time. The
// resolved value gets persisted into workflow_waits.matchPredicate
// and the wake-up scan compares arriving event payloads against
// the frozen predicate.
//
// G-3 timeout: default 30 days if the step omits `timeout`. The
// synthesis-time validator enforces the 90-day ceiling (PR 1 M2);
// here we just trust the parsed step and compute an absolute
// timestamp.

import type { AwaitEventStep } from "../../agents/validator";
import type { NextAction, RuntimeContext, StoredRun } from "../types";

const DEFAULT_TIMEOUT_MS = 30 * 24 * 60 * 60 * 1000; // G-3 default: 30 days

// Minimal Duration → ms conversion. Mirrors
// validator.ts::durationToApproxMs — kept separate here because the
// runtime resolves real timeout timestamps while the validator only
// ceiling-checks. If the duration shape parser drifts between
// validator and runtime, a PR 2 unit test should catch it (covered
// by the integration test with timeout: "P7D").
function durationToMs(duration: string): number {
  const subDay = /^PT(\d+)([SMH])$/.exec(duration);
  if (subDay) {
    const n = Number(subDay[1]);
    if (subDay[2] === "S") return n * 1000;
    if (subDay[2] === "M") return n * 60 * 1000;
    if (subDay[2] === "H") return n * 60 * 60 * 1000;
  }
  const dayPlus = /^P(\d+)([DWMY])$/.exec(duration);
  if (dayPlus) {
    const n = Number(dayPlus[1]);
    const day = 24 * 60 * 60 * 1000;
    if (dayPlus[2] === "D") return n * day;
    if (dayPlus[2] === "W") return n * 7 * day;
    if (dayPlus[2] === "M") return n * 30 * day;
    if (dayPlus[2] === "Y") return n * 365 * day;
  }
  return DEFAULT_TIMEOUT_MS;
}

// Resolve interpolations inside the predicate. Same scope semantics
// as mcp-tool-call.ts — variables + captures. Operates on objects
// recursively so `{{contactId}}` in any `value` field gets swapped
// for the literal before the predicate is persisted.
const INTERPOLATION_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

function resolveInterpolations(value: unknown, run: StoredRun): unknown {
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

export function dispatchAwaitEvent(
  run: StoredRun,
  step: AwaitEventStep,
  context: RuntimeContext,
): NextAction {
  const timeoutMs = step.timeout ? durationToMs(step.timeout) : DEFAULT_TIMEOUT_MS;
  const timeoutAt = new Date(context.now().getTime() + timeoutMs);

  const resolvedPredicate = step.match
    ? (resolveInterpolations(step.match, run) as Record<string, unknown>)
    : null;

  return {
    kind: "pause_event",
    eventType: step.event,
    matchPredicate: resolvedPredicate,
    timeoutAt,
    onResumeNext: step.on_resume.next,
    onResumeCapture: step.on_resume.capture ?? null,
    onTimeoutNext: step.on_timeout.next,
  };
}
