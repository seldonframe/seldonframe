"use server";

import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { organizations, pipelines, users } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { generateSoul } from "@/lib/soul/generate";
import type { OrgSoul, SoulWizardInput } from "@/lib/soul/types";
import { assertWritable } from "@/lib/demo/server";
import { trackTelemetryEvent } from "@seldonframe/core/telemetry";

async function getCurrentOrgId() {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const [dbUser] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);

  return dbUser?.orgId ?? null;
}

export async function generateSoulPreviewAction(input: SoulWizardInput) {
  return generateSoul(input);
}

export async function saveSoulAction(soul: OrgSoul) {
  assertWritable();

  const orgId = await getCurrentOrgId();

  if (!orgId) {
    throw new Error("Unauthorized");
  }

  const normalizedStages =
    Array.isArray(soul.pipeline?.stages) && soul.pipeline.stages.length > 0
      ? soul.pipeline.stages.map((stage, index) => ({
          name: String(stage.name || `Stage ${index + 1}`),
          color: String(stage.color || ["#6366f1", "#8b5cf6", "#22c55e", "#ef4444"][index % 4]),
          probability: Number.isFinite(stage.probability) ? Math.max(0, Math.min(100, Number(stage.probability))) : 0,
        }))
      : [{ name: "New", color: "#6366f1", probability: 0 }];

  const [defaultPipeline] = await db
    .select({ id: pipelines.id })
    .from(pipelines)
    .where(eq(pipelines.orgId, orgId))
    .limit(1);

  if (defaultPipeline) {
    await db
      .update(pipelines)
      .set({
        name: soul.pipeline?.name || "Pipeline",
        stages: normalizedStages,
        isDefault: true,
        updatedAt: new Date(),
      })
      .where(eq(pipelines.id, defaultPipeline.id));
  } else {
    await db.insert(pipelines).values({
      orgId,
      name: soul.pipeline?.name || "Pipeline",
      stages: normalizedStages,
      isDefault: true,
    });
  }

  await db
    .update(organizations)
    .set({
      soul,
      soulCompletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));

  trackTelemetryEvent("soul_config_generated", {
    industry: soul.industry,
    stages_count: soul.pipeline.stages.length,
    fields_generated: soul.suggestedFields.contact.length + soul.suggestedFields.deal.length,
  });

  return { success: true };
}

export async function updateSoulCustomContextAction(input: { customContext: string }) {
  assertWritable();

  const orgId = await getCurrentOrgId();

  if (!orgId) {
    throw new Error("Unauthorized");
  }

  const normalized = String(input.customContext ?? "").trim().slice(0, 2000);

  const [org] = await db
    .select({ soul: organizations.soul })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const existingSoul = (org?.soul as OrgSoul | null) ?? null;
  if (!existingSoul) {
    throw new Error("Soul not configured yet");
  }

  const nextSoul: OrgSoul = {
    ...existingSoul,
    customContext: normalized,
  };

  await db
    .update(organizations)
    .set({
      soul: nextSoul,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));

  revalidatePath("/settings/profile");
  revalidatePath("/seldon");

  return { success: true, customContext: normalized };
}

export async function updateSoulBusinessProfileAction(input: {
  businessName: string;
  industry: string;
  businessDescription: string;
  offerType?: string;
}) {
  assertWritable();

  const orgId = await getCurrentOrgId();

  if (!orgId) {
    throw new Error("Unauthorized");
  }

  const [org] = await db
    .select({ soul: organizations.soul })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const existingSoul = (org?.soul as OrgSoul | null) ?? null;
  if (!existingSoul) {
    throw new Error("Soul not configured yet");
  }

  const nextSoul: OrgSoul = {
    ...existingSoul,
    businessName: String(input.businessName ?? "").trim().slice(0, 120),
    industry: String(input.industry ?? "").trim().slice(0, 120),
    businessDescription: String(input.businessDescription ?? "").trim().slice(0, 1000),
    offerType: String(input.offerType ?? existingSoul.offerType ?? "services").trim().slice(0, 120) || "services",
  };

  await db
    .update(organizations)
    .set({
      soul: nextSoul,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));

  revalidatePath("/settings/profile");
  revalidatePath("/settings");
  revalidatePath("/seldon");

  return {
    success: true,
    soul: {
      businessName: nextSoul.businessName,
      industry: nextSoul.industry,
      businessDescription: nextSoul.businessDescription,
      offerType: nextSoul.offerType,
    },
  };
}
