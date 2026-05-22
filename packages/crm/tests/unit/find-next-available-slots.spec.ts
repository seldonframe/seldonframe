// 2026-05-22 — chatbot UX: "always offer the next 3 slots".
//
// The chatbot's `look_up_availability` tool used to return at most 3
// slots from a SINGLE day. If the requested day had only 1 free slot,
// the chatbot would only offer that 1 slot — and the visitor would
// drop off. ("Pick from this single time" doesn't feel like an offer;
// it feels like a take-it-or-leave-it.)
//
// New behaviour: walk forward day-by-day, accumulating slots, until
// we have 3 OR we've burned through a 14-day horizon (same horizon as
// the automations-path `check_availability` tool in tool-invoker.ts).
//
// The walk logic is extracted as a pure async function so we can test
// the math without spinning up the DB / public booking action. The
// runtime tool injects a `fetchSlotsForDay` closure that wraps
// listPublicBookingSlotsAction.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { findNextAvailableSlots } from "../../src/lib/agents/tools";

// Helper — build a Date for a YYYY-MM-DD at noon UTC. The walk treats
// dates as opaque ordinals so the exact hour doesn't matter, but using
// noon avoids any DST-edge weirdness if the implementation ever uses
// getUTCDate / setUTCDate.
function day(yyyymmdd: string): Date {
  return new Date(`${yyyymmdd}T12:00:00Z`);
}

describe("findNextAvailableSlots — multi-day walk for the chatbot", () => {
  test("returns up to maxSlots when first day has plenty", async () => {
    const calls: string[] = [];
    const slots = await findNextAvailableSlots({
      startDate: day("2026-06-01"),
      maxSlots: 3,
      maxDaysToWalk: 14,
      fetchSlotsForDay: async (date) => {
        const iso = date.toISOString().slice(0, 10);
        calls.push(iso);
        // Day 0 has 5 slots — well above maxSlots.
        return [
          "2026-06-01T13:00:00Z",
          "2026-06-01T14:00:00Z",
          "2026-06-01T15:00:00Z",
          "2026-06-01T16:00:00Z",
          "2026-06-01T17:00:00Z",
        ];
      },
    });
    assert.equal(slots.length, 3, "should return exactly maxSlots");
    assert.deepEqual(slots, [
      "2026-06-01T13:00:00Z",
      "2026-06-01T14:00:00Z",
      "2026-06-01T15:00:00Z",
    ]);
    assert.equal(calls.length, 1, "should only query day 0 — no walk needed");
    assert.equal(calls[0], "2026-06-01");
  });

  test("walks one day when first day is sparse", async () => {
    const calls: string[] = [];
    const byDate: Record<string, string[]> = {
      "2026-06-01": ["2026-06-01T16:00:00Z"], // single 4pm slot
      "2026-06-02": [
        "2026-06-02T09:00:00Z",
        "2026-06-02T10:00:00Z",
        "2026-06-02T11:00:00Z",
        "2026-06-02T13:00:00Z",
        "2026-06-02T14:00:00Z",
      ],
    };
    const slots = await findNextAvailableSlots({
      startDate: day("2026-06-01"),
      maxSlots: 3,
      maxDaysToWalk: 14,
      fetchSlotsForDay: async (date) => {
        const iso = date.toISOString().slice(0, 10);
        calls.push(iso);
        return byDate[iso] ?? [];
      },
    });
    assert.deepEqual(slots, [
      "2026-06-01T16:00:00Z",
      "2026-06-02T09:00:00Z",
      "2026-06-02T10:00:00Z",
    ]);
    assert.equal(calls.length, 2, "should query 2 days (day 0 + day 1)");
  });

  test("walks multiple empty days before finding slots", async () => {
    const calls: string[] = [];
    const byDate: Record<string, string[]> = {
      "2026-06-01": [], // empty
      "2026-06-02": [], // empty
      "2026-06-03": [
        "2026-06-03T10:00:00Z",
        "2026-06-03T11:00:00Z",
      ],
      "2026-06-04": [
        "2026-06-04T09:00:00Z",
        "2026-06-04T10:00:00Z",
        "2026-06-04T11:00:00Z",
        "2026-06-04T13:00:00Z",
        "2026-06-04T14:00:00Z",
      ],
    };
    const slots = await findNextAvailableSlots({
      startDate: day("2026-06-01"),
      maxSlots: 3,
      maxDaysToWalk: 14,
      fetchSlotsForDay: async (date) => {
        const iso = date.toISOString().slice(0, 10);
        calls.push(iso);
        return byDate[iso] ?? [];
      },
    });
    assert.deepEqual(slots, [
      "2026-06-03T10:00:00Z",
      "2026-06-03T11:00:00Z",
      "2026-06-04T09:00:00Z",
    ]);
    assert.equal(calls.length, 4, "should query 4 days: 1, 2, 3, 4");
    assert.deepEqual(calls, [
      "2026-06-01",
      "2026-06-02",
      "2026-06-03",
      "2026-06-04",
    ]);
  });

  test("returns empty array when no slots in the 14-day horizon", async () => {
    const calls: string[] = [];
    const slots = await findNextAvailableSlots({
      startDate: day("2026-06-01"),
      maxSlots: 3,
      maxDaysToWalk: 14,
      fetchSlotsForDay: async (date) => {
        calls.push(date.toISOString().slice(0, 10));
        return [];
      },
    });
    assert.deepEqual(slots, []);
    assert.equal(calls.length, 14, "should query exactly 14 days then stop");
  });

  test("returns partial result if horizon reached with fewer than maxSlots", async () => {
    const calls: string[] = [];
    const byDate: Record<string, string[]> = {
      "2026-06-05": ["2026-06-05T10:00:00Z"],
      "2026-06-10": ["2026-06-10T14:00:00Z"],
    };
    const slots = await findNextAvailableSlots({
      startDate: day("2026-06-01"),
      maxSlots: 3,
      maxDaysToWalk: 14,
      fetchSlotsForDay: async (date) => {
        const iso = date.toISOString().slice(0, 10);
        calls.push(iso);
        return byDate[iso] ?? [];
      },
    });
    assert.equal(slots.length, 2, "should return only the 2 slots found");
    assert.deepEqual(slots, [
      "2026-06-05T10:00:00Z",
      "2026-06-10T14:00:00Z",
    ]);
    assert.equal(calls.length, 14, "should walk the full horizon");
  });

  test("stops walking as soon as maxSlots is reached", async () => {
    const calls: string[] = [];
    const byDate: Record<string, string[]> = {
      "2026-06-01": [
        "2026-06-01T09:00:00Z",
        "2026-06-01T10:00:00Z",
        "2026-06-01T11:00:00Z",
        "2026-06-01T12:00:00Z",
        "2026-06-01T13:00:00Z",
      ],
      // Day 1 has many slots too, but we should NEVER reach it.
      "2026-06-02": [
        "2026-06-02T09:00:00Z",
        "2026-06-02T10:00:00Z",
      ],
    };
    const slots = await findNextAvailableSlots({
      startDate: day("2026-06-01"),
      maxSlots: 3,
      maxDaysToWalk: 14,
      fetchSlotsForDay: async (date) => {
        const iso = date.toISOString().slice(0, 10);
        calls.push(iso);
        return byDate[iso] ?? [];
      },
    });
    assert.equal(slots.length, 3);
    assert.equal(calls.length, 1, "should NOT query day 1 — already have 3 from day 0");
    assert.equal(calls[0], "2026-06-01");
  });

  test("preserves chronological order across days", async () => {
    // Day 0: one slot late afternoon. Day 1: two morning slots.
    // Chrono order must be day 0 first, day 1 second.
    const byDate: Record<string, string[]> = {
      "2026-06-01": ["2026-06-01T17:00:00Z"],
      "2026-06-02": ["2026-06-02T08:00:00Z", "2026-06-02T09:00:00Z"],
    };
    const slots = await findNextAvailableSlots({
      startDate: day("2026-06-01"),
      maxSlots: 3,
      maxDaysToWalk: 14,
      fetchSlotsForDay: async (date) => {
        const iso = date.toISOString().slice(0, 10);
        return byDate[iso] ?? [];
      },
    });
    assert.deepEqual(slots, [
      "2026-06-01T17:00:00Z",
      "2026-06-02T08:00:00Z",
      "2026-06-02T09:00:00Z",
    ]);
    // Sanity check: every later slot's ISO sorts >= the previous one.
    for (let i = 1; i < slots.length; i += 1) {
      assert.ok(
        slots[i]! >= slots[i - 1]!,
        `slot ${i} (${slots[i]}) should be >= slot ${i - 1} (${slots[i - 1]})`,
      );
    }
  });

  test("partial fill on the last walked day — only takes what fits in maxSlots", async () => {
    // Day 0 has 2 slots, day 1 has 10 slots. We want exactly 3 total,
    // so we should take 2 from day 0 + the FIRST one from day 1.
    const calls: string[] = [];
    const byDate: Record<string, string[]> = {
      "2026-06-01": ["2026-06-01T10:00:00Z", "2026-06-01T11:00:00Z"],
      "2026-06-02": [
        "2026-06-02T09:00:00Z",
        "2026-06-02T10:00:00Z",
        "2026-06-02T11:00:00Z",
        "2026-06-02T13:00:00Z",
      ],
    };
    const slots = await findNextAvailableSlots({
      startDate: day("2026-06-01"),
      maxSlots: 3,
      maxDaysToWalk: 14,
      fetchSlotsForDay: async (date) => {
        const iso = date.toISOString().slice(0, 10);
        calls.push(iso);
        return byDate[iso] ?? [];
      },
    });
    assert.deepEqual(slots, [
      "2026-06-01T10:00:00Z",
      "2026-06-01T11:00:00Z",
      "2026-06-02T09:00:00Z",
    ]);
    assert.equal(calls.length, 2, "queried day 0 and day 1, then stopped");
  });
});
