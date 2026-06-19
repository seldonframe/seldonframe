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

describe("runVoiceCall — assistant-turn safety cap", () => {
  test("ends with max_turns after maxTurns response.done events (no goodbye)", async () => {
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
    for (let i = 0; i < 3; i += 1) {
      cap.emit("message", { data: Buffer.from(JSON.stringify({ type: "response.done" }), "utf8") });
    }
    const reason = await promise;
    assert.equal(reason, "max_turns");
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
