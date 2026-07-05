// TDD for pushBookingToConnectedCalendar (Task 8): pure orchestration, fully
// DI'd so it runs DB/network-free. Covers:
//   - no org-level googlecalendar/outlook connection → { pushed:false, reason:"no_connection" } silently
//   - connection found → executeCreateEvent called with orgId + mapped event fields
//   - executeCreateEvent throws → { pushed:false } without throwing, logged (no PII)
//   - payload never includes customer phone/email

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  pushBookingToConnectedCalendar,
  memoizedGetConnection,
  __resetCalendarPushMemoForTests,
} from "@/lib/integrations/calendar-push";

const ORG_ID = "org-123";
const BOOKING_ID = "booking-456";

function makeBooking(overrides: Partial<{
  title: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  startsAt: Date;
  endsAt: Date;
}> = {}) {
  return {
    title: "Consultation",
    fullName: "Jane Doe",
    email: "jane@example.com",
    phone: "+15551234567",
    startsAt: new Date("2026-07-10T15:00:00.000Z"),
    endsAt: new Date("2026-07-10T15:30:00.000Z"),
    ...overrides,
  };
}

test("no org-level connection → pushed:false reason:no_connection, silently", () => {
  return (async () => {
    let loggedErrors = 0;
    const result = await pushBookingToConnectedCalendar(
      { orgId: ORG_ID, bookingId: BOOKING_ID },
      {
        getConnection: async () => null,
        executeCreateEvent: async () => {
          throw new Error("should not be called");
        },
        loadBooking: async () => makeBooking(),
        logEvent: () => {
          loggedErrors += 1;
        },
      },
    );
    assert.deepEqual(result, { pushed: false, reason: "no_connection" });
    // "silently" — no error-level log for the common case.
    assert.equal(loggedErrors, 0);
  })();
});

test("connection found → executeCreateEvent called with orgId + mapped fields", () => {
  return (async () => {
    let capturedArgs: any = null;
    const result = await pushBookingToConnectedCalendar(
      { orgId: ORG_ID, bookingId: BOOKING_ID },
      {
        getConnection: async () => ({ provider: "googlecalendar", connectedAccountId: "acct_1" }),
        executeCreateEvent: async (args) => {
          capturedArgs = args;
          return { ok: true };
        },
        loadBooking: async () => makeBooking(),
        logEvent: () => {},
      },
    );
    assert.deepEqual(result, { pushed: true });
    assert.ok(capturedArgs, "executeCreateEvent should have been called");
    assert.equal(capturedArgs.orgId, ORG_ID);
    assert.equal(capturedArgs.provider, "googlecalendar");
    assert.equal(capturedArgs.connectedAccountId, "acct_1");
    assert.match(capturedArgs.summary, /Consultation/);
    assert.match(capturedArgs.summary, /Jane Doe/);
    assert.equal(capturedArgs.startIso, "2026-07-10T15:00:00.000Z");
    assert.equal(capturedArgs.endIso, "2026-07-10T15:30:00.000Z");
    assert.match(capturedArgs.description, /dashboard/);
  })();
});

test("executeCreateEvent throws → { pushed:false } without throwing; logged, no PII", () => {
  return (async () => {
    const logs: Array<{ event: string; data?: Record<string, unknown> }> = [];
    const result = await pushBookingToConnectedCalendar(
      { orgId: ORG_ID, bookingId: BOOKING_ID },
      {
        getConnection: async () => ({ provider: "googlecalendar", connectedAccountId: "acct_1" }),
        executeCreateEvent: async () => {
          throw new Error("composio_boom");
        },
        loadBooking: async () => makeBooking(),
        logEvent: (event, data) => {
          logs.push({ event, data });
        },
      },
    );
    assert.deepEqual(result, { pushed: false, reason: "push_failed" });
    assert.equal(logs.length, 1);
    assert.equal(logs[0].event, "calendar_push_failed");
    const serialized = JSON.stringify(logs[0].data);
    assert.doesNotMatch(serialized, /jane@example\.com/);
    assert.doesNotMatch(serialized, /\+15551234567/);
  })();
});

test("payload never includes customer phone/email in the event description", () => {
  return (async () => {
    let capturedArgs: any = null;
    await pushBookingToConnectedCalendar(
      { orgId: ORG_ID, bookingId: BOOKING_ID },
      {
        getConnection: async () => ({ provider: "outlook", connectedAccountId: "acct_2" }),
        executeCreateEvent: async (args) => {
          capturedArgs = args;
          return { ok: true };
        },
        loadBooking: async () => makeBooking(),
        logEvent: () => {},
      },
    );
    assert.ok(capturedArgs);
    assert.doesNotMatch(capturedArgs.description, /jane@example\.com/);
    assert.doesNotMatch(capturedArgs.description, /\+15551234567/);
    assert.doesNotMatch(capturedArgs.summary, /jane@example\.com/);
    assert.doesNotMatch(capturedArgs.summary, /\+15551234567/);
  })();
});

// M2 latency fix (2026-07-05) — memoizedGetConnection wraps the (network-
// bound) connection resolver with a per-org TTL memo so repeat bookings for
// the same org don't each pay a fresh Composio listConnections() round-trip.
test("memoizedGetConnection: second call within TTL does not invoke resolve again", () => {
  return (async () => {
    __resetCalendarPushMemoForTests();
    let calls = 0;
    const resolve = async (_orgId: string) => {
      calls += 1;
      return null;
    };

    const first = await memoizedGetConnection(ORG_ID, resolve);
    const second = await memoizedGetConnection(ORG_ID, resolve);

    assert.equal(first, null);
    assert.equal(second, null);
    assert.equal(calls, 1, "resolve should only be invoked once within the TTL window");
  })();
});

test("memoizedGetConnection: memoizes a found connection too (not just no_connection)", () => {
  return (async () => {
    __resetCalendarPushMemoForTests();
    let calls = 0;
    const connection = { provider: "googlecalendar" as const, connectedAccountId: "acct_1" };
    const resolve = async (_orgId: string) => {
      calls += 1;
      return connection;
    };

    const first = await memoizedGetConnection(ORG_ID, resolve);
    const second = await memoizedGetConnection(ORG_ID, resolve);

    assert.deepEqual(first, connection);
    assert.deepEqual(second, connection);
    assert.equal(calls, 1);
  })();
});

test("memoizedGetConnection: different orgs are memoized independently", () => {
  return (async () => {
    __resetCalendarPushMemoForTests();
    const calls: string[] = [];
    const resolve = async (orgId: string) => {
      calls.push(orgId);
      return null;
    };

    await memoizedGetConnection(ORG_ID, resolve);
    await memoizedGetConnection("org-999", resolve);
    await memoizedGetConnection(ORG_ID, resolve);

    assert.deepEqual(calls, [ORG_ID, "org-999"]);
  })();
});

test("memoizedGetConnection: re-resolves once the TTL has expired", () => {
  return (async () => {
    __resetCalendarPushMemoForTests();
    let calls = 0;
    const resolve = async (_orgId: string) => {
      calls += 1;
      return null;
    };

    await memoizedGetConnection(ORG_ID, resolve);

    // Simulate TTL expiry by clearing the memo directly (the TTL constant
    // itself is internal/unexported — this exercises the same "cache miss"
    // path a real expiry would hit without needing a 5-minute-long test).
    __resetCalendarPushMemoForTests();
    await memoizedGetConnection(ORG_ID, resolve);

    assert.equal(calls, 2);
  })();
});

test("no booking row found → pushed:false reason:no_booking, silently", () => {
  return (async () => {
    let loggedErrors = 0;
    const result = await pushBookingToConnectedCalendar(
      { orgId: ORG_ID, bookingId: BOOKING_ID },
      {
        getConnection: async () => ({ provider: "googlecalendar", connectedAccountId: "acct_1" }),
        executeCreateEvent: async () => {
          throw new Error("should not be called");
        },
        loadBooking: async () => null,
        logEvent: () => {
          loggedErrors += 1;
        },
      },
    );
    assert.deepEqual(result, { pushed: false, reason: "no_booking" });
    assert.equal(loggedErrors, 0);
  })();
});
