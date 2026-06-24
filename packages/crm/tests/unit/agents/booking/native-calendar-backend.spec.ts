import { test } from "node:test";
import assert from "node:assert/strict";
import { makeNativeCalendarBackend } from "../../../../src/lib/agents/booking/native-calendar-backend";

test("createEvent maps to submitBooking args + returns eventRef", async () => {
  const calls: any[] = [];
  const be = makeNativeCalendarBackend({
    orgSlug: "acme", bookingSlug: "default",
    listSlots: async () => ({ slots: [], durationMinutes: 30, workspaceTimezone: "UTC" }),
    submitBooking: async (a) => { calls.push(a); return { ok: true, bookingId: "bk_1" }; },
  });
  const r = await be.createEvent({ startIso: "2026-07-01T16:00:00Z", durationMinutes: 30, timezone: "UTC",
    title: "Service call", attendee: { name: "Pat", phone: "+15125550148" } });
  assert.deepEqual(r, { ok: true, eventRef: "bk_1" });
  assert.equal(calls[0].startsAt, "2026-07-01T16:00:00Z");
  assert.equal(calls[0].fullName, "Pat");
  assert.equal(calls[0].intakeResponses.phone, "+15125550148");
});

test("findDayAvailability maps ISO slots to labeled slots", async () => {
  const be = makeNativeCalendarBackend({
    orgSlug: "acme", bookingSlug: "default",
    listSlots: async () => ({ slots: ["2026-07-01T16:00:00Z"], durationMinutes: 30, workspaceTimezone: "UTC" }),
    submitBooking: async () => ({ ok: true, bookingId: "x" }),
  });
  const r = await be.findDayAvailability({ date: "2026-07-01", durationMinutes: 30, timezone: "UTC" });
  assert.equal(r.slots.length, 1);
  assert.equal(r.slots[0].iso, "2026-07-01T16:00:00Z");
  assert.ok(r.slots[0].label.length > 0);
});

test("createEvent surfaces failure", async () => {
  const be = makeNativeCalendarBackend({ orgSlug: "a", bookingSlug: "d",
    listSlots: async () => ({ slots: [], durationMinutes: 30 }),
    submitBooking: async () => ({ ok: false, error: "slot_taken" }) });
  const r = await be.createEvent({ startIso: "x", durationMinutes: 30, timezone: "UTC", title: "t", attendee: { name: "P" } });
  assert.deepEqual(r, { ok: false, error: "slot_taken" });
});
