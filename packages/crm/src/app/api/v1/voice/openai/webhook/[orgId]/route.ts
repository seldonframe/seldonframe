// Tier-2 (BYO OpenAI project) per-org voice webhook — spec
// 2026-07-01-voice-deploy-metered-billing, Task 8.
//
// This is the SIBLING of the platform route
// (app/api/v1/voice/openai/webhook/route.ts), for builders running their OWN
// OpenAI project. Instead of one shared platform webhook verified against
// OPENAI_WEBHOOK_SECRET, each Tier-2 org gets its own URL
// (…/webhook/{orgId}) and its OpenAI project is configured (by the builder,
// in their own OpenAI dashboard) to send `realtime.call.incoming` events
// HERE, signed with THEIR project's webhook secret (stored encrypted under
// integrations.openaiVoice.webhookSecret — see
// lib/telephony/openai-voice-store.ts).
//
// SECURITY-CRITICAL: the whole point of the per-org route + org-scoped
// secret is that org A's OpenAI project can only ever drive calls for org A.
// The gate is `decideTier2Call` (lib/agents/voice/tier2-auth.ts, PURE +
// TDD'd): verify the signature against THIS org's own whsec_ FIRST (before
// anything about the deployment/org-match/key is examined — see that file's
// header comment for why the order is load-bearing), then require the
// dialed number resolve to an ACTIVE deployment, then require that
// deployment's builderOrgId equals the :orgId route param (the cross-org
// guard), then require the org actually has a stored key.
//
// DELIBERATE DIVERGENCES from the platform route (do not "fix" these —
// they're the point of Tier 2, not oversights):
//   - Never metered. isMeteredCall(..., perOrgWebhook: true) always returns
//     false (voice-metering-orchestration.ts) — this tier is $0 SF fees, so
//     the metering modules (gateMeteredAccept/meterCallEnd/wallet-store) are
//     not even imported here, let alone called. No accept gate, no
//     low-balance hangup, no hang-up debit, no subaccount suspend hook.
//   - STRICT key usage: accept + the control WS run on ONLY this org's
//     stored `apiKey` — never process.env.OPENAI_API_KEY (the platform key)
//     as a fallback. A cross-project accept would fail anyway (the call
//     lives in the builder's OpenAI project, not SF's), so silently falling
//     back to the platform key would just paper over a misconfiguration
//     with a confusing failure mode later (or worse, quietly answer on the
//     wrong project). Strictness here is honesty: not_configured (403) is a
//     clearer signal than a fallback that doesn't actually work.
//   - No marketplace buyer-onboarding key resolution
//     (resolveDeploymentRuntimeKey) — that resolves the TEMPLATE OWNER's
//     key for a bought/marketplace agent; Tier 2 is explicitly "this org
//     runs it in THEIR OWN OpenAI project", so the org's own stored key is
//     the ONLY key in play, full stop.
//   - No legacy workspace-by-number fallback. The platform route falls
//     through to resolveVoiceContextByNumber (fromNumber-per-workspace) when
//     no deployment matches. Tier 2 has no such concept — a Tier-2 URL only
//     ever serves this org's deployments; no deployment match is a
//     definitive 404 (no_deployment), not a fallback.
//
// EVERYTHING ELSE (accept → after() → runVoiceCall wiring, transcript
// open/append/end, caller-ID → ctx.callerPhone, dialed/caller number
// extraction, logEvent shape) mirrors the platform route's deployment-path
// branch exactly — same primitives, same call-driving flow. Duplicating
// this thin wiring is a deliberate, in-scope tradeoff (per the task brief):
// a shared-extraction refactor across the two routes is explicitly ruled
// OUT of scope here.

import { after, NextResponse } from "next/server";
import { logEvent } from "@/lib/observability/log";
import {
  extractWebhookHeaders,
  verifyOpenAiWebhook,
} from "@/lib/agents/voice/openai-webhook-verify";
import { acceptCall, runVoiceCall } from "@/lib/agents/voice/openai-realtime";
import {
  extractDialedNumber,
  extractCallerNumber,
} from "@/lib/agents/voice/sip-headers";
import { resolveDeploymentByNumber } from "@/lib/agents/voice/resolve-deployment-by-number";
import { loadDeploymentVoiceContext } from "@/lib/agents/voice/deployment-voice";
import {
  startVoiceConversation,
  appendVoiceTurn,
  endVoiceConversation,
} from "@/lib/agents/voice/transcript";
import { getOrgOpenAiVoice } from "@/lib/telephony/openai-voice-store";
import { decideTier2Call } from "@/lib/agents/voice/tier2-auth";

// Node runtime (not edge) — same reason as the platform route: node:crypto
// for HMAC verification + the Node WebSocket/undici options bag for the
// realtime control socket (opened inside runVoiceCall).
export const runtime = "nodejs";

// Matches the platform route's ceiling — Vercel Pro/Enterprise allows up to
// 800s; clamped to 300 on Hobby automatically. Wall-clock budget for the
// whole invocation INCLUDING the after() WS hold.
export const maxDuration = 800;

// Webhooks must not be statically optimized / cached.
export const dynamic = "force-dynamic";

/** Shape of the `realtime.call.incoming` event we care about — identical to
 *  the platform route (same OpenAI webhook payload). */
type RealtimeIncomingEvent = {
  type?: string;
  data?: {
    call_id?: string;
    sip_headers?: Array<{ name?: string; value?: string }>;
  };
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orgId: string }> },
): Promise<Response> {
  const { orgId } = await params;

  // 1. Read the RAW body FIRST — the signature is computed over these exact
  //    bytes, same as the platform route. Parsing to JSON and re-serializing
  //    would change them and break verification.
  const rawBody = await request.text();

  logEvent("voice_call_incoming", { org_id: orgId, per_org_webhook: true }, { request });

  // 2. Load this org's Tier-2 OpenAI voice credentials. null (never
  //    configured, or a malformed row) is a normal outcome, NOT an error —
  //    we still run signature verification below with secret: undefined so
  //    the 401 (bad_signature) path wins over ever reaching the
  //    not-configured check with an unauthenticated request. This route
  //    must never 500 just because an org hasn't finished Tier-2 setup.
  const orgVoice = await getOrgOpenAiVoice(orgId).catch((err) => {
    logEvent(
      "voice_call_tier2_store_error",
      { org_id: orgId, error: err instanceof Error ? err.message : String(err) },
      { request, severity: "error" },
    );
    return null;
  });

  // 3. Verify the Standard Webhooks signature against THIS ORG's own
  //    whsec_ (never the platform OPENAI_WEBHOOK_SECRET) — the verifier is
  //    already secret-parameterized (openai-webhook-verify.ts:126), so this
  //    is a zero-refactor reuse, just a different secret per call site.
  const verification = verifyOpenAiWebhook({
    payload: rawBody,
    headers: extractWebhookHeaders(request.headers),
    secret: orgVoice?.webhookSecret,
  });

  // 4. Resolve the deployment for the dialed number BEFORE the auth
  //    decision — decideTier2Call's signature check runs first regardless
  //    (order is enforced inside the pure function, not by control flow
  //    here), but we need the resolved builderOrgId as an INPUT to that
  //    decision. sip_headers require parsing the body only far enough to
  //    read them — no JSON.parse of the full event is needed for this step,
  //    mirroring the platform route which also reads sip_headers off the
  //    raw event before any accept.
  let event: RealtimeIncomingEvent | null = null;
  try {
    event = JSON.parse(rawBody) as RealtimeIncomingEvent;
  } catch {
    // Malformed JSON. We still run the full decideTier2Call gate below (a
    // bad signature must still win with 401 over a bad-JSON 400 — same
    // "auth first" principle), then fall through to a 400 only on the
    // happy-auth path. Deployment resolution below simply gets a null
    // dialedNumber, which resolveDeploymentByNumber returns null for.
  }

  const dialedNumber = extractDialedNumber(event?.data?.sip_headers);

  const deployment = await resolveDeploymentByNumber(dialedNumber).catch((err) => {
    logEvent(
      "voice_call_tier2_deployment_resolve_error",
      { org_id: orgId, error: err instanceof Error ? err.message : String(err) },
      { request, severity: "error" },
    );
    return null;
  });

  // 5. THE gate. All four rejection branches + their strict order live in
  //    decideTier2Call (tier2-auth.ts) — TDD'd exhaustively. This route only
  //    supplies the four inputs and maps the result to a response; it must
  //    never itself decide differently than that pure function.
  const decision = decideTier2Call({
    orgId,
    verified: verification.ok,
    deploymentBuilderOrgId: deployment?.builderOrgId ?? null,
    storedKeyPresent: orgVoice !== null,
  });

  if (!decision.ok) {
    logEvent(
      "voice_call_tier2_rejected",
      { org_id: orgId, reason: decision.reason, dialed_number: dialedNumber },
      { request, status: decision.status, severity: "warn" },
    );
    return NextResponse.json({ error: decision.reason }, { status: decision.status });
  }

  logEvent("voice_call_tier2_authorized", { org_id: orgId }, { request });

  // Past this point `deployment` and `orgVoice` are both non-null — the gate
  // above required deploymentBuilderOrgId !== null (deployment resolved) and
  // storedKeyPresent (orgVoice !== null) to reach {ok:true}. Narrow them
  // explicitly rather than relying on control-flow narrowing across the
  // `decideTier2Call` boundary.
  const resolvedDeployment = deployment!;
  const resolvedOrgVoice = orgVoice!;

  if (!event || event.type !== "realtime.call.incoming") {
    // Non-incoming events (or unparsable bodies) are ACK'd 200 so OpenAI
    // doesn't retry — same as the platform route's "ignore, don't 4xx"
    // stance for event types we don't drive a call from.
    logEvent(
      "voice_call_tier2_ignored_event",
      { org_id: orgId, event_type: event?.type ?? null },
      { request },
    );
    return NextResponse.json({ received: true });
  }

  const callId = event.data?.call_id?.trim();
  if (!callId) {
    logEvent(
      "voice_call_tier2_missing_call_id",
      { org_id: orgId },
      { request, status: 400, severity: "warn" },
    );
    return NextResponse.json({ error: "missing_call_id" }, { status: 400 });
  }

  // 6. ACK the webhook fast, then accept + drive the call in ONE background
  //    task — same accept/WS-open adjacency requirement as the platform
  //    route (see its giant comment on `after()`): OpenAI tears down an
  //    un-controlled SIP call quickly, so accept and opening the control WS
  //    must stay sub-second apart.
  after(async () => {
    logEvent("voice_call_tier2_background_start", { org_id: orgId, call_id: callId });
    try {
      // STRICT key usage — ONLY this org's own stored apiKey, NEVER
      // process.env.OPENAI_API_KEY. See the file-header comment for why a
      // platform-key fallback would be actively wrong here (cross-project).
      const accepted = await acceptCall({ callId, apiKey: resolvedOrgVoice.apiKey });
      if (!accepted.ok) {
        logEvent(
          "voice_call_tier2_accept_failed",
          {
            org_id: orgId,
            call_id: callId,
            accept_status: accepted.status,
            accept_body: accepted.body.slice(0, 500),
          },
          { severity: "error" },
        );
        return;
      }
      logEvent("voice_call_tier2_accepted", {
        org_id: orgId,
        call_id: callId,
        accept_status: accepted.status,
      });

      const callerNumber = extractCallerNumber(event.data?.sip_headers);

      const dctx = await loadDeploymentVoiceContext({
        deployment: resolvedDeployment,
        now: new Date(),
      }).catch((err) => {
        logEvent(
          "voice_call_tier2_compose_error",
          {
            org_id: orgId,
            call_id: callId,
            error: err instanceof Error ? err.message : String(err),
          },
          { severity: "error" },
        );
        return null;
      });

      if (!dctx) {
        // Template missing/deleted since the deployment resolved — same
        // degrade-to-nothing-rather-than-drop stance the platform route
        // takes, except Tier 2 has no workspace fallback to fall through
        // to: the accepted SIP leg is left to the caller's own timeout /
        // OpenAI's default handling rather than answering with a
        // no-context greeting under the WRONG (or no) persona.
        logEvent(
          "voice_call_tier2_no_context",
          { org_id: orgId, call_id: callId, deployment_id: resolvedDeployment.id },
          { severity: "error" },
        );
        return;
      }

      if (callerNumber) {
        dctx.ctx.callerPhone = callerNumber;
      }

      const conversationId = await startVoiceConversation({
        agentId: dctx.transcriptAgentId,
        orgId: dctx.transcriptOrgId,
        callId,
        fromNumber: callerNumber ?? undefined,
        toNumber: dialedNumber ?? undefined,
      });

      let turnIndex = 0;
      const cid = conversationId;
      const transcriptCallbacks = cid
        ? {
            onUserTurn: (text: string) => {
              void appendVoiceTurn({ conversationId: cid, turnIndex: turnIndex++, role: "user", content: text });
            },
            onAssistantTurn: (text: string) => {
              void appendVoiceTurn({ conversationId: cid, turnIndex: turnIndex++, role: "assistant", content: text });
            },
            onCallEnd: () => {
              void endVoiceConversation({ conversationId: cid, turnCount: turnIndex });
            },
          }
        : {};

      // NEVER METERED (Tier 2 is $0 SF fees) — no gateMeteredAccept, no
      // meterCallEnd, no wallet debit, no subaccount suspend hook. The WS
      // open runs on the org's own key against the org's own OpenAI
      // project; billing for the call itself is between the builder and
      // OpenAI directly.
      await runVoiceCall({
        callId,
        apiKey: resolvedOrgVoice.apiKey,
        toolContext: dctx.ctx,
        instructions: dctx.instructions,
        audioVoice: dctx.audioVoice,
        greeting: dctx.greeting,
        ...transcriptCallbacks,
      });
    } catch (err) {
      // Belt-and-suspenders: a background throw must never bubble (nothing
      // is listening once the response has flushed) — same as the platform
      // route.
      logEvent(
        "voice_call_tier2_background_error",
        { org_id: orgId, call_id: callId, error: err instanceof Error ? err.message : String(err) },
        { severity: "error" },
      );
    }
  });

  // 7. ACK the webhook immediately so OpenAI considers delivery successful.
  return NextResponse.json({ received: true, call_id: callId });
}
