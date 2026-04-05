import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";
import { getPlan } from "@/lib/billing/plans";
import { canRemoveBranding } from "@/lib/billing/entitlements";

function readRemovePoweredBy(rawSettings: unknown) {
  if (!rawSettings || typeof rawSettings !== "object") {
    return null;
  }

  const settings = rawSettings as Record<string, unknown>;
  const branding = settings.branding;

  if (!branding || typeof branding !== "object") {
    return null;
  }

  const removePoweredBy = (branding as Record<string, unknown>).removePoweredBy;
  return typeof removePoweredBy === "boolean" ? removePoweredBy : null;
}

export async function shouldShowPoweredByBadgeForOrg(orgId: string) {
  const [org] = await db
    .select({ ownerId: organizations.ownerId, plan: organizations.plan, settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) {
    return true;
  }

  const [owner] = org.ownerId
    ? await db
        .select({ planId: users.planId })
        .from(users)
        .where(eq(users.id, org.ownerId))
        .limit(1)
    : [null];

  const plan = owner?.planId ? getPlan(owner.planId) ?? null : null;
  const removePoweredBy = readRemovePoweredBy(org.settings);
  const canHide = canRemoveBranding(plan);

  if (canHide) {
    return removePoweredBy === true ? false : true;
  }

  if (org.plan === "pro") {
    return removePoweredBy === true ? false : true;
  }

  return true;
}
