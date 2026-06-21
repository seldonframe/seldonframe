// ICP-3 (Phase 2, Task 6) — TDD for deriveName, the pure helper behind the
// "Describe your agent" create flow. Turns a one-sentence intent into a
// sensible template name so a generated agent doesn't need a second prompt.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { deriveName } from "../../../src/lib/agent-templates/store";

describe("deriveName", () => {
  test("takes the first ~5 words and title-cases them", () => {
    assert.equal(
      deriveName("answer my plumbing company's phone and book jobs"),
      "Answer My Plumbing Company's Phone",
    );
  });

  test("strips trailing punctuation from words", () => {
    assert.equal(deriveName("book jobs, text a quote…"), "Book Jobs Text A Quote");
  });

  test("collapses extra whitespace", () => {
    assert.equal(deriveName("  schedule   patient   visits  "), "Schedule Patient Visits");
  });

  test("falls back to 'New agent' for empty input", () => {
    assert.equal(deriveName(""), "New agent");
    assert.equal(deriveName("   "), "New agent");
  });

  test("falls back to 'New agent' for punctuation-only input", () => {
    assert.equal(deriveName("!!! ??? ..."), "New agent");
  });

  test("caps the name length", () => {
    const longWord = "a".repeat(80);
    assert.ok(deriveName(longWord).length <= 60);
  });

  test("preserves casing of already-capitalized acronyms in first letter only", () => {
    // We title-case the first char and keep the rest, so "HVAC" stays "HVAC".
    assert.equal(deriveName("HVAC front desk receptionist"), "HVAC Front Desk Receptionist");
  });
});
