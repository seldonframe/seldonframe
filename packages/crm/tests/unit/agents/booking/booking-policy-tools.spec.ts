// Per-client booking policy (P1) — tool-seam enforcement tests.
//
// look_up_availability must offer ONLY slots that are BOTH a policy candidate
// (weekday window + duration cadence + lead time) AND free on the real calendar,
// capped at policy.maxPerDay. book_appointment must gate on policy.requiredFields
// (no partial booking) and book at policy.durationMinutes.
//
// PATTERN (repo convention): DI over module mocking. Both tools expose deps seams
// — look_up_availability takes { resolveBackend, listSlots }; book_appointment
// takes { submitBooking, resolveBackend }. We inject fakes so the policy
// intersection / required-fields logic is proven with no network / DB.

import { describe, test, mock } from "node:test";
import assert from "node:assert/strict";

import {
  lookUpAvailability,
  bookAppointment,
  type ToolExecuteContext,
  type LookUpAvailabilityDeps,
  type BookAppointmentDeps,
} from "../../../../src/lib/agents/tools";
import type {
  CalendarBackend,
  FreeWindow,
} from "../../../../src/lib/agents/booking/calendar-backend";
import { resolveBookingPolicy } from "../../../../src/lib/agents/booking/booking-policy";

// 2026-07-01 is a Wednesday → weekday 3.
const TEST_DATE = "2026-07-01";

// Frozen clock injected via deps.now. generateCandidateSlots drops any slot
// earlier than now + leadTimeHours, so a real-clock `now` makes these frozen
// fixtures rot: the suite started failing the moment the calendar passed the
// fixture dates (broke main CI 2026-07-10). Always keep FROZEN_NOW before
// every fixture date above/below.
const FROZEN_NOW = () => new Date("2026-06-28T00:00:00.000Z");

/** A book_external ctx whose policy is 09:00–11:00, 60-min, Wed-only, UTC.
 *  Candidates for TEST_DATE: 09:00 and 10:00 (11:00 wouldn't fit a 60-min slot). */
function ctxWithPolicy(
  overrides: Parameters<typeof resolveBookingPolicy>[0],
): ToolExecuteContext {
  return {
    orgId: "org-1",
    orgSlug: "acme",
    agentId: "agt-1",
    conversationId: "conv-1",
    testMode: false,
    timezone: "UTC",
    booking: {
      mode: "native",
      binding: {
        mode: "book_external",
        calendarRef: { provider: "googlecalendar", accountId: "ca_1" },
      },
      policy: resolveBookingPolicy(
        { startTime: "09:00", endTime: "11:00", durationMinutes: 60, weekdays: [3], timezone: "UTC", ...overrides },
        null,
        "UTC",
      ),
    },
  };
}

/** A fake CalendarBackend exposing the given free windows. createEvent/find are
 *  unused by look_up_availability's free-window path but required by the type. */
function backendWithWindows(windows: FreeWindow[]): CalendarBackend {
  return {
    findDayAvailability: async () => ({ slots: [] }),
    createEvent: async () => ({ ok: true, eventRef: "evt" }),
    findFreeWindows: async () => windows,
  };
}

describe("look_up_availability honors the booking policy window ∩ free/busy", () => {
  test("only the free in-window candidate is offered (09–10 busy, 10–11 free)", async () => {
    // Free window 10:00–11:00 only → 09:00 candidate excluded (busy), 10:00 kept.
    const deps: LookUpAvailabilityDeps = {
      resolveBackend: () =>
        backendWithWindows([{ start: `${TEST_DATE}T10:00:00.000Z`, end: `${TEST_DATE}T11:00:00.000Z` }]),
      // not reached on the book_external happy path, but provide a safe default
      listSlots: async () => ({ slots: [], durationMinutes: 60 }),
      now: FROZEN_NOW,
    };
    const res = (await lookUpAvailability.execute(
      { date: TEST_DATE },
      ctxWithPolicy({}),
      deps,
    )) as { slots: { iso: string }[]; durationMinutes: number };

    assert.deepEqual(
      res.slots.map((s) => s.iso),
      [`${TEST_DATE}T10:00:00.000Z`],
    );
    assert.equal(res.durationMinutes, 60, "offers at the policy duration, not 30");
  });

  test("a policy excluding the date's weekday offers nothing", async () => {
    // weekdays:[1] (Monday) but TEST_DATE is a Wednesday → no candidates at all.
    // Even with the whole day free, nothing is offered; the native fall-through
    // also produces nothing (empty listSlots, no config).
    const deps: LookUpAvailabilityDeps = {
      resolveBackend: () =>
        backendWithWindows([{ start: `${TEST_DATE}T00:00:00.000Z`, end: `${TEST_DATE}T23:59:59.000Z` }]),
      listSlots: async () => ({ slots: [], durationMinutes: 60 }),
      now: FROZEN_NOW,
    };
    const res = (await lookUpAvailability.execute(
      { date: TEST_DATE },
      ctxWithPolicy({ weekdays: [1] }),
      deps,
    )) as { slots: { iso: string }[] };

    assert.deepEqual(res.slots, []);
  });

  test("maxPerDay caps a 2-candidate free day to 1", async () => {
    // Whole 09:00–11:00 window free → both 09:00 + 10:00 fit; maxPerDay:1 caps it.
    const deps: LookUpAvailabilityDeps = {
      resolveBackend: () =>
        backendWithWindows([{ start: `${TEST_DATE}T09:00:00.000Z`, end: `${TEST_DATE}T11:00:00.000Z` }]),
      listSlots: async () => ({ slots: [], durationMinutes: 60 }),
      now: FROZEN_NOW,
    };
    const res = (await lookUpAvailability.execute(
      { date: TEST_DATE },
      ctxWithPolicy({ maxPerDay: 1 }),
      deps,
    )) as { slots: { iso: string }[] };

    assert.equal(res.slots.length, 1, "maxPerDay:1 offers at most one slot");
    assert.deepEqual(
      res.slots.map((s) => s.iso),
      [`${TEST_DATE}T09:00:00.000Z`],
    );
  });
});

describe("look_up_availability walks forward across days (book_external)", () => {
  // Regression: the book_external branch used to check input.date ONLY. A call
  // landing on an off-policy day (or late, past the window) then yielded zero
  // candidates and the agent said "no availability" instead of offering the next
  // open day. The branch must now walk forward up to 14 days from input.date,
  // accumulating up to 3 slots, intersecting EACH day's policy candidates with
  // THAT day's free windows.
  //
  // 2026-07-03 = Friday (in policy), 2026-07-04 = Saturday (off policy),
  // 2026-07-06 = Monday (in policy). Mon–Fri 09:00–17:00, 60-min, UTC.
  const FRIDAY = "2026-07-03";
  const SATURDAY = "2026-07-04";
  const MONDAY = "2026-07-06";

  /** A book_external ctx: Mon–Fri 09:00–17:00, 60-min slots, UTC. */
  const WALK_CTX: ToolExecuteContext = {
    orgId: "org-1",
    orgSlug: "acme",
    agentId: "agt-1",
    conversationId: "conv-1",
    testMode: false,
    timezone: "UTC",
    booking: {
      mode: "native",
      binding: {
        mode: "book_external",
        calendarRef: { provider: "googlecalendar", accountId: "ca_1" },
      },
      policy: resolveBookingPolicy(
        {
          durationMinutes: 60,
          weekdays: [1, 2, 3, 4, 5],
          startTime: "09:00",
          endTime: "17:00",
          timezone: "UTC",
        },
        null,
        "UTC",
      ),
    },
  };

  /** A backend whose findFreeWindows returns an all-day free window FOR THE
   *  QUERIED DATE (any date). This proves the walk fetches per-day windows: a
   *  Saturday query only yields slots if the tool walks forward to a weekday and
   *  re-queries free/busy for THAT day. listSlots returns nothing so the native
   *  fall-through can't be what produces the slots. */
  const deps: LookUpAvailabilityDeps = {
    resolveBackend: () => ({
      findDayAvailability: async () => ({ slots: [] }),
      createEvent: async () => ({ ok: true as const, eventRef: "evt" }),
      findFreeWindows: async ({ date }) => [
        { start: `${date}T00:00:00Z`, end: `${date}T23:59:59Z` },
      ],
    }),
    listSlots: async () => ({ slots: [], durationMinutes: 60 }),
    now: FROZEN_NOW,
  };

  test("an in-policy Friday returns same-day slots (all on the Friday)", async () => {
    const res = (await lookUpAvailability.execute(
      { date: FRIDAY },
      WALK_CTX,
      deps,
    )) as { slots: { iso: string }[]; durationMinutes: number; date: string };

    assert.ok(res.slots.length >= 1, "offers at least one slot on the in-policy day");
    assert.equal(res.durationMinutes, 60);
    assert.equal(res.date, FRIDAY, "echoes the requested start date");
    // Every offered slot is on the requested Friday (no need to walk).
    for (const s of res.slots) {
      assert.ok(s.iso.startsWith(FRIDAY), `slot ${s.iso} is on the requested Friday`);
    }
    // Accumulates up to the 3-slot cap.
    assert.equal(res.slots.length, 3, "accumulates up to 3 slots total");
  });

  test("an off-policy Saturday WALKS forward to Monday (proves multi-day walk)", async () => {
    const res = (await lookUpAvailability.execute(
      { date: SATURDAY },
      WALK_CTX,
      deps,
    )) as { slots: { iso: string }[]; durationMinutes: number; date: string };

    // The OLD single-day behavior would return [] here (Saturday is off policy
    // → zero candidates → native fall-through is empty). The walk must skip
    // Sat + Sun and land the first slots on Monday.
    assert.ok(res.slots.length >= 1, "walks forward and still offers slots");
    assert.equal(res.date, SATURDAY, "date echoes the original requested start");
    // No slot may be on the off-policy Sat/Sun; the first open day is Monday.
    for (const s of res.slots) {
      assert.ok(
        !s.iso.startsWith(SATURDAY) && !s.iso.startsWith("2026-07-05"),
        `slot ${s.iso} must not be on the off-policy weekend`,
      );
    }
    assert.ok(
      res.slots.every((s) => s.iso.startsWith(MONDAY)),
      "first available open day after a Sat start is the Monday",
    );
    assert.equal(res.slots.length, 3, "still accumulates up to 3 slots after walking");
  });
});

describe("book_appointment enforces policy.requiredFields before writing", () => {
  /** A book_external ctx requiring name+phone+address, 60-min slots. */
  const REQUIRED_CTX: ToolExecuteContext = {
    orgId: "org-1",
    orgSlug: "acme",
    agentId: "agt-1",
    conversationId: "conv-1",
    testMode: false,
    timezone: "UTC",
    booking: {
      mode: "native",
      binding: {
        mode: "book_external",
        calendarRef: { provider: "googlecalendar", accountId: "ca_1" },
      },
      policy: resolveBookingPolicy(
        { requiredFields: ["name", "phone", "address"], durationMinutes: 60, timezone: "UTC" },
        null,
        "UTC",
      ),
    },
  };

  test("a missing required field → returns needs + does NOT write", async () => {
    const createEvent = mock.fn(async () => ({ ok: true as const, eventRef: "evt" }));
    const submitBooking = mock.fn(async () => ({ success: true }));
    const deps: BookAppointmentDeps = {
      submitBooking,
      resolveBackend: () => ({
        findDayAvailability: async () => ({ slots: [] }),
        createEvent,
      }),
    };

    const res = (await bookAppointment.execute(
      {
        fullName: "Pat Lee",
        phone: "+15551234567", // name + phone present, address MISSING
        slotIso: `${TEST_DATE}T10:00:00.000Z`,
        confirmed: true,
      },
      REQUIRED_CTX,
      deps,
    )) as { ok: boolean; needs?: string[] };

    assert.equal(res.ok, false);
    assert.deepEqual(res.needs, ["address"], "names the one missing field");
    assert.equal(createEvent.mock.calls.length, 0, "no calendar write on a missing field");
    assert.equal(submitBooking.mock.calls.length, 0, "no native write either");
  });

  test("all required fields present → books at the policy duration", async () => {
    const createEventCalls: Array<{ durationMinutes: number }> = [];
    const createEvent = mock.fn(async (input: { durationMinutes: number }) => {
      createEventCalls.push(input);
      return { ok: true as const, eventRef: "evt_1" };
    });
    const deps: BookAppointmentDeps = {
      submitBooking: mock.fn(async () => ({ success: true })),
      resolveBackend: () => ({
        findDayAvailability: async () => ({ slots: [] }),
        createEvent: createEvent as unknown as CalendarBackend["createEvent"],
      }),
    };

    const res = (await bookAppointment.execute(
      {
        fullName: "Pat Lee",
        phone: "+15551234567",
        slotIso: `${TEST_DATE}T10:00:00.000Z`,
        intakeResponses: { address: "1234 Main St" },
        confirmed: true,
      },
      REQUIRED_CTX,
      deps,
    )) as { ok: boolean; bookingId?: string };

    assert.equal(res.ok, true);
    assert.equal(res.bookingId, "evt_1");
    assert.equal(createEventCalls.length, 1, "wrote the event once");
    assert.equal(
      createEventCalls[0]!.durationMinutes,
      60,
      "createEvent gets the policy duration (60), not the hardcoded 30",
    );
  });
});
