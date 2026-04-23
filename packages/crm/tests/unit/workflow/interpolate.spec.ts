// Tests for the shared interpolation helper. SLICE 3 C4 per audit
// §4.5 + §7.7 (strict behavior preservation from mcp-tool-call.ts:24).
//
// Invariants from §7.7:
//   - Variables resolve by name only; path access unsupported →
//     raw token preserved.
//   - Captures: dotted-path walk via own-property check; miss →
//     raw token preserved.
//   - Reserved namespaces (trigger/contact/agent/workspace) →
//     pass-through as literal.
//   - No {{now}} / date helpers.
//   - No array indexing syntax (items[0]).
//   - Always String(current) for resolved values.
//   - Recurses through arrays + objects.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { resolveInterpolations } from "../../../src/lib/workflow/interpolate";
import type { StoredRun } from "../../../src/lib/workflow/types";

function makeRun(overrides: Partial<StoredRun> = {}): StoredRun {
  return {
    id: "r-1",
    orgId: "org-1",
    archetypeId: "t",
    specSnapshot: {} as StoredRun["specSnapshot"],
    triggerEventId: null,
    triggerPayload: {},
    status: "running",
    currentStepId: null,
    captureScope: {},
    variableScope: {},
    failureCount: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("resolveInterpolations — variable scope", () => {
  test("resolves a top-level variable by name", () => {
    const run = makeRun({ variableScope: { contactId: "c-1" } });
    assert.equal(resolveInterpolations("hi {{contactId}}", run), "hi c-1");
  });

  test("variable with a sub-path: resolves by name, sub-path silently dropped", () => {
    // Matches legacy mcp-tool-call resolver behavior (§7.7 audit
    // clarification — the inline comment said "path access
    // unsupported" but the code returns the variable value
    // ignoring sub-path segments).
    const run = makeRun({ variableScope: { contactId: "c-1" } });
    assert.equal(resolveInterpolations("{{contactId.field}}", run), "c-1");
  });

  test("stringifies non-string variable values", () => {
    // Variables are typed as Record<string, unknown>. The original
    // resolver used String(...) on the resolved value. Preserve.
    const run = makeRun({ variableScope: { count: 42 as unknown as string } });
    assert.equal(resolveInterpolations("{{count}}", run), "42");
  });
});

describe("resolveInterpolations — capture scope (dotted walk)", () => {
  test("resolves a top-level capture by name (stringifies)", () => {
    const run = makeRun({ captureScope: { coupon: { code: "SAVE20" } } });
    assert.equal(resolveInterpolations("code={{coupon.code}}", run), "code=SAVE20");
  });

  test("nested walk resolves deep paths", () => {
    const run = makeRun({
      captureScope: { profile: { address: { city: "Berlin" } } },
    });
    assert.equal(
      resolveInterpolations("{{profile.address.city}}", run),
      "Berlin",
    );
  });

  test("missing path → raw token preserved (no error)", () => {
    const run = makeRun({ captureScope: { coupon: { code: "x" } } });
    assert.equal(
      resolveInterpolations("{{coupon.nothere}}", run),
      "{{coupon.nothere}}",
    );
  });

  test("partial miss along the walk → raw token preserved", () => {
    const run = makeRun({ captureScope: { a: { b: 1 } } });
    assert.equal(resolveInterpolations("{{a.b.c.d}}", run), "{{a.b.c.d}}");
  });
});

describe("resolveInterpolations — reserved namespaces pass-through", () => {
  test("trigger/contact/agent/workspace tokens are NOT resolved; left as raw", () => {
    const run = makeRun();
    assert.equal(
      resolveInterpolations("{{trigger.contactId}}", run),
      "{{trigger.contactId}}",
    );
    assert.equal(resolveInterpolations("{{contact.id}}", run), "{{contact.id}}");
    assert.equal(resolveInterpolations("{{agent.name}}", run), "{{agent.name}}");
    assert.equal(
      resolveInterpolations("{{workspace.soul.x}}", run),
      "{{workspace.soul.x}}",
    );
  });
});

describe("resolveInterpolations — unsupported features (left raw)", () => {
  test("{{now}} / date helpers are NOT supported — left raw", () => {
    const run = makeRun();
    assert.equal(resolveInterpolations("{{now}}", run), "{{now}}");
  });

  test("array indexing syntax is NOT supported — left raw", () => {
    const run = makeRun({ captureScope: { items: ["a", "b"] } });
    assert.equal(
      resolveInterpolations("{{items[0]}}", run),
      "{{items[0]}}",
    );
  });
});

describe("resolveInterpolations — recursion + pass-through", () => {
  test("recurses into arrays", () => {
    const run = makeRun({ captureScope: { x: { v: "hi" } } });
    const out = resolveInterpolations(["a", "{{x.v}}", "b"], run);
    assert.deepEqual(out, ["a", "hi", "b"]);
  });

  test("recurses into objects", () => {
    const run = makeRun({ captureScope: { x: { v: "hi" } } });
    const out = resolveInterpolations({ k: "{{x.v}}", nested: { k2: "{{x.v}}!" } }, run);
    assert.deepEqual(out, { k: "hi", nested: { k2: "hi!" } });
  });

  test("primitives pass through unchanged", () => {
    const run = makeRun();
    assert.equal(resolveInterpolations(42, run), 42);
    assert.equal(resolveInterpolations(true, run), true);
    assert.equal(resolveInterpolations(null, run), null);
  });
});

describe("resolveInterpolations — whitespace tolerance", () => {
  test("trims whitespace inside interpolation braces", () => {
    const run = makeRun({ variableScope: { x: "value" } });
    assert.equal(resolveInterpolations("{{  x  }}", run), "value");
  });
});

describe("resolveInterpolations — multiple tokens in one string", () => {
  test("resolves every token independently", () => {
    const run = makeRun({
      variableScope: { a: "1", b: "2" },
      captureScope: { c: { d: "3" } },
    });
    assert.equal(
      resolveInterpolations("{{a}}-{{b}}-{{c.d}}", run),
      "1-2-3",
    );
  });
});
