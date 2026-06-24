// packages/crm/tests/unit/deployments/booking-binding.spec.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { deploymentToBinding } from "../../../src/lib/deployments/booking-binding";

test("native", () => assert.deepEqual(deploymentToBinding({ bookingMode: "native" }), { mode: "native" }));
test("missing bookingMode → native", () => assert.deepEqual(deploymentToBinding({ bookingMode: null }), { mode: "native" }));
test("external_link carries url", () =>
  assert.deepEqual(deploymentToBinding({ bookingMode: "external_link", externalBookingUrl: "https://cal.com/x" }),
    { mode: "external_link", externalUrl: "https://cal.com/x" }));
test("api_mcp + connected google → book_external with ref", () =>
  assert.deepEqual(
    deploymentToBinding({ bookingMode: "api_mcp", calendarRef: { provider: "googlecalendar", accountId: "ca_1", calendarId: "primary" } }),
    { mode: "book_external", calendarRef: { provider: "googlecalendar", accountId: "ca_1", calendarId: "primary" } }));
test("api_mcp but NOT yet connected (no accountId) → book_external, calendarRef null (→ native fallback)", () =>
  assert.deepEqual(deploymentToBinding({ bookingMode: "api_mcp", calendarRef: null }), { mode: "book_external", calendarRef: null }));
test("api_mcp with unknown provider → null ref", () =>
  assert.deepEqual(deploymentToBinding({ bookingMode: "api_mcp", calendarRef: { provider: "weirdcal", accountId: "x" } }), { mode: "book_external", calendarRef: null }));
