// ICP-3 Phase 0 Task 2 — TDD for TemplateBlueprintPatchSchema (allow-list).
//
// The schema lives in a plain module (NOT "use server") so it can be imported
// by both actions.ts and tests. These tests verify:
//   1. quoteRanges is now an accepted field (widened allow-list).
//   2. The schema is still strict — undeclared keys are rejected.
//   3. Existing fields continue to work.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { TemplateBlueprintPatchSchema } from "../../../src/lib/agent-templates/schema";

// ---------------------------------------------------------------------
// quoteRanges (new in Phase 0 Task 2)
// ---------------------------------------------------------------------

describe("TemplateBlueprintPatchSchema — quoteRanges", () => {
  test("accepts a valid quoteRanges array", () => {
    const result = TemplateBlueprintPatchSchema.safeParse({
      quoteRanges: [{ service: "AC tune-up", low: 89, high: 149 }],
    });
    assert.equal(result.success, true, `Expected success but got: ${!result.success ? JSON.stringify((result as { error: unknown }).error) : ""}`);
  });

  test("accepts quoteRanges with optional note field", () => {
    const result = TemplateBlueprintPatchSchema.safeParse({
      quoteRanges: [{ service: "Furnace repair", low: 199, high: 499, note: "parts extra" }],
    });
    assert.equal(result.success, true);
  });

  test("accepts an empty quoteRanges array", () => {
    const result = TemplateBlueprintPatchSchema.safeParse({ quoteRanges: [] });
    assert.equal(result.success, true);
  });

  test("rejects a quoteRanges entry with missing service", () => {
    const result = TemplateBlueprintPatchSchema.safeParse({
      quoteRanges: [{ service: "", low: 89, high: 149 }],
    });
    assert.equal(result.success, false, "empty service should fail min(1)");
  });

  test("accepts quoteRanges as optional (undefined = omit)", () => {
    const result = TemplateBlueprintPatchSchema.safeParse({ greeting: "Hello" });
    assert.equal(result.success, true, "quoteRanges is optional");
  });
});

// ---------------------------------------------------------------------
// Strict reject undeclared keys
// ---------------------------------------------------------------------

describe("TemplateBlueprintPatchSchema — strict rejection", () => {
  test("rejects an undeclared key (strict mode)", () => {
    const result = TemplateBlueprintPatchSchema.safeParse({ wat: 1 });
    assert.equal(result.success, false, "undeclared key must be rejected by .strict()");
  });

  test("rejects a mix of valid + undeclared key", () => {
    const result = TemplateBlueprintPatchSchema.safeParse({
      greeting: "Hi",
      unknownKey: "oops",
    });
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------
// Existing fields regression (greeting, customSkillMd, voice, faq, capabilities)
// ---------------------------------------------------------------------

describe("TemplateBlueprintPatchSchema — existing fields regression", () => {
  test("accepts greeting only", () => {
    const result = TemplateBlueprintPatchSchema.safeParse({ greeting: "Hi there!" });
    assert.equal(result.success, true);
  });

  test("accepts customSkillMd", () => {
    const result = TemplateBlueprintPatchSchema.safeParse({ customSkillMd: "Be concise." });
    assert.equal(result.success, true);
  });

  test("accepts capabilities array", () => {
    const result = TemplateBlueprintPatchSchema.safeParse({ capabilities: ["book_appointment"] });
    assert.equal(result.success, true);
  });

  test("accepts faq array", () => {
    const result = TemplateBlueprintPatchSchema.safeParse({
      faq: [{ q: "Hours?", a: "9-5" }],
    });
    assert.equal(result.success, true);
  });

  test("accepts empty object (all fields optional)", () => {
    const result = TemplateBlueprintPatchSchema.safeParse({});
    assert.equal(result.success, true);
  });
});
