"use server";

import { and, eq } from "drizzle-orm";
import { buildSoulVariables, interpolateDeep, loadSoulPackage } from "@seldonframe/core/soul";
import { db } from "@/db";
import { bookings, intakeForms, landingPages, organizations, pipelines } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import type { OrgSoul } from "@/lib/soul/types";
import { assertWritable } from "@/lib/demo/server";

type InstallSoulInput = {
  soulId?: string;
  frameworkId?: string;
  framework?: FrameworkConfig;
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

export type FrameworkConfig = {
  id: string;
  name: string;
  description: string;
  icon: string;
  defaultBusinessName: string;
  contactLabel: { singular: string; plural: string };
  dealLabel: { singular: string; plural: string };
  activityLabel: { singular: string; plural: string };
  voice: { tone: string; personality: string };
  pipeline: Array<{ name: string; order: number }>;
  bookingTypes: Array<{
    name: string;
    slug: string;
    durationMinutes: number;
    price: number;
    description: string;
    bufferBefore: number;
    bufferAfter: number;
    maxPerDay: number;
  }>;
  emailTemplates: Array<{
    name: string;
    tag: string;
    subject: string;
    body: string;
  }>;
  intakeForm: {
    name: string;
    slug: string;
    fields: Array<{
      label: string;
      type: string;
      required: boolean;
      options?: string[];
    }>;
  };
  landingPage: {
    headline: string;
    subhead: string;
    cta: string;
  };
  automationSuggestions?: Array<Record<string, unknown>>;
};

async function loadFrameworkConfig(id: string): Promise<FrameworkConfig> {
  const loaders: Record<string, () => Promise<{ default: FrameworkConfig }>> = {
    coaching: () => import("@/lib/frameworks/coaching.json") as Promise<{ default: FrameworkConfig }>,
    agency: () => import("@/lib/frameworks/agency.json") as Promise<{ default: FrameworkConfig }>,
    saas: () => import("@/lib/frameworks/saas.json") as Promise<{ default: FrameworkConfig }>,
  };

  const loader = loaders[id];

  if (!loader) {
    throw new Error(`Unknown framework: ${id}`);
  }

  const mod = await loader();
  return mod.default;
}

function interpolateString(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
    return key in vars ? vars[key] : match;
  });
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

  if (input.frameworkId) {
    return installFrameworkEntities(orgId, org, input);
  }

  if (!input.soulId) {
    throw new Error("Either soulId or frameworkId is required");
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

async function installFrameworkEntities(
  orgId: string,
  org: { id: string; name: string; settings: Record<string, unknown> },
  input: InstallSoulInput,
) {
  const framework = input.framework ?? (await loadFrameworkConfig(input.frameworkId!));
  const answers = input.answers ?? {};

  const ownerName = String(answers.ownerName || answers.ownerFirstName || "");
  const ownerFullName = String(answers.ownerFullName || "");
  const businessName = String(answers.businessName || org.name);
  const journeyDescription = String(answers.journeyDescription || "");
  const enabledAutomations = Array.isArray(answers.enabledAutomations) ? (answers.enabledAutomations as string[]) : [];

  const vars: Record<string, string> = {
    ownerName,
    ownerFullName,
    businessName,
    firstName: "{{firstName}}",
    bookingLink: "{{bookingLink}}",
    intakeLink: "{{intakeLink}}",
    enrollmentLink: "{{enrollmentLink}}",
    cadence: "weekly",
    duration: "60",
    date: "{{date}}",
    month: "{{month}}",
  };

  const normalizedStages = framework.pipeline.map((stage, index) => ({
    name: stage.name,
    probability: Math.min(100, Math.round((stage.order / framework.pipeline.length) * 100)),
    color: normalizeStageColor(index),
  }));

  const pipelineName = `${businessName} Pipeline`;

  const [existingDefaultPipeline] = await db
    .select({ id: pipelines.id })
    .from(pipelines)
    .where(and(eq(pipelines.orgId, orgId), eq(pipelines.isDefault, true)))
    .limit(1);

  if (existingDefaultPipeline) {
    await db
      .update(pipelines)
      .set({ name: pipelineName, stages: normalizedStages, updatedAt: new Date() })
      .where(eq(pipelines.id, existingDefaultPipeline.id));
  } else {
    await db.insert(pipelines).values({
      orgId,
      name: pipelineName,
      stages: normalizedStages,
      isDefault: true,
    });
  }

  let installedBookingTypes = 0;

  for (const bt of framework.bookingTypes) {
    const bookingSlug = bt.slug || toSlug(bt.name);

    const [existing] = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.orgId, orgId), eq(bookings.status, "template"), eq(bookings.bookingSlug, bookingSlug)))
      .limit(1);

    const metadata = {
      kind: "appointment_type",
      description: bt.description || "",
      durationMinutes: bt.durationMinutes,
      price: bt.price,
      availability: {},
      bufferBeforeMinutes: bt.bufferBefore,
      bufferAfterMinutes: bt.bufferAfter,
      maxBookingsPerDay: bt.maxPerDay,
    };

    if (existing) {
      await db
        .update(bookings)
        .set({ title: bt.name, metadata, updatedAt: new Date() })
        .where(eq(bookings.id, existing.id));
    } else {
      const now = new Date();
      await db.insert(bookings).values({
        orgId,
        title: bt.name,
        bookingSlug,
        provider: "manual",
        status: "template",
        startsAt: now,
        endsAt: new Date(now.getTime() + bt.durationMinutes * 60_000),
        metadata,
      });
      installedBookingTypes += 1;
    }
  }

  if (framework.intakeForm?.fields?.length) {
    const intakeName = framework.intakeForm.name;
    const intakeSlug = framework.intakeForm.slug || toSlug(intakeName);
    const fields = framework.intakeForm.fields.map((field) => ({
      key: toSlug(field.label),
      label: field.label,
      type: field.type,
      required: field.required,
      options: field.options,
    }));

    const [existingForm] = await db
      .select({ id: intakeForms.id })
      .from(intakeForms)
      .where(and(eq(intakeForms.orgId, orgId), eq(intakeForms.slug, intakeSlug)))
      .limit(1);

    if (existingForm) {
      await db
        .update(intakeForms)
        .set({ name: intakeName, fields, settings: { source: "framework", frameworkId: framework.id }, updatedAt: new Date() })
        .where(eq(intakeForms.id, existingForm.id));
    } else {
      await db.insert(intakeForms).values({
        orgId,
        name: intakeName,
        slug: intakeSlug,
        fields,
        settings: { source: "framework", frameworkId: framework.id },
      });
    }
  }

  let installedLandingPages = 0;
  const landingSlug = toSlug(businessName) || "home";
  const landingTitle = interpolateString(framework.landingPage.headline, vars);
  const landingSections: LandingSection[] = [
    {
      type: "hero",
      content: {
        headline: interpolateString(framework.landingPage.headline, vars),
        subhead: interpolateString(framework.landingPage.subhead, vars),
        cta: framework.landingPage.cta,
      },
      order: 0,
    },
  ];

  const [existingPage] = await db
    .select({ id: landingPages.id })
    .from(landingPages)
    .where(and(eq(landingPages.orgId, orgId), eq(landingPages.slug, landingSlug)))
    .limit(1);

  if (existingPage) {
    await db
      .update(landingPages)
      .set({ title: landingTitle, sections: landingSections, settings: { source: "framework", frameworkId: framework.id }, updatedAt: new Date() })
      .where(eq(landingPages.id, existingPage.id));
  } else {
    await db.insert(landingPages).values({
      orgId,
      title: landingTitle,
      slug: landingSlug,
      status: "published",
      sections: landingSections,
      settings: { source: "framework", frameworkId: framework.id },
    });
    installedLandingPages += 1;
  }

  const interpolatedEmailTemplates = framework.emailTemplates.map((template) => ({
    name: template.name,
    tag: template.tag,
    subject: interpolateString(template.subject, vars),
    body: interpolateString(template.body, vars),
  }));

  const nextSettings = {
    ...(org.settings ?? {}),
    soulPackage: {
      id: `framework:${framework.id}`,
      installedAt: new Date().toISOString(),
      identity: {
        defaultBusinessName: framework.defaultBusinessName,
        entityLabels: {
          contact: framework.contactLabel,
          deal: framework.dealLabel,
          activity: framework.activityLabel,
        },
      },
      emailTemplates: interpolatedEmailTemplates,
      customFields: {},
      proposalTemplate: null,
    },
    enabledAutomations,
  };

  const soul: OrgSoul = {
    businessName,
    businessDescription: framework.description,
    industry: framework.id,
    offerType: framework.name,
    entityLabels: {
      contact: framework.contactLabel,
      deal: framework.dealLabel,
      activity: framework.activityLabel,
      pipeline: { singular: "Pipeline", plural: "Pipelines" },
      intakeForm: { singular: "Form", plural: "Forms" },
    },
    pipeline: {
      name: pipelineName,
      stages: normalizedStages,
    },
    suggestedFields: { contact: [], deal: [] },
    contactStatuses: [
      { value: "active", label: "Active", color: "#22c55e" },
      { value: "inactive", label: "Inactive", color: "#94a3b8" },
    ],
    voice: {
      style: framework.voice.tone,
      vocabulary: [],
      avoidWords: [],
      samplePhrases: [],
    },
    priorities: [],
    aiContext: `${businessName} is a ${framework.description.toLowerCase()} business. Voice: ${framework.voice.tone}. ${framework.voice.personality}.`,
    suggestedIntakeForm: {
      name: framework.intakeForm.name,
      fields: framework.intakeForm.fields.map((field) => ({
        key: toSlug(field.label),
        label: field.label,
        type: field.type,
        required: field.required,
      })),
    },
    branding: {
      primaryColor: "#3b82f6",
      accentColor: "#8b5cf6",
      mood: framework.voice.tone.split(",")[0]?.trim() || "professional",
    },
    rawInput: {
      processDescription: journeyDescription,
      painPoint: "",
      clientDescription: "",
    },
    journey: {
      userDescription: journeyDescription,
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
    soul,
    soulId: `framework:${framework.id}`,
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
    frameworkId: framework.id,
    frameworkName: framework.name,
    installedLandingPages,
    installedBookingTypes,
    pipelineStages: normalizedStages.length,
    emailTemplates: interpolatedEmailTemplates.length,
    intakeFormFields: framework.intakeForm.fields.length,
  };
}
