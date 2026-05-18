import { and, eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { organizations, smsEvents, smsMessages, workflowRuns, workflowWaits } from "@/db/schema";
import { decryptValue } from "@/lib/encryption";
import { emitSeldonEvent } from "@/lib/events/bus";
import { logEvent } from "@/lib/observability/log";
import { handleIncomingTurn } from "@/lib/conversation/runtime";
import { classifyInboundIntent, shouldAutoReplyForIntent } from "@/lib/messaging/classify-intent";
import { findContactByPhone, persistInboundSms } from "@/lib/sms/api";
import { toE164 } from "@/lib/sms/providers";
import { addPhoneSuppression, isHelpKeyword, isStopKeyword } from "@/lib/sms/suppression";
import { verifyTwilioSignature } from "@/lib/sms/webhook-verify";
import { dispatchTwilioInboundForMessageTriggers } from "@/lib/agents/message-trigger-wiring";
import type { OrgSoul } from "@/lib/soul/types";

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

/**
 * Build the boilerplate response sent when a customer texts HELP / INFO
 * (Slice 4). Carriers expect a deterministic, non-marketing reply that
 * names the business and offers a support contact. We pull the
 * workspace name + the soul-stored business phone when present.
 */
async function buildHelpReply(orgId: string): Promise<string> {
  const [row] = await db
    .select({ name: organizations.name, soul: organizations.soul })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const businessName = row?.name?.trim() || "this business";
  const soul = (row?.soul ?? null) as OrgSoul | null;
  const soulRaw = (soul ?? {}) as unknown as Record<string, unknown>;
  const businessPhone = typeof soulRaw.phone === "string" ? soulRaw.phone.trim() : "";

  const supportLine = businessPhone
    ? `Reach ${businessName} at ${businessPhone}.`
    : `Reach ${businessName} by replying to this thread.`;

  // Keep under 160 chars including the STOP footer so this lands in
  // one SMS segment for the operator's customer.
  return `${businessName}: ${supportLine} Reply STOP to unsubscribe.`;
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

  // HELP / INFO keyword (Slice 4): Carriers expect a deterministic
  // non-marketing reply that names the business and offers a support
  // contact. Unlike STOP, we don't suppress — the contact can still
  // receive transactional + conversational messages. We send via
  // sendSmsFromApi for the full audit-log treatment (so the reply lands
  // in /conversations alongside other operator outbound).
  if (isHelpKeyword(inboundBody)) {
    const reply = await buildHelpReply(orgId);
    const { sendSmsFromApi } = await import("@/lib/sms/api");
    await sendSmsFromApi({
      orgId,
      userId: null,
      contactId: null,
      toNumber: fromNumber,
      body: reply,
    }).catch((error) => {
      logEvent("twilio_webhook_help_send_failed", {
        org_id: orgId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
    return NextResponse.json({ ok: true, action: "help_reply" });
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

  // 2026-05-18 — precedence check (moved up). If a conversation step
  // is currently paused on sms.replied for this contact (e.g.
  // speed-to-lead's qualify_conversation), the conversation engine
  // owns this reply. We must skip BOTH the message-trigger dispatcher
  // AND the chatbot auto-reply, so the customer doesn't get three
  // replies (agent LLM + appointment-confirm-sms agent + soul-aware
  // chatbot). Without this guard, "tomorrow at 10am" routes to
  // appointment-confirm-sms which then says "no upcoming appointment".
  //
  // The conversation engine still resumes through the sms.replied
  // event below — we just block the OTHER paths.
  let conversationOwnsReply = false;
  if (contactId) {
    const activeConversationWait = await db
      .select({ id: workflowWaits.id })
      .from(workflowWaits)
      .innerJoin(workflowRuns, eq(workflowWaits.runId, workflowRuns.id))
      .where(
        and(
          eq(workflowRuns.orgId, orgId),
          eq(workflowWaits.eventType, "sms.replied"),
          isNull(workflowWaits.resumedAt),
          sql`${workflowWaits.matchPredicate}->>'contactId' = ${contactId}`,
        ),
      )
      .limit(1);
    if (activeConversationWait.length > 0) {
      conversationOwnsReply = true;
      logEvent("twilio_webhook_skipped_for_conversation", {
        org_id: orgId,
        contact_id: contactId,
        wait_id: activeConversationWait[0].id,
      });
    }
  }

  // SLICE 7 PR 1 C6: dispatch matching message-triggered agents.
  // Best-effort: errors are caught + logged inside the wrapper; never
  // propagate to the webhook response. PR 1 dispatcher is no-op until
  // message_triggers rows exist (PR 2 ships the first archetype +
  // installer + real runtime startRun wiring). Runs BEFORE handleIncomingTurn
  // so message-triggered agents can run concurrently with the Soul-aware
  // reply path — UNLESS a conversation step is currently in flight,
  // in which case the conversation owns the reply.
  if (!conversationOwnsReply) {
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
  }

  // Always emit sms.replied — the conversation engine's pause_event
  // listener is the path that resumes a paused conversation step. The
  // chatbot path (handleIncomingTurn below) is gated separately by
  // conversationOwnsReply.
  await emitSeldonEvent("sms.replied", {
    smsMessageId: inbound.id,
    contactId,
    conversationId: null,
  }, { orgId: orgId });

  // If we know which contact this is from, route through the runtime
  // for a Soul-aware reply. Anonymous inbound (phone not in CRM) is
  // persisted but not auto-replied to.
  //
  // Slice 4: gate the auto-reply on intent classification. Per the
  // plan's locked decision #2, only FAQ / pricing / scheduling intents
  // get an auto-reply — anything ambiguous (complaints, unclear asks)
  // lands in the operator's inbox unread instead. classifyInboundIntent
  // returns null on failure, in which case shouldAutoReplyForIntent
  // falls back to the existing always-reply behavior so a degraded
  // classifier doesn't break currently-working workspaces.
  if (contactId) {
    if (conversationOwnsReply) {
      return NextResponse.json({
        ok: true,
        matched: true,
        contactId,
        handled_by: "conversation_step",
      });
    }

    const intent = await classifyInboundIntent({ orgId, body: inboundBody });
    const autoReply = shouldAutoReplyForIntent(intent);

    logEvent("twilio_webhook_intent_classified", {
      org_id: orgId,
      contact_id: contactId,
      intent: intent ?? "unknown",
      auto_reply: autoReply,
    });

    if (autoReply) {
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
    // else: classified as 'other' (complaint / ambiguous). Inbound row
    // is already persisted + sms.replied was emitted earlier, so the
    // /conversations inbox will surface it as unread for the operator
    // to handle manually.
  }

  return NextResponse.json({ ok: true, matched: true, contactId });
}
