import { test } from "node:test";
import assert from "node:assert/strict";
import {
  shouldVisionVerify,
  buildVisionGradePrompt,
  parseVisionVerdict,
  gradeScreenshot,
  renderScreenshot,
} from "@/lib/vision/verify-page";

// ─────────────────────────── shouldVisionVerify ───────────────────────────

test("shouldVisionVerify: flag off never verifies, even with a successful mutating tool", () => {
  assert.equal(
    shouldVisionVerify([{ name: "update_media", ok: true }], false),
    false,
  );
});

test("shouldVisionVerify: read-only turn (no mutating tool calls) never verifies", () => {
  assert.equal(shouldVisionVerify([], true), false);
  assert.equal(
    shouldVisionVerify([{ name: "get_workspace_state", ok: true }, { name: "list_designs", ok: true }], true),
    false,
  );
});

test("shouldVisionVerify: flag on + a successful public-site-changing tool call verifies", () => {
  assert.equal(
    shouldVisionVerify([{ name: "update_media", ok: true }], true),
    true,
  );
  assert.equal(
    shouldVisionVerify([{ name: "edit_site", ok: true }], true),
    true,
  );
  assert.equal(
    shouldVisionVerify([{ name: "add_custom_block", ok: true }], true),
    true,
  );
});

test("shouldVisionVerify: a FAILED mutating tool call does not verify", () => {
  assert.equal(
    shouldVisionVerify([{ name: "update_media", ok: false }], true),
    false,
  );
});

test("shouldVisionVerify: mixed turn — one failed, one successful mutating call still verifies", () => {
  assert.equal(
    shouldVisionVerify(
      [
        { name: "get_workspace_state", ok: true },
        { name: "update_media", ok: false },
        { name: "update_design", ok: true },
      ],
      true,
    ),
    true,
  );
});

// ─────────────────────────── buildVisionGradePrompt ───────────────────────────

test("buildVisionGradePrompt: includes the goal, the rubric, and a strict-JSON instruction", () => {
  const prompt = buildVisionGradePrompt(
    "Change the hero headline to 'Book faster.'",
    "Hero has a legible headline, a visible CTA, no broken images.",
  );
  assert.match(prompt, /Book faster\./);
  assert.match(prompt, /Hero has a legible headline/);
  assert.match(prompt, /"pass"/);
  assert.match(prompt, /"gaps"/);
  assert.match(prompt, /JSON/i);
});

// ─────────────────────────── parseVisionVerdict ───────────────────────────

test("parseVisionVerdict: parses clean JSON", () => {
  const verdict = parseVisionVerdict('{"pass":true,"gaps":[]}');
  assert.deepEqual(verdict, { pass: true, gaps: [] });
});

test("parseVisionVerdict: parses JSON with gaps", () => {
  const verdict = parseVisionVerdict('{"pass":false,"gaps":["hero image is broken","low contrast CTA"]}');
  assert.deepEqual(verdict, { pass: false, gaps: ["hero image is broken", "low contrast CTA"] });
});

test("parseVisionVerdict: parses JSON wrapped in a code fence", () => {
  const text = '```json\n{"pass":false,"gaps":["empty section"]}\n```';
  assert.deepEqual(parseVisionVerdict(text), { pass: false, gaps: ["empty section"] });
});

test("parseVisionVerdict: parses JSON with surrounding prose", () => {
  const text = 'Here is my verdict:\n{"pass":true,"gaps":[]}\nHope that helps!';
  assert.deepEqual(parseVisionVerdict(text), { pass: true, gaps: [] });
});

test("parseVisionVerdict: fail-soft defaults to pass on unparseable garbage", () => {
  assert.deepEqual(parseVisionVerdict("not json at all, sorry I can't help"), {
    pass: true,
    gaps: [],
  });
  assert.deepEqual(parseVisionVerdict(""), { pass: true, gaps: [] });
});

// ─────────────────────────── gradeScreenshot ───────────────────────────

test("gradeScreenshot: maps a DI'd anthropic client's fixed verdict correctly", async () => {
  const fakeAnthropic = {
    messages: {
      create: async () => ({
        content: [{ type: "text", text: '{"pass":false,"gaps":["hero background is a broken video url"]}' }],
      }),
    },
  };

  const verdict = await gradeScreenshot(
    "ZmFrZS1iYXNlNjQ=",
    "image/png",
    "Set the hero background to a photo",
    "Hero has a real photo background, no broken media.",
    { anthropic: fakeAnthropic as never },
  );

  assert.deepEqual(verdict, { pass: false, gaps: ["hero background is a broken video url"] });
});

test("gradeScreenshot: fail-soft defaults to pass when the anthropic call throws", async () => {
  const fakeAnthropic = {
    messages: {
      create: async () => {
        throw new Error("network blip");
      },
    },
  };

  const verdict = await gradeScreenshot(
    "ZmFrZS1iYXNlNjQ=",
    "image/png",
    "goal",
    "rubric",
    { anthropic: fakeAnthropic as never },
  );

  assert.deepEqual(verdict, { pass: true, gaps: [] });
});

// ─────────────────────────── renderScreenshot ───────────────────────────

test("renderScreenshot: fail-soft on a fetch error (never throws)", async () => {
  const throwingFetch = (async () => {
    throw new Error("fetch failed");
  }) as unknown as typeof fetch;

  const result = await renderScreenshot("https://example.app.seldonframe.com", {
    fetchImpl: throwingFetch,
  });

  assert.equal(result.ok, false);
});

test("renderScreenshot: fail-soft when microlink reports a non-success status", async () => {
  const fakeFetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("api.microlink.io")) {
      return new Response(JSON.stringify({ status: "fail", message: "blocked" }), { status: 200 });
    }
    return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
  }) as unknown as typeof fetch;

  const result = await renderScreenshot("https://example.app.seldonframe.com", {
    fetchImpl: fakeFetch,
  });

  assert.equal(result.ok, false);
});

test("renderScreenshot: happy path returns base64 + mediaType", async () => {
  const fakeFetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("api.microlink.io")) {
      return new Response(
        JSON.stringify({ status: "success", data: { screenshot: { url: "https://cdn.example/shot.png" } } }),
        { status: 200 },
      );
    }
    if (url.includes("cdn.example")) {
      return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200 });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as unknown as typeof fetch;

  const result = await renderScreenshot("https://example.app.seldonframe.com", {
    fetchImpl: fakeFetch,
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.mediaType, "image/png");
    assert.ok(result.base64.length > 0);
  }
});
