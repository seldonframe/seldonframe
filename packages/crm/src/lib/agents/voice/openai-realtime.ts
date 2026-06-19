// OpenAI Realtime (SIP) call driver — PHASE 0 hello-world.
//
// Scope (deliberately tiny — this proves the transport, nothing more):
//   1. accept the inbound SIP call    → POST /v1/realtime/calls/{id}/accept
//   2. open the realtime control WS    → wss://api.openai.com/v1/realtime?call_id=
//   3. push the greeting persona       → session.update
//   4. make the agent speak first      → response.create
//   5. let gpt-realtime-2 run the call  (audio bridges over SIP automatically;
//      we relay NOTHING — no audio frames cross this WS, OpenAI handles both
//      legs once the call is accepted)
//   6. hang up gracefully on goodbye / max-turn cap / timeout
//
// NO tools, NO DB, NO per-workspace logic, NO audio relay. Phase 1+ adds the
// tool bridge (see realtime-tools.ts), Phase 2 adds persistence + per-workspace
// persona resolution.
//
// Transport choice: the `ws` npm package for the control WebSocket (its
// constructor supports an options bag with `headers`, which is how OpenAI's
// realtime WS authenticates), and the Node global `fetch` for the accept call.
//
// WHY `ws` and not the global `WebSocket`: the WHATWG/undici global
// `WebSocket` constructor is `new WebSocket(url, protocols)` — it has NO 3rd
// `options` argument and silently DROPS anything passed there. An earlier
// Phase 0 revision assumed the global accepted `{ headers }` as a 3rd arg, so
// the `Authorization: Bearer <key>` header was never transmitted and OpenAI
// rejected the upgrade with a non-101 status (the call torn down at 0s). The
// `ws` package's `new WebSocket(address, options)` form actually sends the
// header. `ws` is already an (indirect) dependency in the tree; we make it a
// direct dependency so this import is legitimate.

import WsWebSocket from "ws";

import { logEvent } from "@/lib/observability/log";
import {
  ALL_TOOLS,
  type AgentTool,
  type ToolExecuteContext,
} from "../tools";
import {
  executeVoiceToolCall as defaultExecuteVoiceToolCall,
  toRealtimeFunctionTools,
} from "./realtime-tools";
import {
  buildFunctionCallOutputItem,
  parseFunctionCalls,
} from "./realtime-function-calls";

const OPENAI_API_BASE = "https://api.openai.com";
const OPENAI_REALTIME_WS_BASE = "wss://api.openai.com/v1/realtime";

/**
 * The voice-exposed tool subset. SIX of the seven `ALL_TOOLS` — we EXCLUDE
 * `provide_faq_answer`: it's a v1.26 placeholder whose execute() always returns
 * an empty match list (the text runtime injects the operator's FAQ into the
 * system prompt instead of calling it). Exposing it as a callable function over
 * voice is dead weight — it would burn a model turn to get `{ matches: [] }`.
 * If FAQ behavior is wanted on voice, append the workspace's FAQ to the
 * `instructions` text (Phase 2), don't make it a tool.
 */
export const VOICE_TOOLS: AgentTool[] = ALL_TOOLS.filter(
  (tool) => tool.name !== "provide_faq_answer",
);

/**
 * Phase 1 SDR persona for the voice agent. A concise, voice-tuned distillation
 * of the website-chatbot SDR playbook (lib/agents/skills/website-chatbot/sdr.ts)
 * — kept short for Phase 1 (a long prompt is read aloud slowly by TTS and isn't
 * needed to prove the tool loop). Phase 2 swaps this for per-workspace persona
 * resolution off the dialed number.
 *
 * The booking-tool CALL ORDER is spelled out because it's load-bearing: the
 * model must call look_up_availability FIRST, READ the slot's `label` aloud
 * (it's already in the business's local timezone), and pass that slot's `iso`
 * VERBATIM into book_appointment. Speaking the raw iso or converting times by
 * hand books/quotes the wrong time across timezones — the empirical bug that
 * had the agent say "5pm" for a 10am-Pacific slot (see tools.ts formatSlotLabel).
 */
export const VOICE_SDR_INSTRUCTIONS =
  "You are a warm, efficient phone receptionist for the business. Speak in " +
  "short, natural sentences — this is a live phone call. Your job is to help " +
  "the caller book an appointment or answer a quick question, then close the " +
  "loop. " +
  "You can check real availability and book real appointments with your tools. " +
  "To book: FIRST call look_up_availability with the date the caller wants " +
  "(format YYYY-MM-DD) to get real open slots. Each slot has a `label` — the " +
  "time ALREADY in the business's local timezone (e.g. 'Monday, June 1 at " +
  "10:00 AM PDT') — and an `iso`. Read back one or two slots using the `label` " +
  "exactly; never say the iso, and never convert or invent a time yourself (the " +
  "label is already correct). Once the caller picks one, collect their full name " +
  "and email and call book_appointment, passing that slot's `iso` EXACTLY as " +
  "given. Confirm the slot's label back to the caller before booking. " +
  "If the caller wants to change or cancel an existing appointment, use " +
  "find_my_existing_appointment with their email first, then " +
  "reschedule_appointment or cancel_appointment. " +
  "If you can't help or the caller asks for a person, use escalate_to_human. " +
  "Never read tool names or JSON aloud. If the caller says goodbye, thank them " +
  "and end the call.";

/**
 * Voice for the realtime session. Set via `session.update` under
 * `audio.output.voice` (NOT in the /accept body — a top-level `voice` at accept
 * breaks session creation; see acceptCall).
 * cedar/marin are the newest gpt-realtime voices; if OpenAI rejects cedar for this model, "sage" is the safe fallback.
 */
export const VOICE_AUDIO_OUTPUT_VOICE = "cedar";

/**
 * The exact model id used for the call. Confirmed from the OpenAI Realtime SIP
 * guide's accept-call example (`"model": "gpt-realtime-2"`). Centralised here so
 * a model bump is a one-line change.
 */
export const VOICE_MODEL = "gpt-realtime-2";

/** Voice for the greeting. cedar/marin are the newest gpt-realtime voices; if OpenAI rejects cedar for this model, "sage" is the safe fallback. */
export const VOICE_NAME = "cedar";

/**
 * The hard-coded Phase 0 / fallback persona — used when no per-workspace persona
 * can be composed (unresolved workspace or persona-compose error). Warm, concise,
 * receptionist-style; greets by business context, offers concrete help, and ends
 * politely. Phase 2 replaces this with per-workspace agent resolution.
 */
export const PHASE0_GREETING_INSTRUCTIONS =
  "You are a warm, helpful phone receptionist. Greet the caller by saying " +
  "'Thanks for calling — how can I help you today?' Keep every reply short " +
  "and natural (one or two sentences). You can answer questions about the " +
  "business, help the caller book an appointment, or connect them to the right " +
  "person. If the caller asks to book, offer to take their name and preferred " +
  "time and let them know someone will confirm shortly. Always be friendly and " +
  "unhurried. If the caller says goodbye, thank them warmly and end the call.";

/**
 * Accept-time instructions. The model must NOT greet at /accept: the call's
 * per-agent voice (e.g. Cedar) and the per-workspace persona are only applied
 * later over the control WS (session.update sets audio.output.voice + the real
 * persona, then a single response.create delivers the greeting). A greeting at
 * /accept would therefore land in the WRONG voice AND collide with the WS
 * greeting — the "double hello" operators reported. So we hold the model silent
 * until the WS turn fires (within a moment of connect). Used ONLY at /accept;
 * PHASE0_GREETING_INSTRUCTIONS stays the no-tools WS fallback persona.
 */
export const PHASE0_ACCEPT_INSTRUCTIONS =
  "Do not speak yet. Stay completely silent and do not greet or respond to the " +
  "caller. Your full persona and your greeting instruction arrive over the " +
  "control channel within a moment of the call connecting — wait for them, then " +
  "greet the caller exactly once.";

/**
 * Safety cap on assistant turns. gpt-realtime-2 normally ends the call itself
 * when the caller says goodbye (via the persona instruction), but this is a
 * belt-and-suspenders ceiling so a stuck/looping call can't pin the function
 * open until maxDuration. Phase 0 is a hello-world: a handful of turns proves
 * the pipe.
 */
export const MAX_ASSISTANT_TURNS = 12;

/**
 * Build the body of the post-call follow-up SMS sent to the caller after a
 * voice call ends. Pure function — no I/O, no side effects. Unit-tested.
 *
 * Two variants, gated per-workspace by `includeMetaPitch`
 * (blueprint.postCallMetaPitch):
 *   - false (default — CLIENT workspaces): a clean, on-brand booking nudge with
 *     NO mention of SeldonFrame. A client's customer must never receive our ad.
 *   - true (the agency's OWN lead-gen workspace, e.g. Seldon Studio): the META
 *     loop — the text itself is the demo, pitching the prospect on getting it.
 * `bookUrl` should be the full `https://` URL.
 */
export function buildPostCallSmsBody(params: {
  businessName: string;
  bookUrl: string;
  includeMetaPitch?: boolean;
}): string {
  const { businessName, bookUrl, includeMetaPitch = false } = params;
  if (includeMetaPitch) {
    // The agency's own funnel: the text itself demonstrates the product.
    return (
      `Thanks for calling ${businessName}! 🙏 Want your own AI receptionist that texts back ` +
      `your missed calls like this? Reply DEMO or book a demo at ${bookUrl}`
    );
  }
  // Client workspaces: a clean booking nudge, no SeldonFrame mention.
  return (
    `Thanks for calling ${businessName}! 🙏 ` +
    `Book or reschedule anytime here: ${bookUrl} — we look forward to seeing you!`
  );
}

/**
 * Hard wall-clock cap (ms) for a single call's WS hold. Kept under the Vercel
 * function `maxDuration` so we close the socket ourselves with a clean log
 * line rather than getting killed mid-call by a FUNCTION_INVOCATION_TIMEOUT.
 * Phase 0 = sub-5-min calls; 4 min leaves headroom under a 300s/800s ceiling.
 */
export const MAX_CALL_MS = 4 * 60 * 1000;

/**
 * Goodbye-detection pattern. Shared by BOTH caller-transcript code paths so the
 * literal is defined exactly once:
 *   1. the (legacy / fallback) `conversation.item.input_audio_transcription.completed`
 *      handler, and
 *   2. the out-of-band caller transcript that comes back as `response.output_text`.
 * On the OpenAI Realtime SIP path (1) never fires, so (2) is the live source of
 * caller text; keeping the same regex means a spoken "goodbye" closes the call
 * identically regardless of which path delivered the transcript.
 */
export const CALLER_GOODBYE_RE =
  /\b(good ?bye|bye|that'?s all|thank you,? bye|hang up)\b/i;

/**
 * Build the OUT-OF-BAND caller-speech transcription request.
 *
 * WHY this exists: on our OpenAI Realtime SIP calls the built-in
 * `conversation.item.input_audio_transcription.completed` event never fires, so
 * the caller's transcript is dark (the assistant's `response.output_audio_transcript`
 * works fine). OpenAI's own remedy is "out-of-band transcription": after the
 * caller's turn ends, send a SEPARATE text-only `response.create` whose
 * `conversation:"none"` keeps it OUT of the live conversation state (so it does
 * not interrupt or alter the spoken audio response), asking the model to
 * transcribe the caller's most recent utterance. The returned text is routed to
 * `onUserTurn` exactly like a normal caller transcript.
 *
 * Pure function — no I/O, no side effects. The exact shape is asserted in
 * run-voice-call.spec.ts so a drift in any field is caught.
 */
export function buildCallerTranscriptionRequest(): {
  type: "response.create";
  response: {
    conversation: "none";
    output_modalities: ["text"];
    instructions: string;
  };
} {
  return {
    type: "response.create",
    response: {
      conversation: "none",
      output_modalities: ["text"],
      instructions:
        "Transcribe the user's most recent spoken message, word for word and verbatim. Output ONLY the transcription text — no preamble, no quotes. If there is no recent user message, output nothing.",
    },
  };
}

/**
 * Decide whether a `response.done` payload is an OUT-OF-BAND TRANSCRIPTION
 * response (which must NOT be counted as an assistant turn) versus a real
 * assistant AUDIO reply.
 *
 * The distinction is content modality, inspected robustly off `response.output[]`:
 *   - the out-of-band transcription response was requested with
 *     `output_modalities:["text"]`, so its output items carry only TEXT content
 *     parts (`type:"text"` / `"output_text"`) — never `audio` / `output_audio`.
 *   - a spoken assistant reply carries an `audio` / `output_audio` content part
 *     (the transcript rides alongside it).
 *
 * Returns true ONLY when there is at least one text content part AND no audio
 * content part anywhere in the output. An EMPTY / ABSENT output (e.g. a bare
 * `{ type:"response.done" }`) returns false, so the existing assistant-turn
 * accounting for those is unchanged (some tests rely on that).
 *
 * Pure + total — never throws on malformed JSON; an unrecognizable shape that
 * contains no text parts simply returns false (treated as a normal turn).
 */
export function isOutOfBandTranscriptionDone(
  msg: Record<string, unknown>,
): boolean {
  const response = msg?.response;
  const output =
    response && typeof response === "object"
      ? (response as { output?: unknown }).output
      : undefined;
  if (!Array.isArray(output) || output.length === 0) return false;

  let sawText = false;
  for (const rawItem of output) {
    if (!rawItem || typeof rawItem !== "object") continue;
    const content = (rawItem as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const rawPart of content) {
      if (!rawPart || typeof rawPart !== "object") continue;
      const partType = (rawPart as { type?: unknown }).type;
      if (partType === "audio" || partType === "output_audio") {
        // Any audio content → this is a spoken assistant reply, not the
        // transcription response. Bail immediately.
        return false;
      }
      if (partType === "text" || partType === "output_text") {
        sawText = true;
      }
    }
  }
  return sawText;
}

export type AcceptCallResult =
  | { ok: true; status: number; body: string; headers: Record<string, string | null> }
  | { ok: false; status: number; body: string };

/**
 * Accept an inbound SIP call. Tells OpenAI to ring the SIP leg and stand up the
 * realtime session with our model/voice/persona. Must succeed BEFORE opening
 * the control WS. Pure-ish (one fetch); never throws — returns a result the
 * route logs + maps to a status.
 */
export async function acceptCall(params: {
  callId: string;
  apiKey: string;
  // Injectable for tests; defaults to global fetch.
  fetchImpl?: typeof fetch;
}): Promise<AcceptCallResult> {
  const doFetch = params.fetchImpl ?? fetch;
  const url = `${OPENAI_API_BASE}/v1/realtime/calls/${encodeURIComponent(params.callId)}/accept`;

  // Accept-call body — shape confirmed from the OpenAI Realtime SIP guide.
  // `type: "realtime"` selects the realtime session kind; model/voice/
  // instructions configure it. NO `tools` key (Phase 0).
  // 2026-06-01 — match the OpenAI Agents SDK twilio_sip reference EXACTLY:
  // {type, model, instructions} only. We previously also sent `voice:"alloy"`,
  // which NEITHER working reference sends at accept. In the current Realtime
  // schema `voice` lives under `audio.output` (set via session.update over the
  // WS), so a stray top-level `voice` may make OpenAI reject session creation
  // while still 200-ing the HTTP accept — leaving no session for the WS to
  // attach to ("call_id_not_found"). Voice is set post-connect, not here.
  const acceptBody = {
    type: "realtime" as const,
    model: VOICE_MODEL,
    // Silent at accept — greet once over the WS (in the right voice). See
    // PHASE0_ACCEPT_INSTRUCTIONS for why this isn't the greeting persona.
    instructions: PHASE0_ACCEPT_INSTRUCTIONS,
  };

  try {
    const res = await doFetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(acceptBody),
    });

    const body = await res.text().catch(() => "");
    if (!res.ok) {
      return { ok: false, status: res.status, body };
    }
    // Capture the SUCCESS body + key headers. The WS 404s "No session found for
    // the provided call_id" despite accept 200 — surfacing the project / org /
    // request-id the accept ran under confirms whether a project mismatch (vs
    // the SIP-endpoint's project) is the cause, and gives a request id to
    // correlate with OpenAI support if it's none of the obvious things.
    const pick = (k: string) => res.headers.get(k);
    return {
      ok: true,
      status: res.status,
      body,
      headers: {
        "openai-project": pick("openai-project"),
        "openai-organization": pick("openai-organization"),
        "x-request-id": pick("x-request-id"),
      },
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      body: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Reasons a held call WS finally closed — surfaced in the final log line so a
 *  failed validation call can be diagnosed from the Vercel log export alone. */
export type CallEndReason =
  | "goodbye" // caller said goodbye; model finished its closing response
  | "max_turns" // hit the assistant-turn safety cap
  | "timeout" // hit the wall-clock cap
  | "ws_closed" // OpenAI closed the socket (call ended SIP-side)
  | "ws_error" // socket errored
  | "open_failed"; // WS never opened (upgrade rejected / connect error)

/**
 * The slice of the `ws` package's WebSocket surface this driver actually uses.
 * `runVoiceCall` accepts an injectable ctor for tests (a mock that records the
 * url + options and lets the test drive events); the default is the real `ws`
 * `WebSocket`. Kept structural (not `typeof WsWebSocket`) so a lightweight test
 * double satisfies it without re-implementing the entire `ws` class.
 */
export interface ControlSocket {
  readonly readyState: number;
  readonly OPEN: number;
  readonly CONNECTING: number;
  binaryType: string;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: string, listener: (event: unknown) => void): void;
  // Node-style emitter API (the `ws` package exposes both `addEventListener`
  // and `.on`). Optional so a minimal mock can omit it; used only for the
  // `unexpected-response` upgrade-failure diagnostic.
  on?(event: string, listener: (...args: unknown[]) => void): void;
}

export type ControlSocketCtor = new (
  url: string,
  options?: { headers?: Record<string, string>; family?: number },
) => ControlSocket;

/**
 * Open the realtime control WebSocket for an already-accepted call, send the
 * session config + an initial response so the agent speaks first, then hold the
 * socket until the call ends.
 *
 * This is the function the route hands to `waitUntil` — it lives past the HTTP
 * response and keeps the Fluid Compute instance alive for the call. It awaits
 * on WS events (I/O wait — does not burn active CPU) and resolves with the end
 * reason once the call closes.
 *
 * We do NOT relay audio: once the call is accepted, gpt-realtime-2 bridges the
 * caller's audio over the SIP leg on its own. This WS is the *control* channel —
 * we use it only to inject the persona and kick off the first response, then to
 * observe `response.done` / `goodbye` so we can close cleanly.
 */
export async function runVoiceCall(params: {
  callId: string;
  apiKey: string;
  // Injectable WebSocket ctor for tests; defaults to the `ws` package's
  // WebSocket (the global undici WebSocket can't send the Authorization header).
  WebSocketImpl?: ControlSocketCtor;
  maxCallMs?: number;
  maxTurns?: number;
  // PHASE 1 — workspace-scoped tool-execution context. When present, the tools
  // (VOICE_TOOLS) are declared on the session and the function-call loop runs
  // calls against this ctx (orgId/orgSlug → real availability + booking). When
  // ABSENT, the call falls back to a tool-less greeting (Phase 0 behavior) so a
  // misconfigured test workspace still answers gracefully.
  toolContext?: ToolExecuteContext;
  // Persona for the session. Defaults to the Phase 1 SDR instructions when a
  // toolContext is given, else the Phase 0 greeting persona.
  instructions?: string;
  // Injectable tool executor for tests (defaults to the real bridge).
  executeToolCall?: typeof defaultExecuteVoiceToolCall;
  // PHASE 2 — per-agent TTS voice (blueprint.voice). Defaults to the GA fallback.
  audioVoice?: string;
  // PHASE 2 — per-workspace opening line (blueprint.greeting). When set, the
  // agent's FIRST response delivers this greeting; otherwise it falls back to a
  // generic warm greeting. (Without this the editor's Greeting field saved but
  // never reached the call.)
  greeting?: string;
  // PHASE 2 — transcript capture callbacks (best-effort, fire-and-forget). The
  // caller wires these to persist agentTurns. A throw here must never affect the
  // call, so they're invoked inside try/catch at the call sites.
  onUserTurn?: (text: string) => void;
  onAssistantTurn?: (text: string) => void;
  onCallEnd?: () => void;
  // PHASE 2 (Stage B) — fired when book_appointment succeeds, so the caller can
  // record a brain "win" (booking landed) against the consumed patterns.
  // Best-effort, fire-and-forget.
  onBookingCompleted?: () => void;
  // META loop — fired once the call ends (all reasons). When set, the caller
  // should send a post-call follow-up SMS to the caller's number. Best-effort:
  // a throw here must never affect call teardown. The SMS itself is sent by the
  // webhook (not here) so this is a plain signal callback with no arguments.
  onPostCallSms?: () => void;
}): Promise<CallEndReason> {
  const WS: ControlSocketCtor =
    params.WebSocketImpl ?? (WsWebSocket as unknown as ControlSocketCtor);
  const maxCallMs = params.maxCallMs ?? MAX_CALL_MS;
  const maxTurns = params.maxTurns ?? MAX_ASSISTANT_TURNS;
  const wsUrl = `${OPENAI_REALTIME_WS_BASE}?call_id=${encodeURIComponent(params.callId)}`;

  // PHASE 1 wiring. Tools are additive: present only when a workspace ctx was
  // resolved. The persona defaults to the SDR script when tools are live.
  const toolContext = params.toolContext;
  const toolsEnabled = Boolean(toolContext);
  const executeToolCall = params.executeToolCall ?? defaultExecuteVoiceToolCall;
  const instructions =
    params.instructions ??
    (toolsEnabled ? VOICE_SDR_INSTRUCTIONS : PHASE0_GREETING_INSTRUCTIONS);

  // Open the control WS with the `ws` package's `new WebSocket(url, options)`
  // form. The `headers` option is the ONLY way OpenAI's realtime WS gets the
  // bearer token (it has no query-param / subprotocol auth for this variant) —
  // see the OpenAI Realtime SIP guide, whose example uses this exact shape.
  //
  // `Authorization` is the load-bearing header (its absence caused the original
  // non-101 upgrade rejection). We send ONLY Authorization — do NOT add
  // `OpenAI-Beta: realtime=v1`.
  //
  // 2026-06-01 — that header was the ACTUAL cause of the 404 `call_id_not_found`.
  // `OpenAI-Beta: realtime=v1` routes the WS to the LEGACY realtime endpoint,
  // which has no knowledge of the SIP session that `/accept` created on the
  // CURRENT API → "No session found for the provided call_id" (after a ~5s
  // legacy-side lookup that can never succeed). The OpenAI Agents SDK + the
  // community SIP references all send Authorization only; one explicitly warns
  // the beta header "connects to the old API". An earlier revision here added it
  // as "harmless belt-and-suspenders" — it was not harmless. Removed.
  //
  // 2026-06-01 — force IPv4 (family: 4). The diagnostic proved the WS was
  // taking a consistent ~5.4s to connect, after which OpenAI returned 404
  // `call_id_not_found` ("No session found for the provided call_id") — i.e.
  // accept succeeded and the session existed, but by the time the upgrade
  // completed OpenAI had torn the un-attached session down. A FIXED ~5s connect
  // delay is the textbook signature of an IPv6 (AAAA) connect attempt hanging
  // before falling back to IPv4. Pinning family: 4 skips the dead IPv6 path so
  // the WS attaches in <500ms — while the session is still alive. `ws` forwards
  // the option to the underlying https handshake request, which honors `family`.
  // `voice_call_ws_connecting` timestamps the handshake start so the log proves
  // the connect time dropped from ~5s to sub-second.
  logEvent("voice_call_ws_connecting", { call_id: params.callId, ws_url: wsUrl });
  const ws = new WS(wsUrl, {
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
    },
    family: 4,
  });

  // Default `ws` binaryType is "nodebuffer" → binary frames arrive as a single
  // Buffer. Force "arraybuffer" so a stray binary control frame is a plain
  // ArrayBuffer we coerce uniformly below (the realtime control channel is JSON
  // text in practice, but we never want a Buffer-vs-string surprise to break
  // JSON.parse). Guarded: a minimal mock may not allow assigning it.
  try {
    ws.binaryType = "arraybuffer";
  } catch {
    // ignore — mock or impl without a settable binaryType
  }

  return await new Promise<CallEndReason>((resolve) => {
    let assistantTurns = 0;
    let sawGoodbye = false;
    let settled = false;
    // PHASE 1 — call_ids we've already dispatched a tool call for. A single tool
    // call can surface on BOTH `response.function_call_arguments.done` AND the
    // terminal `response.done` output[]; tracking the id here means we execute
    // it exactly once (no double-booking). See realtime-function-calls.ts.
    const seenCallIds = new Set<string>();

    // voice-r1 — accumulator for the OUT-OF-BAND caller transcription. The model
    // may stream the transcript as `response.output_text.delta` events and then
    // emit a `.done` that omits the full text; we concat the deltas here and
    // flush on `.done`. Reset after each flush so consecutive caller turns don't
    // bleed together. (When `.done` carries the full `text`, we use that and the
    // buffer stays empty.)
    let oobTranscript = "";
    // voice-r1 — log the raw `response.done` output content-types exactly ONCE
    // per call so the live-call logs confirm the assistant-audio vs out-of-band-
    // text shape we key the turn-accounting guard on (without spamming every turn).
    let loggedResponseDoneShape = false;

    // Single resolution path — closes the socket (if still open) and resolves
    // the promise exactly once, logging the final reason.
    const finish = (reason: CallEndReason) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        // 1000 = normal closure.
        if (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING) {
          ws.close(1000, "phase0_call_complete");
        }
      } catch {
        // ignore — best-effort close
      }
      // PHASE 2 — let the caller close out the transcript (mark conversation
      // completed + turnCount). Best-effort: a throw here must not stop the
      // promise from resolving. Fires exactly once (guarded by `settled`).
      try {
        params.onCallEnd?.();
      } catch {
        // ignore — best-effort transcript close-out
      }
      // META loop — signal the webhook to send a post-call follow-up SMS.
      // Best-effort: a throw here must never affect teardown.
      try {
        params.onPostCallSms?.();
      } catch {
        // ignore — best-effort post-call SMS signal
      }
      logEvent("voice_call_ws_closed", { call_id: params.callId, reason });
      resolve(reason);
    };

    const timer = setTimeout(() => finish("timeout"), maxCallMs);

    const send = (obj: unknown) => {
      try {
        ws.send(JSON.stringify(obj));
      } catch (err) {
        logEvent(
          "voice_call_ws_send_failed",
          { call_id: params.callId, error: err instanceof Error ? err.message : String(err) },
          { severity: "warn" }
        );
      }
    };

    // Coerce a `ws`-package message payload to text. With `addEventListener`
    // the event's `data` is the WHATWG-shaped `{ data }`, but the `ws` package
    // may hand back a Buffer, an ArrayBuffer, or an array of Buffer fragments
    // (depending on binaryType / frame type) rather than a string. The global
    // undici WebSocket always gave a string here; `ws` does not, so we
    // normalise every shape to UTF-8 text before JSON.parse. Returns null for
    // shapes we can't decode (caller ignores the frame).
    const frameToText = (data: unknown): string | null => {
      if (typeof data === "string") return data;
      if (typeof Buffer !== "undefined" && Buffer.isBuffer(data)) {
        return (data as Buffer).toString("utf8");
      }
      if (data instanceof ArrayBuffer) {
        return Buffer.from(new Uint8Array(data)).toString("utf8");
      }
      if (ArrayBuffer.isView(data)) {
        const view = data as ArrayBufferView;
        return Buffer.from(
          view.buffer as ArrayBuffer,
          view.byteOffset,
          view.byteLength,
        ).toString("utf8");
      }
      if (Array.isArray(data)) {
        // binaryType "fragments" → array of Buffers; concat then decode.
        try {
          return Buffer.concat(data as Buffer[]).toString("utf8");
        } catch {
          return null;
        }
      }
      return null;
    };

    // PHASE 1 — run the function calls carried by one realtime event, feed each
    // result back as a `function_call_output` conversation item, then ask the
    // model to continue (ONE `response.create` after all outputs in the batch)
    // so it speaks the result. Records each call_id in `seenCallIds` BEFORE
    // executing so the same call arriving again (streaming-done + terminal
    // response.done) is never run twice.
    //
    // Why a single response.create per batch (not one per call): the Realtime
    // API rejects a `response.create` while a response is already in progress
    // ("conversation_already_has_active_response"). When a response.done carries
    // several function_call items, we submit ALL their outputs first, then ask
    // for one continuation. (The common case is one call per turn anyway.)
    //
    // Each call is timed + logged: `voice_call_tool_invoked` (name, ok, ms) on
    // completion, `voice_call_tool_failed` (name, error) when the bridge returns
    // a failure — same structured-logging style as the other voice events, so a
    // booking can be traced from the Vercel log export alone. Never throws (the
    // bridge already resolves a discriminated result); a stray error is logged
    // and the call continues — a phone call must not crash on a tool error.
    const dispatchFunctionCalls = async (
      msg: { type?: string } & Record<string, unknown>,
      // Optional pre-parsed calls (the response.done path already parsed them to
      // decide it was a tool-call turn — avoid re-parsing the same event).
      preParsed?: ReturnType<typeof parseFunctionCalls>,
    ): Promise<void> => {
      if (!toolsEnabled || !toolContext) return;
      const calls = preParsed ?? parseFunctionCalls(msg, seenCallIds);
      if (calls.length === 0) return;

      for (const call of calls) {
        // Mark seen up-front so a re-delivery of the same call_id is ignored
        // even if execution is still in flight.
        seenCallIds.add(call.callId);
        const startedAt = Date.now();
        try {
          const result = await executeToolCall({
            name: call.name,
            argumentsJson: call.argumentsJson,
            ctx: toolContext,
          });
          const ms = Date.now() - startedAt;
          // On success feed the tool's serialized output; on failure feed a
          // compact error string the model can apologize/recover from.
          const output = result.ok
            ? result.output
            : JSON.stringify({ error: result.error });
          send(buildFunctionCallOutputItem(call.callId, output));
          logEvent("voice_call_tool_invoked", {
            call_id: params.callId,
            tool: call.name,
            ok: result.ok,
            ms,
          });
          if (!result.ok) {
            logEvent(
              "voice_call_tool_failed",
              { call_id: params.callId, tool: call.name, error: result.error },
              { severity: "warn" },
            );
          }
          // PHASE 2 (Stage B) — a landed booking is the brain "win" signal.
          if (result.ok && call.name === "book_appointment") {
            try {
              params.onBookingCompleted?.();
            } catch {
              // best-effort — never let the brain hook affect the call
            }
          }
        } catch (err) {
          // Defensive — executeVoiceToolCall is total, but never let a throw
          // escape into the WS callback. Feed the error back so the model isn't
          // left waiting on an output it will never get.
          const message = err instanceof Error ? err.message : String(err);
          send(
            buildFunctionCallOutputItem(
              call.callId,
              JSON.stringify({ error: message }),
            ),
          );
          logEvent(
            "voice_call_tool_failed",
            { call_id: params.callId, tool: call.name, error: message },
            { severity: "error" },
          );
        }
      }

      // All outputs for this batch submitted → ask the model to continue once.
      send({ type: "response.create" });
    };

    ws.addEventListener("open", () => {
      logEvent("voice_call_ws_opened", { call_id: params.callId });

      // Push the persona onto the live session. (The accept call already set the
      // Phase 0 instructions, but re-asserting over the WS is the documented
      // control-channel pattern and is where we attach the PHASE 1 additions:
      // the tools + tool_choice + the voice. `session.update.session.type` is
      // "realtime" (GA), tools is the function-tool wire array, and the voice
      // lives at audio.output.voice (NEVER in the /accept body).
      const session: Record<string, unknown> = {
        type: "realtime",
        instructions,
        // Voice via the GA audio config path (per-agent in Phase 2; falls back to
        // the GA default). `input.transcription` ENABLES caller-speech transcripts
        // — without it `conversation.item.input_audio_transcription.completed`
        // never fires (so goodbye-detection + transcript capture stay dark).
        // Defensive: if OpenAI rejects any field it emits an `error` event
        // (logged via voice_call_realtime_error) but the call still runs.
        audio: {
          input: {
            // gpt-4o-mini-transcribe is the current GA realtime transcription
            // model. whisper-1 is legacy and may be silently dropped on the GA
            // SIP path (verified: input_audio_transcription.completed never
            // fired with whisper-1 while assistant transcripts streamed fine).
            transcription: { model: "gpt-4o-mini-transcribe" },
            // CALLER TRANSCRIPT FIX (2026-06-02, OpenAI GA docs): input
            // transcription only runs when the caller's audio buffer is
            // COMMITTED, and server VAD is what commits each turn. Without an
            // explicit turn_detection here, `input_audio_transcription.completed`
            // never fires (no error — the config is otherwise valid), so the
            // transcript was one-sided (assistant only). Making server VAD
            // explicit links transcription to each committed caller turn.
            // create_response/interrupt_response match the SIP session's existing
            // auto-respond + barge-in behavior (the call already turn-takes), so
            // this ADDS caller transcripts without changing the response flow.
            // Audio FORMAT intentionally left to SIP negotiation (the live call
            // already understands callers — don't risk the working audio path).
            turn_detection: {
              type: "server_vad",
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500,
              create_response: true,
              interrupt_response: true,
            },
          },
          output: { voice: params.audioVoice ?? VOICE_AUDIO_OUTPUT_VOICE },
        },
      };
      if (toolsEnabled) {
        // 6 tools (provide_faq_answer excluded). tool_choice "auto" lets the
        // model decide when to call them.
        session.tools = toRealtimeFunctionTools(VOICE_TOOLS);
        session.tool_choice = "auto";
      }
      send({ type: "session.update", session });
      logEvent("voice_call_session_updated", {
        call_id: params.callId,
        tools_enabled: toolsEnabled,
        tool_count: toolsEnabled ? VOICE_TOOLS.length : 0,
      });

      // Make the agent speak first — the warm greeting. Without this the agent
      // waits for the caller to speak, which feels broken on an "it answered
      // and greeted me" validation. PHASE 2: when the workspace set a custom
      // greeting (blueprint.greeting via the editor), the agent opens with it;
      // otherwise a generic warm greeting.
      const greeting = params.greeting?.trim();
      send({
        type: "response.create",
        response: {
          instructions: greeting
            ? `Open the call by delivering this greeting in your own natural, warm voice: "${greeting}". Then briefly ask how you can help. Keep it to one or two short sentences.`
            : "Greet the caller warmly as the receptionist and ask how you can help. Keep it to one or two short sentences.",
        },
      });
      logEvent("voice_call_first_response_requested", { call_id: params.callId });
    });

    ws.addEventListener("message", (ev: unknown) => {
      const text = frameToText((ev as { data?: unknown })?.data);
      if (text === null) return; // undecodable / non-text frame

      let msg: { type?: string } & Record<string, unknown>;
      try {
        msg = JSON.parse(text);
      } catch {
        return; // ignore non-JSON frames
      }

      switch (msg.type) {
        // PHASE 1 — streaming function-call completion. The model finished
        // streaming this call's arguments; run it immediately (don't wait for
        // response.done). Logged so we can confirm from the live call which
        // variant the API actually emits.
        case "response.function_call_arguments.done": {
          logEvent("voice_call_realtime_event", {
            call_id: params.callId,
            event_type: msg.type,
          });
          void dispatchFunctionCalls(msg);
          break;
        }

        // voice-r1 — OUT-OF-BAND caller transcription TRIGGER. When the caller's
        // input audio buffer is COMMITTED (server VAD has closed the caller's
        // turn), fire a separate text-only response that transcribes what the
        // caller just said. `conversation:"none"` keeps this request out of the
        // live conversation so it does NOT interrupt or replace the assistant's
        // spoken audio reply (which the model produces in parallel from the same
        // committed audio). The returned text is captured in the
        // `response.output_text.done` case below and routed to onUserTurn.
        //
        // NOTE: it is not yet confirmed which buffer event the GA SIP path emits.
        // We log BOTH `input_audio_buffer.committed` and
        // `input_audio_buffer.speech_stopped` so the next live call's logs reveal
        // which one fires. If `committed` never fires on SIP but `speech_stopped`
        // does, MOVE the `send(buildCallerTranscriptionRequest())` line into the
        // `speech_stopped` case below.
        case "input_audio_buffer.committed": {
          logEvent("voice_call_realtime_event", {
            call_id: params.callId,
            event_type: msg.type,
          });
          try {
            send(buildCallerTranscriptionRequest());
          } catch {
            // best-effort — a failed out-of-band send must never affect the call
          }
          break;
        }

        // voice-r1 — diagnostic only (NO send). Logs whether the GA SIP path
        // emits `speech_stopped`; pairs with the `committed` log above so the
        // next live call shows which buffer event actually fires. See the note
        // on the `committed` case for moving the send here if needed.
        case "input_audio_buffer.speech_stopped": {
          logEvent("voice_call_realtime_event", {
            call_id: params.callId,
            event_type: msg.type,
          });
          break;
        }

        // voice-r1 — OUT-OF-BAND caller transcription DELTA accumulation. The
        // model may stream the transcript in pieces before the `.done`. Buffer
        // them so a `.done` that omits the full `text` can still be finalized.
        case "response.output_text.delta":
        case "response.text.delta": {
          const delta = typeof msg.delta === "string" ? msg.delta : "";
          if (delta) oobTranscript += delta;
          break;
        }

        // voice-r1 — OUT-OF-BAND caller transcription CAPTURE. The text-only
        // response we requested above completes here (GA: `response.output_text.done`,
        // beta: `response.text.done`). Prefer the full `text` on the event; fall
        // back to the accumulated deltas. Route any non-empty transcript to
        // onUserTurn (the caller's turn) and run the SAME goodbye detection the
        // legacy input_audio_transcription path uses (shared CALLER_GOODBYE_RE).
        case "response.output_text.done":
        case "response.text.done": {
          const fullText = typeof msg.text === "string" ? msg.text : "";
          const text = (fullText || oobTranscript).trim();
          oobTranscript = ""; // reset for the next caller turn either way
          logEvent("voice_call_realtime_event", {
            call_id: params.callId,
            event_type: msg.type,
            text_len: text.length,
          });
          if (text) {
            try {
              params.onUserTurn?.(text);
            } catch {
              // best-effort transcript capture — never affect the call
            }
            if (CALLER_GOODBYE_RE.test(text)) {
              sawGoodbye = true;
              logEvent("voice_call_goodbye_detected", { call_id: params.callId });
            }
          }
          break;
        }

        case "response.done": {
          // voice-r1 — log the raw output content-types ONCE so the live call
          // confirms the shape of an assistant-audio vs an out-of-band-text
          // response.done (truncated; this is what the turn guard keys on).
          if (!loggedResponseDoneShape) {
            loggedResponseDoneShape = true;
            try {
              const output = (msg.response as { output?: unknown })?.output;
              const outTypes = Array.isArray(output)
                ? output
                    .map((it) => {
                      const content = (it as { content?: unknown })?.content;
                      const partTypes = Array.isArray(content)
                        ? content.map((p) => (p as { type?: unknown })?.type)
                        : [];
                      return {
                        type: (it as { type?: unknown })?.type,
                        content_types: partTypes,
                      };
                    })
                    .slice(0, 4)
                : null;
              logEvent("voice_call_realtime_event", {
                call_id: params.callId,
                event_type: "response.done.output_shape",
                output_types: JSON.stringify(outTypes).slice(0, 400),
              });
            } catch {
              // best-effort diagnostic — never let logging affect the call
            }
          }

          // voice-r1 — OUT-OF-BAND TRANSCRIPTION GUARD. Our caller-transcription
          // request (buildCallerTranscriptionRequest) ALSO emits a `response.done`.
          // Its output is TEXT-only (no audio content), which distinguishes it
          // from a spoken assistant reply. It must NOT count as an assistant turn
          // and must NOT trip the goodbye/max_turns finish — the caller's text was
          // already captured + goodbye-scanned in the `response.output_text.done`
          // case. Skip ALL turn accounting for it. (The capture/goodbye logic must
          // live in the output_text case, not here, because a `.done` carrying the
          // full text only when audio is absent would otherwise be ambiguous.)
          if (isOutOfBandTranscriptionDone(msg)) {
            logEvent("voice_call_realtime_event", {
              call_id: params.callId,
              event_type: "response.done.out_of_band_transcription",
            });
            break;
          }

          // PHASE 1 — a response can finish as a TOOL-CALL turn (its output[]
          // holds function_call items) rather than a spoken reply. Extract +
          // dispatch any terminal calls first; `seenCallIds` makes this a no-op
          // for calls already run via the streaming-done path above.
          const terminalCalls = toolsEnabled
            ? parseFunctionCalls(msg, seenCallIds)
            : [];
          const isToolCallTurn = terminalCalls.length > 0;
          if (isToolCallTurn) {
            logEvent("voice_call_realtime_event", {
              call_id: params.callId,
              event_type: "response.done.function_call",
              tool_calls: terminalCalls.length,
            });
            void dispatchFunctionCalls(msg, terminalCalls);
          }

          assistantTurns += 1;
          logEvent("voice_call_response_done", {
            call_id: params.callId,
            assistant_turns: assistantTurns,
            saw_goodbye: sawGoodbye,
            tool_call_turn: isToolCallTurn,
          });
          // A tool-call turn isn't the end of the conversation — the model will
          // speak again after we feed the result + response.create. Only apply
          // the goodbye / turn-cap finish to a genuine spoken response.
          if (isToolCallTurn) {
            break;
          }
          // If the caller already said goodbye, the model's closing line just
          // finished → end the call. Otherwise enforce the turn cap.
          if (sawGoodbye) {
            finish("goodbye");
          } else if (assistantTurns >= maxTurns) {
            finish("max_turns");
          }
          break;
        }

        // Caller-speech transcript completion — used purely to detect a
        // spoken "goodbye" so we can close after the model's next response.
        // (Phase 0 has no other use for transcripts.)
        case "conversation.item.input_audio_transcription.completed": {
          const transcript = typeof msg.transcript === "string" ? msg.transcript : "";
          // Diagnostic (voice-r1 CHANGE B): log the event the moment it fires —
          // BEFORE the empty-transcript guard — so the next live call's logs
          // definitively show whether this event reaches us at all and whether
          // it carries text. The caller-transcript bug is that it has fired zero
          // times on the GA SIP path; this line proves the fix on the next call.
          logEvent("voice_call_realtime_event", {
            call_id: params.callId,
            event_type: msg.type,
            transcript_len: transcript.length,
          });
          if (transcript) {
            try {
              params.onUserTurn?.(transcript);
            } catch {
              // best-effort transcript capture — never affect the call
            }
          }
          if (CALLER_GOODBYE_RE.test(transcript)) {
            sawGoodbye = true;
            logEvent("voice_call_goodbye_detected", { call_id: params.callId });
          }
          break;
        }

        // PHASE 2 — assistant spoken-reply transcript. The GA realtime API emits
        // `response.output_audio_transcript.done`; older builds used
        // `response.audio_transcript.done`. Handle both so transcript capture
        // works regardless, and log the event type once so we can confirm which
        // the API actually sends (the logs to date only show function-call events).
        case "response.output_audio_transcript.done":
        case "response.audio_transcript.done": {
          const transcript = typeof msg.transcript === "string" ? msg.transcript : "";
          logEvent("voice_call_realtime_event", {
            call_id: params.callId,
            event_type: msg.type,
          });
          if (transcript) {
            try {
              params.onAssistantTurn?.(transcript);
            } catch {
              // best-effort
            }
          }
          break;
        }

        case "error": {
          logEvent(
            "voice_call_realtime_error",
            { call_id: params.callId, detail: JSON.stringify(msg).slice(0, 500) },
            { severity: "warn" }
          );
          break;
        }

        default:
          // Most realtime events (audio deltas, rate-limit updates, etc.) are
          // irrelevant to Phase 0 — OpenAI handles the audio bridge itself.
          break;
      }
    });

    // Upgrade-failure diagnostic. The `ws` package emits BOTH an `error` event
    // AND, when the HTTP upgrade is rejected (non-101), an `unexpected-response`
    // event carrying the actual HTTP response. The original bug surfaced only
    // as "non-101 status code" with no status — wiring this logs the concrete
    // code (401 = bad/missing key, 403 = key lacks realtime, 404 = call_id gone)
    // so the next failure is diagnosable from the log export alone. `.on` is
    // the `ws`-package emitter API; guarded for mocks that omit it.
    ws.on?.("unexpected-response", (...args: unknown[]) => {
      // `res` is a Node http.IncomingMessage (a readable stream). We read its
      // BODY + key headers so the log shows OpenAI's actual error text — not
      // just the bare status. That distinguishes the three things a 404 here
      // could mean: a lifecycle error ("no active call with call_id …"), a
      // param error ("model is required"), or an HTML 404 from an intermediary
      // proxy (which the `server` / `cf-ray` headers would reveal). The
      // call_id WS URL + Authorization header match the OpenAI SIP guide
      // verbatim, so the next failure's body is what finally pinpoints it.
      const res = args[1] as
        | {
            statusCode?: number;
            statusMessage?: string;
            headers?: Record<string, string | string[] | undefined>;
            on?: (event: string, cb: (...a: unknown[]) => void) => void;
          }
        | undefined;
      const headers = res?.headers ?? {};
      const h = (k: string): string | null => {
        const v = headers[k];
        return Array.isArray(v) ? v.join(",") : (v ?? null);
      };
      let logged = false;
      let body = "";
      const done = () => {
        if (logged) return;
        logged = true;
        logEvent(
          "voice_call_ws_upgrade_rejected",
          {
            call_id: params.callId,
            http_status: res?.statusCode ?? null,
            http_status_text: res?.statusMessage ?? null,
            server: h("server"),
            openai_request_id: h("x-request-id") ?? h("openai-request-id"),
            cf_ray: h("cf-ray"),
            content_type: h("content-type"),
            body: body.slice(0, 600) || null,
          },
          { severity: "error" }
        );
        // Terminal — the socket will never open. Resolve the held promise
        // instead of waiting for the wall-clock timeout.
        finish("open_failed");
      };
      if (res && typeof res.on === "function") {
        res.on("data", (c: unknown) => {
          body +=
            typeof c === "string"
              ? c
              : Buffer.isBuffer(c)
                ? c.toString("utf8")
                : String(c);
        });
        res.on("end", done);
        res.on("error", done);
        // Safety: if the body stream stalls, log what we have after 1.5s.
        setTimeout(done, 1500);
      } else {
        done();
      }
    });

    ws.addEventListener("error", (ev: unknown) => {
      logEvent(
        "voice_call_ws_error",
        {
          call_id: params.callId,
          detail: (ev as { message?: string })?.message ?? "unknown",
        },
        { severity: "error" }
      );
      finish("ws_error");
    });

    ws.addEventListener("close", () => {
      // OpenAI closed the socket — usually because the SIP call ended. If we
      // haven't already resolved for another reason, this is the end.
      finish("ws_closed");
    });
  });
}
