import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { organizations, smsEvents, smsMessages } from "@/db/schema";
import { decryptValue } from "@/lib/encryption";
import { emitSeldonEvent } from "@/lib/events/bus";
import { logEvent } from "@/lib/observability/log";
import { handleIncomingTurn } from "@/lib/conversation/runtime";
import { findContactByPhone, persistInboundSms } from "@/lib/sms/api";
import { toE164 } from "@/lib/sms/providers";
import { addPhoneSuppression, isStopKeyword } from "@/lib/sms/suppression";
import { verifyTwilioSignature } from "@/lib/sms/webhook-verify";
import { dispatchTwilioInboundForMessageTriggers } from "@/lib/agents/message-trigger-wiring";

export const runtime = "nodejs";

async function resolveOrgByFromNumber(fromNumber: string) {
  // Twilio posts To=<our number> for inbound; we look up the workspace
  // that owns that number. A workspace's Twilio integration stores the
  // fromNumber in organizations.integrations.twilio.fromNumber.
  const rows = await db
    .select({
      id: organizations.id,
      integrations: organizations.integrations,
    })
    .from(organizations);

  for (const row of rows) {
    const integrations = (row.integrations ?? {}) as Record<string, unknown>;
    const twilio = (integrations.twilio ?? {}) as { fromNumber?: string };
    const stored = twilio.fromNumber?.trim() ?? "";
    if (stored && toE164(stored) === fromNumber) {
      return row.id;
    }
  }

  return null;
}

async function loadTwilioAuthTokenForOrg(orgId: string) {
  const [row] = await db
    .select({ integrations: organizations.integrations })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const integrations = (row?.integrations ?? {}) as Record<string, unknown>;
  const twilio = (integrations.twilio ?? {}) as { authToken?: string };
  const raw = twilio.authToken?.trim() ?? "";

  if (raw.startsWith("v1.")) {
    try {
      return decryptValue(raw);
    } catch {
      return "";
    }
  }
  return raw;
}

function fullRequestUrl(request: Request) {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (forwardedProto && forwardedHost) {
    const url = new URL(request.url);
    return `${forwardedProto}://${forwardedHost}${url.pathname}${url.search}`;
  }
  return request.url;
}

async function handleStatusCallback(params: {
  orgId: string;
  externalMessageId: string;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  rawBody: Record<string, string>;
}) {
  const [row] = await db
    .select()
    .from(smsMessages)
    .where(
      and(
        eq(smsMessages.orgId, params.orgId),
        eq(smsMessages.externalMessageId, params.externalMessageId)
      )
    )
    .limit(1);

  if (!row) {
    logEvent("twilio_webhook_no_sms_match", {
      org_id: params.orgId,
      external_id: params.externalMessageId,
      status: params.status,
    });
    return { matched: false };
  }

  const providerEventId = `${params.status}:${params.externalMessageId}:${Date.now()}`;

  await db
    .insert(smsEvents)
    .values({
      orgId: params.orgId,
      smsMessageId: row.id,
      eventType: `sms.${params.status}`,
      provider: "twilio",
      providerEventId,
      payload: params.rawBody,
    })
    .onConflictDoNothing({ target: [smsEvents.provider, smsEvents.providerEventId] });

  switch (params.status) {
    case "delivered":
      await db
        .update(smsMessages)
        .set({ status: "delivered", deliveredAt: new Date(), updatedAt: new Date() })
        .where(eq(smsMessages.id, row.id));
      await emitSeldonEvent("sms.delivered", {
        smsMessageId: row.id,
        contactId: row.contactId,
      }, { orgId: params.orgId });
      break;

    case "failed":
    case "undelivered":
      await db
        .update(smsMessages)
        .set({
          status: "failed",
          errorCode: params.errorCode,
          errorMessage: params.errorMessage ?? `Twilio reported ${params.status}`,
          updatedAt: new Date(),
        })
        .where(eq(smsMessages.id, row.id));
      await emitSeldonEvent("sms.failed", {
        smsMessageId: row.id,
        contactId: row.contactId,
        reason: params.errorMessage ?? params.errorCode ?? params.status,
      }, { orgId: params.orgId });
      // Carrier-reported permanent failures (error code 30003, 30005,
      // 30006) imply the number is bad. Auto-suppress so future sends
      // skip it.
      if (params.errorCode && ["30003", "30005", "30006"].includes(params.errorCode)) {
        await addPhoneSuppression({
          orgId: params.orgId,
          phone: row.toNumber,
          reason: "carrier_block",
          source: `webhook:${params.errorCode}`,
        });
      }
      break;
  }

  return { matched: true };
}

export async function POST(request: Request) {
  const rawText = await request.text();
  const params = new URLSearchParams(rawText);
  const body: Record<string, string> = {};
  for (const [key, value] of params) {
    body[key] = value;
  }

  const toNumber = toE164(body.To ?? "");
  const fromNumber = toE164(body.From ?? "");
  const externalMessageId = body.MessageSid ?? "";

  if (!toNumber || !externalMessageId) {
    return NextResponse.json({ error: "Missing required params" }, { status: 400 });
  }

  // Status callbacks use the same endpoint. Twilio sends MessageStatus
  // on status updates and Body+From on inbound messages. If we have
  // MessageStatus, it's a status callback; if we have Body and no
  // MessageStatus, it's an inbound message.
  const messageStatus = body.MessageStatus?.trim() ?? "";
  const isStatusCallback = Boolean(messageStatus);

  // For status callbacks, To is the recipient; for inbound, To is us.
  // Resolve org from whichever matches our stored fromNumber.
  const orgId = (await resolveOrgByFromNumber(isStatusCallback ? fromNumber : toNumber));
  if (!orgId) {
    logEvent("twilio_webhook_no_org_match", {
      status_callback: isStatusCallback,
      from: fromNumber,
      to: toNumber,
    });
    return NextResponse.json({ ok: true, matched: false });
  }

  // Verify signature using the workspace's auth token. Unsigned requests
  // are rejected in production (authToken present) but accepted in dev
  // (no token configured) — matches the Resend webhook posture.
  const authToken = await loadTwilioAuthTokenForOrg(orgId);
  if (authToken) {
    const signature = request.headers.get("x-twilio-signature");
    const ok = verifyTwilioSignature({
      url: fullRequestUrl(request),
      body: params,
      signature,
      authToken,
    });
    if (!ok) {
      logEvent("twilio_webhook_signature_rejected", { org_id: orgId });
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  if (isStatusCallback) {
    const result = await handleStatusCallback({
      orgId,
      externalMessageId,
      status: messageStatus,
      errorCode: body.ErrorCode ?? null,
      errorMessage: body.ErrorMessage ?? null,
      rawBody: body,
    });
    return NextResponse.json({ ok: true, matched: result.matched });
  }

  // Inbound message path.
  const inboundBody = body.Body?.trim() ?? "";
  if (!inboundBody) {
    return NextResponse.json({ ok: true, skipped: "empty_body" });
  }

  // STOP keyword: auto-suppress the sender and acknowledge without
  // routing through the runtime. Carriers require this — replying with
  // marketing content to a STOP is a violation.
  if (isStopKeyword(inboundBody)) {
    await addPhoneSuppression({
      orgId,
      phone: fromNumber,
      reason: "stop_keyword",
      source: "webhook:stop",
    });
    await emitSeldonEvent("sms.suppressed", {
      phone: fromNumber,
      reason: "stop_keyword",
      contactId: null,
    }, { orgId: orgId });
    return NextResponse.json({ ok: true, action: "auto_suppressed" });
  }

  const contactId = await findContactByPhone(orgId, fromNumber);

  const inbound = await persistInboundSms({
    orgId,
    contactId,
    fromNumber,
    toNumber,
    body: inboundBody,
    externalMessageId,
    metadata: { twilio: body },
  });

  // SLICE 7 PR 1 C6: dispatch matching message-triggered agents.
  // Best-effort: errors are caught + logged inside the wrapper; never
  // propagate to the webhook response. PR 1 dispatcher is no-op until
  // message_triggers rows exist (PR 2 ships the first archetype +
  // installer + real runtime startRun wiring). Runs BEFORE handleIncomingTurn
  // so message-triggered agents can run concurrently with the Soul-aware
  // reply path.
  await dispatchTwilioInboundForMessageTriggers({
    orgId,
    from: fromNumber,
    to: toNumber,
    body: inboundBody,
    externalMessageId,
    receivedAt: new Date(),
    contactId,
    conversationId: null,
  });

  await emitSeldonEvent("sms.replied", {
    smsMessageId: inbound.id,
    contactId,
    conversationId: null,
  }, { orgId: orgId });

  // If we know which contact this is from, route through the runtime
  // for a Soul-aware reply. Anonymous inbound (phone not in CRM) is
  // persisted but not auto-replied to.
  if (contactId) {
    const result = await handleIncomingTurn({
      orgId,
      contactId,
      channel: "sms",
      incomingMessage: inboundBody,
      smsMessageId: inbound.id,
    });

    // Send the generated reply back via the outbound SMS path.
    if (result.responseText) {
      // Intentionally re-export through sendSmsFromApi for the full
      // suppression-check + activity-log + webhook dispatch treatment.
      const { sendSmsFromApi } = await import("@/lib/sms/api");
      await sendSmsFromApi({
        orgId,
        userId: null,
        contactId,
        toNumber: fromNumber,
        body: result.responseText,
      }).catch((error) => {
        logEvent("twilio_webhook_reply_send_failed", {
          org_id: orgId,
          contact_id: contactId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
  }

  return NextResponse.json({ ok: true, matched: true, contactId });
}
