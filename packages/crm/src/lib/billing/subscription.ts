import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations, type OrganizationSubscription } from "@/db/schema";

export type OrgSubscriptionStatus = "active" | "trialing" | "past_due" | "canceled" | "unpaid";

export async function getOrgSubscription(orgId: string | null | undefined): Promise<OrganizationSubscription> {
  if (!orgId) {
    return {};
  }

  const [row] = await db
    .select({ subscription: organizations.subscription })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  return row?.subscription ?? {};
}

export async function updateOrgSubscription(
  orgId: string | null | undefined,
  updates: Partial<OrganizationSubscription>
) {
  if (!orgId) {
    return;
  }

  const current = await getOrgSubscription(orgId);
  const next: OrganizationSubscription = {
    ...current,
    ...updates,
  };

  await db
    .update(organizations)
    .set({
      subscription: next,
      updatedAt: new Date(),
      ...(typeof updates.tier === "string" ? { plan: updates.tier } : {}),
    })
    .where(eq(organizations.id, orgId));
}
