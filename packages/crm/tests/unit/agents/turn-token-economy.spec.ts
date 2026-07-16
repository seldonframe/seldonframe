// Token-smart runtime (2026-07-16) — unit properties for the shared token
// economy helpers that both agentic loops (runtime.ts + stateless-turn.ts)
// consume. Born from the live incident where untruncated, uncached
// GMAIL_FETCH_EMAILS payloads re-sent every iteration burned a $20 top-up in
// 34 minutes.
//
// Properties under test:
//   - serializeToolResultCapped: passthrough under cap · truncation marker over
//     cap · null/undefined → "null" · circular → fixed marker, never throws
//   - capErrorText: passthrough under cap · truncation over cap
//   - cachedSystemBlocks: non-empty → single cache-marked block · blank →
//     returned verbatim (API "empty text block" behavior unchanged)
//   - cachedToolParams: marker ONLY on last tool · input array not mutated ·
//     empty → as-is
//   - withMovingCacheBreakpoint: marker on last block of last message ·
//     string content converted to a marked text block · copy-on-write (working
//     array untouched → markers never accumulate) · empty-string/empty-array
//     last message → unchanged

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  TOOL_RESULT_MAX_CHARS,
  serializeToolResultCapped,
  capErrorText,
  cachedSystemBlocks,
  cachedToolParams,
  withMovingCacheBreakpoint,
  type LooseMessage,
} from "@/lib/agents/turn-token-economy";

describe("serializeToolResultCapped", () => {
  test("small output passes through as plain JSON, no marker", () => {
    const out = serializeToolResultCapped({ ok: true, id: "x" });
    assert.equal(out, JSON.stringify({ ok: true, id: "x" }));
  });

  test("null and undefined serialize to \"null\" (previous inline behavior)", () => {
    assert.equal(serializeToolResultCapped(null), "null");
    assert.equal(serializeToolResultCapped(undefined), "null");
  });

  test("oversized output is truncated at the cap with an explicit marker", () => {
    const big = { emails: "x".repeat(TOOL_RESULT_MAX_CHARS * 2) };
    const out = serializeToolResultCapped(big);
    assert.ok(out.length < TOOL_RESULT_MAX_CHARS + 300, "stays near the cap");
    assert.ok(out.includes("[tool result truncated"), "carries the marker");
    assert.ok(
      out.includes(`showing ${TOOL_RESULT_MAX_CHARS} of `),
      "marker states cap and original size",
    );
  });

  test("respects a custom cap", () => {
    const out = serializeToolResultCapped({ a: "y".repeat(500) }, 100);
    assert.ok(out.startsWith(JSON.stringify({ a: "y".repeat(500) }).slice(0, 100)));
    assert.ok(out.includes("truncated"));
  });

  test("circular output returns the fixed marker instead of throwing", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    assert.equal(
      serializeToolResultCapped(circular),
      "[tool result was not serializable]",
    );
  });
});

describe("capErrorText", () => {
  test("short error passes through", () => {
    assert.equal(capErrorText("boom"), "boom");
  });

  test("long error is truncated with a marker", () => {
    const out = capErrorText("e".repeat(10_000));
    assert.ok(out.length < 2_100);
    assert.ok(out.includes("[error truncated"));
  });
});

describe("cachedSystemBlocks", () => {
  test("non-empty prompt becomes one cache-marked text block", () => {
    const out = cachedSystemBlocks("You are helpful.");
    assert.deepEqual(out, [
      {
        type: "text",
        text: "You are helpful.",
        cache_control: { type: "ephemeral" },
      },
    ]);
  });

  test("blank prompt is returned verbatim (no empty block minted)", () => {
    assert.equal(cachedSystemBlocks(""), "");
    assert.equal(cachedSystemBlocks("   "), "   ");
  });
});

describe("cachedToolParams", () => {
  test("marks ONLY the last tool and does not mutate the input", () => {
    const tools = [
      { name: "a", description: "", input_schema: {} },
      { name: "b", description: "", input_schema: {} },
    ];
    const out = cachedToolParams(tools);
    assert.equal(out.length, 2);
    assert.ok(!("cache_control" in out[0]), "first tool unmarked");
    assert.deepEqual(
      (out[1] as { cache_control?: unknown }).cache_control,
      { type: "ephemeral" },
    );
    // input untouched
    assert.ok(!("cache_control" in tools[1]));
  });

  test("empty tools array is returned as-is", () => {
    const tools: Array<{ name: string }> = [];
    assert.equal(cachedToolParams(tools), tools);
  });
});

describe("withMovingCacheBreakpoint", () => {
  test("marks the last block of the last message; earlier messages untouched", () => {
    const messages: LooseMessage[] = [
      { role: "user", content: "hi" },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "t1", content: "{}" },
          { type: "tool_result", tool_use_id: "t2", content: "{}" },
        ],
      },
    ];
    const out = withMovingCacheBreakpoint(messages);
    const lastContent = out[1].content as Array<Record<string, unknown>>;
    assert.ok(!("cache_control" in lastContent[0]), "penultimate block unmarked");
    assert.deepEqual(lastContent[1].cache_control, { type: "ephemeral" });
    // first message is the SAME object (copy-on-write scope = last message only)
    assert.equal(out[0], messages[0]);
    // working array's own last message never gains the marker
    const workingLast = messages[1].content as Array<Record<string, unknown>>;
    assert.ok(!("cache_control" in workingLast[1]));
  });

  test("string content on the last message converts to a marked text block", () => {
    const messages: LooseMessage[] = [{ role: "user", content: "hello" }];
    const out = withMovingCacheBreakpoint(messages);
    assert.deepEqual(out[0].content, [
      { type: "text", text: "hello", cache_control: { type: "ephemeral" } },
    ]);
    // original untouched
    assert.equal(messages[0].content, "hello");
  });

  test("repeated per-iteration calls never accumulate markers (loop contract)", () => {
    const messages: LooseMessage[] = [{ role: "user", content: "hello" }];
    withMovingCacheBreakpoint(messages);
    messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "t1", content: "{}" }],
    });
    const out2 = withMovingCacheBreakpoint(messages);
    // exactly ONE marker across the whole request payload
    let markers = 0;
    for (const m of out2) {
      if (typeof m.content === "string") continue;
      for (const block of m.content) {
        if ("cache_control" in block) markers += 1;
      }
    }
    assert.equal(markers, 1);
  });

  test("empty array, empty-string content, empty block array → unchanged", () => {
    const empty: LooseMessage[] = [];
    assert.equal(withMovingCacheBreakpoint(empty), empty);
    const blank: LooseMessage[] = [{ role: "user", content: "" }];
    assert.equal(withMovingCacheBreakpoint(blank), blank);
    const noBlocks: LooseMessage[] = [{ role: "user", content: [] }];
    assert.equal(withMovingCacheBreakpoint(noBlocks), noBlocks);
  });
});
