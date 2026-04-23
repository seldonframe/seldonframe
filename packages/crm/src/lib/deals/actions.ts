"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts, deals, pipelines } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { assertWritable } from "@/lib/demo/server";
import { emitSeldonEvent } from "@/lib/events/bus";
import { inferClientLifecycleFromStatus, recordDealStageLearning } from "@/lib/soul/learning";

export async function listDeals() {
  const orgId = await getOrgId();

  if (!orgId) {
    return [];
  }

  return db.select().from(deals).where(eq(deals.orgId, orgId));
}

export async function getDefaultPipeline() {
  const orgId = await getOrgId();

  if (!orgId) {
    return null;
  }

  const [pipeline] = await db
    .select()
    .from(pipelines)
    .where(and(eq(pipelines.orgId, orgId), eq(pipelines.isDefault, true)))
    .limit(1);

  return pipeline ?? null;
}

export async function createDealAction(formData: FormData) {
  assertWritable();

  const orgId = await getOrgId();

  if (!orgId) {
    throw new Error("Unauthorized");
  }

  const [pipeline] = await db
    .select()
    .from(pipelines)
    .where(and(eq(pipelines.orgId, orgId), eq(pipelines.isDefault, true)))
    .limit(1);

  if (!pipeline) {
    throw new Error("Pipeline not configured");
  }

  const contactId = String(formData.get("contactId") ?? "");

  if (!contactId) {
    throw new Error("Contact required");
  }

  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId)))
    .limit(1);

  if (!contact) {
    throw new Error("Contact not found");
  }

  const firstStage = Array.isArray(pipeline.stages) && pipeline.stages.length > 0 ? pipeline.stages[0] : { name: "New", probability: 0 };

  await db.insert(deals).values({
    orgId,
    contactId: contact.id,
    pipelineId: pipeline.id,
    title: String(formData.get("title") ?? "Untitled"),
    stage: String((firstStage as { name?: string }).name ?? "New"),
    probability: Number((firstStage as { probability?: number }).probability ?? 0),
    value: String(formData.get("value") ?? "0"),
  });

  await recordDealStageLearning({
    orgId,
    stage: String((firstStage as { name?: string }).name ?? "New"),
    probability: Number((firstStage as { probability?: number }).probability ?? 0),
    source: contact.source,
    value: Number(formData.get("value") ?? 0),
    createdAt: new Date(),
  });
}

export async function moveDealStageAction(dealId: string, stage: string, probability: number) {
  assertWritable();

  const orgId = await getOrgId();

  if (!orgId) {
    throw new Error("Unauthorized");
  }

  const [existingDeal] = await db
    .select({ stage: deals.stage })
    .from(deals)
    .where(and(eq(deals.orgId, orgId), eq(deals.id, dealId)))
    .limit(1);

  if (!existingDeal) {
    throw new Error("Deal not found");
  }

  await db
    .update(deals)
    .set({
      stage,
      probability,
      updatedAt: new Date(),
      closedAt: probability === 100 || stage.toLowerCase().includes("won") || stage.toLowerCase().includes("lost") ? new Date() : null,
    })
    .where(and(eq(deals.orgId, orgId), eq(deals.id, dealId)));

  const [updatedDeal] = await db
    .select({ createdAt: deals.createdAt, value: deals.value, source: contacts.source })
    .from(deals)
    .leftJoin(contacts, eq(contacts.id, deals.contactId))
    .where(and(eq(deals.orgId, orgId), eq(deals.id, dealId)))
    .limit(1);

  await recordDealStageLearning({
    orgId,
    stage,
    probability,
    source: updatedDeal?.source ?? undefined,
    value: Number(updatedDeal?.value ?? 0),
    createdAt: updatedDeal?.createdAt ?? undefined,
  });

  await inferClientLifecycleFromStatus({
    orgId,
    status: stage,
    source: updatedDeal?.source ?? undefined,
    lifetimeValue: Number(updatedDeal?.value ?? 0),
  });

  await emitSeldonEvent("deal.stage_changed", {
    dealId,
    from: existingDeal.stage,
    to: stage,
  }, { orgId: orgId });
}
