// branch step dispatcher — SLICE 6 PR 1 C5 per audit §4.2 + G-6-2 + G-6-4.
//
// Two condition types:
//   type="predicate"     → delegate to evaluatePredicate over a merged
//                          scope (variables + captureScope)
//   type="external_state" → resolve interpolations in HTTP config +
//                          call evaluateExternalState (C4)
//
// Returns NextAction:
//   - {kind:"advance", next: on_match_next}    when condition === true
//   - {kind:"advance", next: on_no_match_next} when condition === false
//   - {kind:"fail", reason}                    on evaluation error
//     (unless timeout_behavior="false_on_timeout", in which case the
//      evaluator pre-converts timeout to matched=false + no error)
//
// The dispatcher stays pure at the orchestration layer: the caller
// supplies a SecretResolver closure bound to (orgId, db). Predicate
// + external-state evaluators are imported; interpolation resolver
// is shared with other dispatchers.

import type { BranchStep, Condition } from "../../agents/validator";
import type { Predicate } from "../../agents/types";
import type { NextAction, StoredRun } from "../types";
import { resolveInterpolations } from "../interpolate";
import {
  evaluateExternalState,
  type ExternalStateCondition,
  type SecretResolver,
  type EvaluationResult,
} from "../external-state-evaluator";

export type BranchDispatchContext = {
  /** Resolves a secret_name to plaintext (orgId-bound closure at call site). */
  resolveSecret: SecretResolver;
  /** Called on each evaluation for observability (PR 2 C2 wires this to workflow_event_log). */
  onEvaluated?: (entry: {
    runId: string;
    stepId: string;
    conditionType: Condition["type"];
    url?: string;
    method?: string;
    responseStatus?: number;
    matched: boolean;
    elapsedMs: number;
    error?: string;
  }) => void;
};

export async function dispatchBranch(
  run: StoredRun,
  step: BranchStep,
  ctx: BranchDispatchContext,
): Promise<NextAction> {
  if (step.condition.type === "predicate") {
    return dispatchPredicateBranch(run, step, step.condition.predicate, ctx);
  }
  return dispatchExternalStateBranch(run, step, step.condition, ctx);
}

// ---------------------------------------------------------------------
// Predicate branch
// ---------------------------------------------------------------------

function dispatchPredicateBranch(
  run: StoredRun,
  step: BranchStep,
  predicate: Predicate,
  ctx: BranchDispatchContext,
): NextAction {
  // Build a flat scope from variables + captures. Unlike the
  // workflow_waits predicate evaluator (which requires a "data." prefix
  // because event payloads arrive wrapped), branch predicates read
  // directly against the run's merged scope.
  const scope: Record<string, unknown> = {
    ...run.variableScope,
    ...run.captureScope,
  };
  const matched = evaluateBranchPredicate(predicate, scope);
  ctx.onEvaluated?.({
    runId: run.id,
    stepId: step.id,
    conditionType: "predicate",
    matched,
    elapsedMs: 0,
  });
  return {
    kind: "advance",
    next: matched ? step.on_match_next : step.on_no_match_next,
  };
}

function evaluateBranchPredicate(
  predicate: Predicate,
  scope: Record<string, unknown>,
): boolean {
  switch (predicate.kind) {
    case "field_equals": {
      const value = readFlatPath(scope, predicate.field);
      return value === predicate.value;
    }
    case "field_contains": {
      const value = readFlatPath(scope, predicate.field);
      return typeof value === "string" && value.includes(predicate.substring);
    }
    case "field_exists": {
      const value = readFlatPath(scope, predicate.field);
      return value !== undefined && value !== null;
    }
    case "event_emitted":
      // Meaningful only at await_event resolution, not inside a branch.
      return false;
    case "all":
      return predicate.of.every((child) => evaluateBranchPredicate(child, scope));
    case "any":
      return predicate.of.some((child) => evaluateBranchPredicate(child, scope));
  }
}

function readFlatPath(scope: Record<string, unknown>, field: string): unknown {
  const segments = field.split(".");
  let current: unknown = scope;
  for (const seg of segments) {
    if (current && typeof current === "object" && seg in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return current;
}

// ---------------------------------------------------------------------
// External-state branch
// ---------------------------------------------------------------------

async function dispatchExternalStateBranch(
  run: StoredRun,
  step: BranchStep,
  condition: ExternalStateCondition,
  ctx: BranchDispatchContext,
): Promise<NextAction> {
  // Resolve interpolations in url, headers, query, body. resolveInterpolations
  // walks nested objects + strings.
  const resolvedHttp = resolveInterpolations(condition.http, run) as ExternalStateCondition["http"];
  const resolved: ExternalStateCondition = {
    ...condition,
    http: resolvedHttp,
  };

  let result: EvaluationResult;
  try {
    result = await evaluateExternalState(resolved, ctx.resolveSecret);
  } catch (err) {
    // evaluateExternalState already catches expected errors and returns
    // matched=false+error; a throw here means something unexpected.
    return {
      kind: "fail",
      reason: `external_state evaluation threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  ctx.onEvaluated?.({
    runId: run.id,
    stepId: step.id,
    conditionType: "external_state",
    url: resolved.http.url,
    method: resolved.http.method ?? "GET",
    responseStatus: result.responseStatus,
    matched: result.matched,
    elapsedMs: result.elapsedMs,
    error: result.error,
  });

  // Error handling per G-6-2: default timeout_behavior="fail" means
  // an error result fails the branch; "false_on_timeout" pre-converts
  // timeouts to matched=false + no error inside the evaluator.
  if (result.error) {
    return {
      kind: "fail",
      reason: `branch "${step.id}" external_state evaluation failed: ${result.error}`,
    };
  }

  return {
    kind: "advance",
    next: result.matched ? step.on_match_next : step.on_no_match_next,
  };
}
