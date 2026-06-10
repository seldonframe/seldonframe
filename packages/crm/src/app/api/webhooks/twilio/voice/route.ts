// Twilio Voice webhook — call.missed event emitter.
//
// Thin harness, fat skill posture:
//   This route exists ONLY to translate Twilio's CallStatus signal
//   into a SeldonEvent the archetype runtime can react to. It has
//   zero business logic. The intelligence (what to text back, when,
//   in what tone) lives in:
//     - packages/crm/src/lib/agents/archetypes/missed-call-text-back.ts
//       (the spec template — wait → text → wait → log)
//     - packages/crm/src/lib/agents/skills/missed-call/
//       vertical-templates.md (the per-vertical text-back copy that
//       synthesis fills into $textBackBody)
//   When Claude / GPT / Gemini get better, the synthesized copy gets
//   better. This file doesn't need to change.
//
// What this route does:
//   1. Accept Twilio Voice status-callback POSTs.
//   2. Resolve the workspace via the To-number (or From, for the
//      initial voice-URL hit).
//   3. Verify Twilio signature against the workspace's auth token.
//   4. If the CallStatus is one of the missed-call terminal states
//      (no-answer / busy / failed) → emit `call.missed` event.
//   5. Return empty TwiML for the initial voice-URL hit so Twilio
//      hangs up cleanly (no awkward dead-air); return JSON 200 for
//      status callbacks.
//
// What this route does NOT do:
//   - Send any SMS itself (archetype runtime handles that)
//   - Play voicemail / IVR / voice-agent flows (those land Q3+ via
//     the voice-agent infrastructure work)
//   - Lookup or create the caller's CRM contact (the contact-resolve
//     runs in the archetype's send_sms step, which already handles
//     null contact_id)
//
// Twilio status-callback nuances we deliberately encode:
//   - "missed" is the union of no-answer, busy, and failed. NOT
//     "completed" (which usually means the call connected and the
//     caller hung up, or hit voicemail and left a recording — both
//     are "engaged", not missed).
//   - Status callbacks fire on the call's terminal state by default.
//     Per-status-change callbacks require `StatusCallbackEvent`
//     params in the Twilio number config; we don't depend on them.
//   - Anonymous callers (caller-ID blocked) arrive with From="anonymous"
//     or empty. We still emit the event with fromNumber="" so the
//     activity log captures the call, but the archetype's send_sms
//     step will fail E.164 validation and noop (correct behavior —
//     can't text back a number we don't have).

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { decryptValue } from "@/lib/encryption";
import { emitSeldonEvent } from "@/lib/events/bus";
import { logEvent } from "@/lib/observability/log";
import { findContactByPhone } from "@/lib/sms/api";
import { toE164 } from "@/lib/sms/providers";
import { verifyTwilioSignature } from "@/lib/sms/webhook-verify";
import { resolveWorkspaceByPhoneNumber } from "@/lib/agents/voice/resolve-workspace-by-number";
import {
  buildGreetingTwiml,
  buildVoiceGreeting,
  shouldGreetOnInbound,
} from "@/lib/agents/voice/greeting";

export const runtime = "nodejs";

// Twilio CallStatus values that count as "missed" from the agency's
// perspective. "completed" deliberately excluded — it means the call
// connected (either answered or rolled to voicemail with a recording).
// See https://www.twilio.com/docs/voice/api/call-resource#call-status-values
const MISSED_CALL_STATUSES = new Set(["no-answer", "busy", "failed"] as const);

type MissedCallStatus = "no-answer" | "busy" | "failed";

function isMissedStatus(value: string): value is MissedCallStatus {
  return MISSED_CALL_STATUSES.has(value as MissedCallStatus);
}

// Same auth-token-loading pattern as the SMS webhook. v1.* prefix
// signals an encrypted value; everything else is treated as plain.
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

// 2026-06-10 — Load what the inbound-greeting decision needs: whether the
// missed-call-text-back agent is deployed for this workspace, plus the
// business name for the spoken greeting.
async function loadGreetingContext(orgId: string): Promise<{
  deployedAt: string | null;
  pausedAt: string | null;
  businessName: string | null;
}> {
  const [row] = await db
    .select({ settings: organizations.settings, soul: organizations.soul })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const settings = (row?.settings ?? {}) as Record<string, unknown>;
  const agentConfigs = (settings.agentConfigs ?? {}) as Record<
    string,
    { deployedAt?: string | null; pausedAt?: string | null }
  >;
  const cfg = agentConfigs["missed-call-text-back"] ?? {};

  const soul = (row?.soul ?? {}) as Record<string, unknown>;
  const businessName =
    (typeof soul.business_name === "string" && soul.business_name.trim()) ||
    (typeof soul.businessName === "string" && soul.businessName.trim()) ||
    null;

  return {
    deployedAt: cfg.deployedAt ?? null,
    pausedAt: cfg.pausedAt ?? null,
    businessName,
  };
}

function fullRequestUrl(request: Request) {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (forwardedProto && forwardedHost) {
    const url = new URL(request.url);
    return `${forwardedProto}://${forwardedHost}${url.pathname}${url.search}`;
  }
  return request.url;
}

// Minimal TwiML for the initial voice-URL hit. We don't run a voice
// IVR/agent at v1.46.0 — Twilio's default behavior (or the agency's
// existing voicemail-style fallback) handles the actual caller
// experience. Empty <Response/> tells Twilio "do nothing"; the call
// hangs up immediately and the StatusCallback then fires with
// CallStatus=no-answer (or busy/failed depending on why the call
// reached Twilio in the first place).
//
// Q3 2026: voice agent infrastructure replaces this empty response
// with TwiML that connects the call to LiveKit + OpenAI Realtime
// for live AI answering. Same endpoint, different TwiML.
const EMPTY_TWIML_RESPONSE =
  '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

function twimlResponse(xml: string) {
  return new NextResponse(xml, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

export async function POST(request: Request) {
  const rawText = await request.text();
  const params = new URLSearchParams(rawText);
  const body: Record<string, string> = {};
  for (const [key, value] of params) {
    body[key] = value;
  }

  const callSid = body.CallSid?.trim() ?? "";
  const callStatus = body.CallStatus?.trim() ?? "";
  const fromRaw = body.From?.trim() ?? "";
  const toRaw = body.To?.trim() ?? "";
  const durationSeconds = Number.parseInt(body.CallDuration ?? "0", 10) || 0;

  if (!callSid) {
    return NextResponse.json({ error: "Missing CallSid" }, { status: 400 });
  }

  // For inbound voice calls (the initial voice-URL POST and the
  // matching status callbacks), To is the agency's Twilio number
  // and From is the caller. E.164-normalize for org lookup.
  // Anonymous callers send From="anonymous" or empty — we keep the
  // raw value for logging but use an empty E.164 for the SMS step,
  // which will safely noop.
  const fromNumber = fromRaw && fromRaw !== "anonymous" ? toE164(fromRaw) : "";
  const toNumber = toE164(toRaw);

  if (!toNumber) {
    return NextResponse.json({ error: "Missing To number" }, { status: 400 });
  }

  const orgId = await resolveWorkspaceByPhoneNumber(toNumber);
  if (!orgId) {
    logEvent("twilio_voice_webhook_no_org_match", {
      call_sid: callSid,
      to: toNumber,
      from: fromNumber,
      status: callStatus,
    });
    // Distinguish voice-URL initial hits from status callbacks by
    // the presence of a terminal CallStatus + CallDuration. Without
    // a workspace match we still need to return parseable TwiML on
    // the initial hit so Twilio doesn't 502 the caller.
    return callStatus && callStatus !== "ringing" && callStatus !== "in-progress"
      ? NextResponse.json({ ok: true, matched: false })
      : twimlResponse(EMPTY_TWIML_RESPONSE);
  }

  // Verify Twilio signature against the workspace's auth token.
  // Posture matches the SMS webhook: enforce when token is present,
  // skip in dev where the token isn't configured.
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
      logEvent("twilio_voice_webhook_signature_rejected", {
        org_id: orgId,
        call_sid: callSid,
      });
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  // 2026-06-10 — Inbound greeting decision, shared by the voice-URL hit and
  // the status callback. When the missed-call agent is deployed we answer +
  // emit on the inbound hit, so the status callback must not double-emit.
  const greetCtx = await loadGreetingContext(orgId);
  const greetMode = shouldGreetOnInbound(greetCtx.deployedAt, greetCtx.pausedAt);

  // Initial voice-URL hit (no terminal status).
  if (!callStatus || callStatus === "ringing" || callStatus === "in-progress") {
    if (greetMode) {
      // Deterministic path: answer with a branded greeting and fire the
      // text-back NOW — don't wait for Twilio to classify a "missed" status.
      const contactId = fromNumber
        ? await findContactByPhone(orgId, fromNumber)
        : null;
      await emitSeldonEvent(
        "call.missed",
        {
          callSid,
          contactId,
          fromNumber,
          toNumber,
          status: "no-answer",
          durationSeconds: 0,
        },
        { orgId },
      );
      logEvent("twilio_voice_webhook_greeted_and_emitted", {
        org_id: orgId,
        call_sid: callSid,
        from: fromNumber,
        to: toNumber,
        contact_id: contactId,
      });
      return twimlResponse(
        buildGreetingTwiml(buildVoiceGreeting(greetCtx.businessName)),
      );
    }

    // Legacy path: empty TwiML; rely on the status callback to detect a
    // missed call (when no missed-call agent is deployed).
    logEvent("twilio_voice_webhook_voice_url_hit", {
      org_id: orgId,
      call_sid: callSid,
      from: fromNumber,
      to: toNumber,
    });
    return twimlResponse(EMPTY_TWIML_RESPONSE);
  }

  // Status callback path — terminal state reached.
  if (isMissedStatus(callStatus)) {
    // When greet-mode is on, the inbound voice-URL hit already emitted
    // call.missed and answered the call. Skip here so a caller who hangs up
    // mid-greeting (which can surface a no-answer callback) doesn't trigger
    // a SECOND text-back.
    if (greetMode) {
      logEvent("twilio_voice_webhook_missed_skipped_greeted", {
        org_id: orgId,
        call_sid: callSid,
        status: callStatus,
      });
      return NextResponse.json({ ok: true, skipped: "greeted_on_inbound" });
    }

    const contactId = fromNumber ? await findContactByPhone(orgId, fromNumber) : null;

    await emitSeldonEvent(
      "call.missed",
      {
        callSid,
        contactId,
        fromNumber,
        toNumber,
        status: callStatus,
        durationSeconds,
      },
      { orgId },
    );

    logEvent("twilio_voice_webhook_call_missed", {
      org_id: orgId,
      call_sid: callSid,
      from: fromNumber,
      to: toNumber,
      status: callStatus,
      duration: durationSeconds,
      contact_id: contactId,
    });

    return NextResponse.json({ ok: true, emitted: "call.missed" });
  }

  // Non-missed terminal status (completed / canceled). v1.46.0
  // doesn't fire any agent on these — voicemail / connected calls
  // are out of scope for this archetype. Q3 2026's voice-agent
  // infrastructure will emit `call.completed` here when the
  // workspace has an active voice agent.
  logEvent("twilio_voice_webhook_terminal_non_missed", {
    org_id: orgId,
    call_sid: callSid,
    status: callStatus,
    duration: durationSeconds,
  });

  return NextResponse.json({ ok: true, status: callStatus });
}
