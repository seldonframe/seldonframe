import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { resolveLandingMode } from "../../../src/app/(public)/landing-mode";

describe("resolveLandingMode", () => {
  test("?mode=record with flag on → record", () => {
    assert.equal(resolveLandingMode("record", true), "record");
  });
  test("?mode=record with flag OFF → build (flag contract)", () => {
    assert.equal(resolveLandingMode("record", false), "build");
  });
  test("absent / unknown / array params → build", () => {
    assert.equal(resolveLandingMode(undefined, true), "build");
    assert.equal(resolveLandingMode("banana", true), "build");
    assert.equal(resolveLandingMode(["record", "record"], true), "build");
  });
});
