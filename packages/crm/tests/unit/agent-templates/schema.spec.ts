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
// connectors (#3 — Studio MCP connector picker; reuses #2's schema)
// ---------------------------------------------------------------------

describe("TemplateBlueprintPatchSchema — connectors", () => {
  test("accepts a valid vetted connector binding", () => {
    const result = TemplateBlueprintPatchSchema.safeParse({
      connectors: [
        {
          id: "postiz",
          kind: "vetted",
          serviceName: "postiz",
          enabledTools: ["schedulePost"],
        },
      ],
    });
    assert.equal(
      result.success,
      true,
      `Expected success but got: ${!result.success ? JSON.stringify((result as { error: unknown }).error) : ""}`,
    );
  });

  test("accepts a valid BYO https connector + an empty connectors array", () => {
    const byo = TemplateBlueprintPatchSchema.safeParse({
      connectors: [
        {
          id: "my-mcp",
          kind: "byo",
          serviceName: "byo_my-mcp",
          endpoint: "https://x.example.com/mcp",
          enabledTools: [],
        },
      ],
    });
    assert.equal(byo.success, true, "https BYO endpoint should pass");

    const empty = TemplateBlueprintPatchSchema.safeParse({ connectors: [] });
    assert.equal(empty.success, true, "empty connectors array is valid");
  });

  test("rejects a BYO connector with a non-HTTPS endpoint", () => {
    const result = TemplateBlueprintPatchSchema.safeParse({
      connectors: [
        {
          id: "evil",
          kind: "byo",
          serviceName: "byo_evil",
          endpoint: "http://insecure.example.com/mcp",
          enabledTools: [],
        },
      ],
    });
    assert.equal(result.success, false, "non-HTTPS BYO endpoint must be rejected");
  });

  test("connectors is optional (omittable)", () => {
    const result = TemplateBlueprintPatchSchema.safeParse({ greeting: "Hi" });
    assert.equal(result.success, true, "connectors is optional");
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

// ---------------------------------------------------------------------
// templateVariables (2026-07-16 — marketplace generalize, Task 1)
// ---------------------------------------------------------------------

describe("TemplateBlueprintPatchSchema — templateVariables", () => {
  test("accepts a valid templateVariables array", () => {
    const result = TemplateBlueprintPatchSchema.safeParse({
      templateVariables: [
        { name: "business_email", description: "The owner's contact email", example: "max@acme.test" },
      ],
    });
    assert.equal(result.success, true, `Expected success but got: ${!result.success ? JSON.stringify((result as { error: unknown }).error) : ""}`);
  });

  test("accepts an empty templateVariables array", () => {
    const result = TemplateBlueprintPatchSchema.safeParse({ templateVariables: [] });
    assert.equal(result.success, true);
  });

  test("templateVariables is optional (undefined = omit)", () => {
    const result = TemplateBlueprintPatchSchema.safeParse({ greeting: "Hello" });
    assert.equal(result.success, true);
  });

  test("rejects a name that isn't snake_case (regex ^[a-z0-9_]{2,40}$)", () => {
    const bad = [
      { name: "Business Email", description: "d", example: "e" }, // spaces/caps
      { name: "a", description: "d", example: "e" }, // too short (min 2)
      { name: "x".repeat(41), description: "d", example: "e" }, // too long (max 40)
      { name: "business-email", description: "d", example: "e" }, // hyphen
    ];
    for (const entry of bad) {
      const result = TemplateBlueprintPatchSchema.safeParse({ templateVariables: [entry] });
      assert.equal(result.success, false, `expected rejection for name=${JSON.stringify(entry.name)}`);
    }
  });

  test("caps templateVariables at 12 entries", () => {
    const thirteen = Array.from({ length: 13 }, (_, i) => ({
      name: `var_${i}`,
      description: "d",
      example: "e",
    }));
    const result = TemplateBlueprintPatchSchema.safeParse({ templateVariables: thirteen });
    assert.equal(result.success, false, "13 entries should exceed the max(12) cap");

    const twelve = thirteen.slice(0, 12);
    const okResult = TemplateBlueprintPatchSchema.safeParse({ templateVariables: twelve });
    assert.equal(okResult.success, true, "exactly 12 entries should be accepted");
  });

  test("rejects an undeclared extra key on a templateVariables entry (still strict overall)", () => {
    const result = TemplateBlueprintPatchSchema.safeParse({
      templateVariables: [{ name: "ok_name", description: "d", example: "e", extra: "nope" }],
    });
    assert.equal(result.success, false);
  });
});
