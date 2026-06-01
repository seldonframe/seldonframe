// Phase 1 voice — tests for the pure function-call event parser + the
// function_call_output item builder (realtime-function-calls.ts). These are the
// load-bearing pure pieces of the realtime function-call loop; the WS wiring
// around them is integration-only (a live phone call).
//
// node:test + DI, matching realtime-tools.spec.ts. No mocks needed here — the
// parser is pure, so we just feed it event shapes (both API variants) and a
// seen-set and assert what it extracts.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  parseFunctionCalls,
  buildFunctionCallOutputItem,
} from "../../../../src/lib/agents/voice/realtime-function-calls";

const NO_SEEN = new Set<string>();

// ─── streaming path: response.function_call_arguments.done ──────────────────

describe("parseFunctionCalls — response.function_call_arguments.done", () => {
  test("extracts a single call (call_id, name, arguments string)", () => {
    const calls = parseFunctionCalls(
      {
        type: "response.function_call_arguments.done",
        call_id: "call_abc",
        name: "look_up_availability",
        arguments: '{"date":"2026-06-02"}',
      },
      NO_SEEN,
    );
    assert.deepEqual(calls, [
      {
        callId: "call_abc",
        name: "look_up_availability",
        argumentsJson: '{"date":"2026-06-02"}',
      },
    ]);
  });

  test("missing arguments → normalized to empty string (zero-arg call)", () => {
    const calls = parseFunctionCalls(
      {
        type: "response.function_call_arguments.done",
        call_id: "call_x",
        name: "escalate_to_human",
      },
      NO_SEEN,
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.argumentsJson, "");
  });

  test("already-seen call_id is skipped (dedupe)", () => {
    const seen = new Set<string>(["call_dup"]);
    const calls = parseFunctionCalls(
      {
        type: "response.function_call_arguments.done",
        call_id: "call_dup",
        name: "book_appointment",
        arguments: "{}",
      },
      seen,
    );
    assert.deepEqual(calls, []);
  });

  test("missing call_id or name → no calls (defensive)", () => {
    assert.deepEqual(
      parseFunctionCalls(
        { type: "response.function_call_arguments.done", name: "x", arguments: "{}" },
        NO_SEEN,
      ),
      [],
    );
    assert.deepEqual(
      parseFunctionCalls(
        { type: "response.function_call_arguments.done", call_id: "c", arguments: "{}" },
        NO_SEEN,
      ),
      [],
    );
  });
});

// ─── terminal path: response.done → response.output[] ───────────────────────

describe("parseFunctionCalls — response.done output[] function_call items", () => {
  test("extracts function_call items, ignoring non-function_call output", () => {
    const calls = parseFunctionCalls(
      {
        type: "response.done",
        response: {
          output: [
            { type: "message", role: "assistant", content: [] },
            {
              type: "function_call",
              call_id: "call_1",
              name: "look_up_availability",
              arguments: '{"date":"2026-06-03"}',
            },
          ],
        },
      },
      NO_SEEN,
    );
    assert.deepEqual(calls, [
      {
        callId: "call_1",
        name: "look_up_availability",
        argumentsJson: '{"date":"2026-06-03"}',
      },
    ]);
  });

  test("extracts multiple function_call items in order", () => {
    const calls = parseFunctionCalls(
      {
        type: "response.done",
        response: {
          output: [
            { type: "function_call", call_id: "c1", name: "a", arguments: "{}" },
            { type: "function_call", call_id: "c2", name: "b", arguments: "{}" },
          ],
        },
      },
      NO_SEEN,
    );
    assert.equal(calls.length, 2);
    assert.equal(calls[0]!.callId, "c1");
    assert.equal(calls[1]!.callId, "c2");
  });

  test("skips call_ids already in the seen set", () => {
    const seen = new Set<string>(["c1"]);
    const calls = parseFunctionCalls(
      {
        type: "response.done",
        response: {
          output: [
            { type: "function_call", call_id: "c1", name: "a", arguments: "{}" },
            { type: "function_call", call_id: "c2", name: "b", arguments: "{}" },
          ],
        },
      },
      seen,
    );
    assert.deepEqual(
      calls.map((c) => c.callId),
      ["c2"],
    );
  });

  test("de-dupes a call_id repeated WITHIN the same response.done", () => {
    const calls = parseFunctionCalls(
      {
        type: "response.done",
        response: {
          output: [
            { type: "function_call", call_id: "c1", name: "a", arguments: "{}" },
            { type: "function_call", call_id: "c1", name: "a", arguments: "{}" },
          ],
        },
      },
      NO_SEEN,
    );
    assert.equal(calls.length, 1);
  });

  test("response.done with no output array → no calls", () => {
    assert.deepEqual(
      parseFunctionCalls({ type: "response.done", response: {} }, NO_SEEN),
      [],
    );
    assert.deepEqual(
      parseFunctionCalls({ type: "response.done" }, NO_SEEN),
      [],
    );
  });

  test("response.done whose output is only a spoken message → no calls", () => {
    const calls = parseFunctionCalls(
      {
        type: "response.done",
        response: {
          output: [
            {
              type: "message",
              role: "assistant",
              content: [{ type: "audio", transcript: "Hi there!" }],
            },
          ],
        },
      },
      NO_SEEN,
    );
    assert.deepEqual(calls, []);
  });
});

// ─── irrelevant / malformed events ──────────────────────────────────────────

describe("parseFunctionCalls — irrelevant events", () => {
  test("unrelated event types → no calls", () => {
    for (const type of [
      "response.audio.delta",
      "conversation.item.input_audio_transcription.completed",
      "rate_limits.updated",
      "error",
    ]) {
      assert.deepEqual(parseFunctionCalls({ type }, NO_SEEN), [], type);
    }
  });

  test("missing/non-string type → no calls, does not throw", () => {
    assert.deepEqual(parseFunctionCalls({}, NO_SEEN), []);
    assert.deepEqual(
      parseFunctionCalls({ type: 42 } as unknown as { type?: unknown }, NO_SEEN),
      [],
    );
  });
});

// ─── buildFunctionCallOutputItem ────────────────────────────────────────────

describe("buildFunctionCallOutputItem — wire shape", () => {
  test("builds a conversation.item.create with function_call_output", () => {
    const item = buildFunctionCallOutputItem(
      "call_99",
      '{"slots":["2026-06-02T16:00:00Z"]}',
    );
    assert.deepEqual(item, {
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: "call_99",
        output: '{"slots":["2026-06-02T16:00:00Z"]}',
      },
    });
  });

  test("passes the output string through verbatim (error payloads too)", () => {
    const item = buildFunctionCallOutputItem("c", '{"error":"unknown_tool"}');
    assert.equal(item.item.output, '{"error":"unknown_tool"}');
    assert.equal(item.item.call_id, "c");
  });
});
