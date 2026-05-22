// 2026-05-22 — chatbot skill prose check (companion to
// find-next-available-slots.spec.ts).
//
// History:
//   1. Polish #3 (earlier today) introduced a single-day 3-slot cap
//      via a `capSlotsForChat()` helper. The helper had its own tests
//      in this file.
//   2. Later the same day we replaced the single-day cap with a
//      forward-walking multi-day collector. The walk logic
//      (`findNextAvailableSlots`) and its 3-slot cap are tested in
//      find-next-available-slots.spec.ts — those tests subsume the
//      old cap-helper tests, so the helper was deleted.
//
// What survives in this file is the skill-prose check: the SDR skill
// text must still say "offer exactly 3", because that's the visitor-
// facing promise the new walk behaviour actually delivers on. If a
// future edit drifts the prose back to "offer 2-3" the user experience
// would lie about what the tool returns.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

describe("sdr skill — chatbot offers 3 slots", () => {
  test("Step 5 says 'offer exactly 3'", async () => {
    const sdrSkill = (await import("../../src/lib/agents/skills/website-chatbot/sdr"))
      .default;
    assert.ok(
      /offer\s+exactly\s+3/i.test(sdrSkill),
      "SDR skill should instruct the agent to 'offer exactly 3' slots in Step 5",
    );
    // Belt: prior wording was "offer 2-3 to the user" — make sure we replaced it.
    assert.ok(
      !/offer\s+2-3\s+to\s+the\s+user/i.test(sdrSkill),
      "SDR skill still says 'offer 2-3 to the user' — should say 'offer exactly 3'",
    );
  });
});
