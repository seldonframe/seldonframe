// packages/crm/tests/unit/deployments/booking-binding.spec.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { deploymentToBinding } from "../../../src/lib/deployments/booking-binding";

// id (the Composio entity) + builderOrgId (the Composio key org) are now part of
// the BindingSource — every case threads them; the book_external ref carries
// them through as entityUserId + ownerOrgId.
const base = { id: "dep_1", builderOrgId: "builder_1" };

test("native", () => assert.deepEqual(deploymentToBinding({ ...base, bookingMode: "native" }), { mode: "native" }));
test("missing bookingMode → native", () => assert.deepEqual(deploymentToBinding({ ...base, bookingMode: null }), { mode: "native" }));
test("external_link carries url", () =>
  assert.deepEqual(deploymentToBinding({ ...base, bookingMode: "external_link", externalBookingUrl: "https://cal.com/x" }),
    { mode: "external_link", externalUrl: "https://cal.com/x" }));
test("api_mcp + connected google → book_external with ref (owner + entity stamped)", () =>
  assert.deepEqual(
    deploymentToBinding({ ...base, bookingMode: "api_mcp", calendarRef: { provider: "googlecalendar", accountId: "ca_1", calendarId: "primary" } }),
    { mode: "book_external", calendarRef: { provider: "googlecalendar", accountId: "ca_1", calendarId: "primary", ownerOrgId: "builder_1", entityUserId: "dep_1" } }));
test("api_mcp but NOT yet connected (no accountId) → book_external, calendarRef null (→ native fallback)", () =>
  assert.deepEqual(deploymentToBinding({ ...base, bookingMode: "api_mcp", calendarRef: null }), { mode: "book_external", calendarRef: null }));
test("api_mcp with unknown provider → null ref", () =>
  assert.deepEqual(deploymentToBinding({ ...base, bookingMode: "api_mcp", calendarRef: { provider: "weirdcal", accountId: "x" } }), { mode: "book_external", calendarRef: null }));
