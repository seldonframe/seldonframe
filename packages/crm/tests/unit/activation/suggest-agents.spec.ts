// Unit tests for lib/activation/suggest-agents.ts — pure contextual
// starter-agent picker (Task 10 of the win-ladder + SeldonChat plan, step 4).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { suggestAgentsForIndustry, type AgentPickId } from "../../../src/lib/activation/suggest-agents";

const ALLOWED_IDS: ReadonlySet<AgentPickId> = new Set(["review-requester", "speed-to-lead"]);

describe("suggestAgentsForIndustry", () => {
  test("medspa (health/beauty) industry: review-requester first, speed-to-lead second", () => {
    const picks = suggestAgentsForIndustry("Medspa");
    assert.deepEqual(
      picks.map((p) => p.id),
      ["review-requester", "speed-to-lead"],
    );
  });

  test("hvac (trades) industry: speed-to-lead first, review-requester second", () => {
    const picks = suggestAgentsForIndustry("HVAC contractor");
    assert.deepEqual(
      picks.map((p) => p.id),
      ["speed-to-lead", "review-requester"],
    );
  });

  test("unknown/null industry falls back to review-requester, speed-to-lead", () => {
    const picksUnknown = suggestAgentsForIndustry("some totally unrelated business");
    assert.deepEqual(
      picksUnknown.map((p) => p.id),
      ["review-requester", "speed-to-lead"],
    );

    const picksNull = suggestAgentsForIndustry(null);
    assert.deepEqual(
      picksNull.map((p) => p.id),
      ["review-requester", "speed-to-lead"],
    );

    const picksUndefined = suggestAgentsForIndustry(undefined);
    assert.deepEqual(
      picksUndefined.map((p) => p.id),
      ["review-requester", "speed-to-lead"],
    );
  });

  test("always returns exactly 2 picks, both ids from the allowed union", () => {
    for (const industry of ["Dental clinic", "Plumbing", "Roofing co", "unknown", null]) {
      const picks = suggestAgentsForIndustry(industry);
      assert.equal(picks.length, 2);
      for (const pick of picks) {
        assert.ok(ALLOWED_IDS.has(pick.id), `${pick.id} should be in the allowed union`);
        assert.ok(pick.title.length > 0);
        assert.ok(pick.payoff.length > 0);
      }
      // No duplicate ids.
      assert.equal(new Set(picks.map((p) => p.id)).size, 2);
    }
  });
});
