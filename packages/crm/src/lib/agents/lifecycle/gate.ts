// Agent lifecycle slice — the single source of truth for "is this template
// allowed to sell": both the Verified-stage ladder badge AND the marketplace
// publish gate (lib/marketplace/seller-actions.ts) read this exact function,
// so the two surfaces can never silently disagree.

import type { EvalRun } from "@/db/schema/eval-runs";
import type { ConnectorBinding } from "@/lib/agents/mcp/connectors";

/** A latest EvalRun passes the gate at >=80% pass rate with at least one
 *  scenario run (a 100%-of-zero pass rate never counts as verified). */
export const EVAL_PASS_THRESHOLD = 80;

/** Native capabilities that never take a real-world action — pure replies
 *  (an FAQ answer, a computed quote range) or the safe-exit
 *  (escalate_to_human hands off; it never itself DOES anything). A template
 *  whose only capabilities are drawn from this set, with no bound external
 *  connector, has nothing a supervised run could ever verify with a real
 *  tool call. */
const NON_ACTION_CAPABILITIES = new Set<string>([
  "escalate_to_human",
  "provide_faq_answer",
  "get_quote_range",
]);

/**
 * F-D (the opus-review gate regression): does this template have at least
 * one tool that could ever take a REAL action? True iff it has a bound
 * external connector (composio or vetted — ANY, since resolveComposioBinding
 * only wraps `enabledTools`, we don't need to inspect the allowlist here to
 * know intent-to-act) OR a native capability outside NON_ACTION_CAPABILITIES
 * (book_appointment, reschedule_appointment, cancel_appointment,
 * look_up_availability, find_my_existing_appointment, take_message, …).
 * Pure; never throws — null/undefined inputs are treated as empty.
 */
export function hasActionableTools(args: {
  connectors: ConnectorBinding[] | null | undefined;
  capabilities: string[] | null | undefined;
}): boolean {
  if (Array.isArray(args.connectors) && args.connectors.length > 0) return true;
  const capabilities = Array.isArray(args.capabilities) ? args.capabilities : [];
  return capabilities.some((cap) => !NON_ACTION_CAPABILITIES.has(cap));
}

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
  /** True when the template has no bound external tools and no
   *  action-capable native capability beyond escalate_to_human/faq/quote —
   *  a pure-chat agent that can never take a real tool action. The
   *  supervised-run requirement is EXEMPT for it (never appears in
   *  `missing`); evals are still required. The strict >=1-ok-action
   *  supervised-run rule (supervised-run.ts's runSupervised) is completely
   *  unchanged for any template WITH tools. */
  supervisedRunExempt: boolean;
  /** Which requirements are NOT satisfied, in check order — empty when
   *  every applicable gate passes. */
  missing: Array<"eval_pass" | "supervised_run">;
};

/**
 * The lifecycle gate: does this template have (a) a passing eval run and (b)
 * a completed supervised run (unless exempt — F-D)? Pure DI'd read — never
 * writes, never throws (a deps call throwing propagates, same contract as
 * getLatestEvalRun today; callers already wrap this in their own try/catch
 * where needed). `hasActionableTools` is plain already-loaded data (the
 * template's blueprint connectors + capabilities), not I/O — callers compute
 * it with the {@link hasActionableTools} pure fn above before calling in.
 */
export async function lifecycleGate(
  deps: LifecycleGateDeps,
  input: { orgId: string; templateId: string; hasActionableTools: boolean },
): Promise<LifecycleGateResult> {
  const [latestEvalRun, supervisedRun] = await Promise.all([
    deps.getLatestEvalRun({ orgId: input.orgId, subjectKind: "template", subjectId: input.templateId }),
    deps.hasSucceededSupervisedRun({ orgId: input.orgId, templateId: input.templateId }),
  ]);

  const evalPass =
    latestEvalRun != null &&
    latestEvalRun.passRate >= EVAL_PASS_THRESHOLD &&
    latestEvalRun.scenarioCount >= 1;

  const supervisedRunExempt = !input.hasActionableTools;

  const missing: LifecycleGateResult["missing"] = [];
  if (!evalPass) missing.push("eval_pass");
  if (!supervisedRun && !supervisedRunExempt) missing.push("supervised_run");

  return { evalPass, supervisedRun, supervisedRunExempt, missing };
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
