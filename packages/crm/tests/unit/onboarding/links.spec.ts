import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isValidOnboardingToken } from "../../../src/lib/onboarding/links";

describe("isValidOnboardingToken", () => {
  it("accepts a 32+ char url-safe token", () => {
    assert.equal(isValidOnboardingToken("A".repeat(32)), true);
  });
  it("rejects short or unsafe tokens", () => {
    assert.equal(isValidOnboardingToken("short"), false);
    assert.equal(isValidOnboardingToken("bad/" + "x".repeat(40)), false);
  });
});
