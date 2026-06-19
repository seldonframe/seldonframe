import { getPlan, type Plan } from "./plans";

function isSelfHosted(plan: Plan | null) {
  return plan === null;
}

export function resolvePlanFromPlanId(planId: string | null | undefined) {
  return planId ? getPlan(planId) ?? null : null;
}

/** Any paid tier can install marketplace blocks. Self-hosted is always
 *  allowed. (A null plan = no active subscription → not allowed.) */
export function canInstallBlocks(plan: Plan | null): boolean {
  if (isSelfHosted(plan)) return true;
  return true;
}

/** Submitting a custom block to the marketplace is an Agency feature
 *  (marketplace entitlement). */
export function canSubmitBlocks(plan: Plan | null): boolean {
  if (isSelfHosted(plan)) return true;
  return plan.limits.marketplace;
}

export function canSellBlocks(plan: Plan | null): boolean {
  if (isSelfHosted(plan)) return true;
  return plan.limits.marketplace;
}

export function canRateBlocks(plan: Plan | null): boolean {
  if (isSelfHosted(plan)) return true;
  return true;
}

/** Managed AI generation is included on EVERY paid tier (no BYOK gate).
 *  Self-hosted is always allowed (it supplies its own platform key). */
export function canSeldonIt(plan: Plan | null): boolean {
  if (isSelfHosted(plan)) return true;
  return true;
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
