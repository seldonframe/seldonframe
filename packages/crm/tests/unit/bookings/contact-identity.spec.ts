// Voice R1 — TDD for resolveBookingContactIdentity.
//
// The pure decision at the heart of "book with phone, no email": given the
// (email, phone) a booking arrives with, decide HOW to resolve the contact —
// by email (web + text-chatbot always send one) or by phone (voice plumber
// path). Keeping it pure lets us prove the branch without a Postgres.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { resolveBookingContactIdentity } from "../../../src/lib/bookings/contact-identity";

describe("resolveBookingContactIdentity", () => {
  test("email present → match by email; storedEmail is the email", () => {
    const id = resolveBookingContactIdentity({
      email: "jane@acme.co",
      phone: "+15551234567",
    });
    assert.equal(id.matchBy, "email");
    assert.equal(id.email, "jane@acme.co");
    assert.equal(id.storedEmail, "jane@acme.co");
    assert.equal(id.phone, "+15551234567");
  });

  test("email present but no phone → still match by email", () => {
    const id = resolveBookingContactIdentity({ email: "jane@acme.co" });
    assert.equal(id.matchBy, "email");
    assert.equal(id.storedEmail, "jane@acme.co");
    assert.equal(id.phone, null);
  });

  test("empty-string email → falls through to phone", () => {
    const id = resolveBookingContactIdentity({
      email: "",
      phone: "+15551234567",
    });
    assert.equal(id.matchBy, "phone");
    // storedEmail is NULL (not "") so the nullable columns hold null.
    assert.equal(id.storedEmail, null);
    assert.equal(id.phone, "+15551234567");
  });

  test("whitespace-only email → falls through to phone", () => {
    const id = resolveBookingContactIdentity({
      email: "   ",
      phone: "+15551234567",
    });
    assert.equal(id.matchBy, "phone");
    assert.equal(id.storedEmail, null);
  });

  test("absent email → match by phone, storedEmail null", () => {
    const id = resolveBookingContactIdentity({ phone: "+15551234567" });
    assert.equal(id.matchBy, "phone");
    assert.equal(id.storedEmail, null);
    assert.equal(id.email, null);
    assert.equal(id.phone, "+15551234567");
  });

  test("trims a phone before using it as the match key", () => {
    const id = resolveBookingContactIdentity({ phone: "  +15551234567  " });
    assert.equal(id.matchBy, "phone");
    assert.equal(id.phone, "+15551234567");
  });

  test("neither email nor phone → matchBy 'none' (caller falls back to orphan)", () => {
    const id = resolveBookingContactIdentity({});
    assert.equal(id.matchBy, "none");
    assert.equal(id.storedEmail, null);
    assert.equal(id.email, null);
    assert.equal(id.phone, null);
  });

  test("email is trimmed for storage + matching", () => {
    const id = resolveBookingContactIdentity({ email: "  jane@acme.co  " });
    assert.equal(id.matchBy, "email");
    assert.equal(id.email, "jane@acme.co");
    assert.equal(id.storedEmail, "jane@acme.co");
  });
});
