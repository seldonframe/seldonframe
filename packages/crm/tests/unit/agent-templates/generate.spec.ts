// ICP-3 — TDD tests for the AI-assisted agent generator (Tasks 3, 4, 5).
//
// Run: node --import tsx --test tests/unit/agent-templates/generate.spec.ts
// (bare tsx --test does NOT resolve the @/ alias; use node --import tsx)

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  buildGeneratePrompt,
  parseGeneratedDraft,
  generateDraft,
  type BuildGeneratePromptInput,
  type GenerateDeps,
} from "../../../src/lib/agent-templates/generate";

// ─────────────────────────────────────────────────────────────────────────────
// Task 3 — buildGeneratePrompt
// ─────────────────────────────────────────────────────────────────────────────

describe("buildGeneratePrompt", () => {
  const baseInput: BuildGeneratePromptInput = {
    intent: "Answer questions and book plumbing appointments",
    surface: "voice",
    allowedCapabilities: ["look_up_availability", "book_appointment", "get_quote_range"],
    businessName: "Acme Plumbing",
  };

  test("system contains the quote-guard rule", () => {
    const { system } = buildGeneratePrompt(baseInput);
    assert.match(system, /never (state|quote) a firm price/i);
  });

  test("system contains a read-back rule", () => {
    const { system } = buildGeneratePrompt(baseInput);
    assert.match(system, /read.?back/i);
  });

  test("system contains a passed capability name", () => {
    const { system } = buildGeneratePrompt(baseInput);
    assert.ok(
      system.includes("get_quote_range"),
      "system prompt must list the passed capability",
    );
  });

  test("system contains the JSON contract marker", () => {
    const { system } = buildGeneratePrompt(baseInput);
    assert.match(system, /JSON/i);
  });

  test("system is surface-aware: voice surface mentions 'voice'", () => {
    const { system } = buildGeneratePrompt({ ...baseInput, surface: "voice" });
    assert.match(system, /voice/i);
  });

  test("system is surface-aware: chat surface does NOT repeat the voice line", () => {
    const { system } = buildGeneratePrompt({ ...baseInput, surface: "chat" });
    assert.ok(
      !system.includes("VOICE phone agent"),
      "chat prompt must not contain the voice-specific line",
    );
    assert.match(system, /WEB CHAT/i);
  });

  test("user string contains the intent", () => {
    const { user } = buildGeneratePrompt(baseInput);
    assert.ok(
      user.includes("Answer questions and book plumbing appointments"),
      "user prompt must include the literal intent",
    );
  });

  test("user string contains the business name", () => {
    const { user } = buildGeneratePrompt(baseInput);
    assert.ok(user.includes("Acme Plumbing"), "user prompt must include the business name");
  });

  test("user contains fallback name when businessName is omitted", () => {
    const { user } = buildGeneratePrompt({
      intent: "Help users",
      surface: "chat",
      allowedCapabilities: [],
    });
    assert.ok(user.includes("(unnamed)"), "must fall back to (unnamed)");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 4 — parseGeneratedDraft
// ─────────────────────────────────────────────────────────────────────────────

describe("parseGeneratedDraft", () => {
  const allowed = ["book_appointment", "escalate_to_human", "get_quote_range"];

  test("valid JSON → ok:true with all fields", () => {
    const json = JSON.stringify({
      greeting: "Hello!",
      customSkillMd: "Be warm.",
      capabilities: ["book_appointment", "get_quote_range"],
      faq: [{ q: "Hours?", a: "9-5" }],
      quoteRanges: [{ service: "Repair", low: 100, high: 300 }],
    });
    const result = parseGeneratedDraft(json, { allowedCapabilities: allowed });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("unreachable");
    assert.equal(result.patch.greeting, "Hello!");
    assert.equal(result.patch.customSkillMd, "Be warm.");
    assert.deepEqual(result.patch.capabilities, ["book_appointment", "get_quote_range"]);
    assert.deepEqual(result.patch.faq, [{ q: "Hours?", a: "9-5" }]);
    assert.deepEqual(result.patch.quoteRanges, [{ service: "Repair", low: 100, high: 300 }]);
  });

  test("out-of-allowlist tool is filtered out", () => {
    const json = JSON.stringify({
      greeting: "Hi",
      customSkillMd: "Persona",
      capabilities: ["book_appointment", "nonexistent_tool", "get_quote_range"],
      faq: [],
      quoteRanges: [],
    });
    const result = parseGeneratedDraft(json, { allowedCapabilities: allowed });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("unreachable");
    assert.deepEqual(
      result.patch.capabilities,
      ["book_appointment", "get_quote_range"],
      "nonexistent_tool must be filtered out",
    );
  });

  test("code-fenced JSON → ok:true", () => {
    const json = JSON.stringify({ greeting: "Hi", customSkillMd: "x", capabilities: [], faq: [], quoteRanges: [] });
    const fenced = "```json\n" + json + "\n```";
    const result = parseGeneratedDraft(fenced, { allowedCapabilities: allowed });
    assert.equal(result.ok, true);
  });

  test("code fence without language tag → ok:true", () => {
    const json = JSON.stringify({ greeting: "Hi", customSkillMd: "x", capabilities: [], faq: [], quoteRanges: [] });
    const fenced = "```\n" + json + "\n```";
    const result = parseGeneratedDraft(fenced, { allowedCapabilities: allowed });
    assert.equal(result.ok, true);
  });

  test("non-JSON text → ok:false, error: unparseable", () => {
    const result = parseGeneratedDraft("sorry I can't help with that", { allowedCapabilities: allowed });
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.equal(result.error, "unparseable");
  });

  test("valid JSON wrong shape → ok:false, error: invalid_shape", () => {
    // RawDraft uses .optional() for all fields, but a non-object root fails
    const result = parseGeneratedDraft("[1,2,3]", { allowedCapabilities: allowed });
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.equal(result.error, "invalid_shape");
  });

  test("partial JSON (only greeting) → ok:true, patch has only greeting", () => {
    const json = JSON.stringify({ greeting: "Partial" });
    const result = parseGeneratedDraft(json, { allowedCapabilities: allowed });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("unreachable");
    assert.equal(result.patch.greeting, "Partial");
    // capabilities not in output when not in LLM response
    assert.equal(result.patch.capabilities, undefined);
  });

  test("faq rows have extra keys stripped to just q+a", () => {
    const json = JSON.stringify({
      faq: [{ q: "Q1", a: "A1", extra: "ignored" }],
    });
    const result = parseGeneratedDraft(json, { allowedCapabilities: allowed });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("unreachable");
    assert.deepEqual(result.patch.faq, [{ q: "Q1", a: "A1" }]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 5 — generateDraft (DI orchestrator)
// ─────────────────────────────────────────────────────────────────────────────

describe("generateDraft", () => {
  const baseInput = {
    intent: "Book HVAC appointments",
    surface: "voice" as const,
    allowedCapabilities: ["book_appointment", "escalate_to_human"],
    businessName: "Cool Air HVAC",
  };

  const validJson = JSON.stringify({
    greeting: "Thanks for calling Cool Air!",
    customSkillMd: "You are a warm receptionist.",
    capabilities: ["book_appointment"],
    faq: [],
    quoteRanges: [],
  });

  test("canned valid JSON → ok:true with parsed patch", async () => {
    let callCount = 0;
    const deps: GenerateDeps = {
      complete: async () => {
        callCount++;
        return validJson;
      },
    };

    const result = await generateDraft(baseInput, deps);

    assert.equal(result.ok, true, "should succeed with valid LLM output");
    if (!result.ok) throw new Error("unreachable");
    assert.equal(result.patch.greeting, "Thanks for calling Cool Air!");
    assert.deepEqual(result.patch.capabilities, ["book_appointment"]);
    assert.equal(callCount, 1, "complete must be called exactly once on success");
  });

  test("always-invalid JSON → complete called exactly twice → ok:false", async () => {
    let callCount = 0;
    const deps: GenerateDeps = {
      complete: async () => {
        callCount++;
        return "not json at all";
      },
    };

    const result = await generateDraft(baseInput, deps);

    assert.equal(result.ok, false, "should fail after retry");
    if (result.ok) throw new Error("unreachable");
    assert.equal(result.error, "generation_failed");
    assert.equal(callCount, 2, "complete must be called exactly twice (1 attempt + 1 retry)");
  });

  test("first attempt fails, second succeeds → ok:true", async () => {
    let callCount = 0;
    const deps: GenerateDeps = {
      complete: async () => {
        callCount++;
        if (callCount === 1) return "invalid json";
        return validJson;
      },
    };

    const result = await generateDraft(baseInput, deps);

    assert.equal(result.ok, true, "should succeed on retry");
    if (!result.ok) throw new Error("unreachable");
    assert.equal(result.patch.greeting, "Thanks for calling Cool Air!");
    assert.equal(callCount, 2);
  });

  test("complete() throws → generation_failed returned", async () => {
    const deps: GenerateDeps = {
      complete: async () => {
        throw new Error("network error");
      },
    };

    const result = await generateDraft(baseInput, deps);
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.equal(result.error, "generation_failed");
  });

  test("out-of-allowlist tools in LLM output are stripped at orchestrator level", async () => {
    const jsonWithHallucinatedTool = JSON.stringify({
      greeting: "Hi!",
      customSkillMd: "Be helpful",
      capabilities: ["book_appointment", "fly_a_rocket"],
      faq: [],
      quoteRanges: [],
    });
    const deps: GenerateDeps = {
      complete: async () => jsonWithHallucinatedTool,
    };
    const result = await generateDraft(baseInput, deps);
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("unreachable");
    assert.deepEqual(result.patch.capabilities, ["book_appointment"]);
    assert.ok(
      !result.patch.capabilities?.includes("fly_a_rocket"),
      "hallucinated tool must be stripped",
    );
  });
});
