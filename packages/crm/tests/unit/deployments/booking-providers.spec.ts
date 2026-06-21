// packages/crm/tests/unit/deployments/booking-providers.spec.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BOOKING_PROVIDERS,
  getBookingProvider,
  resolveBookingMode,
  type BookingMode,
} from "../../../src/lib/deployments/booking-providers";

test("native + external_link are available; api_mcp + cal_com are coming_soon", () => {
  assert.equal(getBookingProvider("native").status, "available");
  assert.equal(getBookingProvider("external_link").status, "available");
  assert.equal(getBookingProvider("api_mcp").status, "coming_soon");
  assert.equal(getBookingProvider("cal_com").status, "coming_soon");
});

test("every provider has label, description, and agentBehavior", () => {
  for (const p of BOOKING_PROVIDERS) {
    assert.ok(p.label.length > 0, `${p.id} label`);
    assert.ok(p.description.length > 0, `${p.id} description`);
    assert.ok(
      ["book_native", "handoff_link", "handoff_followup"].includes(p.agentBehavior),
      `${p.id} agentBehavior`,
    );
  }
});

test("native behaves via the native chain; external_link hands off a link", () => {
  assert.equal(getBookingProvider("native").agentBehavior, "book_native");
  assert.equal(getBookingProvider("external_link").agentBehavior, "handoff_link");
  assert.equal(getBookingProvider("cal_com").agentBehavior, "handoff_followup");
});

test("resolveBookingMode falls back to native on unknown / null / undefined", () => {
  assert.equal(resolveBookingMode("external_link"), "external_link");
  assert.equal(resolveBookingMode("bogus"), "native");
  assert.equal(resolveBookingMode(null), "native");
  assert.equal(resolveBookingMode(undefined), "native");
});

test("requiresUrl is true only for external_link", () => {
  assert.equal(getBookingProvider("external_link").requiresUrl, true);
  assert.equal(getBookingProvider("native").requiresUrl, false);
});

// Touch the exported type so tsc keeps the import meaningful.
const _modeCheck: BookingMode = "native";
void _modeCheck;
