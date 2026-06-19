// Voice Round-1 — MISSED-CALL TEXT-BACK route (Twilio call-STATUS callback).
//
// ── What Max must configure in Twilio ──────────────────────────────────────
// On the Elastic SIP Trunk that routes the voice number to OpenAI (or on the
// phone number's "Call Status Changes" webhook), set the STATUS CALLBACK URL to:
//
//     https://app.seldonframe.com/api/v1/voice/missed-call   (HTTP POST)
//
//   • For an Elastic SIP Trunk: Trunk → Voice → "Call Status Changes URL"
//     (a.k.a. the status callback), HTTP POST.
//   • For a number whose Voice config dials the trunk via TwiML: add a
//     <Dial> statusCallback (events: completed) — but in the pure-SIP-trunk
//     setup the trunk-level status callback is the right place.
//
// Twilio POSTs application/x-www-form-urlencoded with: CallSid, CallStatus,
// From (the caller), To (the dialed workspace number), CallDuration, etc.
//
// ── Why this is a SEPARATE route from the realtime webhook ──────────────────
// The realtime.call.incoming webhook (api/v1/voice/openai/webhook) is OpenAI's
// signed event for an INCOMING call it's about to bridge. It can't tell us a
// call was missed — if the agent never engages, OpenAI may not fire anything we
// can act on, and the post-call SMS only fires for calls that reached the
// control-WS hold. Twilio's status callback is the authoritative source for the
// call's terminal OUTCOME (no-answer / busy / failed / canceled / completed),
// so the missed-call detector lives here. A "completed" call means the agent
// answered and runVoiceCall.onPostCallSms already sent the engaged-call SMS —
// this route skips it, so the caller is never double-texted.
//
// All decision logic + the SMS copy live in the injectable core
// (lib/agents/voice/missed-call-textback.ts) and are unit-tested with no DB /
// no Twilio. This file is the thin harness: parse → verify signature → call the
// core with real (DB- + Twilio-backed) deps → always 200.

import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { agents, organizations, smsMessages } from "@/db/schema";
import type { AgentBlueprint } from "@/db/schema/agents";
import { decryptValue } from "@/lib/encryption";
import { logEvent } from "@/lib/observability/log";
import { sendSmsFromApi, findContactByPhone } from "@/lib/sms/api";
import { toE164 } from "@/lib/sms/providers";
import { verifyTwilioSignature } from "@/lib/sms/webhook-verify";
import { resolveWorkspaceByPhoneNumber } from "@/lib/agents/voice/resolve-workspace-by-number";
import {
  runMissedCallTextBack,
  type MissedCallVoiceConfig,
} from "@/lib/agents/voice/missed-call-textback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MISSED_CALL_SMS_SOURCE = "missed-call-text-back";

// Same auth-token-loading pattern as the SMS + Twilio-voice webhooks. A "v1."
// prefix signals an encrypted value; everything else is plain.
async function loadTwilioAuthTokenForOrg(orgId: string): Promise<string> {
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

// Load the missed-call config for a resolved workspace: the voice agent's
// blueprint toggle + copy, the soul business name, the slug, and the meta-pitch
// flag. Returns null when the workspace has no Twilio fromNumber configured (the
// SMS send would throw "fromNumber not configured" — so we skip cleanly).
async function loadVoiceConfig(orgId: string): Promise<MissedCallVoiceConfig | null> {
  const [org] = await db
    .select({
      slug: organizations.slug,
      soul: organizations.soul,
      integrations: organizations.integrations,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) return null;

  const integrations = (org.integrations ?? {}) as Record<string, unknown>;
  const twilio = (integrations.twilio ?? {}) as { fromNumber?: string };
  if (!twilio.fromNumber?.trim()) return null; // no number → can't send

  const [agent] = await db
    .select({ blueprint: agents.blueprint })
    .from(agents)
    .where(and(eq(agents.orgId, orgId), eq(agents.archetype, "voice-receptionist")))
    .limit(1);
  const blueprint = (agent?.blueprint ?? {}) as AgentBlueprint;
  const mctb = blueprint.missedCallTextBack ?? {};

  const soul = (org.soul ?? {}) as Record<string, unknown>;
  const businessName =
    (typeof soul.businessName === "string" && soul.businessName.trim()) ||
    (typeof soul.business_name === "string" && soul.business_name.trim()) ||
    "us";

  return {
    // Default ON: undefined → enabled. Only an explicit false disables.
    enabled: mctb.enabled !== false,
    message: mctb.message?.trim() || null,
    businessName,
    orgSlug: org.slug,
    baseDomain: process.env.WORKSPACE_BASE_DOMAIN?.trim() || "app.seldonframe.com",
    metaPitch: blueprint.postCallMetaPitch === true,
  };
}

// Idempotency probe — has a missed-call SMS already been sent for this org +
// CallSid? Reads the smsMessages row the send writes (tagged source + callSid).
async function alreadyTexted(orgId: string, callSid: string): Promise<boolean> {
  const [row] = await db
    .select({ id: smsMessages.id })
    .from(smsMessages)
    .where(
      and(
        eq(smsMessages.orgId, orgId),
        sql`${smsMessages.metadata}->>'source' = ${MISSED_CALL_SMS_SOURCE}`,
        sql`${smsMessages.metadata}->>'callSid' = ${callSid}`,
      ),
    )
    .limit(1);
  return Boolean(row);
}

function fullRequestUrl(request: Request): string {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (forwardedProto && forwardedHost) {
    const url = new URL(request.url);
    return `${forwardedProto}://${forwardedHost}${url.pathname}${url.search}`;
  }
  return request.url;
}

export async function POST(request: Request): Promise<Response> {
  const rawText = await request.text();
  const params = new URLSearchParams(rawText);

  const callSid = params.get("CallSid")?.trim() ?? "";
  const callStatus = params.get("CallStatus")?.trim() ?? "";
  const fromRaw = params.get("From")?.trim() ?? "";
  const toRaw = params.get("To")?.trim() ?? "";

  // Caller (From) → E.164 unless anonymous; the core re-checks untextable callers.
  const fromNumber = fromRaw && !/anonymous/i.test(fromRaw) ? toE164(fromRaw) : "";
  const toNumber = toE164(toRaw);

  logEvent("voice_missed_call_callback", {
    call_sid: callSid || null,
    call_status: callStatus || null,
    to: toNumber || null,
    from: fromNumber || null,
  });

  if (!toNumber) {
    // Nothing to resolve a workspace by — ACK so Twilio doesn't retry.
    return NextResponse.json({ ok: true, skipped: "missing_to" });
  }

  // Resolve the workspace up front so we can verify the Twilio signature against
  // ITS auth token (per-workspace creds — same posture as the other webhooks).
  const orgId = await resolveWorkspaceByPhoneNumber(toNumber);
  if (!orgId) {
    logEvent("voice_missed_call_no_org_match", { call_sid: callSid || null, to: toNumber });
    return NextResponse.json({ ok: true, matched: false });
  }

  // Signature verification — enforce when the workspace has an auth token; skip
  // in dev where it isn't configured (mirrors the SMS + Twilio-voice webhooks).
  const authToken = await loadTwilioAuthTokenForOrg(orgId);
  if (authToken) {
    const ok = verifyTwilioSignature({
      url: fullRequestUrl(request),
      body: params,
      signature: request.headers.get("x-twilio-signature"),
      authToken,
    });
    if (!ok) {
      logEvent("voice_missed_call_signature_rejected", { org_id: orgId, call_sid: callSid || null });
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  // Run the decision core with real deps. resolveOrgIdByNumber returns the org
  // we already matched (avoids a second table scan).
  const result = await runMissedCallTextBack(
    { callSid, callStatus, fromNumber, toNumber },
    {
      resolveOrgIdByNumber: async () => orgId,
      loadVoiceConfig,
      alreadyTexted,
      sendSms: async ({ orgId: sendOrgId, toNumber: to, body, callSid: sid }) => {
        // Attribute the SMS to the caller's contact if we know them (so it shows
        // on their timeline); null is fine for first-time callers.
        const contactId = await findContactByPhone(sendOrgId, to).catch(() => null);
        await sendSmsFromApi({
          orgId: sendOrgId,
          userId: null,
          contactId,
          toNumber: to,
          body,
          // Tag the row so alreadyTexted() dedups re-deliveries of this CallSid.
          metadata: { source: MISSED_CALL_SMS_SOURCE, callSid: sid },
        });
      },
    },
  );

  if (result.action === "sent") {
    logEvent("voice_missed_call_sms_sent", { org_id: result.orgId, call_sid: callSid, to: result.toNumber });
  } else if (result.action === "error") {
    logEvent(
      "voice_missed_call_sms_failed",
      { org_id: orgId, call_sid: callSid || null, error: result.reason },
      { severity: "warn" },
    );
  } else {
    logEvent("voice_missed_call_skipped", { org_id: orgId, call_sid: callSid || null, reason: result.reason });
  }

  // ALWAYS 200 — a non-2xx makes Twilio retry the status callback (retry-storm).
  return NextResponse.json({ ok: true, action: result.action });
}
