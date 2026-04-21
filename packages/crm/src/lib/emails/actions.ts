"use server";

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { activities, contacts, emails, organizations, users } from "@/db/schema";
import { getCurrentUser, getOrgId } from "@/lib/auth/helpers";
import { assertWritable } from "@/lib/demo/server";
import { emitSeldonEvent } from "@/lib/events/bus";
import { isValidEventType } from "@/lib/events/event-types";
import { recordEmailOpenedLearning, recordEmailSentLearning } from "@/lib/soul/learning";
import { assertEmailSendLimit, incrementEmailSendUsage } from "@/lib/tier/limits";
import { dispatchWebhook } from "@/lib/utils/webhooks";
import {
  getEmailProvider,
  resolveDefaultFromEmail,
  resolveEmailProvider,
} from "./providers";
import { isEmailSuppressed, normalizeEmail } from "./suppression";
import { renderPlainEmailTemplate } from "./templates";

type EmailTemplate = {
  id: string;
  name: string;
  subject: string;
  body: string;
  tag: string;
  triggerEvent?: string;
  createdAt: string;
};

type OrgSettingsWithTemplates = {
  emailTemplates?: EmailTemplate[];
  soulPackage?: {
    emailTemplates?: Array<{
      name?: string;
      subject?: string;
      body?: string;
      tag?: string;
      triggerEvent?: string;
    }>;
  };
};

function extractEmailTemplates(settings: unknown): EmailTemplate[] {
  const source = (settings as OrgSettingsWithTemplates | null) ?? {};
  const rootTemplates = Array.isArray(source.emailTemplates) ? source.emailTemplates : [];
  const frameworkTemplates = Array.isArray(source.soulPackage?.emailTemplates) ? source.soulPackage.emailTemplates : [];

  const normalizedRoot = rootTemplates
    .filter((item): item is EmailTemplate => Boolean(item && typeof item === "object" && item.name && item.subject && item.body))
    .map((item, index) => ({
      id: typeof item.id === "string" && item.id.trim() ? item.id : `tmpl_root_${index}_${Date.now()}`,
      name: item.name,
      subject: item.subject,
      body: item.body,
      tag: item.tag || "general",
      triggerEvent: typeof item.triggerEvent === "string" ? item.triggerEvent : undefined,
      createdAt: item.createdAt || new Date().toISOString(),
    }));

  const normalizedFramework = frameworkTemplates
    .filter((item): item is NonNullable<typeof item> => Boolean(item && typeof item === "object"))
    .filter((item) => typeof item.name === "string" && typeof item.subject === "string" && typeof item.body === "string")
    .map((item, index) => ({
      id: `tmpl_framework_${index}_${item.name!.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      name: item.name!,
      subject: item.subject!,
      body: item.body!,
      tag: typeof item.tag === "string" ? item.tag : "framework",
      triggerEvent: typeof item.triggerEvent === "string" ? item.triggerEvent : undefined,
      createdAt: new Date().toISOString(),
    }));

  const deduped = new Map<string, EmailTemplate>();
  for (const template of [...normalizedFramework, ...normalizedRoot]) {
    const key = `${template.name.toLowerCase()}::${template.subject.toLowerCase()}`;
    if (!deduped.has(key)) {
      deduped.set(key, template);
    }
  }

  return Array.from(deduped.values());
}

function renderTemplateWithContact(template: EmailTemplate, contactFirstName: string | null) {
  const safeName = contactFirstName || "there";
  return {
    subject: template.subject.replaceAll("{{firstName}}", safeName),
    body: template.body.replaceAll("{{firstName}}", safeName),
  };
}

function buildTrackingPixel(emailId: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${baseUrl}/api/email/open/${emailId}`;
}

async function getOrgOwnerUserId(orgId: string) {
  const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.orgId, orgId)).limit(1);
  return owner?.id ?? null;
}

async function createEmailTimelineActivity(params: {
  orgId: string;
  userId: string;
  contactId: string | null;
  subject: string;
  emailId: string;
  toEmail: string;
}) {
  await db.insert(activities).values({
    orgId: params.orgId,
    userId: params.userId,
    contactId: params.contactId,
    type: "email",
    subject: `Email sent: ${params.subject}`,
    body: `Sent to ${params.toEmail}`,
    metadata: {
      emailId: params.emailId,
      source: "email",
    },
  });
}

async function sendEmailForOrg(params: {
  orgId: string;
  userId: string;
  contactId: string | null;
  toEmail: string;
  subject: string;
  body: string;
  providerOverride?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const toEmail = normalizeEmail(params.toEmail);

  const suppression = await isEmailSuppressed(params.orgId, toEmail);
  if (suppression) {
    await emitSeldonEvent("email.suppressed", {
      email: toEmail,
      reason: suppression.reason,
      contactId: params.contactId,
    });
    return { emailId: null, contactId: params.contactId, suppressed: true as const };
  }

  const provider = await resolveEmailProvider(params.providerOverride || null);

  await assertEmailSendLimit(params.orgId);

  const rendered = renderPlainEmailTemplate({
    heading: params.subject,
    body: params.body,
  });

  const [created] = await db
    .insert(emails)
    .values({
      orgId: params.orgId,
      contactId: params.contactId,
      userId: params.userId,
      provider,
      fromEmail: resolveDefaultFromEmail(),
      toEmail: params.toEmail,
      subject: params.subject,
      bodyHtml: rendered.html,
      bodyText: rendered.text,
      status: "queued",
      metadata: {
        source: "dashboard",
        providerConfigured: provider !== "manual",
        ...(params.metadata ?? {}),
      },
    })
    .returning({ id: emails.id, contactId: emails.contactId });

  if (!created) {
    throw new Error("Could not queue email");
  }

  const trackedHtml = `${rendered.html}<img src="${buildTrackingPixel(created.id)}" alt="" width="1" height="1" style="display:none" />`;

  let externalMessageId = `${provider}-${Date.now()}`;

  const impl = getEmailProvider(provider);
  if (impl) {
    const result = await impl.send({
      orgId: params.orgId,
      from: resolveDefaultFromEmail(),
      to: params.toEmail,
      subject: params.subject,
      html: trackedHtml,
      text: rendered.text,
      tags: [{ name: "email_id", value: created.id }],
    });
    externalMessageId = result.externalMessageId;
  }

  await db
    .update(emails)
    .set({
      bodyHtml: trackedHtml,
      status: "sent",
      externalMessageId,
      sentAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(emails.id, created.id));

  if (created.contactId) {
    await emitSeldonEvent("email.sent", {
      emailId: created.id,
      contactId: created.contactId,
    });
  }

  await createEmailTimelineActivity({
    orgId: params.orgId,
    userId: params.userId,
    contactId: created.contactId,
    subject: params.subject,
    emailId: created.id,
    toEmail: params.toEmail,
  });

  await recordEmailSentLearning({
    orgId: params.orgId,
    subject: params.subject,
    sentAt: new Date(),
  });

  await incrementEmailSendUsage(params.orgId);

  await dispatchWebhook({
    orgId: params.orgId,
    event: "email.sent",
    payload: {
      emailId: created.id,
      contactId: created.contactId,
      provider,
      toEmail: params.toEmail,
    },
  });

  return { emailId: created.id, contactId: created.contactId, suppressed: false as const };
}

export async function listEmails() {
  const orgId = await getOrgId();

  if (!orgId) {
    return [];
  }

  return db.select().from(emails).where(eq(emails.orgId, orgId));
}

export async function listEmailTemplates() {
  const orgId = await getOrgId();

  if (!orgId) {
    return [];
  }

  const [org] = await db.select({ settings: organizations.settings }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
  return extractEmailTemplates(org?.settings);
}

export async function createEmailTemplateAction(formData: FormData) {
  assertWritable();

  const orgId = await getOrgId();

  if (!orgId) {
    throw new Error("Unauthorized");
  }

  const name = String(formData.get("name") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const tag = String(formData.get("tag") ?? "general").trim().toLowerCase() || "general";
  const triggerEventRaw = String(formData.get("triggerEvent") ?? "").trim();
  const triggerEvent = triggerEventRaw ? triggerEventRaw.toLowerCase() : "";

  if (!name || !subject || !body) {
    throw new Error("Template name, subject, and body are required");
  }

  if (triggerEvent && !isValidEventType(triggerEvent)) {
    throw new Error("Trigger event must use lowercase entity.action format");
  }

  const [org] = await db.select({ settings: organizations.settings }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
  const currentTemplates = extractEmailTemplates(org?.settings);

  const nextTemplate: EmailTemplate = {
    id: `tmpl_${Date.now()}`,
    name,
    subject,
    body,
    tag,
    triggerEvent: triggerEvent || undefined,
    createdAt: new Date().toISOString(),
  };

  const nextSettings = {
    ...((org?.settings as Record<string, unknown> | null) ?? {}),
    emailTemplates: [...currentTemplates, nextTemplate],
  };

  await db
    .update(organizations)
    .set({
      settings: nextSettings,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));
}

export async function createEmailTemplateForSeldonAction(input: {
  name: string;
  subject: string;
  body: string;
  tag?: string;
  triggerEvent?: string;
}) {
  assertWritable();

  const orgId = await getOrgId();

  if (!orgId) {
    throw new Error("Unauthorized");
  }

  const name = String(input.name ?? "").trim();
  const subject = String(input.subject ?? "").trim();
  const body = String(input.body ?? "").trim();
  const tag = String(input.tag ?? "general").trim().toLowerCase() || "general";
  const triggerEventRaw = String(input.triggerEvent ?? "").trim();
  const triggerEvent = triggerEventRaw ? triggerEventRaw.toLowerCase() : "";

  if (!name || !subject || !body) {
    throw new Error("Template name, subject, and body are required");
  }

  if (triggerEvent && !isValidEventType(triggerEvent)) {
    throw new Error("Trigger event must use lowercase entity.action format");
  }

  const [org] = await db.select({ settings: organizations.settings }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
  const currentTemplates = extractEmailTemplates(org?.settings);

  const nextTemplate: EmailTemplate = {
    id: `tmpl_${Date.now()}`,
    name,
    subject,
    body,
    tag,
    triggerEvent: triggerEvent || undefined,
    createdAt: new Date().toISOString(),
  };

  const nextSettings = {
    ...((org?.settings as Record<string, unknown> | null) ?? {}),
    emailTemplates: [...currentTemplates, nextTemplate],
  };

  await db
    .update(organizations)
    .set({
      settings: nextSettings,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));

  return { id: nextTemplate.id };
}

export async function updateEmailTemplateAction(input: {
  templateId: string;
  name?: string;
  subject?: string;
  body?: string;
  tag?: string;
  triggerEvent?: string;
}) {
  assertWritable();

  const orgId = await getOrgId();

  if (!orgId) {
    throw new Error("Unauthorized");
  }

  const templateId = String(input.templateId ?? "").trim();
  const requestedName = typeof input.name === "string" ? input.name.trim() : undefined;
  const requestedSubject = typeof input.subject === "string" ? input.subject.trim() : undefined;
  const requestedBody = typeof input.body === "string" ? input.body.trim() : undefined;
  const requestedTag = typeof input.tag === "string" ? input.tag.trim().toLowerCase() : undefined;
  const triggerEventRaw = String(input.triggerEvent ?? "").trim();
  const triggerEvent = triggerEventRaw ? triggerEventRaw.toLowerCase() : "";

  if (!templateId) {
    throw new Error("Template ID is required");
  }

  if (triggerEvent && !isValidEventType(triggerEvent)) {
    throw new Error("Trigger event must use lowercase entity.action format");
  }

  const [org] = await db.select({ settings: organizations.settings }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
  const currentTemplates = extractEmailTemplates(org?.settings);
  const target = currentTemplates.find((template) => template.id === templateId);

  if (!target) {
    throw new Error("Template not found");
  }

  const name = requestedName || target.name;
  const subject = requestedSubject || target.subject;
  const body = requestedBody || target.body;
  const tag = requestedTag || target.tag || "general";

  const nextTemplates = currentTemplates.map((template) => {
    if (template.id !== templateId) {
      return template;
    }

    return {
      ...template,
      name,
      subject,
      body,
      tag,
      triggerEvent: triggerEvent || undefined,
    };
  });

  const nextSettings = {
    ...((org?.settings as Record<string, unknown> | null) ?? {}),
    emailTemplates: nextTemplates,
  };

  await db
    .update(organizations)
    .set({
      settings: nextSettings,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));

  return {
    id: templateId,
    name,
    subject,
    body,
    tag,
    triggerEvent: triggerEvent || undefined,
  };
}

export async function sendEmailTemplateToContactAction({
  contactId,
  templateId,
}: {
  contactId: string;
  templateId: string;
}) {
  assertWritable();

  const orgId = await getOrgId();
  const user = await getCurrentUser();

  if (!orgId || !user?.id) {
    throw new Error("Unauthorized");
  }

  const [contact] = await db
    .select({ id: contacts.id, email: contacts.email, firstName: contacts.firstName })
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId)))
    .limit(1);

  if (!contact?.email) {
    throw new Error("Contact email is required");
  }

  const [org] = await db.select({ settings: organizations.settings }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
  const templates = extractEmailTemplates(org?.settings);
  const template = templates.find((item) => item.id === templateId);

  if (!template) {
    throw new Error("Template not found");
  }

  const renderedTemplate = renderTemplateWithContact(template, contact.firstName);

  await sendEmailForOrg({
    orgId,
    userId: user.id,
    contactId: contact.id,
    toEmail: contact.email,
    subject: renderedTemplate.subject,
    body: renderedTemplate.body,
    providerOverride: "resend",
    metadata: {
      source: "contact-detail-template",
      templateId: template.id,
      templateTag: template.tag,
    },
  });
}

export async function sendEmailTemplateToContactFormAction(formData: FormData) {
  const contactId = String(formData.get("contactId") ?? "").trim();
  const templateId = String(formData.get("templateId") ?? "").trim();

  if (!contactId || !templateId) {
    throw new Error("Contact and template are required");
  }

  await sendEmailTemplateToContactAction({
    contactId,
    templateId,
  });
}

export async function sendWelcomeEmailForContact(contactId: string) {
  const [contact] = await db
    .select({
      id: contacts.id,
      orgId: contacts.orgId,
      email: contacts.email,
      firstName: contacts.firstName,
    })
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);

  if (!contact?.email) {
    return;
  }

  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, contact.orgId))
    .limit(1);
  const templates = extractEmailTemplates(org?.settings);
  const welcomeTemplate = templates.find((item) => item.tag === "welcome");

  if (!welcomeTemplate) {
    return;
  }

  const ownerUserId = await getOrgOwnerUserId(contact.orgId);

  if (!ownerUserId) {
    return;
  }

  const renderedTemplate = renderTemplateWithContact(welcomeTemplate, contact.firstName);

  await sendEmailForOrg({
    orgId: contact.orgId,
    userId: ownerUserId,
    contactId: contact.id,
    toEmail: contact.email,
    subject: renderedTemplate.subject,
    body: renderedTemplate.body,
    providerOverride: "resend",
    metadata: {
      source: "welcome-automation",
      templateId: welcomeTemplate.id,
      templateTag: welcomeTemplate.tag,
    },
  });
}

export async function sendTriggeredEmailsForContactEvent(params: { eventType: string; contactId: string }) {
  if (!isValidEventType(params.eventType)) {
    return;
  }

  const normalizedEventType = params.eventType.toLowerCase();

  const [contact] = await db
    .select({
      id: contacts.id,
      orgId: contacts.orgId,
      email: contacts.email,
      firstName: contacts.firstName,
    })
    .from(contacts)
    .where(eq(contacts.id, params.contactId))
    .limit(1);

  if (!contact?.email) {
    return;
  }

  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, contact.orgId))
    .limit(1);

  const matchingTemplates = extractEmailTemplates(org?.settings).filter(
    (template) => (template.triggerEvent || "").toLowerCase() === normalizedEventType
  );

  if (matchingTemplates.length === 0) {
    return;
  }

  const ownerUserId = await getOrgOwnerUserId(contact.orgId);

  if (!ownerUserId) {
    return;
  }

  for (const template of matchingTemplates) {
    const renderedTemplate = renderTemplateWithContact(template, contact.firstName);

    await sendEmailForOrg({
      orgId: contact.orgId,
      userId: ownerUserId,
      contactId: contact.id,
      toEmail: contact.email,
      subject: renderedTemplate.subject,
      body: renderedTemplate.body,
      providerOverride: "resend",
      metadata: {
        source: "event-trigger-template",
        templateId: template.id,
        templateTag: template.tag,
        triggerEvent: normalizedEventType,
      },
    });
  }
}

export async function sendEmailAction(formData: FormData) {
  assertWritable();

  const orgId = await getOrgId();
  const user = await getCurrentUser();

  if (!orgId || !user?.id) {
    throw new Error("Unauthorized");
  }

  const contactId = String(formData.get("contactId") ?? "").trim() || null;
  const toEmail = String(formData.get("toEmail") ?? "").trim();

  if (!toEmail) {
    throw new Error("Recipient email is required");
  }

  if (contactId) {
    const [contact] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId)))
      .limit(1);

    if (!contact) {
      throw new Error("Contact not found");
    }
  }

  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();

  if (!subject || !body) {
    throw new Error("Subject and body are required");
  }

  await sendEmailForOrg({
    orgId,
    userId: user.id,
    contactId,
    toEmail,
    subject,
    body,
    providerOverride: String(formData.get("provider") ?? "") || null,
    metadata: {
      source: "dashboard",
    },
  });
}

export async function markEmailOpenedAction(emailId: string) {
  const orgId = await getOrgId();

  if (!orgId) {
    throw new Error("Unauthorized");
  }

  const [row] = await db
    .update(emails)
    .set({
      openCount: sql`${emails.openCount} + 1`,
      openedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(emails.orgId, orgId), eq(emails.id, emailId)))
    .returning({ id: emails.id, contactId: emails.contactId });

  if (row?.contactId) {
    await emitSeldonEvent("email.opened", {
      emailId: row.id,
      contactId: row.contactId,
    });
  }

  await recordEmailOpenedLearning(orgId);
}

export async function markEmailOpenedByPixelAction(emailId: string) {
  const [row] = await db
    .update(emails)
    .set({
      openCount: sql`${emails.openCount} + 1`,
      openedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(emails.id, emailId))
    .returning({ id: emails.id, contactId: emails.contactId, orgId: emails.orgId });

  if (row?.contactId) {
    await emitSeldonEvent("email.opened", {
      emailId: row.id,
      contactId: row.contactId,
    });
  }

  if (row?.orgId) {
    await recordEmailOpenedLearning(row.orgId);
  }
}

export async function markEmailClickedAction(emailId: string, url: string) {
  const orgId = await getOrgId();

  if (!orgId) {
    throw new Error("Unauthorized");
  }

  const [row] = await db
    .update(emails)
    .set({
      clickCount: sql`${emails.clickCount} + 1`,
      lastClickedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(emails.orgId, orgId), eq(emails.id, emailId)))
    .returning({ id: emails.id, contactId: emails.contactId });

  if (row?.contactId) {
    await emitSeldonEvent("email.clicked", {
      emailId: row.id,
      contactId: row.contactId,
      url,
    });
  }
}
