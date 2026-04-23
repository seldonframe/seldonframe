import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { emailEvents, emails } from "@/db/schema";
import {
  getEmailProvider,
  resolveDefaultFromEmail,
  resolveEmailProvider,
} from "./providers";
import { isEmailSuppressed, normalizeEmail } from "./suppression";
import { renderPlainEmailTemplate } from "./templates";
import { emitSeldonEvent } from "@/lib/events/bus";
import { assertEmailSendLimit, incrementEmailSendUsage } from "@/lib/tier/limits";
import { dispatchWebhook } from "@/lib/utils/webhooks";

// Thin wrapper that mirrors lib/emails/actions.ts::sendEmailForOrg but
// without the "use server" gate so it can be called from API route
// handlers + MCP tool bindings. The two code paths would ideally merge,
// but the server-action module is pinned to 'use server' which locks its
// exports to the server-action calling convention.

export type ApiSendEmailResult =
  | { emailId: string; contactId: string | null; suppressed: false }
  | { emailId: null; contactId: string | null; suppressed: true; reason: string };

export async function sendEmailFromApi(params: {
  orgId: string;
  userId: string;
  contactId: string | null;
  toEmail: string;
  subject: string;
  body: string;
  provider?: string | null;
}): Promise<ApiSendEmailResult> {
  const toEmail = normalizeEmail(params.toEmail);

  const suppression = await isEmailSuppressed(params.orgId, toEmail);
  if (suppression) {
    await emitSeldonEvent("email.suppressed", {
      email: toEmail,
      reason: suppression.reason,
      contactId: params.contactId,
    }, { orgId: params.orgId });
    return { emailId: null, contactId: params.contactId, suppressed: true, reason: suppression.reason };
  }

  const provider = await resolveEmailProvider(params.provider ?? null);
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
      toEmail,
      subject: params.subject,
      bodyHtml: rendered.html,
      bodyText: rendered.text,
      status: "queued",
      metadata: { source: "api" },
    })
    .returning({ id: emails.id, contactId: emails.contactId });

  if (!created) {
    throw new Error("Could not queue email");
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const trackedHtml = `${rendered.html}<img src="${baseUrl}/api/email/open/${created.id}" alt="" width="1" height="1" style="display:none" />`;

  let externalMessageId = `${provider}-${Date.now()}`;
  const impl = getEmailProvider(provider);
  if (impl) {
    const result = await impl.send({
      orgId: params.orgId,
      from: resolveDefaultFromEmail(),
      to: toEmail,
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
    }, { orgId: params.orgId });
  }

  await incrementEmailSendUsage(params.orgId);

  await dispatchWebhook({
    orgId: params.orgId,
    event: "email.sent",
    payload: {
      emailId: created.id,
      contactId: created.contactId,
      provider,
      toEmail,
    },
  });

  return { emailId: created.id, contactId: created.contactId, suppressed: false };
}

export async function getEmailWithEvents(orgId: string, emailId: string) {
  const [row] = await db
    .select()
    .from(emails)
    .where(and(eq(emails.orgId, orgId), eq(emails.id, emailId)))
    .limit(1);
  if (!row) return null;

  const events = await db
    .select({
      id: emailEvents.id,
      eventType: emailEvents.eventType,
      provider: emailEvents.provider,
      createdAt: emailEvents.createdAt,
      payload: emailEvents.payload,
    })
    .from(emailEvents)
    .where(and(eq(emailEvents.orgId, orgId), eq(emailEvents.emailId, emailId)))
    .orderBy(desc(emailEvents.createdAt));

  return { email: row, events };
}
