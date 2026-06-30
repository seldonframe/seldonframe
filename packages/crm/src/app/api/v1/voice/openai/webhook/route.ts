// OpenAI Realtime SIP webhook — PHASE 0 voice hello-world.
//
// This is the public entry point for the inbound-call pipe:
//
//   Caller dials Twilio number
//     → Twilio Elastic SIP Trunk routes the leg to
//       sip:<project-id>@sip.api.openai.com;transport=tls
//     → OpenAI fires `realtime.call.incoming` to THIS webhook (signed)
//     → we verify the signature, POST /v1/realtime/calls/{id}/accept
//       (model gpt-realtime-2 + voice + hard-coded greeting persona)
//     → we respond 200 fast, then hold the realtime control WS in the
//       background (Next's `after()` → Fluid Compute keeps the instance
//       alive up to maxDuration) and let gpt-realtime-2 run the call.
//
// WHY accept-then-after (not hold-the-WS-inside-the-request): OpenAI expects a
// prompt 2xx on the webhook delivery; holding the socket inside the request and
// never responding would trip webhook delivery timeouts/retries. Fluid Compute
// explicitly supports post-response background work, so we ACK the webhook and
// move the long-lived WS into `after()`. The function instance survives for the
// call (sub-5-min for Phase 0) under the configured maxDuration.
//
// FLUID COMPUTE / DURATION:
//   maxDuration is set to 800 (Vercel Pro/Enterprise ceiling). On Hobby the
//   platform clamps this to 300 (5 min) — still fine for Phase 0's sub-5-min
//   calls. The in-code MAX_CALL_MS (4 min) closes the WS ourselves before the
//   platform would, so calls end with a clean log line, not a 504.
//
// HARD BOUNDARIES (Phase 0): no tools, no DB writes, no per-workspace agent
// resolution, no outbound calling, no audio relay. Just prove the pipe.

import { after, NextResponse } from "next/server";
import { logEvent } from "@/lib/observability/log";
import {
  extractWebhookHeaders,
  verifyOpenAiWebhook,
} from "@/lib/agents/voice/openai-webhook-verify";
import {
  acceptCall,
  runVoiceCall,
  buildPostCallSmsBody,
} from "@/lib/agents/voice/openai-realtime";
import {
  resolveVoiceContextByNumber,
  loadVoicePersonaInputs,
} from "@/lib/agents/voice/voice-workspace";
import {
  extractDialedNumber,
  extractCallerNumber,
} from "@/lib/agents/voice/sip-headers";
import { sendSmsFromApi } from "@/lib/sms/api";
import { composeVoicePersona } from "@/lib/agents/voice/persona";
import {
  loadAgentBrainContext,
  recordAgentBrainOutcome,
} from "@/lib/agents/brain-context";
import {
  startVoiceConversation,
  appendVoiceTurn,
  endVoiceConversation,
} from "@/lib/agents/voice/transcript";
// ICP-3 — deployment voice path (strictly ADDITIVE). Tried FIRST; falls through
// to the existing workspace resolution below when no active deployment matches.
import { resolveDeploymentByNumber } from "@/lib/agents/voice/resolve-deployment-by-number";
import { loadDeploymentVoiceContext } from "@/lib/agents/voice/deployment-voice";
// Task 12 (marketplace buyer onboarding) — route a deployment's voice call to the
// BUILDER's (template author's) OpenAI key first, fail-soft to the platform key.
import {
  resolveDeploymentRuntimeKey,
  buildDefaultDeploymentRuntimeKeyDeps,
} from "@/lib/agents/deployment-ai-key-runtime";

// Node runtime (not edge) — we use node:crypto for HMAC and the Node global
// WebSocket/undici options bag for the realtime control socket.
export const runtime = "nodejs";

// Vercel Pro/Enterprise ceiling. Clamped to 300 on Hobby automatically. This is
// the wall-clock budget for the whole invocation INCLUDING the after() WS hold.
export const maxDuration = 800;

// Webhooks must not be statically optimized / cached.
export const dynamic = "force-dynamic";

/**
 * Shape of the `realtime.call.incoming` event we care about. We only read
 * `type` and `data.call_id`; everything else (sip_headers, etc.) is ignored in
 * Phase 0.
 */
type RealtimeIncomingEvent = {
  type?: string;
  data?: {
    call_id?: string;
    sip_headers?: Array<{ name?: string; value?: string }>;
  };
};

export async function POST(request: Request): Promise<Response> {
  // 1. Read the RAW body FIRST — the signature is computed over these exact
  //    bytes. Parsing to JSON and re-serializing would change them and break
  //    verification.
  const rawBody = await request.text();

  logEvent("voice_call_incoming", {}, { request });

  // 2. Verify the Standard Webhooks signature against OPENAI_WEBHOOK_SECRET.
  const verification = verifyOpenAiWebhook({
    payload: rawBody,
    headers: extractWebhookHeaders(request.headers),
    secret: process.env.OPENAI_WEBHOOK_SECRET,
  });

  if (!verification.ok) {
    logEvent(
      "voice_call_signature_rejected",
      { reason: verification.reason },
      { request, status: 401, severity: "warn" }
    );
    // 401 for auth failures; 400 when the server simply isn't configured yet
    // (missing secret) so a misconfig is distinguishable in the logs.
    const status = verification.reason === "missing_secret" ? 400 : 401;
    return NextResponse.json({ error: verification.reason }, { status });
  }

  logEvent("voice_call_signature_verified", {}, { request });

  // 3. Parse the (now-trusted) body.
  let event: RealtimeIncomingEvent;
  try {
    event = JSON.parse(rawBody) as RealtimeIncomingEvent;
  } catch {
    logEvent("voice_call_bad_json", {}, { request, status: 400, severity: "warn" });
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Only `realtime.call.incoming` drives the accept flow. ACK anything else
  // 200 so OpenAI doesn't retry events we don't handle in Phase 0.
  if (event.type !== "realtime.call.incoming") {
    logEvent("voice_call_ignored_event", { event_type: event.type ?? null }, { request });
    return NextResponse.json({ received: true });
  }

  const callId = event.data?.call_id?.trim();
  if (!callId) {
    logEvent("voice_call_missing_call_id", {}, { request, status: 400, severity: "warn" });
    return NextResponse.json({ error: "missing_call_id" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logEvent(
      "voice_call_missing_api_key",
      { call_id: callId },
      { request, status: 500, severity: "error" }
    );
    return NextResponse.json({ error: "missing_api_key" }, { status: 500 });
  }

  // PHASE 2 A1 diagnostic — surface the SIP headers so we can confirm which
  // one carries the dialed (To) number before wiring number→workspace routing.
  logEvent("voice_call_sip_headers", {
    call_id: callId,
    sip_headers: (event.data?.sip_headers ?? []).map((h) => ({
      name: h.name ?? null,
      value: typeof h.value === "string" ? h.value.slice(0, 200) : null,
    })),
  });

  // 4. ACK the webhook fast, then accept + drive the call in ONE background
  //    task. CRITICAL ordering fix (2026-06-01): accept and the control-WS open
  //    MUST be adjacent. The previous revision accepted synchronously here in
  //    the request, then opened the WS in after() — leaving a ~5s gap (after()
  //    start latency) during which OpenAI tore the un-controlled SIP call down,
  //    so the WS upgrade 404'd "call not found" (call_id gone stale). Doing
  //    accept → runVoiceCall in the SAME after() callback keeps them sub-second
  //    apart, so the call_id is still live when the control WS attaches.
  //
  //    The webhook's 200 ACK below is independent of accept — OpenAI's delivery
  //    only needs the prompt 2xx; the SIP leg keeps ringing until accept fires a
  //    beat later. `voice_call_background_start` makes the after() start latency
  //    visible in the logs so we can see exactly how long the gap was.
  after(async () => {
    logEvent("voice_call_background_start", { call_id: callId });
    try {
      const accepted = await acceptCall({ callId, apiKey });
      if (!accepted.ok) {
        logEvent(
          "voice_call_accept_failed",
          {
            call_id: callId,
            accept_status: accepted.status,
            accept_body: accepted.body.slice(0, 500),
          },
          { severity: "error" }
        );
        return;
      }
      logEvent("voice_call_accepted", {
        call_id: callId,
        accept_status: accepted.status,
        // The accept body + headers are the key diagnostics for the WS "No
        // session found" 404: the body shows what /accept created (session id /
        // status / a warning despite 200); the headers show the project / org /
        // request-id it ran under (to rule the project-mismatch theory in/out).
        accept_body: accepted.body ? accepted.body.slice(0, 800) : null,
        accept_headers: accepted.headers,
      });

      // PHASE 2 — resolve the workspace FROM THE DIALED NUMBER (the Diversion
      // header carries the called Twilio DID; the To header is the OpenAI project
      // URI). Falls back to the env slug, then to a tool-less greeting. Then
      // compose a per-workspace persona from that workspace's soul and open a
      // transcript. All best-effort: a miss degrades to a working greeting, never
      // a dropped call.
      const dialedNumber = extractDialedNumber(event.data?.sip_headers);
      // META loop — extract the caller's own number for the post-call follow-up SMS.
      // From / P-Asserted-Identity SIP headers carry it. Null for anonymous callers.
      const callerNumber = extractCallerNumber(event.data?.sip_headers);

      // ── ICP-3 deployment voice path (strictly ADDITIVE) ──────────────────
      // Try the DEPLOYMENT path FIRST: an inbound call to a DEPLOYMENT's number
      // is answered by that deployment's agent TEMPLATE and books into the
      // builder's workspace. If NO active deployment matches the dialed number,
      // we fall through COMPLETELY UNCHANGED to the existing workspace
      // resolution below (the live 839 line — a workspace fromNumber, not a
      // deployment — still resolves there exactly as before). Best-effort: a
      // resolve/compose error logs + falls through rather than dropping the call.
      const deployment = await resolveDeploymentByNumber(dialedNumber).catch(
        (err) => {
          logEvent(
            "voice_call_deployment_resolve_error",
            { call_id: callId, error: err instanceof Error ? err.message : String(err) },
            { severity: "error" },
          );
          return null;
        },
      );

      if (deployment) {
        logEvent("voice_call_deployment_resolved", {
          call_id: callId,
          deployment_id: deployment.id,
          dialed_number: dialedNumber,
          builder_org_id: deployment.builderOrgId,
          agent_template_id: deployment.agentTemplateId,
        });

        // Compose the persona from the agent TEMPLATE blueprint + the builder
        // org's soul/timezone/intake; scope tools to the builder org (real
        // booking). Null → the template is missing; fall through to the existing
        // path rather than dropping the call.
        const dctx = await loadDeploymentVoiceContext({
          deployment,
          now: new Date(),
        }).catch((err) => {
          logEvent(
            "voice_call_deployment_compose_error",
            { call_id: callId, error: err instanceof Error ? err.message : String(err) },
            { severity: "error" },
          );
          return null;
        });

        if (dctx) {
          // Caller-ID → tool context (same as the workspace path): auto-fill the
          // contact phone so book_appointment never has to ask. Anonymous callers
          // leave it undefined.
          if (callerNumber) {
            dctx.ctx.callerPhone = callerNumber;
          }

          // Open the transcript against the BUILDER org (no deployment_id column
          // yet — a later refinement). Best-effort: null on failure.
          const depConversationId = await startVoiceConversation({
            agentId: dctx.transcriptAgentId,
            orgId: dctx.transcriptOrgId,
            callId,
            fromNumber: callerNumber ?? undefined,
            toNumber: dialedNumber ?? undefined,
          });

          let depTurnIndex = 0;
          const depCid = depConversationId;
          const depTranscriptCallbacks = depCid
            ? {
                onUserTurn: (text: string) => {
                  void appendVoiceTurn({ conversationId: depCid, turnIndex: depTurnIndex++, role: "user", content: text });
                },
                onAssistantTurn: (text: string) => {
                  void appendVoiceTurn({ conversationId: depCid, turnIndex: depTurnIndex++, role: "assistant", content: text });
                },
                onCallEnd: () => {
                  void endVoiceConversation({ conversationId: depCid, turnCount: depTurnIndex });
                },
              }
            : {};

          // BUILDER-KEY ROUTING (marketplace buyer onboarding, Task 12): a
          // deployment runs the BUILDER's (template author's) agent, so the OpenAI
          // Realtime key should be the BUILDER's — resolved from the deployment's
          // TEMPLATE owner org (NOT deployment.builderOrgId, which is the BUYER for
          // a bought agent) — and only fail-soft to the platform key. Best-effort:
          // any resolve error degrades to the platform `apiKey` (never drops the
          // call). `source`/`ready` are logged so a builder with NO key (ready:
          // false) is visible — the call still answers on the platform key when one
          // exists; only with NO key anywhere does it stay unanswered.
          const depKey = await resolveDeploymentRuntimeKey(
            // A number-resolved deployment is a voice (phone) surface by
            // definition; pass it explicitly (the narrow row omits `surface`).
            { surface: "phone", agentTemplateId: deployment.agentTemplateId },
            {
              ...buildDefaultDeploymentRuntimeKeyDeps(),
              platform: { openai: apiKey, anthropic: process.env.ANTHROPIC_API_KEY ?? null },
            },
          ).catch(() => null);
          const voiceApiKey = depKey?.apiKey ?? apiKey;
          logEvent("voice_call_deployment_key_resolved", {
            call_id: callId,
            deployment_id: deployment.id,
            key_source: depKey?.source ?? "platform",
            key_ready: depKey?.ready ?? Boolean(apiKey),
          });

          await runVoiceCall({
            callId,
            apiKey: voiceApiKey,
            toolContext: dctx.ctx,
            instructions: dctx.instructions,
            audioVoice: dctx.audioVoice,
            greeting: dctx.greeting,
            ...depTranscriptCallbacks,
          });
          return; // deployment handled the call — do NOT run the workspace path.
        }
        // dctx === null → fall through to the existing workspace path below.
      }
      // ── end ICP-3 deployment voice path ──────────────────────────────────

      const resolved = await resolveVoiceContextByNumber({ dialedNumber }).catch((err) => {
        logEvent(
          "voice_call_workspace_resolve_error",
          { call_id: callId, error: err instanceof Error ? err.message : String(err) },
          { severity: "error" }
        );
        return null;
      });

      let instructions: string | undefined;
      let audioVoice: string | undefined;
      let greeting: string | undefined;
      let conversationId: string | null = null;
      let turnIndex = 0;
      // Stage B — brain patterns consumed this call (fed back on a booking win)
      // + the vertical for the outcome row.
      let brainNoteIds: string[] = [];
      let vertical: string | null = null;
      // META loop — business name for the post-call SMS (loaded with persona inputs).
      let smsBusinessName: string | null = null;
      // META loop — true only on the agency's own workspace (blueprint flag):
      // pitch SeldonFrame + link to the demo qualifier. Clients → clean nudge.
      let smsMetaPitch = false;

      if (resolved?.ok) {
        logEvent("voice_call_workspace_resolved", {
          call_id: callId,
          resolved_by: resolved.resolvedBy,
          dialed_number: dialedNumber,
          org_id: resolved.ctx.orgId,
          org_slug: resolved.ctx.orgSlug,
          agent_id: resolved.ctx.agentId,
          conversation_id: resolved.ctx.conversationId,
        });

        // Caller-ID → tool context. The inbound call already carries the
        // caller's number; stamp it on the tool-execution context so
        // book_appointment auto-fills the contact phone (the agent never has to
        // ask). Only set it when present — anonymous/blocked callers leave it
        // undefined, and the booking tools then behave exactly as before.
        if (callerNumber) {
          resolved.ctx.callerPhone = callerNumber;
        }

        // Per-workspace persona (soul + skill registry + workspace timezone) and
        // per-agent TTS voice. Best-effort: a failure falls back to the built-in
        // SDR persona/voice inside runVoiceCall.
        try {
          const personaInputs = await loadVoicePersonaInputs(
            resolved.ctx.orgId,
            resolved.ctx.agentId,
          );
          // Workspace timezone → tool context. The booking/reschedule read-backs
          // format the spoken slot time in this zone so the caller hears
          // "June 25 at 9:00 AM EDT", never the raw UTC ISO. (loadVoicePersonaInputs
          // always returns a concrete zone, defaulting to "UTC".)
          resolved.ctx.timezone = personaInputs.timezone;
          // Stage B READ — load learned patterns (readBrainNote ticks `uses`),
          // inject them into the persona, and remember the consumed ids so a
          // booking win can bump exactly those notes' confidence.
          const brain = await loadAgentBrainContext({ orgId: resolved.ctx.orgId });
          brainNoteIds = brain.consumedNoteIds;
          const soulRec = personaInputs.soul as Record<string, unknown> | null;
          vertical = typeof soulRec?.industry === "string" ? soulRec.industry : null;
          // META loop — capture business name for the post-call SMS body.
          smsBusinessName =
            (typeof soulRec?.businessName === "string" && soulRec.businessName.trim()) ||
            (typeof soulRec?.business_name === "string" && soulRec.business_name.trim()) ||
            null;
          // META loop — the agency's own workspace flips this on (blueprint flag).
          smsMetaPitch = personaInputs.blueprint?.postCallMetaPitch === true;
          instructions = composeVoicePersona({
            soul: personaInputs.soul,
            blueprint: personaInputs.blueprint,
            timezone: personaInputs.timezone,
            now: new Date(),
            // Voice R1 — collect exactly the fields THIS workspace declares.
            intakeFields: personaInputs.intakeFields,
            brainNotes: brain.notes,
            // Voice R1+ — when the caller ID gave us a number, tell the agent not
            // to ask for the phone (it's auto-captured). Anonymous → ask normally.
            callerPhoneKnown: !!callerNumber,
          });
          audioVoice = personaInputs.blueprint.voice;
          greeting = personaInputs.blueprint.greeting;
        } catch (err) {
          logEvent(
            "voice_call_persona_compose_error",
            { call_id: callId, error: err instanceof Error ? err.message : String(err) },
            { severity: "warn" }
          );
        }

        // Open the transcript conversation (best-effort — null on failure).
        // Persist the caller's number (caller ID) as channel_meta.from_number so
        // the operator sees who phoned — null for anonymous/blocked callers.
        conversationId = await startVoiceConversation({
          agentId: resolved.ctx.agentId,
          orgId: resolved.ctx.orgId,
          callId,
          fromNumber: callerNumber ?? undefined,
          toNumber: dialedNumber ?? undefined,
        });
      } else {
        logEvent(
          "voice_call_workspace_unresolved",
          {
            call_id: callId,
            resolved_by: resolved ? resolved.resolvedBy : "resolve_threw",
            dialed_number: dialedNumber,
          },
          { severity: "warn" }
        );
      }

      // Transcript callbacks persist each turn when a conversation row was
      // created. `cid` is a const so it stays narrowed to `string` inside the
      // closures (no non-null assertion needed).
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

      // Stage B WRITE — on a landed booking, record a brain "win" against the
      // patterns this call consumed. `winOrgId` is a const so it stays narrowed
      // to `string` inside the closure (no non-null assertion).
      const winOrgId = resolved?.ok ? resolved.ctx.orgId : null;
      const onBookingCompleted = winOrgId
        ? () => {
            void recordAgentBrainOutcome({
              orgId: winOrgId,
              vertical,
              eventType: "voice_booking",
              outcome: "win",
              noteIds: brainNoteIds,
              context: { dialed_number: dialedNumber, call_id: callId },
            });
          }
        : undefined;

      // META loop — post-call follow-up SMS. Fires when the call ends (any
      // reason). Requires: a resolved workspace (orgId), a valid caller number
      // (not anonymous), and the workspace's Twilio credentials (sendSmsFromApi
      // throws if fromNumber is not configured — caught below).
      // Best-effort: wrapped in try/catch, never blocks call teardown.
      const smsOrgId = resolved?.ok ? resolved.ctx.orgId : null;
      const smsOrgSlug = resolved?.ok ? resolved.ctx.orgSlug : null;
      const onPostCallSms =
        smsOrgId && smsOrgSlug && callerNumber
          ? () => {
              const baseDomain =
                process.env.WORKSPACE_BASE_DOMAIN?.trim() || "app.seldonframe.com";
              // META loop (agency's own workspace) → the brand booking URL.
              // seldonstudio.com/book is a redirect (on the marketing site) to
              // this workspace's /book. Clients → their own subdomain calendar.
              const bookUrl = smsMetaPitch
                ? "https://seldonstudio.com/book"
                : `https://${smsOrgSlug}.${baseDomain}/book`;
              const businessName = smsBusinessName || "us";
              const body = buildPostCallSmsBody({
                businessName,
                bookUrl,
                includeMetaPitch: smsMetaPitch,
              });
              void (async () => {
                try {
                  await sendSmsFromApi({
                    orgId: smsOrgId,
                    userId: null,
                    contactId: null,
                    toNumber: callerNumber,
                    body,
                  });
                  logEvent("voice_call_post_call_sms_sent", {
                    call_id: callId,
                    org_id: smsOrgId,
                    to: callerNumber,
                  });
                } catch (err) {
                  logEvent(
                    "voice_call_post_call_sms_failed",
                    {
                      call_id: callId,
                      org_id: smsOrgId,
                      to: callerNumber,
                      error: err instanceof Error ? err.message : String(err),
                    },
                    { severity: "warn" },
                  );
                }
              })();
            }
          : undefined;

      if (callerNumber && !smsOrgId) {
        logEvent("voice_call_post_call_sms_skipped", {
          call_id: callId,
          reason: "no_resolved_workspace",
        });
      }

      // WS open happens immediately inside runVoiceCall — adjacent to accept.
      // Tools + per-workspace persona + per-agent voice are passed only when the
      // workspace resolved; otherwise the call falls back to the greeting persona.
      await runVoiceCall({
        callId,
        apiKey,
        toolContext: resolved?.ok ? resolved.ctx : undefined,
        instructions,
        audioVoice,
        greeting,
        onBookingCompleted,
        onPostCallSms,
        ...transcriptCallbacks,
      });
    } catch (err) {
      // Belt-and-suspenders: a background throw must never bubble (nothing is
      // listening once the response has flushed).
      logEvent(
        "voice_call_background_error",
        { call_id: callId, error: err instanceof Error ? err.message : String(err) },
        { severity: "error" }
      );
    }
  });

  // 5. ACK the webhook immediately so OpenAI considers delivery successful.
  //    (This also means the dashboard "Send test event" now gets a 200 instead
  //    of the old 400 — accept runs in the background, decoupled from the ACK.)
  return NextResponse.json({ received: true, call_id: callId });
}
