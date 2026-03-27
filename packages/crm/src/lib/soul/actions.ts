"use server";

import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";
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

  await db
    .update(organizations)
    .set({
      soul: soul as unknown as Record<string, unknown>,
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
