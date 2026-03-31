import { getPlan, type Plan } from "./plans";

function isSelfHosted(plan: Plan | null) {
  return plan === null;
}

export function resolvePlanFromPlanId(planId: string | null | undefined) {
  return planId ? getPlan(planId) ?? null : null;
}

export function canInstallBlocks(plan: Plan | null): boolean {
  if (isSelfHosted(plan)) return true;
  return plan.id !== "cloud-starter";
}

export function canSubmitBlocks(plan: Plan | null): boolean {
  if (isSelfHosted(plan)) return true;
  return plan.type === "pro";
}

export function canSellBlocks(plan: Plan | null): boolean {
  if (isSelfHosted(plan)) return true;
  return plan.type === "pro";
}

export function canRateBlocks(plan: Plan | null): boolean {
  if (isSelfHosted(plan)) return true;
  return plan.id !== "cloud-starter";
}

export function canSeldonIt(plan: Plan | null): boolean {
  if (isSelfHosted(plan)) return true;
  return plan.id === "cloud-pro" || plan.type === "pro";
}

export function getMaxOrgs(plan: Plan | null): number {
  if (isSelfHosted(plan)) return Number.POSITIVE_INFINITY;
  return plan.limits.maxOrgs;
}

export function canRemoveBranding(plan: Plan | null): boolean {
  if (isSelfHosted(plan)) return true;
  return plan.limits.removeBranding;
}
