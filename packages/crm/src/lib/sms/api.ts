import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  activities,
  contacts,
  organizations,
  smsEvents,
  smsMessages,
} from "@/db/schema";
import { emitSeldonEvent } from "@/lib/events/bus";
import { dispatchWebhook } from "@/lib/utils/webhooks";
import { getSmsProvider, SmsProviderSendError, toE164 } from "./providers";
import { isPhoneSuppressed, normalizePhone } from "./suppression";

export type SendSmsResult =
  | {
      smsId: string;
      contactId: string | null;
      suppressed: false;
      externalMessageId: string;
      segments: number;
    }
  | {
      smsId: null;
      contactId: string | null;
      suppressed: true;
      reason: string;
    };

async function resolveFromNumber(orgId: string) {
  const [org] = await db
    .select({ integrations: organizations.integrations })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const integrations = (org?.integrations ?? {}) as Record<string, unknown>;
  const twilio = (integrations.twilio ?? {}) as { fromNumber?: string };
  const from = twilio.fromNumber?.trim() ?? "";
  return from ? toE164(from) : "";
}

export async function sendSmsFromApi(params: {
  orgId: string;
  userId: string | null;
  contactId: string | null;
  toNumber: string;
  body: string;
  provider?: string | null;
}): Promise<SendSmsResult> {
  const toNumber = normalizePhone(params.toNumber);
  if (!toNumber) {
    throw new Error("toNumber is required");
  }

  const suppression = await isPhoneSuppressed(params.orgId, toNumber);
  if (suppression) {
    await emitSeldonEvent("sms.suppressed", {
      phone: toNumber,
      reason: suppression.reason,
      contactId: params.contactId,
    }, { orgId: params.orgId });
    return {
      smsId: null,
      contactId: params.contactId,
      suppressed: true,
      reason: suppression.reason,
    };
  }

  const fromNumber = await resolveFromNumber(params.orgId);
  if (!fromNumber) {
    throw new Error("Twilio fromNumber not configured for this workspace");
  }

  const provider = params.provider?.trim() || "twilio";
  const impl = getSmsProvider(provider);
  if (!impl) {
    throw new Error(`Unknown sms provider: ${provider}`);
  }

  const [created] = await db
    .insert(smsMessages)
    .values({
      orgId: params.orgId,
      contactId: params.contactId,
      userId: params.userId,
      provider,
      direction: "outbound",
      fromNumber,
      toNumber,
      body: params.body,
      status: "queued",
      metadata: { source: "api" },
    })
    .returning({ id: smsMessages.id, contactId: smsMessages.contactId });

  if (!created) {
    throw new Error("Could not queue sms");
  }

  try {
    const result = await impl.send({
      orgId: params.orgId,
      from: fromNumber,
      to: toNumber,
      body: params.body,
    });

    await db
      .update(smsMessages)
      .set({
        status: "sent",
        externalMessageId: result.externalMessageId,
        segments: result.segments,
        sentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(smsMessages.id, created.id));

    if (created.contactId) {
      await emitSeldonEvent("sms.sent", {
        smsMessageId: created.id,
        contactId: created.contactId,
      }, { orgId: params.orgId });
    }

    if (params.userId && created.contactId) {
      await db.insert(activities).values({
        orgId: params.orgId,
        userId: params.userId,
        contactId: created.contactId,
        type: "sms",
        subject: `SMS sent`,
        body: `To ${toNumber}: ${params.body.slice(0, 140)}`,
        metadata: { smsId: created.id, segments: result.segments },
      });
    }

    await dispatchWebhook({
      orgId: params.orgId,
      event: "sms.sent",
      payload: {
        smsId: created.id,
        contactId: created.contactId,
        provider,
        toNumber,
        segments: result.segments,
      },
    });

    return {
      smsId: created.id,
      contactId: created.contactId,
      suppressed: false,
      externalMessageId: result.externalMessageId,
      segments: result.segments,
    };
  } catch (error) {
    const reason =
      error instanceof SmsProviderSendError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Provider error";
    const code = error instanceof SmsProviderSendError ? error.code : null;

    await db
      .update(smsMessages)
      .set({
        status: "failed",
        errorCode: code,
        errorMessage: reason,
        updatedAt: new Date(),
      })
      .where(eq(smsMessages.id, created.id));

    await emitSeldonEvent("sms.failed", {
      smsMessageId: created.id,
      contactId: created.contactId,
      reason,
    }, { orgId: params.orgId });

    throw error;
  }
}

export async function getSmsWithEvents(orgId: string, smsId: string) {
  const [row] = await db
    .select()
    .from(smsMessages)
    .where(and(eq(smsMessages.orgId, orgId), eq(smsMessages.id, smsId)))
    .limit(1);
  if (!row) return null;

  const events = await db
    .select({
      id: smsEvents.id,
      eventType: smsEvents.eventType,
      provider: smsEvents.provider,
      createdAt: smsEvents.createdAt,
      payload: smsEvents.payload,
    })
    .from(smsEvents)
    .where(and(eq(smsEvents.orgId, orgId), eq(smsEvents.smsMessageId, smsId)))
    .orderBy(desc(smsEvents.createdAt));

  return { sms: row, events };
}

export async function listRecentSms(orgId: string, limit = 50) {
  return db
    .select({
      id: smsMessages.id,
      contactId: smsMessages.contactId,
      direction: smsMessages.direction,
      fromNumber: smsMessages.fromNumber,
      toNumber: smsMessages.toNumber,
      body: smsMessages.body,
      status: smsMessages.status,
      provider: smsMessages.provider,
      segments: smsMessages.segments,
      errorCode: smsMessages.errorCode,
      errorMessage: smsMessages.errorMessage,
      sentAt: smsMessages.sentAt,
      deliveredAt: smsMessages.deliveredAt,
      createdAt: smsMessages.createdAt,
    })
    .from(smsMessages)
    .where(eq(smsMessages.orgId, orgId))
    .orderBy(desc(smsMessages.createdAt))
    .limit(limit);
}

// Invoked from the inbound Twilio webhook (4.f) — persists an inbound
// row and hands off to the conversation runtime for reply generation.
export async function persistInboundSms(params: {
  orgId: string;
  contactId: string | null;
  fromNumber: string;
  toNumber: string;
  body: string;
  externalMessageId: string;
  metadata?: Record<string, unknown>;
}) {
  const [row] = await db
    .insert(smsMessages)
    .values({
      orgId: params.orgId,
      contactId: params.contactId,
      userId: null,
      provider: "twilio",
      direction: "inbound",
      fromNumber: normalizePhone(params.fromNumber),
      toNumber: normalizePhone(params.toNumber),
      body: params.body,
      status: "received",
      externalMessageId: params.externalMessageId,
      segments: 1,
      metadata: params.metadata ?? {},
    })
    .returning({ id: smsMessages.id });

  if (!row) {
    throw new Error("Could not persist inbound sms");
  }

  return row;
}

export async function findContactByPhone(orgId: string, phone: string) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  // Contacts store phone in whatever format the user typed. Normalize
  // the column in the query via a filter pass; at v1 scale a table scan
  // is fine. Index on phone can land later if needed.
  const rows = await db
    .select({ id: contacts.id, phone: contacts.phone })
    .from(contacts)
    .where(eq(contacts.orgId, orgId));

  const match = rows.find((row) => row.phone && normalizePhone(row.phone) === normalized);
  return match?.id ?? null;
}
