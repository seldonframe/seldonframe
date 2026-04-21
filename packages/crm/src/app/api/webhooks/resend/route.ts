import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { emailEvents, emails } from "@/db/schema";
import { addSuppression } from "@/lib/emails/suppression";
import { verifyResendWebhook } from "@/lib/emails/webhook-verify";
import { emitSeldonEvent } from "@/lib/events/bus";
import { logEvent } from "@/lib/observability/log";

export const runtime = "nodejs";

type ResendEventType =
  | "email.sent"
  | "email.delivered"
  | "email.delivery_delayed"
  | "email.complained"
  | "email.bounced"
  | "email.opened"
  | "email.clicked"
  | "email.failed";

type ResendWebhookPayload = {
  type: ResendEventType;
  created_at: string;
  data: {
    created_at?: string;
    email_id?: string;
    from?: string;
    to?: string | string[];
    subject?: string;
    click?: { link?: string };
    bounce?: { message?: string; type?: string };
    tags?: Array<{ name: string; value: string }>;
  };
};

function extractTag(payload: ResendWebhookPayload, name: string) {
  return payload.data.tags?.find((tag) => tag.name === name)?.value;
}

async function resolveEmailRow(payload: ResendWebhookPayload) {
  // We set tag {name: "email_id", value: <our db id>} on every send, so
  // the tag is the fastest lookup. Fall back to external_message_id if
  // the tag is missing (older sends before 3.d, or manual resends).
  const taggedEmailId = extractTag(payload, "email_id");
  if (taggedEmailId) {
    const [row] = await db.select().from(emails).where(eq(emails.id, taggedEmailId)).limit(1);
    if (row) return row;
  }

  const externalId = payload.data.email_id;
  if (externalId) {
    const [row] = await db
      .select()
      .from(emails)
      .where(eq(emails.externalMessageId, externalId))
      .limit(1);
    if (row) return row;
  }

  return null;
}

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const rawBody = await request.text();

  if (secret) {
    const result = verifyResendWebhook({
      body: rawBody,
      secret,
      headers: {
        svixId: request.headers.get("svix-id"),
        svixTimestamp: request.headers.get("svix-timestamp"),
        svixSignature: request.headers.get("svix-signature"),
      },
    });
    if (!result.ok) {
      logEvent("resend_webhook_rejected", { reason: result.reason });
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let payload: ResendWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as ResendWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const emailRow = await resolveEmailRow(payload);
  if (!emailRow) {
    logEvent("resend_webhook_no_email_match", {
      event_type: payload.type,
      external_id: payload.data.email_id ?? null,
    });
    return NextResponse.json({ ok: true, matched: false });
  }

  const providerEventId = `${payload.type}:${payload.data.email_id ?? ""}:${payload.created_at}`;

  await db
    .insert(emailEvents)
    .values({
      orgId: emailRow.orgId,
      emailId: emailRow.id,
      eventType: payload.type,
      provider: "resend",
      providerEventId,
      payload: payload as unknown as Record<string, unknown>,
    })
    .onConflictDoNothing({ target: [emailEvents.provider, emailEvents.providerEventId] });

  // Keep the emails row in sync with the canonical counters + timestamps.
  // Tracking-pixel opens already bump openCount locally; provider-reported
  // opens overlap but are idempotent (onConflict on email_events).
  switch (payload.type) {
    case "email.delivered":
      await db
        .update(emails)
        .set({ status: "delivered", updatedAt: new Date() })
        .where(and(eq(emails.id, emailRow.id), eq(emails.orgId, emailRow.orgId)));
      await emitSeldonEvent("email.delivered", {
        emailId: emailRow.id,
        contactId: emailRow.contactId,
      });
      break;

    case "email.opened":
      await db
        .update(emails)
        .set({
          openCount: sql`${emails.openCount} + 1`,
          openedAt: emailRow.openedAt ?? new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(emails.id, emailRow.id), eq(emails.orgId, emailRow.orgId)));
      if (emailRow.contactId) {
        await emitSeldonEvent("email.opened", {
          emailId: emailRow.id,
          contactId: emailRow.contactId,
        });
      }
      break;

    case "email.clicked":
      await db
        .update(emails)
        .set({
          clickCount: sql`${emails.clickCount} + 1`,
          lastClickedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(emails.id, emailRow.id), eq(emails.orgId, emailRow.orgId)));
      if (emailRow.contactId) {
        await emitSeldonEvent("email.clicked", {
          emailId: emailRow.id,
          contactId: emailRow.contactId,
          url: payload.data.click?.link ?? "",
        });
      }
      break;

    case "email.bounced":
    case "email.failed":
    case "email.complained": {
      const reasonText =
        payload.data.bounce?.message ??
        payload.data.bounce?.type ??
        (payload.type === "email.complained" ? "complaint" : "bounce");
      await db
        .update(emails)
        .set({ status: payload.type === "email.complained" ? "complained" : "bounced", updatedAt: new Date() })
        .where(and(eq(emails.id, emailRow.id), eq(emails.orgId, emailRow.orgId)));

      await emitSeldonEvent("email.bounced", {
        emailId: emailRow.id,
        contactId: emailRow.contactId,
        reason: reasonText,
      });

      // Hard bounces and complaints are auto-suppressed so future sends
      // from this workspace skip the address until a human un-suppresses.
      await addSuppression({
        orgId: emailRow.orgId,
        email: emailRow.toEmail,
        reason: payload.type === "email.complained" ? "complaint" : "bounce",
        source: `webhook:${payload.type}`,
      });
      break;
    }

    case "email.sent":
    case "email.delivery_delayed":
      // No state transition needed — emails row is already in `sent` status
      // from the synchronous send path. The event_events row is the record.
      break;
  }

  return NextResponse.json({ ok: true, matched: true });
}
