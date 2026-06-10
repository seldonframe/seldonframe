// ============================================================================
// v1.14.0 — booking-form structural primitives (pure helpers)
// ============================================================================
//
// Mirrors v1.13's intake-structure pattern but for the booking form.
// The booking form has TWO standard fields (fullName, email) that the
// renderer + public POST handler require — they're prepended by
// mergeBookingFormFields on every persist (v1.4.2 fix). These atomic
// primitives must REFUSE to delete or mutate the standards by design,
// so an operator can't accidentally break the booking flow.
//
// Five primitives:
//   - applyAddBookingField(fields, newField, position?)
//   - applyMoveBookingField(fields, fromIndex, toIndex)
//   - applyDeleteBookingField(fields, index)
//   - applyUpdateBookingField(fields, index, patch)
//   - deriveBookingFieldPreview(field)
//
// STANDARD_FIELD_IDS = { "fullName", "email" } are unmovable + un-
// deletable + un-renamable. ID-changes and patches that target these
// IDs are rejected. Move ops where from/to references a standard
// field are rejected.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyAddBookingField,
  applyMoveBookingField,
  applyDeleteBookingField,
  applyUpdateBookingField,
  deriveBookingFieldPreview,
  STANDARD_BOOKING_FIELD_IDS,
} from "@/lib/page-blocks/booking-structure";
import type { BookingFormField } from "@/lib/blueprint/types";

const FULL_NAME: BookingFormField = { id: "fullName", label: "Your name", type: "text", required: true };
const EMAIL: BookingFormField = { id: "email", label: "Email", type: "email", required: true };
const PHONE: BookingFormField = { id: "phone", label: "Phone", type: "phone", required: true };
const ADDRESS: BookingFormField = { id: "service_address", label: "Service address", type: "text", required: true };
const EQUIPMENT: BookingFormField = {
  id: "equipment",
  label: "Equipment",
  type: "select",
  required: true,
  options: ["Furnace", "Heat pump", "Water heater", "AC unit"],
};
const ISSUE: BookingFormField = { id: "issue", label: "What's going on?", type: "textarea" };

// ─── STANDARD_BOOKING_FIELD_IDS sanity ─────────────────────────────────────

test("STANDARD_BOOKING_FIELD_IDS contains exactly fullName + email", () => {
  // Pin this — adding/removing a "standard" silently breaks
  // submitPublicBookingAction's binding contract.
  assert.ok(STANDARD_BOOKING_FIELD_IDS.has("fullName"));
  assert.ok(STANDARD_BOOKING_FIELD_IDS.has("email"));
  assert.equal(STANDARD_BOOKING_FIELD_IDS.size, 2);
});

// ─── applyAddBookingField ──────────────────────────────────────────────────

test("applyAddBookingField appends after the standards by default", () => {
  const result = applyAddBookingField([FULL_NAME, EMAIL, PHONE], ADDRESS);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.fields.map((f) => f.id),
    ["fullName", "email", "phone", "service_address"],
  );
});

test("applyAddBookingField inserts at the given position", () => {
  const result = applyAddBookingField([FULL_NAME, EMAIL, PHONE, ISSUE], ADDRESS, 3);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.fields.map((f) => f.id),
    ["fullName", "email", "phone", "service_address", "issue"],
  );
});

test("applyAddBookingField rejects insert at position 0 or 1 (standards' slots)", () => {
  // The standards live at indices 0 and 1 by contract. Inserting
  // BEFORE them would visually shift the standards down — confusing
  // and breaks the renderer's assumption that name/email come first.
  const r1 = applyAddBookingField([FULL_NAME, EMAIL], PHONE, 0);
  assert.equal(r1.ok, false);
  if (!r1.ok) {
    assert.ok(r1.errors.some((e) => /standard|reserved|position 0|position 1/i.test(e)));
  }
  const r2 = applyAddBookingField([FULL_NAME, EMAIL], PHONE, 1);
  assert.equal(r2.ok, false);
});

test("applyAddBookingField rejects adding a field with a standard id", () => {
  const r1 = applyAddBookingField([FULL_NAME, EMAIL], { ...PHONE, id: "fullName" });
  assert.equal(r1.ok, false);
  const r2 = applyAddBookingField([FULL_NAME, EMAIL], { ...PHONE, id: "email" });
  assert.equal(r2.ok, false);
});

test("applyAddBookingField rejects duplicate non-standard id", () => {
  const result = applyAddBookingField(
    [FULL_NAME, EMAIL, PHONE],
    { ...ADDRESS, id: "phone" },
  );
  assert.equal(result.ok, false);
});

test("applyAddBookingField adds the FIRST custom field to an empty (freshly-seeded) form", () => {
  // 2026-06-10 regression — a freshly-seeded booking has an empty formFields
  // array (the standards are virtual until the first persist re-prepends
  // them). The range was [STANDARD_SLOT_COUNT, fields.length] = [2, 0] — an
  // empty range — so the very first add_booking_field always 422'd. The fix
  // uses effectiveLen = max(fields.length, STANDARD_SLOT_COUNT).
  const result = applyAddBookingField([], EQUIPMENT, 2);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.fields.map((f) => f.id), ["equipment"]);
});

test("applyAddBookingField appends the first custom field on an empty form when position is omitted", () => {
  const result = applyAddBookingField([], EQUIPMENT);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.fields.map((f) => f.id), ["equipment"]);
});

// ─── applyMoveBookingField ─────────────────────────────────────────────────

test("applyMoveBookingField moves an extra forward + backward", () => {
  // [fullName, email, phone, address, equipment, issue]
  // Move equipment (index 4) to index 2 — but indices 0/1 are standards
  // and shouldn't be displaced. Fix: minimum to_index for any op is 2.
  const fields = [FULL_NAME, EMAIL, PHONE, ADDRESS, EQUIPMENT, ISSUE];
  const result = applyMoveBookingField(fields, 4, 2);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.fields.map((f) => f.id),
    ["fullName", "email", "equipment", "phone", "service_address", "issue"],
  );
});

test("applyMoveBookingField refuses to move standards", () => {
  const fields = [FULL_NAME, EMAIL, PHONE];
  const r1 = applyMoveBookingField(fields, 0, 2);
  assert.equal(r1.ok, false);
  if (!r1.ok) {
    assert.ok(r1.errors.some((e) => /standard|fullName/i.test(e)));
  }
  const r2 = applyMoveBookingField(fields, 1, 2);
  assert.equal(r2.ok, false);
});

test("applyMoveBookingField refuses to move INTO a standard's slot", () => {
  const fields = [FULL_NAME, EMAIL, PHONE, ADDRESS];
  const r1 = applyMoveBookingField(fields, 2, 0);
  assert.equal(r1.ok, false);
  const r2 = applyMoveBookingField(fields, 3, 1);
  assert.equal(r2.ok, false);
});

test("applyMoveBookingField from == to is a no-op", () => {
  const fields = [FULL_NAME, EMAIL, PHONE];
  const result = applyMoveBookingField(fields, 2, 2);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.fields.map((f) => f.id), ["fullName", "email", "phone"]);
});

// ─── applyDeleteBookingField ───────────────────────────────────────────────

test("applyDeleteBookingField removes an extra at the index", () => {
  const result = applyDeleteBookingField([FULL_NAME, EMAIL, PHONE, ADDRESS], 2);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.removed.id, "phone");
  assert.deepEqual(result.fields.map((f) => f.id), ["fullName", "email", "service_address"]);
});

test("applyDeleteBookingField refuses to delete standards", () => {
  const fields = [FULL_NAME, EMAIL, PHONE];
  const r1 = applyDeleteBookingField(fields, 0);
  assert.equal(r1.ok, false);
  if (!r1.ok) {
    assert.ok(r1.errors.some((e) => /standard|fullName/i.test(e)));
  }
  const r2 = applyDeleteBookingField(fields, 1);
  assert.equal(r2.ok, false);
});

test("applyDeleteBookingField allows deleting all extras (standards remain)", () => {
  // Deleting down to just standards is fine — the booking form still
  // has name + email and remains usable. Different from intake which
  // requires ≥1 field; for booking the floor is "the 2 standards."
  const result = applyDeleteBookingField([FULL_NAME, EMAIL, PHONE], 2);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.fields.length, 2);
});

// ─── applyUpdateBookingField ───────────────────────────────────────────────

test("applyUpdateBookingField patches an extra by index", () => {
  const result = applyUpdateBookingField(
    [FULL_NAME, EMAIL, PHONE],
    2,
    { label: "Mobile number", required: false },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.fields[2].label, "Mobile number");
  assert.equal(result.fields[2].required, false);
});

test("applyUpdateBookingField rejects patches targeting standards (label / type / required all locked)", () => {
  const fields = [FULL_NAME, EMAIL, PHONE];
  const r1 = applyUpdateBookingField(fields, 0, { label: "Name (please)" });
  assert.equal(r1.ok, false);
  const r2 = applyUpdateBookingField(fields, 1, { required: false });
  assert.equal(r2.ok, false);
});

test("applyUpdateBookingField rejects renaming an extra to a standard id", () => {
  const result = applyUpdateBookingField(
    [FULL_NAME, EMAIL, PHONE],
    2,
    { id: "fullName" },
  );
  assert.equal(result.ok, false);
});

test("applyUpdateBookingField rejects empty patch", () => {
  const result = applyUpdateBookingField([FULL_NAME, EMAIL, PHONE], 2, {});
  assert.equal(result.ok, false);
});

// ─── deriveBookingFieldPreview ─────────────────────────────────────────────

test("deriveBookingFieldPreview marks standard fields as 'standard, locked'", () => {
  const r = deriveBookingFieldPreview(FULL_NAME);
  assert.match(r, /standard|locked|required/i);
});

test("deriveBookingFieldPreview shows option count for select", () => {
  const r = deriveBookingFieldPreview(EQUIPMENT);
  assert.match(r, /4.*option/i);
});

test("deriveBookingFieldPreview marks optional extras as optional (no required marker)", () => {
  const r = deriveBookingFieldPreview(ISSUE);
  // ISSUE has no required:true — the preview shouldn't claim it's
  // required.
  assert.ok(!/^.*required(?!\s+option).*$/i.test(r) || /optional/i.test(r), `expected non-required: ${r}`);
});
