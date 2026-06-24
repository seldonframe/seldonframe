import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { resolveCalendarBackend } from "../../../../src/lib/agents/booking/calendar-backend";

const nativeStub = { findDayAvailability: async () => ({ slots: [] }), createEvent: async () => ({ ok: true as const, eventRef: "n" }) };
const composioStub = { findDayAvailability: async () => ({ slots: [] }), createEvent: async () => ({ ok: true as const, eventRef: "c" }) };
const deps = { makeNative: () => nativeStub, makeComposio: () => composioStub };

describe("resolveCalendarBackend", () => {
  test("native when binding is undefined", () => {
    assert.equal(resolveCalendarBackend(undefined, deps), nativeStub);
  });
  test("native when mode is native", () => {
    assert.equal(resolveCalendarBackend({ mode: "native" }, deps), nativeStub);
  });
  test("composio when book_external AND calendarRef.accountId present", () => {
    assert.equal(
      resolveCalendarBackend({ mode: "book_external", calendarRef: { provider: "googlecalendar", accountId: "ca_1" } }, deps),
      composioStub,
    );
  });
  test("FALLS BACK to native when book_external but calendar not yet connected (no accountId)", () => {
    assert.equal(resolveCalendarBackend({ mode: "book_external", calendarRef: null }, deps), nativeStub);
  });
});
