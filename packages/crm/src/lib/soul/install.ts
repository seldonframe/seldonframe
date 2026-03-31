"use server";

import { and, eq } from "drizzle-orm";
import { buildSoulVariables, interpolateDeep, loadSoulPackage } from "@seldonframe/core/soul";
import { db } from "@/db";
import { bookings, intakeForms, landingPages, organizations, pipelines } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import type { OrgSoul } from "@/lib/soul/types";
import { assertWritable } from "@/lib/demo/server";

type InstallSoulInput = {
  soulId: string;
  answers?: Record<string, unknown>;
  orgId?: string;
  markCompleted?: boolean;
};

type LandingSection = {
  type: string;
  content: Record<string, unknown>;
  order: number;
};

type AppointmentTypeTemplate = {
  title: string;
  slug?: string;
  description?: string;
  durationMinutes?: number;
  price?: number;
  availability?: Record<string, unknown>;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  maxBookingsPerDay?: number;
};

function toSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function normalizeStageColor(index: number) {
  const palette = ["#14b8a6", "#3b82f6", "#8b5cf6", "#f59e0b", "#22c55e"];
  return palette[index % palette.length];
}

export async function installSoul(input: InstallSoulInput) {
  assertWritable();

  const orgId = input.orgId ?? (await getOrgId());

  if (!orgId) {
    throw new Error("Unauthorized");
  }

  const [org] = await db
    .select({ id: organizations.id, name: organizations.name, settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) {
    throw new Error("Organization not found");
  }

  const soulPackage = await loadSoulPackage(input.soulId);

  const wizardAnswers = Object.fromEntries(
    Object.entries(input.answers ?? {}).map(([key, value]) => [key, value == null ? "" : String(value)])
  ) as Record<string, string>;

  const variables = {
    ...buildSoulVariables(soulPackage.config, {
      businessName: org.name,
      ...wizardAnswers,
    }),
    businessName: org.name,
    ownerName: wizardAnswers.ownerName || wizardAnswers.ownerFirstName || "",
    ownerFullName: wizardAnswers.ownerFullName || "",
    contactSingular: wizardAnswers.contactSingular || "Contact",
    contactPlural: wizardAnswers.contactPlural || "Contacts",
    bookingLink: wizardAnswers.bookingLink || "",
    sessionDate: wizardAnswers.sessionDate || "",
    sessionTime: wizardAnswers.sessionTime || "",
    orgSlug: wizardAnswers.orgSlug || "",
    clientDescription: wizardAnswers.clientDescription || "",
    primaryOutcome: wizardAnswers.primaryOutcome || "",
    investmentAmount: wizardAnswers.investmentAmount || "",
    sessionFee: wizardAnswers.sessionFee || "",
  };

  const interpolatedSoul = interpolateDeep(soulPackage.config, variables);

  const identity = (interpolatedSoul.identity ?? {}) as Record<string, unknown>;
  const pipelineTemplate = (interpolatedSoul.pipeline ?? {}) as {
    name?: string;
    stages?: Array<{ name?: string; probability?: number; color?: string }>;
  };
  const landingVariants = Array.isArray(interpolatedSoul.landingPageVariants)
    ? (interpolatedSoul.landingPageVariants as Array<Record<string, unknown>>)
    : [];
  const bookingTemplates = Array.isArray(interpolatedSoul.bookingTypes)
    ? (interpolatedSoul.bookingTypes as AppointmentTypeTemplate[])
    : [];
  const intakeTemplate = (interpolatedSoul.intakeForm ?? {}) as {
    name?: string;
    slug?: string;
    fields?: Array<Record<string, unknown>>;
  };

  const normalizedStages = (pipelineTemplate.stages ?? []).map((stage, index) => ({
    name: String(stage.name || `Stage ${index + 1}`),
    probability: Number.isFinite(stage.probability) ? Number(stage.probability) : Math.min(100, index * 25),
    color: stage.color ? String(stage.color) : normalizeStageColor(index),
  }));

  const pipelineName = String(pipelineTemplate.name || "Pipeline");

  const [existingDefaultPipeline] = await db
    .select({ id: pipelines.id })
    .from(pipelines)
    .where(and(eq(pipelines.orgId, orgId), eq(pipelines.isDefault, true)))
    .limit(1);

  if (existingDefaultPipeline) {
    await db
      .update(pipelines)
      .set({
        name: pipelineName,
        stages: normalizedStages.length ? normalizedStages : [{ name: "New", probability: 0, color: normalizeStageColor(0) }],
        updatedAt: new Date(),
      })
      .where(eq(pipelines.id, existingDefaultPipeline.id));
  } else {
    await db.insert(pipelines).values({
      orgId,
      name: pipelineName,
      stages: normalizedStages.length ? normalizedStages : [{ name: "New", probability: 0, color: normalizeStageColor(0) }],
      isDefault: true,
    });
  }

  let installedLandingPages = 0;

  for (const [index, variant] of landingVariants.entries()) {
    const title = String(variant.title || `Landing Page ${index + 1}`);
    const slug = toSlug(String(variant.slug || title || `page-${index + 1}`)) || `page-${index + 1}`;
    const sections = Array.isArray(variant.sections) ? (variant.sections as LandingSection[]) : [];

    const [existingPage] = await db
      .select({ id: landingPages.id })
      .from(landingPages)
      .where(and(eq(landingPages.orgId, orgId), eq(landingPages.slug, slug)))
      .limit(1);

    if (existingPage) {
      await db
        .update(landingPages)
        .set({
          title,
          sections,
          settings: {
            source: "soul-package",
            soulId: input.soulId,
          },
          updatedAt: new Date(),
        })
        .where(eq(landingPages.id, existingPage.id));
    } else {
      await db.insert(landingPages).values({
        orgId,
        title,
        slug,
        status: index === 0 ? "published" : "draft",
        sections,
        settings: {
          source: "soul-package",
          soulId: input.soulId,
        },
      });
      installedLandingPages += 1;
    }
  }

  let installedBookingTypes = 0;

  for (const template of bookingTemplates) {
    const title = String(template.title || "Consultation");
    const bookingSlug = toSlug(String(template.slug || title || "consultation")) || "consultation";

    const [existingTemplate] = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.orgId, orgId), eq(bookings.status, "template"), eq(bookings.bookingSlug, bookingSlug)))
      .limit(1);

    const metadata = {
      kind: "appointment_type",
      description: template.description || "",
      durationMinutes: Number(template.durationMinutes ?? 30),
      price: Number(template.price ?? 0),
      availability: template.availability ?? {},
      bufferBeforeMinutes: Number(template.bufferBeforeMinutes ?? 0),
      bufferAfterMinutes: Number(template.bufferAfterMinutes ?? 0),
      maxBookingsPerDay: Number(template.maxBookingsPerDay ?? 0),
    };

    if (existingTemplate) {
      await db
        .update(bookings)
        .set({
          title,
          metadata,
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, existingTemplate.id));
    } else {
      const now = new Date();
      await db.insert(bookings).values({
        orgId,
        title,
        bookingSlug,
        provider: "manual",
        status: "template",
        startsAt: now,
        endsAt: new Date(now.getTime() + 30 * 60_000),
        metadata,
      });
      installedBookingTypes += 1;
    }
  }

  if (Array.isArray(intakeTemplate.fields) && intakeTemplate.fields.length > 0) {
    const intakeName = String(intakeTemplate.name || "Client Intake");
    const intakeSlug = toSlug(String(intakeTemplate.slug || intakeName || "intake")) || "intake";

    const [existingForm] = await db
      .select({ id: intakeForms.id })
      .from(intakeForms)
      .where(and(eq(intakeForms.orgId, orgId), eq(intakeForms.slug, intakeSlug)))
      .limit(1);

    if (existingForm) {
      await db
        .update(intakeForms)
        .set({
          name: intakeName,
          fields: intakeTemplate.fields as Array<{
            key: string;
            label: string;
            type: string;
            required: boolean;
            options?: string[];
          }>,
          settings: {
            source: "soul-package",
            soulId: input.soulId,
          },
          updatedAt: new Date(),
        })
        .where(eq(intakeForms.id, existingForm.id));
    } else {
      await db.insert(intakeForms).values({
        orgId,
        name: intakeName,
        slug: intakeSlug,
        fields: intakeTemplate.fields as Array<{
          key: string;
          label: string;
          type: string;
          required: boolean;
          options?: string[];
        }>,
        settings: {
          source: "soul-package",
          soulId: input.soulId,
        },
      });
    }
  }

  const nextSettings = {
    ...(org.settings ?? {}),
    soulPackage: {
      id: input.soulId,
      installedAt: new Date().toISOString(),
      identity,
      emailTemplates: interpolatedSoul.emailTemplates ?? [],
      customFields: interpolatedSoul.customFields ?? {},
      proposalTemplate: interpolatedSoul.proposalTemplate ?? null,
    },
  };

  const orgUpdateValues: {
    soul: OrgSoul;
    soulId: string;
    soulContentGenerated: number;
    settings: Record<string, unknown>;
    updatedAt: Date;
    soulCompletedAt?: Date;
  } = {
    soul: interpolatedSoul as unknown as OrgSoul,
    soulId: input.soulId,
    soulContentGenerated: 1,
    settings: nextSettings,
    updatedAt: new Date(),
  };

  if (input.markCompleted !== false) {
    orgUpdateValues.soulCompletedAt = new Date();
  }

  await db
    .update(organizations)
    .set(orgUpdateValues)
    .where(eq(organizations.id, orgId));

  return {
    success: true,
    soulId: input.soulId,
    installedLandingPages,
    installedBookingTypes,
  };
}
