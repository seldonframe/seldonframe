"use server";

import { and, desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { createCheckoutSession } from "@seldonframe/payments";
import { requireCloudAuth, requireSoulCompleted } from "@/lib/auth/actions";
import { db } from "@/lib/db";
import { cloudProvisioningJobs, organizations } from "@/lib/db/schema";
import { assertWritable } from "./guards";
import type { CloudSoulInput, CloudTier } from "./types";
import { hasTier } from "./tier";

async function getOrgBySession() {
  const session = await requireCloudAuth();
  const [org] = await db.select().from(organizations).where(eq(organizations.id, session.orgId)).limit(1);

  if (!org) {
    throw new Error("Organization not found");
  }

  return { session, org };
}

export async function saveCloudSoulAction(input: CloudSoulInput) {
  assertWritable();

  const { org } = await getOrgBySession();

  const soul = {
    businessName: input.businessName,
    industry: input.industry,
    offerType: input.offerType,
    voice: {
      style: input.communicationStyle,
    },
    priorities: input.priorities,
    aiContext: input.narrative,
    rawInput: {
      processDescription: input.processDescription,
      clientType: input.clientType,
      clientLabel: input.clientLabel,
    },
  };

  await db
    .update(organizations)
    .set({
      soul: soul as Record<string, unknown>,
      soulCompletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, org.id));

  redirect("/dashboard");
}

export async function listCloudDashboardData() {
  const { org } = await getOrgBySession();

  const jobs = await db
    .select()
    .from(cloudProvisioningJobs)
    .where(eq(cloudProvisioningJobs.orgId, org.id))
    .orderBy(desc(cloudProvisioningJobs.createdAt));

  return {
    org,
    jobs,
  };
}

export async function rerunProvisioningAction() {
  assertWritable();

  const { org } = await getOrgBySession();

  await db.insert(cloudProvisioningJobs).values({
    orgId: org.id,
    status: "completed",
    template: "default",
    result: {
      rerunAt: new Date().toISOString(),
    },
  });

  redirect("/dashboard");
}

export async function createBillingCheckoutAction() {
  assertWritable();

  const { session, org } = await getOrgBySession();

  const appUrl = process.env.NEXT_PUBLIC_CLOUD_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";

  const checkout = await createCheckoutSession({
    orgId: org.id,
    contactId: session.userId,
    amount: 99,
    currency: "USD",
    sourceBlock: "manual",
    sourceId: "cloud-upgrade-pro",
    customerEmail: session.email,
    successUrl: `${appUrl}/billing?status=success`,
    cancelUrl: `${appUrl}/billing?status=cancelled`,
    metadata: {
      tier: "pro",
    },
  });

  if (!checkout.url) {
    throw new Error("Stripe checkout URL unavailable");
  }

  redirect(checkout.url);
}

export async function activateProTierAction() {
  assertWritable();

  const { org } = await getOrgBySession();

  await db.update(organizations).set({ plan: "pro", updatedAt: new Date() }).where(eq(organizations.id, org.id));

  redirect("/billing?status=pro_activated");
}

export async function getCurrentTier() {
  const { org } = await getOrgBySession();
  return (org.plan as CloudTier) ?? "free";
}

export async function requireFeatureTier(minimumTier: CloudTier) {
  await requireSoulCompleted();
  const tier = await getCurrentTier();

  if (!hasTier(tier, minimumTier)) {
    redirect(`/billing?upgrade=1&tier=${minimumTier}`);
  }
}

export async function listProvisioningJobsForOrg(orgId: string) {
  await requireCloudAuth();

  return db
    .select()
    .from(cloudProvisioningJobs)
    .where(eq(cloudProvisioningJobs.orgId, orgId))
    .orderBy(desc(cloudProvisioningJobs.createdAt));
}

export async function getProvisioningStatus(orgId: string) {
  await requireCloudAuth();

  const [job] = await db
    .select()
    .from(cloudProvisioningJobs)
    .where(and(eq(cloudProvisioningJobs.orgId, orgId), eq(cloudProvisioningJobs.status, "completed")))
    .orderBy(desc(cloudProvisioningJobs.createdAt))
    .limit(1);

  return job ?? null;
}
