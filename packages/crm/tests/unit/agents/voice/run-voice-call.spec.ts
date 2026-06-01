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
  PHASE0_GREETING_INSTRUCTIONS,
  type ControlSocket,
  type ControlSocketCtor,
} from "../../../../src/lib/agents/voice/openai-realtime";

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

  test("also sends the OpenAI-Beta: realtime=v1 header", async () => {
    const { ctor, captures } = makeFakeSocketCtor();
    const promise = runVoiceCall({ callId: CALL_ID, apiKey: API_KEY, WebSocketImpl: ctor, maxCallMs: 50 });
    const cap = captures[0]!;
    assert.equal(cap.options!.headers!["OpenAI-Beta"], "realtime=v1");
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
