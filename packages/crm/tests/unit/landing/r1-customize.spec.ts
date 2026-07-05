// packages/crm/tests/unit/landing/r1-customize.spec.ts
//
// Tests extractFirstJsonObject(), the brace-extraction fallback added in
// hotfix H2 for r1-customize's parse step (lib/landing/r1-customize.ts).
// When the LLM wraps its JSON payload in prose ("Sure, here's the
// update: {...} Let me know..."), a naive JSON.parse on the whole string
// fails; extractFirstJsonObject finds the first balanced {...} object so
// the caller can retry JSON.parse on just that substring. Pure function,
// no DB/network — matches the file's existing test-free-of-side-effects
// convention (this is a NEW spec since no r1-customize spec existed).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { extractFirstJsonObject } from "../../../src/lib/landing/r1-customize";

describe("extractFirstJsonObject", () => {
  test("extracts a JSON object wrapped in leading and trailing prose", () => {
    const text = 'Sure, here you go: {"summary":"Updated the headline"} Let me know if you want more changes.';
    const extracted = extractFirstJsonObject(text);
    assert.ok(extracted, "must find a balanced object");
    const parsed = JSON.parse(extracted!);
    assert.equal(parsed.summary, "Updated the headline");
  });

  test("handles nested braces correctly (depth tracking)", () => {
    const text = 'Here: {"summary":"ok","hero":{"headline":"Hi","cta":{"label":"Go"}}} done.';
    const extracted = extractFirstJsonObject(text);
    assert.ok(extracted);
    const parsed = JSON.parse(extracted!);
    assert.equal(parsed.hero.cta.label, "Go");
  });

  test("ignores braces inside string literals when tracking depth", () => {
    const text = 'Note: {"summary":"uses a { in copy", "detail":"and a } too"} - trailing text';
    const extracted = extractFirstJsonObject(text);
    assert.ok(extracted);
    const parsed = JSON.parse(extracted!);
    assert.equal(parsed.summary, "uses a { in copy");
    assert.equal(parsed.detail, "and a } too");
  });

  test("returns null for pure prose with no JSON object", () => {
    const text = "I'm not able to make that change right now, sorry about that.";
    assert.equal(extractFirstJsonObject(text), null);
  });

  test("returns null when braces never balance", () => {
    const text = 'Broken: {"summary": "unterminated';
    assert.equal(extractFirstJsonObject(text), null);
  });

  test("returns the object unchanged when the whole text is already valid JSON", () => {
    const text = '{"summary":"clean"}';
    const extracted = extractFirstJsonObject(text);
    assert.equal(extracted, text);
    assert.deepEqual(JSON.parse(extracted!), { summary: "clean" });
  });
});
