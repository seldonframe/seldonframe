// T8 — api_mcp promoted to an available "book into the client's calendar" mode.
import { test } from "node:test";
import assert from "node:assert/strict";
import { getBookingProvider, resolveBookingMode } from "../../../src/lib/deployments/booking-providers";

test("api_mcp is available + book_external", () => {
  const p = getBookingProvider("api_mcp");
  assert.equal(p.status, "available");
  assert.equal(p.agentBehavior, "book_external");
});

test("cal_com stays coming_soon (not promoted in this slice)", () => {
  assert.equal(getBookingProvider("cal_com").status, "coming_soon");
});

test("resolveBookingMode round-trips api_mcp", () => {
  assert.equal(resolveBookingMode("api_mcp"), "api_mcp");
});
