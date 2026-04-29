"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts, deals, pipelines } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { assertWritable } from "@/lib/demo/server";
import { emitSeldonEvent } from "@/lib/events/bus";
import { inferClientLifecycleFromStatus, recordDealStageLearning } from "@/lib/soul/learning";
import { ensureDefaultPipelineForOrg } from "@/lib/deals/pipeline-defaults";

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

  // Self-heal: workspaces created via the MCP `create_workspace` tool
  // before pipeline-seeding was wired into `createAnonymousWorkspace`
  // have no `pipelines` row. Without this, the very first deal-create
  // form submission lands the page in the global error boundary
  // ("Pipeline not configured"). ensureDefaultPipelineForOrg returns
  // the existing pipeline if there is one, otherwise inserts a
  // standard B2B funnel (Lead → Qualified → ... → Won/Lost).
  const pipeline = await ensureDefaultPipelineForOrg(orgId);

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

/**
 * Quick-add variant of `createDealAction` — accepts a structured
 * argument instead of FormData and returns a typed result instead of
 * throwing. Used by the kanban "+ Add deal" inline form so a missing
 * contact (or other validation failure) renders as an inline error
 * rather than triggering the global error boundary.
 *
 * On success, inserts the deal at the chosen stage (default: first
 * stage of the org's default pipeline, auto-seeded if missing).
 */
export async function quickCreateDealAction(input: {
  title: string;
  contactId: string;
  value: number;
  stage?: string;
}): Promise<
  | { ok: true; dealId: string; stage: string; probability: number }
  | { ok: false; error: string }
> {
  assertWritable();

  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "Unauthorized." };

  const title = input.title.trim();
  if (!title) return { ok: false, error: "Deal title is required." };
  if (title.length > 200) return { ok: false, error: "Title must be 200 chars or fewer." };

  if (!input.contactId) return { ok: false, error: "Pick a contact." };

  const value = Number.isFinite(input.value) && input.value >= 0 ? input.value : 0;

  const pipeline = await ensureDefaultPipelineForOrg(orgId);

  const [contact] = await db
    .select({ id: contacts.id, source: contacts.source })
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), eq(contacts.id, input.contactId)))
    .limit(1);

  if (!contact) return { ok: false, error: "Contact not found." };

  const stages = Array.isArray(pipeline.stages) ? pipeline.stages : [];
  const fallbackStage = stages[0] ?? { name: "New", probability: 0 };
  const targetStage = input.stage
    ? stages.find((s) => s.name === input.stage) ?? fallbackStage
    : fallbackStage;

  const [created] = await db
    .insert(deals)
    .values({
      orgId,
      contactId: contact.id,
      pipelineId: pipeline.id,
      title,
      value: String(value),
      stage: targetStage.name,
      probability: targetStage.probability ?? 0,
    })
    .returning({ id: deals.id });

  if (!created) return { ok: false, error: "Could not create deal." };

  await recordDealStageLearning({
    orgId,
    stage: targetStage.name,
    probability: targetStage.probability ?? 0,
    source: contact.source,
    value,
    createdAt: new Date(),
  }).catch(() => undefined);

  return {
    ok: true,
    dealId: created.id,
    stage: targetStage.name,
    probability: targetStage.probability ?? 0,
  };
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
