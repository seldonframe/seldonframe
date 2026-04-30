import { getPlan, type Plan } from "./plans";

function isSelfHosted(plan: Plan | null) {
  return plan === null;
}

export function resolvePlanFromPlanId(planId: string | null | undefined) {
  return planId ? getPlan(planId) ?? null : null;
}

/** Free + Growth get the standard catalog; Scale unlocks the everything
 *  tier. Self-hosted is always allowed. */
export function canInstallBlocks(plan: Plan | null): boolean {
  if (isSelfHosted(plan)) return true;
  return plan.id !== "free";
}

/** Submitting a custom block to the marketplace requires the same
 *  entitlement as ratings — i.e., a paid tier. Scale was the previous
 *  "Pro" gate. */
export function canSubmitBlocks(plan: Plan | null): boolean {
  if (isSelfHosted(plan)) return true;
  return plan.id === "scale";
}

export function canSellBlocks(plan: Plan | null): boolean {
  if (isSelfHosted(plan)) return true;
  return plan.id === "scale";
}

export function canRateBlocks(plan: Plan | null): boolean {
  if (isSelfHosted(plan)) return true;
  return plan.id !== "free";
}

/** Seldon It (managed inference) is gated behind a paid tier. */
export function canSeldonIt(plan: Plan | null): boolean {
  if (isSelfHosted(plan)) return true;
  return plan.id === "growth" || plan.id === "scale";
}

export function getMaxOrgs(plan: Plan | null): number {
  if (isSelfHosted(plan)) return Number.POSITIVE_INFINITY;
  if (plan.limits.maxOrgs === -1) return Number.POSITIVE_INFINITY;
  return plan.limits.maxOrgs;
}

export function canRemoveBranding(plan: Plan | null): boolean {
  if (isSelfHosted(plan)) return true;
  return plan.limits.removeBranding;
}

/** Full white-label = remove every visible "SeldonFrame" mention from
 *  the operator's customer-facing surfaces. Scale-only. */
export function canFullWhiteLabel(plan: Plan | null): boolean {
  if (isSelfHosted(plan)) return true;
  return plan.limits.fullWhiteLabel;
}

/** Client portal is the per-customer dashboard surface. Growth + Scale. */
export function canUseClientPortal(plan: Plan | null): boolean {
  if (isSelfHosted(plan)) return true;
  return plan.limits.clientPortal;
}
