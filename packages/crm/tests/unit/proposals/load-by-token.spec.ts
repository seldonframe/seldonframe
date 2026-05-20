// packages/crm/tests/unit/proposals/load-by-token.spec.ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { validateToken } from "@/lib/proposals/load-by-token";

describe("validateToken", () => {
  test("accepts URL-safe base64 strings of length >= 32", () => {
    assert.equal(validateToken("abc-DEF_ghi123456789012345678901234"), true);
  });

  test("rejects strings under 32 chars", () => {
    assert.equal(validateToken("too-short"), false);
  });

  test("rejects strings with disallowed chars (slash, plus)", () => {
    assert.equal(validateToken("contains-slash/and-plus+chars-aaaaaaaa"), false);
  });

  test("rejects empty strings", () => {
    assert.equal(validateToken(""), false);
  });

  test("rejects null-ish (undefined)", () => {
    assert.equal(validateToken(undefined as unknown as string), false);
  });
});
