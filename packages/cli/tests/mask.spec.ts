// mask — never print a full secret. Pins the masking so keys are always shown as
// prefix…suffix and short tokens are fully hidden.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { maskKey } from "../src/lib/mask.js";

describe("maskKey", () => {
  test("keeps the wst_ prefix and the last 4, masks the middle", () => {
    const masked = maskKey("wst_abcdEFGH1234567890wxyz");
    assert.equal(masked, "wst_…wxyz");
  });

  test("does NOT contain the secret middle", () => {
    const raw = "wst_SECRETMIDDLEPART9999tail";
    const masked = maskKey(raw);
    assert.ok(!masked.includes("SECRETMIDDLE"));
    assert.ok(masked.startsWith("wst_"));
    assert.ok(masked.endsWith("tail"));
  });

  test("a non-wst key uses its first 4 chars as the prefix", () => {
    const masked = maskKey("abcdefghijklmnop");
    assert.equal(masked, "abcd…mnop");
  });

  test("a short token is fully masked (never reveal most of it)", () => {
    assert.equal(maskKey("short"), "…");
    assert.equal(maskKey("wst_1"), "…");
  });

  test("empty / non-string is empty string", () => {
    assert.equal(maskKey(""), "");
    assert.equal(maskKey(undefined), "");
    assert.equal(maskKey(null), "");
    assert.equal(maskKey(123 as unknown), "");
  });
});
