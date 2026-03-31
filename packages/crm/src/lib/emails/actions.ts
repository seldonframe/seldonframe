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
import { resolveDefaultFromEmail, resolveEmailProvider } from "./providers";
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
};

function extractEmailTemplates(settings: unknown): EmailTemplate[] {
  const templates = (settings as OrgSettingsWithTemplates | null)?.emailTemplates;
  if (!Array.isArray(templates)) {
    return [];
  }

  return templates.filter((item): item is EmailTemplate => {
    if (!item || typeof item !== "object") {
      return false;
    }

    if (item.triggerEvent != null && typeof item.triggerEvent !== "string") {
      return false;
    }

    return typeof item.id === "string" && typeof item.name === "string" && typeof item.subject === "string" && typeof item.body === "string";
  });
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

async function sendViaResend(params: {
  fromEmail: string;
  toEmail: string;
  subject: string;
  html: string;
  text: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return null;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: params.fromEmail,
      to: [params.toEmail],
      subject: params.subject,
      html: params.html,
      text: params.text,
    }),
  });

  if (!response.ok) {
    throw new Error("Resend send failed");
  }

  const payload = (await response.json()) as { id?: string };
  return payload.id ?? null;
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

  if (provider === "resend") {
    const resendId = await sendViaResend({
      fromEmail: resolveDefaultFromEmail(),
      toEmail: params.toEmail,
      subject: params.subject,
      html: trackedHtml,
      text: rendered.text,
    });

    if (resendId) {
      externalMessageId = resendId;
    }
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

  return { emailId: created.id, contactId: created.contactId };
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
