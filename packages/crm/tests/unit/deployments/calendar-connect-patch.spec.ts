import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { calendarConnectPatch } from "../../../src/lib/deployments/calendar-connect-patch";

describe("calendarConnectPatch", () => {
  test("native + googlecalendar → flips to api_mcp", () => {
    assert.deepEqual(calendarConnectPatch({ currentBookingMode: "native", toolkit: "googlecalendar" }), { bookingMode: "api_mcp" });
  });
  test("unset/null + outlook → flips to api_mcp", () => {
    assert.deepEqual(calendarConnectPatch({ currentBookingMode: null, toolkit: "outlook" }), { bookingMode: "api_mcp" });
    assert.deepEqual(calendarConnectPatch({ currentBookingMode: undefined, toolkit: "googlecalendar" }), { bookingMode: "api_mcp" });
  });
  test("already api_mcp / cal_com → no change (idempotent, no downgrade)", () => {
    assert.deepEqual(calendarConnectPatch({ currentBookingMode: "api_mcp", toolkit: "googlecalendar" }), {});
    assert.deepEqual(calendarConnectPatch({ currentBookingMode: "cal_com", toolkit: "googlecalendar" }), {});
  });
  test("explicit external_link → left untouched (operator chose a handoff)", () => {
    assert.deepEqual(calendarConnectPatch({ currentBookingMode: "external_link", toolkit: "googlecalendar" }), {});
  });
  test("non-calendar toolkit → never touches bookingMode", () => {
    assert.deepEqual(calendarConnectPatch({ currentBookingMode: "native", toolkit: "gmail" }), {});
  });
});
