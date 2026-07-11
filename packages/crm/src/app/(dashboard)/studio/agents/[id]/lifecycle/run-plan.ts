// Agent lifecycle slice (F-F — evidence-first Run stage restructure).
//
// Two pure render-logic helpers for the Run stage:
//   - derivePlannedActions: the "This run will:" PLAN row shown before the
//     button, so the operator knows what to expect BEFORE clicking — reuses
//     the recording's derived eval scenarios' `mustDo` (the same "what must
//     happen" list the eval grader checks) when a recording exists, falling
//     back to a plain description of the bound connector tools otherwise.
//   - deriveRunVerdict: the computed verdict line ("N actions completed" or
//     "N of M actions completed" once a plan exists) — replaces the old
//     ok/fail-only verdict; the WORDS lane (what the agent said) is
//     rendered separately and is never itself the verdict.
//
// Pure — no I/O, no React. Both functions are directly unit-testable.

import type { ConnectorBinding } from "@/lib/agents/mcp/connectors";
import type { EvalScenario } from "@/lib/agents/evals/eval-types";
import type { SupervisedRunActionEvent } from "@/db/schema/agent-lifecycle";

const PLAN_CAP = 6;

/** A human label for one bound connector, used only in the plan-row
 *  fallback (no recording-derived mustDo available). */
function connectorLabel(binding: ConnectorBinding): string | null {
  if (binding.kind === "composio") {
    const toolkits = binding.enabledToolkits.filter(Boolean);
    if (toolkits.length === 0) return null;
    return `Use its connected ${toolkits.join(", ")} tools`;
  }
  if (binding.kind === "vetted") {
    return `Use its connected ${binding.id} tools`;
  }
  // byo — endpoint present but no friendly app name to show.
  return "Use its connected custom tools";
}

/**
 * The "This run will:" plan — what the operator should expect BEFORE
 * clicking "Run it once". Primary source: the union of every derived eval
 * scenario's `mustDo` (the recorded workflow's expected behaviours — the
 * same list the eval grader checks), de-duplicated, capped at 6. Falls back
 * to a plain per-connector description when there's no recording (an
 * authored/generated agent). Empty when neither exists (a tool-free
 * pure-chat agent — see F-D's supervisedRunExempt). Pure; never throws.
 */
export function derivePlannedActions(args: {
  connectors: ConnectorBinding[] | null | undefined;
  scenarios: EvalScenario[] | null | undefined;
}): string[] {
  const scenarios = Array.isArray(args.scenarios) ? args.scenarios : [];
  const fromScenarios: string[] = [];
  const seen = new Set<string>();
  for (const scenario of scenarios) {
    for (const step of scenario.mustDo ?? []) {
      const trimmed = typeof step === "string" ? step.trim() : "";
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      fromScenarios.push(trimmed);
    }
  }
  if (fromScenarios.length > 0) return fromScenarios.slice(0, PLAN_CAP);

  const connectors = Array.isArray(args.connectors) ? args.connectors : [];
  const fromConnectors: string[] = [];
  const seenLabels = new Set<string>();
  for (const binding of connectors) {
    const label = connectorLabel(binding);
    if (!label || seenLabels.has(label)) continue;
    seenLabels.add(label);
    fromConnectors.push(label);
  }
  return fromConnectors.slice(0, PLAN_CAP);
}

/**
 * The computed verdict line — replaces the old ok/fail-only summary. Counts
 * REAL completed actions (actionLog entries with status:"ok") — matches
 * runSupervised's own >=1-ok-action definition of "succeeded" exactly, so
 * the ladder and this line can never disagree. Appends "(N planned)" only
 * when a plan exists (plannedCount > 0) — stated as CONTEXT, never as an
 * "N of M" ratio, since a run can legitimately complete more or fewer
 * actions than the plan enumerated (the old "N of M" phrasing implied a
 * shortfall that wasn't real). Pure; never throws.
 */
export function deriveRunVerdict(args: {
  actionLog: SupervisedRunActionEvent[];
  plannedCount: number;
}): string {
  const completed = args.actionLog.filter((event) => event.status === "ok").length;
  const noun = (n: number) => (n === 1 ? "action" : "actions");
  if (args.plannedCount > 0) {
    return `${completed} ${noun(completed)} completed (${args.plannedCount} planned)`;
  }
  return `${completed} ${noun(completed)} completed`;
}
