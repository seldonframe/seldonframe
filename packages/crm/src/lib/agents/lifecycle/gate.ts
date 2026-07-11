// Agent lifecycle slice — the single source of truth for "is this template
// allowed to sell": both the Verified-stage ladder badge AND the marketplace
// publish gate (lib/marketplace/seller-actions.ts) read this exact function,
// so the two surfaces can never silently disagree.

import type { EvalRun } from "@/db/schema/eval-runs";

/** A latest EvalRun passes the gate at >=80% pass rate with at least one
 *  scenario run (a 100%-of-zero pass rate never counts as verified). */
export const EVAL_PASS_THRESHOLD = 80;

export type LifecycleGateDeps = {
  getLatestEvalRun: (args: {
    orgId: string;
    subjectKind: "template";
    subjectId: string;
  }) => Promise<EvalRun | null>;
  /** True iff at least one `supervised_runs` row for this org+template has
   *  `status === "succeeded"` — the durable "Run it once — watch every
   *  action" record (agent lifecycle Stage 04). */
  hasSucceededSupervisedRun: (args: { orgId: string; templateId: string }) => Promise<boolean>;
};

export type LifecycleGateResult = {
  evalPass: boolean;
  supervisedRun: boolean;
  /** Which requirements are NOT satisfied, in check order — empty when both
   *  gates pass. */
  missing: Array<"eval_pass" | "supervised_run">;
};

/**
 * The lifecycle gate: does this template have (a) a passing eval run and (b)
 * a completed supervised run? Pure DI'd read — never writes, never throws
 * (a deps call throwing propagates, same contract as getLatestEvalRun today;
 * callers already wrap this in their own try/catch where needed).
 */
export async function lifecycleGate(
  deps: LifecycleGateDeps,
  input: { orgId: string; templateId: string },
): Promise<LifecycleGateResult> {
  const [latestEvalRun, supervisedRun] = await Promise.all([
    deps.getLatestEvalRun({ orgId: input.orgId, subjectKind: "template", subjectId: input.templateId }),
    deps.hasSucceededSupervisedRun({ orgId: input.orgId, templateId: input.templateId }),
  ]);

  const evalPass =
    latestEvalRun != null &&
    latestEvalRun.passRate >= EVAL_PASS_THRESHOLD &&
    latestEvalRun.scenarioCount >= 1;

  const missing: LifecycleGateResult["missing"] = [];
  if (!evalPass) missing.push("eval_pass");
  if (!supervisedRun) missing.push("supervised_run");

  return { evalPass, supervisedRun, missing };
}

/**
 * The pure "should this marketplace publish attempt be BLOCKED" decision —
 * consumed by publishOrUpdateAgentListingAction. Flag off ⇒ never blocks
 * (dark-ship: SF_AGENT_LIFECYCLE !== "1" is byte-for-byte zero behavior
 * change). Flag on ⇒ blocks exactly when `lifecycleGate` reports anything
 * missing. Extracted + tested standalone (mirrors resolveListingPublishState
 * in pricing-model.ts — the same file's Stripe Connect gate).
 */
export function resolvePublishGate(args: { enabled: boolean; missing: string[] }): { blocked: boolean } {
  return { blocked: args.enabled && args.missing.length > 0 };
}
