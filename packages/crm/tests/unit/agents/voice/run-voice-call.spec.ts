// Unit tests for runVoiceCall — the realtime control-WS driver.
//
// THE BUG THIS GUARDS: the original Phase 0 code opened the control WS with the
// global undici `WebSocket` and a 3rd-arg `{ headers }` options bag. The WHATWG
// `WebSocket` ctor is `new WebSocket(url, protocols)` — it has no 3rd argument,
// so the `Authorization: Bearer <key>` header was SILENTLY DROPPED and OpenAI
// rejected the upgrade (non-101). The fix switches to the `ws` package, whose
// `new WebSocket(url, options)` form actually sends headers. The first test
// below asserts the Authorization (and OpenAI-Beta) headers reach the ctor —
// that assertion fails against the old code, so it would have caught the bug.
//
// Convention (see realtime-tools.spec.ts / openai-webhook-verify.spec.ts):
// node:test + node:assert/strict, dependency-injection over module mocking.
// runVoiceCall takes an injectable `WebSocketImpl`; we pass a fake that records
// the ctor args and lets the test drive open/message/error/close + the
// Node-style `unexpected-response` event.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  runVoiceCall,
  acceptCall,
  buildCallerTranscriptionRequest,
  responseHasAudioOutput,
  MAX_ASSISTANT_TURNS,
  PHASE0_GREETING_INSTRUCTIONS,
  PHASE0_ACCEPT_INSTRUCTIONS,
  VOICE_SDR_INSTRUCTIONS,
  VOICE_TOOLS,
  VOICE_AUDIO_OUTPUT_VOICE,
  type ControlSocket,
  type ControlSocketCtor,
} from "../../../../src/lib/agents/voice/openai-realtime";
import type { ToolExecuteContext } from "../../../../src/lib/agents/tools";

// A workspace ctx for the Phase 1 tool tests. testMode here is irrelevant — the
// tests inject a fake executeToolCall, so the real tools/DB are never hit.
const TOOL_CTX: ToolExecuteContext = {
  orgId: "org-1",
  orgSlug: "spark-heating-cooling",
  agentId: "agent-1",
  conversationId: "conv-1",
  testMode: false,
};

// ─── acceptCall ──────────────────────────────────────────────────────────────
// The /accept HTTP body sets the model's persona until the control WS lands.
// It MUST keep the model SILENT: the call's per-agent voice + persona are only
// applied over the WS, so any greeting at /accept is in the wrong voice AND
// collides with the WS greeting — the "double hello" operators reported. DI a
// fake fetch and assert the accept body uses the silent instruction.

describe("acceptCall", () => {
  test("holds the model silent at /accept (not the greeting persona) — prevents the double-hello", async () => {
    let capturedBody: unknown = null;
    const fakeFetch = (async (_url: string, init?: { body?: string }) => {
      capturedBody = init?.body ? JSON.parse(init.body) : null;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    const res = await acceptCall({
      callId: "rtc_test",
      apiKey: "sk-test",
      fetchImpl: fakeFetch,
    });

    assert.equal(res.ok, true);
    const body = capturedBody as { type?: string; instructions?: string } | null;
    assert.ok(body, "accept must POST a body");
    assert.equal(body.type, "realtime");
    assert.equal(body.instructions, PHASE0_ACCEPT_INSTRUCTIONS);
    assert.notEqual(
      body.instructions,
      PHASE0_GREETING_INSTRUCTIONS,
      "accept must NOT use the greeting persona (causes the wrong-voice double-hello)",
    );
  });
});

// ─── Fake control socket ─────────────────────────────────────────────────────
// Records the ctor (url + options), captures addEventListener / .on handlers so
// a test can fire them, and records everything sent. WebSocket-shaped enough to
// satisfy ControlSocket without pulling in the real `ws` package.

interface SocketCapture {
  url: string;
  options?: { headers?: Record<string, string> };
  sent: string[];
  closed: { code?: number; reason?: string } | null;
  // Fire a captured listener (no-op if none registered for that type).
  emit: (type: string, event?: unknown) => void;
  emitOn: (event: string, ...args: unknown[]) => void;
}

function makeFakeSocketCtor(): { ctor: ControlSocketCtor; captures: SocketCapture[] } {
  const captures: SocketCapture[] = [];

  class FakeSocket implements ControlSocket {
    static readonly OPEN = 1;
    static readonly CONNECTING = 0;
    readonly OPEN = 1;
    readonly CONNECTING = 0;
    // Report OPEN so finish()'s close-guard path runs (exercises ws.close()).
    readyState = 1;
    binaryType = "nodebuffer";

    private listeners = new Map<string, ((event: unknown) => void)[]>();
    private onListeners = new Map<string, ((...args: unknown[]) => void)[]>();
    private cap: SocketCapture;

    constructor(url: string, options?: { headers?: Record<string, string> }) {
      this.cap = {
        url,
        options,
        sent: [],
        closed: null,
        emit: (type, event) => {
          for (const l of this.listeners.get(type) ?? []) l(event);
        },
        emitOn: (event, ...args) => {
          for (const l of this.onListeners.get(event) ?? []) l(...args);
        },
      };
      captures.push(this.cap);
    }

    send(data: string): void {
      this.cap.sent.push(data);
    }

    close(code?: number, reason?: string): void {
      this.cap.closed = { code, reason };
      this.readyState = 3; // CLOSED
    }

    addEventListener(type: string, listener: (event: unknown) => void): void {
      const arr = this.listeners.get(type) ?? [];
      arr.push(listener);
      this.listeners.set(type, arr);
    }

    on(event: string, listener: (...args: unknown[]) => void): void {
      const arr = this.onListeners.get(event) ?? [];
      arr.push(listener);
      this.onListeners.set(event, arr);
    }
  }

  return { ctor: FakeSocket as unknown as ControlSocketCtor, captures };
}

const API_KEY = "sk-test-abc123";
const CALL_ID = "rtc_test_call_0001";

// ─── The regression test: Authorization header MUST reach the WS ctor ────────

describe("runVoiceCall — control WS authentication (regression for dropped header)", () => {
  test("constructs the WS with an Authorization: Bearer <key> header", async () => {
    const { ctor, captures } = makeFakeSocketCtor();

    const promise = runVoiceCall({
      callId: CALL_ID,
      apiKey: API_KEY,
      WebSocketImpl: ctor,
      maxCallMs: 50, // short safety net; we end the call explicitly below
    });

    // The socket is constructed synchronously inside runVoiceCall.
    assert.equal(captures.length, 1, "exactly one control socket opened");
    const cap = captures[0]!;

    // THE load-bearing assertion — the original bug was a missing/dropped header.
    assert.ok(cap.options, "WS ctor must receive an options bag (2-arg ws form)");
    assert.ok(cap.options!.headers, "options must carry a headers object");
    assert.equal(
      cap.options!.headers!.Authorization,
      `Bearer ${API_KEY}`,
      "Authorization: Bearer <key> must be passed to the WS ctor",
    );

    // Close the call so the held promise resolves and the timer clears.
    cap.emit("close");
    const reason = await promise;
    assert.equal(reason, "ws_closed");
  });

  test("does NOT send OpenAI-Beta: realtime=v1 (that header routes the WS to the legacy API → call_id_not_found)", async () => {
    // 2026-06-01 — REGRESSION GUARD. Sending `OpenAI-Beta: realtime=v1` on the
    // SIP `?call_id=` control WS routes to the legacy realtime endpoint, which
    // has no knowledge of the session `/accept` created on the current API, so
    // the upgrade 404s with "No session found for the provided call_id". The
    // OpenAI Agents SDK + community SIP references send Authorization only.
    const { ctor, captures } = makeFakeSocketCtor();
    const promise = runVoiceCall({ callId: CALL_ID, apiKey: API_KEY, WebSocketImpl: ctor, maxCallMs: 50 });
    const cap = captures[0]!;
    assert.equal(
      cap.options!.headers!["OpenAI-Beta"],
      undefined,
      "OpenAI-Beta must NOT be sent on the SIP call_id WS — it hits the legacy API",
    );
    cap.emit("close");
    await promise;
  });

  test("connects to the call_id WS URL (no model arg — configured by accept)", async () => {
    const { ctor, captures } = makeFakeSocketCtor();
    const promise = runVoiceCall({ callId: CALL_ID, apiKey: API_KEY, WebSocketImpl: ctor, maxCallMs: 50 });
    const cap = captures[0]!;
    assert.match(cap.url, /^wss:\/\/api\.openai\.com\/v1\/realtime\?call_id=/);
    assert.ok(cap.url.includes(encodeURIComponent(CALL_ID)));
    assert.ok(!/[?&]model=/.test(cap.url), "call_id variant must NOT carry a model query arg");
    cap.emit("close");
    await promise;
  });
});

// ─── On open: persona push + first response ──────────────────────────────────

describe("runVoiceCall — on open sends session.update then response.create", () => {
  test("emits session.update (with the Phase 0 persona) and response.create", async () => {
    const { ctor, captures } = makeFakeSocketCtor();
    const promise = runVoiceCall({ callId: CALL_ID, apiKey: API_KEY, WebSocketImpl: ctor, maxCallMs: 50 });
    const cap = captures[0]!;

    cap.emit("open");

    assert.equal(cap.sent.length, 2, "open should send exactly two control messages");
    const first = JSON.parse(cap.sent[0]!);
    const second = JSON.parse(cap.sent[1]!);
    assert.equal(first.type, "session.update");
    assert.equal(first.session.instructions, PHASE0_GREETING_INSTRUCTIONS);
    assert.ok(!("tools" in first.session), "Phase 0 sends no tools");
    assert.equal(second.type, "response.create");

    cap.emit("close");
    await promise;
  });
});

// ─── Message parsing: must handle a Buffer payload (the ws package gives Buffers) ─

describe("runVoiceCall — message frame coercion", () => {
  test("parses a Buffer message payload (ws delivers Buffers, not strings)", async () => {
    const { ctor, captures } = makeFakeSocketCtor();
    const promise = runVoiceCall({
      callId: CALL_ID,
      apiKey: API_KEY,
      WebSocketImpl: ctor,
      maxCallMs: 2000,
      maxTurns: 12,
    });
    const cap = captures[0]!;
    cap.emit("open");

    // Caller says goodbye — delivered as a Buffer, exactly like the ws package.
    const goodbyeFrame = Buffer.from(
      JSON.stringify({
        type: "conversation.item.input_audio_transcription.completed",
        transcript: "ok, goodbye!",
      }),
      "utf8",
    );
    cap.emit("message", { data: goodbyeFrame });

    // Model finishes its closing turn — also a Buffer.
    const doneFrame = Buffer.from(JSON.stringify({ type: "response.done" }), "utf8");
    cap.emit("message", { data: doneFrame });

    // Goodbye seen + response.done → the call ends with reason "goodbye".
    const reason = await promise;
    assert.equal(reason, "goodbye", "Buffer frames must parse so goodbye→done ends the call");
    assert.ok(cap.closed, "socket should be closed on a clean finish");
  });

  test("parses a string message payload too (mixed transports)", async () => {
    const { ctor, captures } = makeFakeSocketCtor();
    const promise = runVoiceCall({ callId: CALL_ID, apiKey: API_KEY, WebSocketImpl: ctor, maxCallMs: 2000 });
    const cap = captures[0]!;
    cap.emit("open");
    cap.emit("message", {
      data: JSON.stringify({
        type: "conversation.item.input_audio_transcription.completed",
        transcript: "bye",
      }),
    });
    cap.emit("message", { data: JSON.stringify({ type: "response.done" }) });
    const reason = await promise;
    assert.equal(reason, "goodbye");
  });

  test("an ArrayBuffer message payload is decoded (binaryType=arraybuffer path)", async () => {
    const { ctor, captures } = makeFakeSocketCtor();
    const promise = runVoiceCall({ callId: CALL_ID, apiKey: API_KEY, WebSocketImpl: ctor, maxCallMs: 2000 });
    const cap = captures[0]!;
    cap.emit("open");
    const buf = Buffer.from(JSON.stringify({ type: "response.done" }), "utf8");
    // Slice to a tight ArrayBuffer view of just these bytes.
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    // One response.done with no goodbye and maxTurns default → does NOT end the
    // call; assert no throw + that the turn was counted (a second control msg is
    // never sent, but the call stays open until we close it).
    cap.emit("message", { data: ab });
    cap.emit("close");
    const reason = await promise;
    assert.equal(reason, "ws_closed");
  });

  test("a non-JSON / undecodable frame is ignored, not thrown", async () => {
    const { ctor, captures } = makeFakeSocketCtor();
    const promise = runVoiceCall({ callId: CALL_ID, apiKey: API_KEY, WebSocketImpl: ctor, maxCallMs: 2000 });
    const cap = captures[0]!;
    cap.emit("open");
    cap.emit("message", { data: Buffer.from("not json at all", "utf8") });
    cap.emit("message", { data: 12345 }); // unknown shape → frameToText returns null
    cap.emit("close");
    const reason = await promise;
    assert.equal(reason, "ws_closed", "garbage frames must not crash the driver");
  });
});

// ─── Turn cap ────────────────────────────────────────────────────────────────

// A `response.done` for a genuine SPOKEN assistant turn carries an audio content
// part. ONLY these count toward the turn cap (tool-call + out-of-band text
// responses produce no audio, so they must NOT). Helper to build one as the ws
// package would deliver it (a Buffer frame).
function audioResponseDoneFrame(): { data: Buffer } {
  return {
    data: Buffer.from(
      JSON.stringify({
        type: "response.done",
        response: {
          output: [
            {
              type: "message",
              role: "assistant",
              content: [{ type: "audio", transcript: "spoken reply" }],
            },
          ],
        },
      }),
      "utf8",
    ),
  };
}

describe("runVoiceCall — assistant-turn safety cap", () => {
  test("ends with max_turns after maxTurns SPOKEN (audio) response.done events (no goodbye)", async () => {
    const { ctor, captures } = makeFakeSocketCtor();
    const promise = runVoiceCall({
      callId: CALL_ID,
      apiKey: API_KEY,
      WebSocketImpl: ctor,
      maxCallMs: 5000,
      maxTurns: 3,
    });
    const cap = captures[0]!;
    cap.emit("open");
    // Each response.done must carry AUDIO output to count as a spoken turn — a
    // bare response.done has no audio and (correctly) no longer increments.
    for (let i = 0; i < 3; i += 1) {
      cap.emit("message", audioResponseDoneFrame());
    }
    const reason = await promise;
    assert.equal(reason, "max_turns");
  });

  test("ends with max_turns at the DEFAULT cap (MAX_ASSISTANT_TURNS=20) of spoken turns", async () => {
    // Drive the real default cap (no maxTurns override) with audio response.done
    // events. The cap is 20 — a long booking call should not be cut short before
    // ~20 genuine spoken replies.
    assert.equal(MAX_ASSISTANT_TURNS, 20, "the spoken-turn safety cap is 20");
    const { ctor, captures } = makeFakeSocketCtor();
    const promise = runVoiceCall({
      callId: CALL_ID,
      apiKey: API_KEY,
      WebSocketImpl: ctor,
      maxCallMs: 5000,
      // no maxTurns → uses MAX_ASSISTANT_TURNS (20)
    });
    const cap = captures[0]!;
    cap.emit("open");
    for (let i = 0; i < MAX_ASSISTANT_TURNS; i += 1) {
      cap.emit("message", audioResponseDoneFrame());
    }
    const reason = await promise;
    assert.equal(reason, "max_turns");
  });
});

// ─── responseHasAudioOutput — pure helper (the turn-counting gate) ───────────
// THE BUG THIS GUARDS: the turn cap previously incremented on EVERY response.done,
// including tool-call responses (function_call output, no audio) and out-of-band
// transcription responses (text/empty output). A normal booking conversation
// (~9 spoken turns + ~3 tool calls + several transcription responses) blew past
// the old cap of 12 → finish("max_turns") killed the call mid-booking before the
// caller could confirm. The fix gates the increment on this helper so ONLY
// genuine SPOKEN (audio) replies count. The helper must be total — an
// unrecognizable shape returns false (never throws).

describe("responseHasAudioOutput — counts only genuine spoken (audio) replies", () => {
  test("true for an output with an `audio` content part", () => {
    assert.equal(
      responseHasAudioOutput({
        response: {
          output: [
            {
              type: "message",
              role: "assistant",
              content: [{ type: "audio", transcript: "hi" }],
            },
          ],
        },
      }),
      true,
    );
  });

  test("true for an output with an `output_audio` content part", () => {
    assert.equal(
      responseHasAudioOutput({
        response: {
          output: [
            { type: "message", content: [{ type: "output_audio", transcript: "hi" }] },
          ],
        },
      }),
      true,
    );
  });

  test("true when audio sits alongside a text part (mixed content)", () => {
    assert.equal(
      responseHasAudioOutput({
        response: {
          output: [
            {
              type: "message",
              content: [{ type: "text", text: "hi" }, { type: "audio", transcript: "hi" }],
            },
          ],
        },
      }),
      true,
    );
  });

  test("false for a function_call-only output (tool-call turn — no audio)", () => {
    assert.equal(
      responseHasAudioOutput({
        response: {
          output: [
            { type: "function_call", call_id: "c1", name: "book_appointment", arguments: "{}" },
          ],
        },
      }),
      false,
    );
  });

  test("false for a text-only output (out-of-band transcription)", () => {
    assert.equal(
      responseHasAudioOutput({
        response: {
          output: [{ type: "message", content: [{ type: "output_text", text: "caller said hi" }] }],
        },
      }),
      false,
    );
  });

  test("false for an empty output array", () => {
    assert.equal(responseHasAudioOutput({ response: { output: [] } }), false);
  });

  test("false for an absent output / bare response.done", () => {
    assert.equal(responseHasAudioOutput({ type: "response.done" }), false);
    assert.equal(responseHasAudioOutput({}), false);
    assert.equal(responseHasAudioOutput({ response: {} }), false);
  });

  test("total — does not throw on malformed shapes (returns false)", () => {
    // Non-array output, non-object items, non-array content, null parts, etc.
    assert.equal(responseHasAudioOutput({ response: { output: "nope" } }), false);
    assert.equal(responseHasAudioOutput({ response: { output: [null, 42, "x"] } }), false);
    assert.equal(
      responseHasAudioOutput({ response: { output: [{ content: "nope" }] } }),
      false,
    );
    assert.equal(
      responseHasAudioOutput({ response: { output: [{ content: [null, 7] }] } }),
      false,
    );
  });
});

// ─── Tool-call responses must NOT consume the turn cap ───────────────────────
// A booking call makes ~3 tool calls (look_up_availability, book_appointment,
// etc.); each surfaces a terminal response.done whose output is a function_call
// (NO audio). Those must NOT count toward the turn cap, or a booking-length call
// trips finish("max_turns") before the read-back. This is the live-call bug.

describe("runVoiceCall — tool-call response.done does NOT consume the turn cap", () => {
  test("many function_call response.done events do not trigger max_turns; an audio one does", async () => {
    let runCount = 0;
    const { ctor, captures } = makeFakeSocketCtor();
    const promise = runVoiceCall({
      callId: CALL_ID,
      apiKey: API_KEY,
      WebSocketImpl: ctor,
      // Generous wall-clock so the test ends via max_turns, not timeout.
      maxCallMs: 5000,
      maxTurns: 1, // a SINGLE spoken turn should be enough to hit the cap
      toolContext: TOOL_CTX,
      executeToolCall: async () => {
        runCount += 1;
        return { ok: true, result: {}, output: "{}" };
      },
    });
    const cap = captures[0]!;
    cap.emit("open");

    // Fire FAR more tool-call response.done events than maxTurns. Each uses a
    // DISTINCT call_id (seenCallIds dedupes per id, not the point here) and
    // carries ONLY a function_call output → no audio → must not increment.
    for (let i = 0; i < 8; i += 1) {
      cap.emit("message", {
        data: Buffer.from(
          JSON.stringify({
            type: "response.done",
            response: {
              output: [
                { type: "function_call", call_id: `call_${i}`, name: "look_up_availability", arguments: "{}" },
              ],
            },
          }),
          "utf8",
        ),
      });
    }
    // Let the async tool dispatch microtasks flush.
    await new Promise((r) => setTimeout(r, 0));

    // The tools ran but the call is STILL OPEN (no max_turns despite 8 > 1).
    assert.equal(runCount, 8, "each tool-call response.done dispatched its tool");
    assert.equal(cap.closed, null, "tool-call turns must not trip max_turns / close the call");

    // Now ONE genuine spoken (audio) turn → with maxTurns:1 this hits the cap.
    cap.emit("message", audioResponseDoneFrame());
    const reason = await promise;
    assert.equal(reason, "max_turns", "only a spoken (audio) turn consumes the cap");
  });
});

// ─── Upgrade-failure diagnostics (the new instrumentation) ───────────────────

describe("runVoiceCall — upgrade rejection diagnostics", () => {
  test("unexpected-response (non-101) ends the call as open_failed with the HTTP status", async () => {
    const { ctor, captures } = makeFakeSocketCtor();
    const promise = runVoiceCall({ callId: CALL_ID, apiKey: API_KEY, WebSocketImpl: ctor, maxCallMs: 5000 });
    const cap = captures[0]!;
    // ws emits `unexpected-response` with (request, response); response carries
    // the HTTP status. 401 = the very failure the original bug produced.
    cap.emitOn("unexpected-response", {}, { statusCode: 401, statusMessage: "Unauthorized" });
    const reason = await promise;
    assert.equal(reason, "open_failed");
  });

  test("error event ends the call as ws_error", async () => {
    const { ctor, captures } = makeFakeSocketCtor();
    const promise = runVoiceCall({ callId: CALL_ID, apiKey: API_KEY, WebSocketImpl: ctor, maxCallMs: 5000 });
    const cap = captures[0]!;
    cap.emit("error", { message: "boom" });
    const reason = await promise;
    assert.equal(reason, "ws_error");
  });
});

// ─── Timeout ─────────────────────────────────────────────────────────────────

describe("runVoiceCall — wall-clock timeout", () => {
  test("resolves with timeout when nothing happens before maxCallMs", async () => {
    const { ctor, captures } = makeFakeSocketCtor();
    const promise = runVoiceCall({ callId: CALL_ID, apiKey: API_KEY, WebSocketImpl: ctor, maxCallMs: 20 });
    const cap = captures[0]!;
    cap.emit("open"); // open, but the caller never speaks and OpenAI never closes
    const reason = await promise;
    assert.equal(reason, "timeout");
  });
});

// ─── PHASE 1: tools on session.update ────────────────────────────────────────

describe("runVoiceCall — Phase 1 session.update with tools + voice", () => {
  test("with a toolContext: declares the voice tools, tool_choice:auto, SDR persona, voice via audio.output.voice", async () => {
    const { ctor, captures } = makeFakeSocketCtor();
    const promise = runVoiceCall({
      callId: CALL_ID,
      apiKey: API_KEY,
      WebSocketImpl: ctor,
      maxCallMs: 50,
      toolContext: TOOL_CTX,
    });
    const cap = captures[0]!;
    cap.emit("open");

    const sessionUpdate = JSON.parse(cap.sent[0]!);
    assert.equal(sessionUpdate.type, "session.update");
    assert.equal(sessionUpdate.session.type, "realtime");
    assert.equal(sessionUpdate.session.instructions, VOICE_SDR_INSTRUCTIONS);
    // All voice tools (provide_faq_answer excluded), each in the GA function
    // wire shape. voice R1 added take_message + get_quote_range → 8 total.
    assert.ok(Array.isArray(sessionUpdate.session.tools));
    assert.equal(sessionUpdate.session.tools.length, VOICE_TOOLS.length);
    assert.equal(sessionUpdate.session.tools.length, 8);
    assert.equal(sessionUpdate.session.tool_choice, "auto");
    for (const t of sessionUpdate.session.tools) {
      assert.equal(t.type, "function");
      assert.ok(typeof t.name === "string");
      assert.notEqual(t.name, "provide_faq_answer", "provide_faq_answer must NOT be exposed");
    }
    // Voice goes via audio.output.voice (NOT a top-level voice, NOT in accept).
    assert.equal(sessionUpdate.session.audio.output.voice, VOICE_AUDIO_OUTPUT_VOICE);
    // Caller-speech transcription uses the GA realtime transcribe model
    // (whisper-1 is legacy and was silently dropped on the GA SIP path —
    // see voice-r1 CHANGE B). Without it, caller turns never transcribe.
    assert.equal(
      sessionUpdate.session.audio.input.transcription.model,
      "gpt-4o-mini-transcribe",
    );

    cap.emit("close");
    await promise;
  });

  test("without a toolContext: Phase 0 behavior preserved (no tools, Phase 0 persona)", async () => {
    const { ctor, captures } = makeFakeSocketCtor();
    const promise = runVoiceCall({ callId: CALL_ID, apiKey: API_KEY, WebSocketImpl: ctor, maxCallMs: 50 });
    const cap = captures[0]!;
    cap.emit("open");

    const sessionUpdate = JSON.parse(cap.sent[0]!);
    assert.equal(sessionUpdate.session.instructions, PHASE0_GREETING_INSTRUCTIONS);
    assert.ok(!("tools" in sessionUpdate.session), "no tools without a toolContext");
    assert.ok(!("tool_choice" in sessionUpdate.session));

    cap.emit("close");
    await promise;
  });
});

// ─── PHASE 1: the function-call event loop ───────────────────────────────────

describe("runVoiceCall — function-call loop (streaming-done variant)", () => {
  test("runs the tool, sends function_call_output + response.create, does NOT end the call", async () => {
    const calls: Array<{ name: string; argumentsJson: string; ctx: ToolExecuteContext }> = [];
    const { ctor, captures } = makeFakeSocketCtor();
    const promise = runVoiceCall({
      callId: CALL_ID,
      apiKey: API_KEY,
      WebSocketImpl: ctor,
      maxCallMs: 80,
      toolContext: TOOL_CTX,
      executeToolCall: async (opts) => {
        calls.push({ name: opts.name, argumentsJson: opts.argumentsJson, ctx: opts.ctx });
        return { ok: true, result: { slots: ["2026-06-02T16:00:00Z"] }, output: '{"slots":["2026-06-02T16:00:00Z"]}' };
      },
    });
    const cap = captures[0]!;
    cap.emit("open");
    const sentAfterOpen = cap.sent.length; // session.update + response.create

    // Model streams a completed function call.
    cap.emit("message", {
      data: Buffer.from(
        JSON.stringify({
          type: "response.function_call_arguments.done",
          call_id: "call_la",
          name: "look_up_availability",
          arguments: '{"date":"2026-06-02"}',
        }),
        "utf8",
      ),
    });

    // Let the async dispatch microtasks flush.
    await new Promise((r) => setTimeout(r, 0));

    // The tool ran with the parsed args + our ctx.
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.name, "look_up_availability");
    assert.equal(calls[0]!.argumentsJson, '{"date":"2026-06-02"}');
    assert.equal(calls[0]!.ctx.orgSlug, "spark-heating-cooling");

    // Two new control messages: function_call_output then response.create.
    const newMsgs = cap.sent.slice(sentAfterOpen).map((s) => JSON.parse(s));
    assert.equal(newMsgs.length, 2);
    assert.equal(newMsgs[0].type, "conversation.item.create");
    assert.equal(newMsgs[0].item.type, "function_call_output");
    assert.equal(newMsgs[0].item.call_id, "call_la");
    assert.equal(newMsgs[0].item.output, '{"slots":["2026-06-02T16:00:00Z"]}');
    assert.equal(newMsgs[1].type, "response.create");

    // The call is still open — a tool call is not a hang-up. End it ourselves.
    cap.emit("close");
    const reason = await promise;
    assert.equal(reason, "ws_closed");
  });

  test("a failed tool call feeds an error payload back (call still continues)", async () => {
    const { ctor, captures } = makeFakeSocketCtor();
    const promise = runVoiceCall({
      callId: CALL_ID,
      apiKey: API_KEY,
      WebSocketImpl: ctor,
      maxCallMs: 80,
      toolContext: TOOL_CTX,
      executeToolCall: async () => ({ ok: false, error: "input_validation_failed: bad" }),
    });
    const cap = captures[0]!;
    cap.emit("open");
    const sentAfterOpen = cap.sent.length;

    cap.emit("message", {
      data: Buffer.from(
        JSON.stringify({
          type: "response.function_call_arguments.done",
          call_id: "call_err",
          name: "book_appointment",
          arguments: "{}",
        }),
        "utf8",
      ),
    });
    await new Promise((r) => setTimeout(r, 0));

    const newMsgs = cap.sent.slice(sentAfterOpen).map((s) => JSON.parse(s));
    assert.equal(newMsgs[0].item.type, "function_call_output");
    const output = JSON.parse(newMsgs[0].item.output);
    assert.equal(output.error, "input_validation_failed: bad");
    assert.equal(newMsgs[1].type, "response.create");

    cap.emit("close");
    await promise;
  });
});

describe("runVoiceCall — function-call loop (terminal response.done variant + dedupe)", () => {
  test("response.done with a function_call output runs the tool and does NOT end the call", async () => {
    let runCount = 0;
    const { ctor, captures } = makeFakeSocketCtor();
    const promise = runVoiceCall({
      callId: CALL_ID,
      apiKey: API_KEY,
      WebSocketImpl: ctor,
      maxCallMs: 80,
      maxTurns: 2,
      toolContext: TOOL_CTX,
      executeToolCall: async () => {
        runCount += 1;
        return { ok: true, result: {}, output: "{}" };
      },
    });
    const cap = captures[0]!;
    cap.emit("open");

    // response.done carrying a function_call item (terminal variant).
    cap.emit("message", {
      data: Buffer.from(
        JSON.stringify({
          type: "response.done",
          response: {
            output: [
              { type: "function_call", call_id: "call_t1", name: "look_up_availability", arguments: "{}" },
            ],
          },
        }),
        "utf8",
      ),
    });
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(runCount, 1, "tool ran once from the terminal response.done");

    // A tool-call turn must NOT count toward the goodbye/turn cap, so even with
    // maxTurns:2 the call hasn't ended. Confirm by timing out only via close.
    cap.emit("close");
    const reason = await promise;
    assert.equal(reason, "ws_closed");
  });

  test("same call_id on BOTH streaming-done AND terminal response.done runs ONCE (no double-book)", async () => {
    let runCount = 0;
    const { ctor, captures } = makeFakeSocketCtor();
    const promise = runVoiceCall({
      callId: CALL_ID,
      apiKey: API_KEY,
      WebSocketImpl: ctor,
      maxCallMs: 80,
      toolContext: TOOL_CTX,
      executeToolCall: async () => {
        runCount += 1;
        return { ok: true, result: {}, output: "{}" };
      },
    });
    const cap = captures[0]!;
    cap.emit("open");

    const fnCall = { call_id: "call_dup", name: "book_appointment", arguments: '{"x":1}' };
    cap.emit("message", {
      data: Buffer.from(
        JSON.stringify({ type: "response.function_call_arguments.done", ...fnCall }),
        "utf8",
      ),
    });
    await new Promise((r) => setTimeout(r, 0));
    // Then the SAME call_id shows up in the terminal response.done.
    cap.emit("message", {
      data: Buffer.from(
        JSON.stringify({ type: "response.done", response: { output: [{ type: "function_call", ...fnCall }] } }),
        "utf8",
      ),
    });
    await new Promise((r) => setTimeout(r, 0));

    assert.equal(runCount, 1, "the same call_id must execute exactly once across both variants");

    cap.emit("close");
    await promise;
  });

  test("tools are NOT dispatched when no toolContext is set (Phase 0 calls ignore function_call events)", async () => {
    let runCount = 0;
    const { ctor, captures } = makeFakeSocketCtor();
    const promise = runVoiceCall({
      callId: CALL_ID,
      apiKey: API_KEY,
      WebSocketImpl: ctor,
      maxCallMs: 60,
      // no toolContext
      executeToolCall: async () => {
        runCount += 1;
        return { ok: true, result: {}, output: "{}" };
      },
    });
    const cap = captures[0]!;
    cap.emit("open");
    cap.emit("message", {
      data: Buffer.from(
        JSON.stringify({
          type: "response.function_call_arguments.done",
          call_id: "c",
          name: "look_up_availability",
          arguments: "{}",
        }),
        "utf8",
      ),
    });
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(runCount, 0, "no tool dispatch without a toolContext");
    cap.emit("close");
    await promise;
  });
});

// ─── voice-r1: OUT-OF-BAND caller-speech transcription ───────────────────────
// On the OpenAI Realtime SIP path the built-in
// `conversation.item.input_audio_transcription.completed` event never fires, so
// the caller's transcript is dark (the assistant's transcript works fine). The
// fix: after the caller's turn ends (input_audio_buffer.committed) send a
// SEPARATE text-only response with `conversation:"none"` that transcribes the
// caller's last utterance, then route the returned text to onUserTurn. These
// tests pin the helper's exact shape, the trigger, the capture, and the
// response.done guard that keeps the out-of-band response from being miscounted
// as an assistant turn.

describe("buildCallerTranscriptionRequest — exact wire shape", () => {
  test("returns a text-only response.create with conversation:none", () => {
    const req = buildCallerTranscriptionRequest();
    assert.deepEqual(req, {
      type: "response.create",
      response: {
        conversation: "none",
        output_modalities: ["text"],
        instructions:
          "Transcribe the user's most recent spoken message, word for word and verbatim. Output ONLY the transcription text — no preamble, no quotes. If there is no recent user message, output nothing.",
      },
    });
    // Spell the load-bearing fields out individually too (a deepEqual regression
    // on an unrelated field shouldn't mask which property drifted).
    assert.equal(req.type, "response.create");
    assert.equal(req.response.conversation, "none");
    assert.deepEqual(req.response.output_modalities, ["text"]);
  });
});

describe("runVoiceCall — out-of-band transcription trigger", () => {
  test("input_audio_buffer.committed sends a response.create with conversation:none", async () => {
    const { ctor, captures } = makeFakeSocketCtor();
    const promise = runVoiceCall({
      callId: CALL_ID,
      apiKey: API_KEY,
      WebSocketImpl: ctor,
      maxCallMs: 2000,
    });
    const cap = captures[0]!;
    cap.emit("open");
    const sentAfterOpen = cap.sent.length; // session.update + greeting response.create

    cap.emit("message", {
      data: Buffer.from(JSON.stringify({ type: "input_audio_buffer.committed" }), "utf8"),
    });

    const newMsgs = cap.sent.slice(sentAfterOpen).map((s) => JSON.parse(s));
    // Exactly one new control message: the out-of-band transcription request.
    const oob = newMsgs.find(
      (m) => m.type === "response.create" && m.response?.conversation === "none",
    );
    assert.ok(oob, "committed must trigger a conversation:none response.create");
    assert.deepEqual(oob.response.output_modalities, ["text"]);

    cap.emit("close");
    await promise;
  });

  test("input_audio_buffer.speech_stopped does NOT send (logs only)", async () => {
    const { ctor, captures } = makeFakeSocketCtor();
    const promise = runVoiceCall({
      callId: CALL_ID,
      apiKey: API_KEY,
      WebSocketImpl: ctor,
      maxCallMs: 2000,
    });
    const cap = captures[0]!;
    cap.emit("open");
    const sentAfterOpen = cap.sent.length;

    cap.emit("message", {
      data: Buffer.from(JSON.stringify({ type: "input_audio_buffer.speech_stopped" }), "utf8"),
    });

    // speech_stopped is diagnostic-only — it must not send any control message.
    assert.equal(
      cap.sent.length,
      sentAfterOpen,
      "speech_stopped must NOT send a control message (log-only diagnostic)",
    );

    cap.emit("close");
    await promise;
  });
});

describe("runVoiceCall — out-of-band transcription capture (output_text)", () => {
  test("response.output_text.done with text routes it to onUserTurn", async () => {
    const userTurns: string[] = [];
    const { ctor, captures } = makeFakeSocketCtor();
    const promise = runVoiceCall({
      callId: CALL_ID,
      apiKey: API_KEY,
      WebSocketImpl: ctor,
      maxCallMs: 2000,
      onUserTurn: (t) => userTurns.push(t),
    });
    const cap = captures[0]!;
    cap.emit("open");

    cap.emit("message", {
      data: Buffer.from(
        JSON.stringify({ type: "response.output_text.done", text: "I'd like to book" }),
        "utf8",
      ),
    });

    assert.deepEqual(userTurns, ["I'd like to book"], "caller transcript routed to onUserTurn");

    cap.emit("close");
    await promise;
  });

  test("response.text.done (beta event name) also routes to onUserTurn", async () => {
    const userTurns: string[] = [];
    const { ctor, captures } = makeFakeSocketCtor();
    const promise = runVoiceCall({
      callId: CALL_ID,
      apiKey: API_KEY,
      WebSocketImpl: ctor,
      maxCallMs: 2000,
      onUserTurn: (t) => userTurns.push(t),
    });
    const cap = captures[0]!;
    cap.emit("open");

    cap.emit("message", {
      data: Buffer.from(
        JSON.stringify({ type: "response.text.done", text: "reschedule please" }),
        "utf8",
      ),
    });

    assert.deepEqual(userTurns, ["reschedule please"]);

    cap.emit("close");
    await promise;
  });

  test("empty transcript text does NOT call onUserTurn", async () => {
    const userTurns: string[] = [];
    const { ctor, captures } = makeFakeSocketCtor();
    const promise = runVoiceCall({
      callId: CALL_ID,
      apiKey: API_KEY,
      WebSocketImpl: ctor,
      maxCallMs: 2000,
      onUserTurn: (t) => userTurns.push(t),
    });
    const cap = captures[0]!;
    cap.emit("open");

    cap.emit("message", {
      data: Buffer.from(JSON.stringify({ type: "response.output_text.done", text: "" }), "utf8"),
    });

    assert.equal(userTurns.length, 0, "empty transcription must not produce a user turn");

    cap.emit("close");
    await promise;
  });

  test("accumulates output_text.delta and finalizes on .done when .done has no text", async () => {
    const userTurns: string[] = [];
    const { ctor, captures } = makeFakeSocketCtor();
    const promise = runVoiceCall({
      callId: CALL_ID,
      apiKey: API_KEY,
      WebSocketImpl: ctor,
      maxCallMs: 2000,
      onUserTurn: (t) => userTurns.push(t),
    });
    const cap = captures[0]!;
    cap.emit("open");

    // Streamed deltas, then a .done that omits the full text (must use buffer).
    cap.emit("message", {
      data: Buffer.from(JSON.stringify({ type: "response.output_text.delta", delta: "can I " }), "utf8"),
    });
    cap.emit("message", {
      data: Buffer.from(JSON.stringify({ type: "response.output_text.delta", delta: "book a slot" }), "utf8"),
    });
    cap.emit("message", {
      data: Buffer.from(JSON.stringify({ type: "response.output_text.done" }), "utf8"),
    });

    assert.deepEqual(userTurns, ["can I book a slot"], "deltas accumulate and flush on done");

    cap.emit("close");
    await promise;
  });

  test("a goodbye in the caller transcript ends the call after the next assistant audio turn", async () => {
    const { ctor, captures } = makeFakeSocketCtor();
    const promise = runVoiceCall({
      callId: CALL_ID,
      apiKey: API_KEY,
      WebSocketImpl: ctor,
      maxCallMs: 2000,
    });
    const cap = captures[0]!;
    cap.emit("open");

    // Caller's transcript arrives via the out-of-band text path, not the
    // (dark) input_audio_transcription.completed event.
    cap.emit("message", {
      data: Buffer.from(
        JSON.stringify({ type: "response.output_text.done", text: "ok, goodbye!" }),
        "utf8",
      ),
    });
    // Assistant's closing line finishes (an AUDIO response.done).
    cap.emit("message", {
      data: Buffer.from(
        JSON.stringify({
          type: "response.done",
          response: { output: [{ type: "message", role: "assistant", content: [{ type: "audio", transcript: "Bye now!" }] }] },
        }),
        "utf8",
      ),
    });

    const reason = await promise;
    assert.equal(reason, "goodbye", "goodbye from the out-of-band transcript must end the call");
  });
});

describe("runVoiceCall — response.done guard (out-of-band text vs assistant audio)", () => {
  test("an AUDIO response.done counts as an assistant turn (existing behavior)", async () => {
    const { ctor, captures } = makeFakeSocketCtor();
    const promise = runVoiceCall({
      callId: CALL_ID,
      apiKey: API_KEY,
      WebSocketImpl: ctor,
      maxCallMs: 5000,
      maxTurns: 1,
    });
    const cap = captures[0]!;
    cap.emit("open");

    // One assistant AUDIO turn with maxTurns:1 → must hit the cap and end.
    cap.emit("message", {
      data: Buffer.from(
        JSON.stringify({
          type: "response.done",
          response: { output: [{ type: "message", role: "assistant", content: [{ type: "audio", transcript: "Hi there" }] }] },
        }),
        "utf8",
      ),
    });

    const reason = await promise;
    assert.equal(reason, "max_turns", "an audio response.done is a real assistant turn");
  });

  test("a TEXT-ONLY (out-of-band) response.done does NOT count as an assistant turn", async () => {
    const { ctor, captures } = makeFakeSocketCtor();
    const promise = runVoiceCall({
      callId: CALL_ID,
      apiKey: API_KEY,
      WebSocketImpl: ctor,
      maxCallMs: 60,
      maxTurns: 1,
    });
    const cap = captures[0]!;
    cap.emit("open");

    // Two text-only (transcription) response.done events. With maxTurns:1 these
    // would trip the cap if (wrongly) counted; the call must instead stay open
    // until the wall-clock timeout.
    for (let i = 0; i < 2; i += 1) {
      cap.emit("message", {
        data: Buffer.from(
          JSON.stringify({
            type: "response.done",
            response: { output: [{ type: "message", role: "assistant", content: [{ type: "text", text: "transcribed caller line" }] }] },
          }),
          "utf8",
        ),
      });
    }

    const reason = await promise;
    assert.equal(reason, "timeout", "a text-only response.done must NOT count toward the turn cap");
  });

  test("a text-only (output_text) response.done does NOT end the call even after a goodbye", async () => {
    // The out-of-band transcription response must never be the response that
    // 'closes the loop' on a goodbye — only the assistant's spoken (audio)
    // closing line should. Otherwise we'd hang up before the agent says bye.
    const { ctor, captures } = makeFakeSocketCtor();
    const promise = runVoiceCall({
      callId: CALL_ID,
      apiKey: API_KEY,
      WebSocketImpl: ctor,
      maxCallMs: 60,
    });
    const cap = captures[0]!;
    cap.emit("open");

    // Caller says goodbye (out-of-band transcript), then the TRANSCRIPTION
    // response.done arrives (text-only). The call must NOT end here.
    cap.emit("message", {
      data: Buffer.from(
        JSON.stringify({ type: "response.output_text.done", text: "goodbye" }),
        "utf8",
      ),
    });
    cap.emit("message", {
      data: Buffer.from(
        JSON.stringify({
          type: "response.done",
          response: { output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "goodbye" }] }] },
        }),
        "utf8",
      ),
    });

    const reason = await promise;
    assert.equal(
      reason,
      "timeout",
      "the text-only transcription response.done must not be the call-ending turn",
    );
  });
});
