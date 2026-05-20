// packages/crm/tests/unit/proposals/signed-token.spec.ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { generateProposalToken } from "@/lib/proposals/signed-token";

describe("generateProposalToken", () => {
  test("returns a URL-safe string", () => {
    const token = generateProposalToken();
    assert.match(token, /^[A-Za-z0-9_-]+$/);
  });

  test("returns at least 43 characters", () => {
    const token = generateProposalToken();
    assert.ok(token.length >= 43);
  });

  test("returns a different token on each call", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateProposalToken()));
    assert.equal(tokens.size, 100);
  });
});
