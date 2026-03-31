import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";
import { getPlan } from "@/lib/billing/plans";

export async function shouldShowPoweredByBadgeForOrg(orgId: string) {
  const [org] = await db
    .select({ ownerId: organizations.ownerId, plan: organizations.plan })
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

  const plan = owner?.planId ? getPlan(owner.planId) : null;

  if (plan) {
    return !plan.limits.removeBranding;
  }

  if (org.plan === "pro") {
    return false;
  }

  return true;
}
