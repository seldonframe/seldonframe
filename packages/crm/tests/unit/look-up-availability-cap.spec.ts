// 2026-05-22 — Polish #3: cap the chatbot's offered booking slots at 3.
//
// Surfacing 6+ time slots in a chat bubble overwhelms users — they freeze
// instead of picking. Three is plenty for chat UX (per Hick's law, fewer
// alternatives = faster decision). The cap lives on the chatbot's
// look_up_availability tool, NOT on the broader booking API: a customer
// who hits the real booking page should still see every available slot.
//
// We extract `capSlotsForChat()` as a tiny pure helper so the test can
// run without spinning up the DB / public booking action / Anthropic
// client. The runtime tool wraps the helper around its DB lookup.
//
// The look-alike `check_availability` tool in lib/agents/tool-invoker.ts
// (used by automations, NOT the chatbot) is intentionally NOT touched —
// it has its own caller-set limit (defaults to 10, max 20).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { capSlotsForChat } from "../../src/lib/agents/tools";

describe("capSlotsForChat — Polish #3 (3-slot cap)", () => {
  test("returns at most 3 slots when given 6", () => {
    const six = [
      "2026-06-01T13:00:00Z",
      "2026-06-01T14:00:00Z",
      "2026-06-01T15:00:00Z",
      "2026-06-01T16:00:00Z",
      "2026-06-01T17:00:00Z",
      "2026-06-01T18:00:00Z",
    ];
    const out = capSlotsForChat(six);
    assert.equal(out.length, 3, "should cap at 3 slots");
    assert.deepEqual(out, six.slice(0, 3), "should keep the first 3 slots in order");
  });

  test("returns 2 slots untouched when given 2", () => {
    const two = ["2026-06-01T13:00:00Z", "2026-06-01T14:00:00Z"];
    const out = capSlotsForChat(two);
    assert.equal(out.length, 2);
    assert.deepEqual(out, two);
  });

  test("returns an empty array when given an empty array", () => {
    assert.deepEqual(capSlotsForChat([]), []);
  });

  test("returns 3 slots untouched when given exactly 3", () => {
    const three = [
      "2026-06-01T13:00:00Z",
      "2026-06-01T14:00:00Z",
      "2026-06-01T15:00:00Z",
    ];
    const out = capSlotsForChat(three);
    assert.equal(out.length, 3);
    assert.deepEqual(out, three);
  });

  test("does not mutate the input array", () => {
    const six = [
      "a", "b", "c", "d", "e", "f",
    ];
    const snapshot = [...six];
    capSlotsForChat(six);
    assert.deepEqual(six, snapshot, "input array should not be mutated");
  });
});

// Belt + suspenders: also assert the SDR skill text reflects the cap
// ("offer exactly 3"). The two pieces (helper + skill prose) are
// intentionally tightly coupled — if a future edit relaxes the helper,
// the skill should follow, and vice versa.
describe("sdr skill — Polish #3 (skill prose matches the cap)", () => {
  test("Step 5 says 'offer exactly 3'", async () => {
    // Dynamic import keeps the test independent of module load order
    // (and matches how composeSystemPrompt reads the skill).
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
