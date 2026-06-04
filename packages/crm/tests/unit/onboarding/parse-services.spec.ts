import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseServicesText } from "../../../src/lib/onboarding/parse-services";

describe("parseServicesText", () => {
  it("parses name, price, and duration from common formats", () => {
    const s = parseServicesText("60-min massage — $90\nDeep tissue (90 min) - $130\nConsult: free");
    assert.deepEqual(s[0], { name: "massage", price: 90, durationMinutes: 60 });
    assert.deepEqual(s[1], { name: "Deep tissue", price: 130, durationMinutes: 90 });
    assert.deepEqual(s[2], { name: "Consult", price: 0, durationMinutes: 30 });
  });
  it("returns [] for empty input", () => {
    assert.deepEqual(parseServicesText(""), []);
  });
});
