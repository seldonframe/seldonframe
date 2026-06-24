// book_appointment → CalendarBackend seam tests (ICP-3, Task 4).
//
// Task 4 routes the CONFIRMED native booking write through a pluggable
// CalendarBackend whenever the deployment's binding is `book_external`
// (booking into the CLIENT's own connected Google/Outlook calendar over
// Composio). The native path is untouched — it keeps calling submitBooking
// directly. The book_external path falls back to the native submit if the
// external backend fails, so a live call never drops.
//
// PATTERN: this repo prefers DI over module mocking. book_appointment exposes a
// `submitBooking` deps seam AND (new) a `resolveBackend` seam — we inject a fake
// backend whose createEvent records the call, and a submitBooking spy, to prove
// the routing + fallback WITHOUT any network / DB.

import { describe, test, mock } from "node:test";
import assert from "node:assert/strict";

import {
  bookAppointment,
  type ToolExecuteContext,
  type BookAppointmentDeps,
} from "../../../../src/lib/agents/tools";
import type { CalendarBackend } from "../../../../src/lib/agents/booking/calendar-backend";

/** A ctx WITHOUT booking → workspace/operator agent → native path. */
const BASE_CTX: ToolExecuteContext = {
  orgId: "org-1",
  orgSlug: "acme",
  agentId: "agt-1",
  conversationId: "conv-1",
  testMode: false,
};

/** A book_external binding with a CONNECTED calendar. */
const EXTERNAL_BINDING: NonNullable<ToolExecuteContext["booking"]> = {
  // legacy handoff selector stays native so the legacy mode branch is a no-op
  mode: "native",
  binding: {
    mode: "book_external",
    calendarRef: { provider: "googlecalendar", accountId: "ca_1" },
  },
};

const CONFIRMED_ARGS = {
  fullName: "Pat Lee",
  phone: "+15551234567",
  slotIso: "2026-07-01T15:00:00Z",
  confirmed: true as const,
};

describe("book_appointment routes through the CalendarBackend seam", () => {
  test("book_external + connected → routes to the resolved backend, NOT native submit", async () => {
    const createEventCalls: unknown[] = [];
    const fakeBackend: CalendarBackend = {
      findDayAvailability: async () => ({ slots: [] }),
      createEvent: async (input) => {
        createEventCalls.push(input);
        return { ok: true, eventRef: "evt_1" };
      },
    };
    // submitBooking must NOT be called on the happy external path.
    const submitBooking = mock.fn(async () => ({ success: true }));
    const deps: BookAppointmentDeps = {
      submitBooking,
      resolveBackend: () => fakeBackend,
    };

    const res = (await bookAppointment.execute(
      CONFIRMED_ARGS,
      { ...BASE_CTX, booking: EXTERNAL_BINDING },
      deps,
    )) as { ok: boolean; bookingId?: string };

    assert.equal(res.ok, true);
    assert.equal(res.bookingId, "evt_1", "returns the external eventRef");
    assert.equal(createEventCalls.length, 1, "routed to the backend exactly once");
    assert.equal(
      submitBooking.mock.calls.length,
      0,
      "native submit must NOT run on the happy external path",
    );
    // The confirmed slotIso must reach the backend verbatim.
    assert.equal(
      (createEventCalls[0] as { startIso: string }).startIso,
      "2026-07-01T15:00:00Z",
    );
  });

  test("book_external backend fails → FALLS BACK to native submit + warns + still succeeds", async () => {
    const fakeBackend: CalendarBackend = {
      findDayAvailability: async () => ({ slots: [] }),
      createEvent: async () => ({ ok: false, error: "x" }),
    };
    const submitBooking = mock.fn(async () => ({ success: true }));
    const deps: BookAppointmentDeps = {
      submitBooking,
      resolveBackend: () => fakeBackend,
    };

    // Capture the structured fallback warn.
    const warnings: string[] = [];
    const origWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map((a) => String(a)).join(" "));
    };
    let res: { ok: boolean };
    try {
      res = (await bookAppointment.execute(
        CONFIRMED_ARGS,
        { ...BASE_CTX, booking: EXTERNAL_BINDING },
        deps,
      )) as { ok: boolean };
    } finally {
      console.warn = origWarn;
    }

    assert.equal(res.ok, true, "fallback still returns success");
    assert.equal(
      submitBooking.mock.calls.length,
      1,
      "fell back to the native submit exactly once",
    );
    // A structured booking_external_fallback warn was emitted with the org + reason.
    const fallbackLog = warnings.find((w) => w.includes("booking_external_fallback"));
    assert.ok(fallbackLog, "emitted a booking_external_fallback warn");
    assert.match(fallbackLog!, /org-1/);
    assert.match(fallbackLog!, /"reason":"x"/);
  });

  test("no booking binding (native) → uses native submit as today (regression guard)", async () => {
    const submitBooking = mock.fn(async () => ({ success: true }));
    // resolveBackend present but must never be consulted on the native path.
    const resolveBackend = mock.fn(() => {
      throw new Error("resolveBackend must NOT run on the native path");
    });
    const deps = {
      submitBooking,
      resolveBackend,
    } as unknown as BookAppointmentDeps;

    const res = (await bookAppointment.execute(
      CONFIRMED_ARGS,
      BASE_CTX, // no ctx.booking → native
      deps,
    )) as { ok: boolean };

    assert.equal(res.ok, true);
    assert.equal(submitBooking.mock.calls.length, 1, "native submit called once");
    assert.equal(
      resolveBackend.mock.calls.length,
      0,
      "the backend seam is never consulted on the native path",
    );
  });
});
