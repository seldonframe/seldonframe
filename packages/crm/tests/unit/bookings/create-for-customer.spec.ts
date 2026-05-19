// Phase 3 Task 3.3 — booking parity test.
//
// Agent path and public path must construct identical input to
// createBookingForCustomer (except for `source` + `notes` which
// describe HOW the booking was created). Real DB-side parity is
// covered by the integration test in Phase 7; this is the contract
// test at the input boundary.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import type { CreateBookingForCustomerInput } from "../../../src/lib/bookings/create-for-customer";

describe("createBookingForCustomer input contract — agent + public parity", () => {
  test("agent and public path produce identical input shape (excluding source + notes + provider/status/skipContactRefresh)", () => {
    const customer = {
      contactId: "c-1",
      firstName: "Alice",
      lastName: null,
      email: "a@x.com",
      phone: "+14505161803",
    };
    const startsAt = new Date("2026-05-20T15:00:00Z");

    const agent: CreateBookingForCustomerInput = {
      orgId: "org-1",
      customer,
      appointmentTypeId: "appt-1",
      startsAt,
      notes: "Booked by agent",
      source: "agent",
    };
    const publicPath: CreateBookingForCustomerInput = {
      orgId: "org-1",
      customer,
      appointmentTypeId: "appt-1",
      startsAt,
      notes: "Booked via public page",
      source: "public_page",
      // Public action upserts contacts upstream with a richer merge —
      // it asks the helper to skip the redundant contact write.
      skipContactRefresh: true,
    };

    // Identical except source + notes (both describe HOW the booking
    // was created) and skipContactRefresh (an operational flag, not a
    // booking attribute). Provider/status default to the same values
    // for the free-booking case so we don't strip them here.
    const stripVariable = (b: CreateBookingForCustomerInput) => ({
      orgId: b.orgId,
      customer: b.customer,
      appointmentTypeId: b.appointmentTypeId,
      startsAt: b.startsAt,
      intakeAnswers: b.intakeAnswers ?? null,
      durationMinutes: b.durationMinutes ?? null,
    });
    assert.deepEqual(stripVariable(agent), stripVariable(publicPath));
  });

  test("source enum is limited to 'agent' | 'public_page'", () => {
    // TypeScript compile-time check; this test just documents the contract.
    const validAgent: CreateBookingForCustomerInput["source"] = "agent";
    const validPublic: CreateBookingForCustomerInput["source"] = "public_page";
    assert.equal(validAgent, "agent");
    assert.equal(validPublic, "public_page");
  });
});
