// ============================================================================
// v1.9.0 — booking form-fields contract
// ============================================================================
//
// Bug class this test exists to prevent: v1.4.2 — Cinder & Salt booking.
//
// Symptom (pre-v1.4.2): IDE agent generates booking.form_fields with
// only operator-specific extras (party_size, occasion, allergies for a
// restaurant; dog_name, breed for a groomer; etc.). v1's bootstrap
// had populated formFields with the standard fullName + email; v2's
// persist path replaced formFields wholesale with the LLM's extras,
// wiping name+email. Result: every v2 booking page shipped without
// name/email inputs and submitPublicBookingAction rejected every
// submit with `missing_required_field fullName_present:false`.
//
// Contract enforced here: mergeBookingFormFields ALWAYS prepends the
// standard fullName + email fields, regardless of what the LLM
// supplied. LLM-provided fields with conflicting ids are dropped
// (server takes precedence). Operator-specific extras pass through
// in their original order.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeBookingFormFields } from "@/lib/page-blocks/persist";

test("mergeBookingFormFields prepends fullName + email when LLM provided no fields", () => {
  const result = mergeBookingFormFields([]);
  assert.equal(result.length, 2);
  assert.equal(result[0].id, "fullName");
  assert.equal(result[0].type, "text");
  assert.equal(result[0].required, true);
  assert.equal(result[1].id, "email");
  assert.equal(result[1].type, "email");
  assert.equal(result[1].required, true);
});

test("mergeBookingFormFields prepends standard fields + appends LLM extras", () => {
  const result = mergeBookingFormFields([
    { id: "party_size", label: "Party size", type: "select", required: true, options: ["2", "4", "6", "8+"] },
    { id: "allergies", label: "Allergies", type: "textarea" },
  ]);
  assert.equal(result.length, 4);
  assert.equal(result[0].id, "fullName");
  assert.equal(result[1].id, "email");
  assert.equal(result[2].id, "party_size");
  assert.equal(result[3].id, "allergies");
});

test("mergeBookingFormFields dedupes when LLM redundantly includes fullName/email", () => {
  // The LLM occasionally re-includes the standard fields. The server
  // is the source of truth; LLM versions are dropped (the server-set
  // ids win because that's what submitPublicBookingAction expects).
  const result = mergeBookingFormFields([
    { id: "fullName", label: "Your full name (LLM version)", type: "text" },
    { id: "email", label: "Your email (LLM version)", type: "email" },
    { id: "dog_name", label: "Dog's name", type: "text", required: true },
  ]);
  assert.equal(result.length, 3);
  assert.equal(result[0].id, "fullName");
  // The server-set label wins, not the LLM's "Your full name (LLM version)".
  assert.equal(result[0].label, "Your name");
  assert.equal(result[1].id, "email");
  assert.equal(result[1].label, "Email");
  assert.equal(result[2].id, "dog_name");
});

test("mergeBookingFormFields preserves the order of LLM-provided extras", () => {
  // Ordering matters — operators see the form field order in the
  // calendar. The LLM picks a sensible order ("most likely to know"
  // first, "optional details" last). We must not reorder.
  const result = mergeBookingFormFields([
    { id: "service_address", label: "Where are you?", type: "text", required: true },
    { id: "preferred_window", label: "Preferred time window", type: "select", options: ["Morning", "Afternoon", "Evening"] },
    { id: "notes", label: "Anything we should know?", type: "textarea" },
  ]);
  assert.equal(result.length, 5);
  assert.equal(result[2].id, "service_address");
  assert.equal(result[3].id, "preferred_window");
  assert.equal(result[4].id, "notes");
});

test("mergeBookingFormFields fullName and email are always required=true", () => {
  // submitPublicBookingAction REQUIRES fullName + email. If we
  // accidentally set required=false (or let the LLM override),
  // bookings with empty values would slip through and crash on
  // downstream contact-creation.
  const result = mergeBookingFormFields([]);
  const fullName = result.find((f) => f.id === "fullName");
  const email = result.find((f) => f.id === "email");
  assert.ok(fullName);
  assert.ok(email);
  assert.equal(fullName.required, true);
  assert.equal(email.required, true);
});
