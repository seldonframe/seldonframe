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

const OPENAI_API_BASE = "https://api.openai.com";
const OPENAI_REALTIME_WS_BASE = "wss://api.openai.com/v1/realtime";

/**
 * The exact model id used for the call. Confirmed from the OpenAI Realtime SIP
 * guide's accept-call example (`"model": "gpt-realtime-2"`). Centralised here so
 * a model bump is a one-line change.
 */
export const VOICE_MODEL = "gpt-realtime-2";

/** Voice for the greeting. `alloy` is a safe, widely-available default. */
export const VOICE_NAME = "alloy";

/**
 * The hard-coded Phase 0 persona. Single greeting, no per-workspace anything.
 * Phase 2 replaces this with per-workspace agent resolution.
 */
export const PHASE0_GREETING_INSTRUCTIONS =
  "You are a friendly receptionist for a test business. Greet the caller " +
  "warmly, ask how you can help, and keep your replies short. If the caller " +
  "says goodbye, thank them and end the call.";

/**
 * Safety cap on assistant turns. gpt-realtime-2 normally ends the call itself
 * when the caller says goodbye (via the persona instruction), but this is a
 * belt-and-suspenders ceiling so a stuck/looping call can't pin the function
 * open until maxDuration. Phase 0 is a hello-world: a handful of turns proves
 * the pipe.
 */
export const MAX_ASSISTANT_TURNS = 12;

/**
 * Hard wall-clock cap (ms) for a single call's WS hold. Kept under the Vercel
 * function `maxDuration` so we close the socket ourselves with a clean log
 * line rather than getting killed mid-call by a FUNCTION_INVOCATION_TIMEOUT.
 * Phase 0 = sub-5-min calls; 4 min leaves headroom under a 300s/800s ceiling.
 */
export const MAX_CALL_MS = 4 * 60 * 1000;

export type AcceptCallResult =
  | { ok: true }
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
  const acceptBody = {
    type: "realtime" as const,
    model: VOICE_MODEL,
    voice: VOICE_NAME,
    instructions: PHASE0_GREETING_INSTRUCTIONS,
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

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, status: res.status, body };
    }
    return { ok: true };
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
  options?: { headers?: Record<string, string> },
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
}): Promise<CallEndReason> {
  const WS: ControlSocketCtor =
    params.WebSocketImpl ?? (WsWebSocket as unknown as ControlSocketCtor);
  const maxCallMs = params.maxCallMs ?? MAX_CALL_MS;
  const maxTurns = params.maxTurns ?? MAX_ASSISTANT_TURNS;
  const wsUrl = `${OPENAI_REALTIME_WS_BASE}?call_id=${encodeURIComponent(params.callId)}`;

  // Open the control WS with the `ws` package's `new WebSocket(url, options)`
  // form. The `headers` option is the ONLY way OpenAI's realtime WS gets the
  // bearer token (it has no query-param / subprotocol auth for this variant) —
  // see the OpenAI Realtime SIP guide, whose example uses this exact shape.
  //
  // `Authorization` is the load-bearing header (its absence caused the original
  // non-101 upgrade rejection). `OpenAI-Beta: realtime=v1` is NOT required for
  // the `?call_id=` SIP variant (the guide omits it; the session is already
  // configured by the accept call), but we send it anyway — it is the standard
  // Realtime beta opt-in and is harmlessly ignored here.
  const ws = new WS(wsUrl, {
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "OpenAI-Beta": "realtime=v1",
    },
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

    ws.addEventListener("open", () => {
      logEvent("voice_call_ws_opened", { call_id: params.callId });

      // Push the persona onto the live session. (The accept call already set
      // it, but re-asserting over the WS is the documented control-channel
      // pattern and makes the persona explicit on the socket we drive.)
      send({
        type: "session.update",
        session: {
          type: "realtime",
          instructions: PHASE0_GREETING_INSTRUCTIONS,
          // No `tools` — Phase 0.
        },
      });
      logEvent("voice_call_session_updated", { call_id: params.callId });

      // Make the agent speak first — the warm greeting. Without this the agent
      // waits for the caller to speak, which feels broken on an outbound-style
      // "it answered and greeted me" validation.
      send({
        type: "response.create",
        response: {
          instructions:
            "Greet the caller warmly as the test-business receptionist and ask how you can help. Keep it to one or two short sentences.",
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
        case "response.done": {
          assistantTurns += 1;
          logEvent("voice_call_response_done", {
            call_id: params.callId,
            assistant_turns: assistantTurns,
            saw_goodbye: sawGoodbye,
          });
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
          if (/\b(good ?bye|bye|that'?s all|thank you,? bye|hang up)\b/i.test(transcript)) {
            sawGoodbye = true;
            logEvent("voice_call_goodbye_detected", { call_id: params.callId });
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
      const res = args[1] as { statusCode?: number; statusMessage?: string } | undefined;
      logEvent(
        "voice_call_ws_upgrade_rejected",
        {
          call_id: params.callId,
          http_status: res?.statusCode ?? null,
          http_status_text: res?.statusMessage ?? null,
        },
        { severity: "error" }
      );
      // An unexpected-response is terminal — the socket will never open. Close
      // out so the held promise resolves instead of waiting for the timeout.
      finish("open_failed");
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
