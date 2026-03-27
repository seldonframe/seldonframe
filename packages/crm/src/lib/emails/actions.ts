"use server";

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { contacts, emails } from "@/db/schema";
import { getCurrentUser, getOrgId } from "@/lib/auth/helpers";
import { assertWritable } from "@/lib/demo/server";
import { emitSeldonEvent } from "@/lib/events/bus";
import { recordEmailOpenedLearning, recordEmailSentLearning } from "@/lib/soul/learning";
import { assertEmailSendLimit, incrementEmailSendUsage } from "@/lib/tier/limits";
import { dispatchWebhook } from "@/lib/utils/webhooks";
import { resolveDefaultFromEmail, resolveEmailProvider } from "./providers";
import { renderPlainEmailTemplate } from "./templates";

export async function listEmails() {
  const orgId = await getOrgId();

  if (!orgId) {
    return [];
  }

  return db.select().from(emails).where(eq(emails.orgId, orgId));
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

  const provider = await resolveEmailProvider(String(formData.get("provider") ?? "") || null);
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const ctaLabel = String(formData.get("ctaLabel") ?? "").trim() || undefined;
  const ctaHref = String(formData.get("ctaHref") ?? "").trim() || undefined;

  if (!subject || !body) {
    throw new Error("Subject and body are required");
  }

  await assertEmailSendLimit(orgId);

  const rendered = renderPlainEmailTemplate({
    heading: subject,
    body,
    ctaLabel,
    ctaHref,
  });

  const [created] = await db
    .insert(emails)
    .values({
      orgId,
      contactId,
      userId: user.id,
      provider,
      fromEmail: resolveDefaultFromEmail(),
      toEmail,
      subject,
      bodyHtml: rendered.html,
      bodyText: rendered.text,
      status: "sent",
      externalMessageId: `${provider}-${Date.now()}`,
      sentAt: new Date(),
      metadata: {
        source: "dashboard",
        providerConfigured: provider !== "manual",
      },
    })
    .returning({ id: emails.id, contactId: emails.contactId });

  if (created?.contactId) {
    await emitSeldonEvent("email.sent", {
      emailId: created.id,
      contactId: created.contactId,
    });
  }

  await recordEmailSentLearning({
    orgId,
    subject,
    sentAt: new Date(),
  });

  await incrementEmailSendUsage(orgId);

  await dispatchWebhook({
    orgId,
    event: "email.sent",
    payload: {
      emailId: created?.id,
      contactId: created?.contactId,
      provider,
      toEmail,
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
