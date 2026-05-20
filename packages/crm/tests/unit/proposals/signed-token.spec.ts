// packages/crm/tests/unit/proposals/signed-token.spec.ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { generateProposalToken } from "@/lib/proposals/signed-token";

describe("generateProposalToken", () => {
  test("returns a URL-safe string", () => {
    const token = generateProposalToken();
    assert.match(token, /^[A-Za-z0-9_-]+$/);
  });

  test("returns at least 32 characters of entropy", () => {
    const token = generateProposalToken();
    assert.ok(token.length >= 32, `token length ${token.length} is less than 32`);
  });

  test("returns a different token on each call", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateProposalToken()));
    assert.equal(tokens.size, 100);
  });
});
