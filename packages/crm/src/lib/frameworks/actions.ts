"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { getAIClient, recordSeldonUsage } from "@/lib/ai/client";
import { getCurrentUser, getOrgId } from "@/lib/auth/helpers";
import type { FrameworkConfig } from "@/lib/soul/install";

export type GeneratedFrameworkOption = {
  id: string;
  name: string;
  description: string;
  icon: string;
  defaultBusinessName: string;
  contactLabel: { singular: string; plural: string };
  dealLabel: { singular: string; plural: string };
  pipeline: Array<{ name: string; order: number }>;
  bookingTypes: Array<{ name: string; slug: string; durationMinutes: number; price: number }>;
  emailTemplates: Array<{ name: string; tag: string }>;
  intakeFormFieldCount: number;
  landingPage: { headline: string; subhead: string; cta: string };
  seldonExamples: Array<{
    block: string;
    icon: string;
    label: string;
    prompt: string;
    description: string;
  }>;
  automationSuggestions: Array<{
    id: string;
    name: string;
    trigger: string;
    action: string;
    templateTag?: string;
    requiresIntegration: string;
    defaultEnabled: boolean;
  }>;
  readme?: {
    overview: string;
    whyThisPipeline: string;
    whyTheseEmails: string;
    whyTheseBookings: string;
    whyTheseAutomations: string;
  };
};

export type GeneratedFrameworkPayload = {
  framework: FrameworkConfig;
  option: GeneratedFrameworkOption;
};

type SavedFrameworkEntry = {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  framework: FrameworkConfig;
};

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);
}

function toWord(input: unknown, fallback: string) {
  const value = String(input ?? "").trim();
  return value.length > 0 ? value : fallback;
}

function toPlural(input: string) {
  const normalized = input.trim();
  if (!normalized) return "Items";
  if (normalized.endsWith("s")) return normalized;
  return `${normalized}s`;
}

function extractJsonObject(input: string) {
  const start = input.indexOf("{");
  const end = input.lastIndexOf("}");

  if (start < 0 || end <= start) {
    return null;
  }

  return input.slice(start, end + 1);
}

function safeParseJson(input: string) {
  try {
    return JSON.parse(input) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function buildFallbackFramework(description: string, businessName?: string) {
  const ownerWord = businessName?.split(" ")[0] || "Owner";
  const short = description.slice(0, 120).trim();

  const framework: FrameworkConfig = {
    id: `custom-${Date.now().toString().slice(-6)}`,
    name: "Custom Seldon Framework",
    description: short || "Custom framework generated from your business details",
    icon: "Rocket",
    defaultBusinessName: businessName?.trim() || `${ownerWord} Studio`,
    contactLabel: { singular: "Client", plural: "Clients" },
    dealLabel: { singular: "Opportunity", plural: "Opportunities" },
    activityLabel: { singular: "Activity", plural: "Activities" },
    voice: {
      tone: "clear, practical, and helpful",
      personality: "trusted advisor focused on outcomes",
    },
    pipeline: [
      { name: "New", order: 1 },
      { name: "Qualified", order: 2 },
      { name: "Proposal", order: 3 },
      { name: "Won", order: 4 },
    ],
    bookingTypes: [
      {
        name: "Discovery Call",
        slug: "discovery-call",
        durationMinutes: 30,
        price: 0,
        description: "A short call to understand goals and fit.",
        bufferBefore: 10,
        bufferAfter: 10,
        maxPerDay: 6,
      },
    ],
    emailTemplates: [
      {
        name: "Welcome",
        tag: "welcome",
        subject: "Thanks for reaching out to {{businessName}}",
        body: "Hi {{firstName}},\n\nThanks for connecting with {{businessName}}. Use this link to book: {{bookingLink}}\n\n{{ownerName}}",
      },
      {
        name: "Follow Up",
        tag: "followup",
        subject: "Quick follow-up from {{businessName}}",
        body: "Hi {{firstName}},\n\nJust checking in to keep things moving. Reply here with any questions.\n\n{{ownerName}}",
      },
    ],
    intakeForm: {
      name: "Client Intake",
      slug: "client-intake",
      fields: [
        { label: "Full Name", type: "text", required: true },
        { label: "Email", type: "email", required: true },
        { label: "What do you need help with?", type: "textarea", required: true },
      ],
    },
    landingPage: {
      headline: "A better way to get consistent results",
      subhead: "{{businessName}} helps you go from first contact to confident client delivery.",
      cta: "Book a Call",
    },
    automationSuggestions: [
      {
        id: "welcome-email",
        name: "Send welcome email on new contact",
        trigger: "contact.created",
        action: "send_email",
        templateTag: "welcome",
        requiresIntegration: "resend",
        defaultEnabled: true,
      },
    ],
  };

  return framework;
}

function normalizeFramework(raw: Record<string, unknown>, description: string, businessName?: string): FrameworkConfig {
  const fallback = buildFallbackFramework(description, businessName);

  const contactSingular = toWord(raw.contactSingular, fallback.contactLabel.singular);
  const dealSingular = toWord(raw.dealSingular, fallback.dealLabel.singular);

  const pipeline = Array.isArray(raw.pipelineStages)
    ? raw.pipelineStages
        .map((entry, index) => ({ name: toWord(entry, "Stage"), order: index + 1 }))
        .filter((entry) => entry.name.length > 0)
    : fallback.pipeline;

  const bookingTypes = Array.isArray(raw.bookingTypes)
    ? raw.bookingTypes
        .map((entry, index) => {
          const value = entry as Record<string, unknown>;
          const name = toWord(value.name, `Session ${index + 1}`);
          const duration = Number(value.durationMinutes ?? 30);
          const price = Number(value.price ?? 0);
          return {
            name,
            slug: slugify(toWord(value.slug, name)) || `session-${index + 1}`,
            durationMinutes: Number.isFinite(duration) ? Math.max(15, Math.min(180, duration)) : 30,
            price: Number.isFinite(price) ? Math.max(0, price) : 0,
            description: toWord(value.description, `${name} with ${businessName || "our team"}`),
            bufferBefore: 10,
            bufferAfter: 10,
            maxPerDay: 6,
          };
        })
        .slice(0, 3)
    : fallback.bookingTypes;

  const emailTemplates = Array.isArray(raw.emailTemplates)
    ? raw.emailTemplates
        .map((entry, index) => {
          const value = entry as Record<string, unknown>;
          const tag = slugify(toWord(value.tag, `template-${index + 1}`)) || `template-${index + 1}`;
          return {
            name: toWord(value.name, `Template ${index + 1}`),
            tag,
            subject: toWord(value.subject, `Update from {{businessName}}`),
            body: toWord(value.body, "Hi {{firstName}},\n\nQuick update from {{businessName}}.\n\n{{ownerName}}"),
          };
        })
        .slice(0, 6)
    : fallback.emailTemplates;

  const intakeFields = Array.isArray(raw.intakeFields)
    ? raw.intakeFields
        .map((entry) => {
          const value = entry as Record<string, unknown>;
          const label = toWord(value.label, "Field");
          const type = ["text", "email", "tel", "textarea", "select", "url"].includes(String(value.type)) ? String(value.type) : "text";
          const options = Array.isArray(value.options) ? value.options.map((option) => String(option)) : undefined;
          return {
            label,
            type,
            required: Boolean(value.required ?? true),
            options: options && options.length > 0 ? options.slice(0, 8) : undefined,
          };
        })
        .slice(0, 10)
    : fallback.intakeForm.fields;

  const generated: FrameworkConfig = {
    id: `custom-${Date.now().toString().slice(-6)}`,
    name: toWord(raw.frameworkName, "Custom Seldon Framework"),
    description: toWord(raw.frameworkDescription, fallback.description),
    icon: "Rocket",
    defaultBusinessName: toWord(businessName, fallback.defaultBusinessName),
    contactLabel: {
      singular: contactSingular,
      plural: toPlural(toWord(raw.contactPlural, toPlural(contactSingular))),
    },
    dealLabel: {
      singular: dealSingular,
      plural: toPlural(toWord(raw.dealPlural, toPlural(dealSingular))),
    },
    activityLabel: {
      singular: "Activity",
      plural: "Activities",
    },
    voice: {
      tone: toWord(raw.voiceTone, fallback.voice.tone),
      personality: toWord(raw.voicePersonality, fallback.voice.personality),
    },
    pipeline: pipeline.length > 0 ? pipeline : fallback.pipeline,
    bookingTypes: bookingTypes.length > 0 ? bookingTypes : fallback.bookingTypes,
    emailTemplates: emailTemplates.length > 0 ? emailTemplates : fallback.emailTemplates,
    intakeForm: {
      name: toWord(raw.intakeFormName, "Client Intake"),
      slug: slugify(toWord(raw.intakeFormSlug, "client-intake")) || "client-intake",
      fields: intakeFields.length > 0 ? intakeFields : fallback.intakeForm.fields,
    },
    landingPage: {
      headline: toWord(raw.landingHeadline, fallback.landingPage.headline),
      subhead: toWord(raw.landingSubhead, fallback.landingPage.subhead),
      cta: toWord(raw.landingCta, fallback.landingPage.cta),
    },
    automationSuggestions: fallback.automationSuggestions,
  };

  return generated;
}

function toFrameworkOption(framework: FrameworkConfig): GeneratedFrameworkOption {
  return {
    id: framework.id,
    name: framework.name,
    description: framework.description,
    icon: framework.icon,
    defaultBusinessName: framework.defaultBusinessName,
    contactLabel: framework.contactLabel,
    dealLabel: framework.dealLabel,
    pipeline: framework.pipeline,
    bookingTypes: framework.bookingTypes.map((bt) => ({
      name: bt.name,
      slug: bt.slug,
      durationMinutes: bt.durationMinutes,
      price: bt.price,
    })),
    emailTemplates: framework.emailTemplates.map((et) => ({ name: et.name, tag: et.tag })),
    intakeFormFieldCount: framework.intakeForm.fields.length,
    landingPage: framework.landingPage,
    seldonExamples: [],
    automationSuggestions: framework.automationSuggestions?.map((a) => ({
      id: toWord(a.id, "automation"),
      name: toWord(a.name, "Automation"),
      trigger: toWord(a.trigger, "contact.created"),
      action: toWord(a.action, "send_email"),
      templateTag: typeof a.templateTag === "string" ? a.templateTag : undefined,
      requiresIntegration: toWord(a.requiresIntegration, "resend"),
      defaultEnabled: Boolean(a.defaultEnabled),
    })) ?? [],
    readme: framework.readme,
  };
}

function readSavedFrameworks(rawSettings: unknown): SavedFrameworkEntry[] {
  if (!rawSettings || typeof rawSettings !== "object") {
    return [];
  }

  const settings = rawSettings as Record<string, unknown>;
  const entries = settings.savedFrameworks;

  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const value = entry as Record<string, unknown>;
      const framework = value.framework;

      if (!framework || typeof framework !== "object") {
        return null;
      }

      return {
        id: toWord(value.id, ""),
        name: toWord(value.name, "Custom Framework"),
        description: toWord(value.description, ""),
        createdAt: toWord(value.createdAt, new Date().toISOString()),
        framework: framework as FrameworkConfig,
      } satisfies SavedFrameworkEntry;
    })
    .filter((entry): entry is SavedFrameworkEntry => Boolean(entry?.id));
}

async function saveFrameworkToLibrary(params: { orgId: string; framework: FrameworkConfig }) {
  const [org] = await db
    .select({ id: organizations.id, settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, params.orgId))
    .limit(1);

  if (!org) {
    return;
  }

  const settings = (org.settings as Record<string, unknown>) ?? {};
  const existing = readSavedFrameworks(settings);
  const filtered = existing.filter((item) => item.id !== params.framework.id);

  const nextEntry: SavedFrameworkEntry = {
    id: params.framework.id,
    name: params.framework.name,
    description: params.framework.description,
    createdAt: new Date().toISOString(),
    framework: params.framework,
  };

  const nextSaved = [nextEntry, ...filtered].slice(0, 20);

  await db
    .update(organizations)
    .set({
      settings: {
        ...settings,
        savedFrameworks: nextSaved,
      },
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, params.orgId));
}

export async function listSavedFrameworkLibrary() {
  const orgId = await getOrgId();

  if (!orgId) {
    return [] as SavedFrameworkEntry[];
  }

  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  return readSavedFrameworks(org?.settings ?? {}).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

export async function listSavedFrameworkOptions() {
  const saved = await listSavedFrameworkLibrary();
  return saved.map((item) => toFrameworkOption(item.framework));
}

export async function deleteSavedFrameworkAction(formData: FormData) {
  const orgId = await getOrgId();

  if (!orgId) {
    throw new Error("Unauthorized");
  }

  const frameworkId = String(formData.get("frameworkId") ?? "").trim();

  if (!frameworkId) {
    return;
  }

  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) {
    return;
  }

  const settings = (org.settings as Record<string, unknown>) ?? {};
  const nextSaved = readSavedFrameworks(settings).filter((item) => item.id !== frameworkId);

  await db
    .update(organizations)
    .set({
      settings: {
        ...settings,
        savedFrameworks: nextSaved,
      },
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));

  revalidatePath("/settings/frameworks");
  revalidatePath("/orgs/new");
}

export async function generateCustomFrameworkAction(input: {
  description: string;
  businessName?: string;
}): Promise<GeneratedFrameworkPayload> {
  const user = await getCurrentUser();
  const orgId = await getOrgId();

  const description = String(input.description ?? "").trim();
  const businessName = String(input.businessName ?? "").trim();

  if (!description) {
    throw new Error("Describe your business to generate a custom framework.");
  }

  const fallback = buildFallbackFramework(description, businessName);

  if (!user?.id || !orgId) {
    return {
      framework: fallback,
      option: toFrameworkOption(fallback),
    };
  }

  const aiResolution = await getAIClient({ orgId, userId: user.id });

  if (!aiResolution.client || aiResolution.provider === "openai") {
    return {
      framework: fallback,
      option: toFrameworkOption(fallback),
    };
  }

  const prompt = `You are generating a CRM framework preset.
Return only valid JSON with these keys:
{
  "frameworkName": string,
  "frameworkDescription": string,
  "contactSingular": string,
  "contactPlural": string,
  "dealSingular": string,
  "dealPlural": string,
  "voiceTone": string,
  "voicePersonality": string,
  "pipelineStages": string[],
  "bookingTypes": [{"name": string, "slug": string, "durationMinutes": number, "price": number, "description": string}],
  "emailTemplates": [{"name": string, "tag": string, "subject": string, "body": string}],
  "intakeFormName": string,
  "intakeFields": [{"label": string, "type": "text"|"email"|"tel"|"textarea"|"select"|"url", "required": boolean, "options"?: string[]}],
  "landingHeadline": string,
  "landingSubhead": string,
  "landingCta": string
}
Business context:
${description}
Business name: ${businessName || "Not provided"}`;

  try {
    const response = await aiResolution.client.messages.create({
      model: process.env.SELDON_MODEL?.trim() || "claude-sonnet-4-20250514",
      max_tokens: 2200,
      temperature: 0.4,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content
      .map((item) => (item.type === "text" ? item.text : ""))
      .join("\n")
      .trim();

    const parsed = safeParseJson(text) ?? safeParseJson(extractJsonObject(text) || "");
    const framework = parsed ? normalizeFramework(parsed, description, businessName) : fallback;

    await recordSeldonUsage({
      orgId,
      userId: user.id,
      mode: aiResolution.mode,
      model: process.env.SELDON_MODEL?.trim() || "claude-sonnet-4-20250514",
    });

    await saveFrameworkToLibrary({ orgId, framework });

    return {
      framework,
      option: toFrameworkOption(framework),
    };
  } catch {
    return {
      framework: fallback,
      option: toFrameworkOption(fallback),
    };
  }
}
