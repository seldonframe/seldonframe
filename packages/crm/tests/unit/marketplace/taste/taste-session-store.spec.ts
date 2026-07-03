import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  truncateGroundingToCap,
  groundingByteSize,
  isSessionExpired,
} from "../../../../src/lib/marketplace/taste/taste-session-store";
import { TASTE_GROUNDING_MAX_BYTES } from "../../../../src/lib/marketplace/taste/taste-policy";
import type { TasteGrounding } from "../../../../src/db/schema/agent-taste-sessions";

const big = (n: number) => "x".repeat(n);

describe("truncateGroundingToCap", () => {
  it("passes small groundings through unchanged", () => {
    const g: TasteGrounding = { businessName: "Acme", sourceDomain: "acme.com", services: ["a"] };
    assert.deepEqual(truncateGroundingToCap(g), g);
  });

  it("caps every field and always lands under the byte cap", () => {
    const g: TasteGrounding = {
      businessName: big(1000),
      description: big(20_000),
      tagline: big(5000),
      industry: big(5000),
      voiceTone: big(5000),
      idealClient: big(5000),
      services: Array.from({ length: 50 }, (_, i) => big(900) + i),
      sourceDomain: "acme.com",
    };
    const t = truncateGroundingToCap(g);
    assert.ok(groundingByteSize(t) <= TASTE_GROUNDING_MAX_BYTES, `size ${groundingByteSize(t)}`);
    assert.ok(t.services!.length <= 8);
    assert.ok(t.businessName.length <= 200);
    assert.equal(t.sourceDomain, "acme.com");
  });
});

describe("isSessionExpired", () => {
  it("closed-open expiry", () => {
    const exp = new Date("2026-07-03T13:00:00Z");
    assert.equal(isSessionExpired(exp, new Date("2026-07-03T12:59:59Z")), false);
    assert.equal(isSessionExpired(exp, new Date("2026-07-03T13:00:00Z")), true);
  });
});
