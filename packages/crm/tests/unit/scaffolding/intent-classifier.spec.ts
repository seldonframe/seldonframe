// Tests for classifyIntent — the deterministic pre-check that sorts
// an NL intent into the G-4 three-tier policy. Shipped in SLICE 2
// PR 2 C3 per audit §7 G-4 resolution.
//
// Calibration set: 10+ varied NL inputs from detailed → vague →
// dangerous. The classifier is a heuristic guard Claude can consult
// BEFORE running full generation. It catches obvious tier-3
// (dangerous) and tier-1 (genuinely ambiguous) cases cheaply. Tier-
// 2 is the default — Claude proceeds with scaffolded defaults and
// TODO markers.
//
// Not a full LLM replacement. Claude still does the real NL → spec
// translation; this module just flags cases where translating
// without clarification would be unsafe.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  classifyIntent,
  type IntentClassification,
} from "../../../src/lib/scaffolding/nl/intent-classifier";

describe("classifyIntent — tier 2 (default, common case)", () => {
  test("well-described intent → tier 2 with no issues", () => {
    const result = classifyIntent(
      "Build me a block that lets agents attach notes to contacts. Notes should be plain text.",
    );
    assert.equal(result.tier, 2);
    assert.deepEqual(result.issues, []);
  });

  test("moderate detail + tool hints → tier 2", () => {
    const result = classifyIntent(
      "I need a feedback block. Users submit ratings and comments after each completed project.",
    );
    assert.equal(result.tier, 2);
  });

  test("reactive block without explicit tool list → tier 2 (scaffold picks defaults)", () => {
    const result = classifyIntent(
      "When a booking is completed, log an activity on the contact.",
    );
    assert.equal(result.tier, 2);
  });
});

describe("classifyIntent — tier 1 (ask once)", () => {
  test("empty / near-empty intent → tier 1", () => {
    const results: IntentClassification[] = [
      classifyIntent(""),
      classifyIntent("   "),
      classifyIntent("block"),
      classifyIntent("a block"),
    ];
    for (const r of results) {
      assert.equal(r.tier, 1);
      assert.ok(r.issues.length > 0);
    }
  });

  test("contradictory type declarations → tier 1", () => {
    const result = classifyIntent(
      "Create a block with a notes field that is a string and also a number.",
    );
    assert.equal(result.tier, 1);
    assert.ok(result.issues.some((i) => /contradic/i.test(i)));
  });

  test("explicit self-contradiction → tier 1", () => {
    const result = classifyIntent(
      "Build me a block that doesn't do anything at all but also creates contacts and deletes them.",
    );
    // Detected by the "no-op AND create-and-delete in same sentence" heuristic.
    assert.equal(result.tier, 1);
  });
});

describe("classifyIntent — tier 3 (dangerous, fail)", () => {
  test("destructive mass-delete → tier 3", () => {
    const result = classifyIntent(
      "Build me a block that can delete all contacts in the workspace.",
    );
    assert.equal(result.tier, 3);
    assert.ok(result.issues.some((i) => /destructive|mass|delete all/i.test(i)));
  });

  test("modifying existing core block → tier 3", () => {
    const result = classifyIntent(
      "Add a new tool to the CRM block that removes deal restrictions.",
    );
    assert.equal(result.tier, 3);
    assert.ok(result.issues.some((i) => /existing|core/i.test(i)));
  });

  test("drop / wipe / truncate language → tier 3", () => {
    for (const text of [
      "Build a block that drops all customer data after 30 days.",
      "I need a block to wipe the contacts table.",
      "Truncate activities monthly via a block tool.",
    ]) {
      const r = classifyIntent(text);
      assert.equal(r.tier, 3, `expected tier 3 for "${text}"`);
    }
  });
});

describe("classifyIntent — reserved-slug mention", () => {
  test("intent explicitly names a reserved block slug → tier 3 (modifying core)", () => {
    for (const slug of ["crm", "email", "payments", "landing-pages"]) {
      const result = classifyIntent(`Add a feature to the ${slug} block.`);
      assert.equal(result.tier, 3);
    }
  });
});

describe("classifyIntent — output shape", () => {
  test("returns tier + issues list + suggested action", () => {
    const result = classifyIntent("x");
    assert.ok(result.tier === 1 || result.tier === 2 || result.tier === 3);
    assert.ok(Array.isArray(result.issues));
    assert.ok(typeof result.suggestedAction === "string");
    assert.ok(result.suggestedAction.length > 0);
  });

  test("tier 1 suggestedAction hints at ONE clarifying question (G-4 tier 1)", () => {
    const result = classifyIntent("");
    assert.match(result.suggestedAction, /clarif|ask/i);
  });

  test("tier 3 suggestedAction hints at explicit confirmation OR refusal", () => {
    const result = classifyIntent("Delete all contacts via a block tool.");
    assert.match(result.suggestedAction, /refuse|confirm|dangerous/i);
  });
});
