// ============================================================================
// v1.13.0 — intake-form structural primitives (pure helpers)
// ============================================================================
//
// Five atomic primitives mirroring v1.11's landing-structure pattern,
// but for the intake-form surface (linear, no nesting):
//
//   - applyAddField(fields, newField, position?)
//   - applyMoveField(fields, fromIndex, toIndex)
//   - applyDeleteField(fields, index)
//   - applyUpdateField(fields, index, patch)
//   - deriveFieldPreview(field)
//
// Index-based addressing same as landing-structure (the reasoning is
// the same: handles duplicate types, atomic, agent re-reads between
// calls). Form fields ALSO have a stable `id` field, but we use index
// as the operation identity for symmetry with landing tools — and
// because the agent reading get_intake_structure shouldn't have to
// remember IDs across calls.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyAddField,
  applyMoveField,
  applyDeleteField,
  applyUpdateField,
  deriveFieldPreview,
} from "@/lib/page-blocks/intake-structure";
import type { IntakeQuestion } from "@/lib/blueprint/types";

const NAME: IntakeQuestion = { id: "fullName", type: "text", label: "Your name", required: true };
const EMAIL: IntakeQuestion = { id: "email", type: "email", label: "Email", required: true };
const PHONE: IntakeQuestion = { id: "phone", type: "phone", label: "Phone", required: true };
const PROPERTY: IntakeQuestion = {
  id: "property_type",
  type: "select",
  label: "Property type",
  required: true,
  options: ["Residential", "Commercial", "Multi-family"],
};
const ISSUE: IntakeQuestion = {
  id: "issue",
  type: "textarea",
  label: "What's going on with your HVAC system?",
  required: true,
  helper: "Tell us as much as you know.",
};

// ─── applyAddField ─────────────────────────────────────────────────────────

test("applyAddField appends to the end when position is omitted", () => {
  const result = applyAddField([NAME, EMAIL], PHONE);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.fields.map((f) => f.id), ["fullName", "email", "phone"]);
});

test("applyAddField inserts at the given position", () => {
  const result = applyAddField([NAME, EMAIL, ISSUE], PHONE, 2);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.fields.map((f) => f.id), ["fullName", "email", "phone", "issue"]);
});

test("applyAddField rejects duplicate id (server-side keys must be unique)", () => {
  // The intake POST handler reads field.id (a.k.a. .key in DB shape)
  // to bind answer→field; duplicates would silently drop one set
  // of answers. Reject upfront.
  const result = applyAddField([NAME, EMAIL], { ...EMAIL, label: "Confirm email" });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.errors.some((e) => /duplicate.*id|already exists/i.test(e)));
});

test("applyAddField rejects out-of-range position", () => {
  const r1 = applyAddField([NAME, EMAIL], PHONE, -1);
  assert.equal(r1.ok, false);
  const r2 = applyAddField([NAME, EMAIL], PHONE, 3);
  // position == fields.length means "append" — that should succeed.
  // 3 with length 2 is too far → reject.
  assert.equal(r2.ok, false);
});

test("applyAddField allows position == fields.length (append explicitly)", () => {
  const result = applyAddField([NAME, EMAIL], PHONE, 2);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.fields[2].id, "phone");
});

test("applyAddField does not mutate input array", () => {
  const fields = [NAME, EMAIL];
  const before = [...fields];
  applyAddField(fields, PHONE);
  assert.deepEqual(fields, before);
});

// ─── applyMoveField ────────────────────────────────────────────────────────

test("applyMoveField moves a field forward (splice semantics)", () => {
  const result = applyMoveField([NAME, EMAIL, PHONE, PROPERTY, ISSUE], 0, 3);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.fields.map((f) => f.id), ["email", "phone", "property_type", "fullName", "issue"]);
});

test("applyMoveField moves a field backward", () => {
  const result = applyMoveField([NAME, EMAIL, PHONE, ISSUE], 3, 0);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.fields.map((f) => f.id), ["issue", "fullName", "email", "phone"]);
});

test("applyMoveField is a no-op when from == to", () => {
  const result = applyMoveField([NAME, EMAIL], 0, 0);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.fields.map((f) => f.id), ["fullName", "email"]);
});

test("applyMoveField rejects out-of-range indices", () => {
  const fields = [NAME, EMAIL];
  assert.equal(applyMoveField(fields, -1, 0).ok, false);
  assert.equal(applyMoveField(fields, 0, -1).ok, false);
  assert.equal(applyMoveField(fields, 2, 0).ok, false);
  assert.equal(applyMoveField(fields, 0, 2).ok, false);
});

// ─── applyDeleteField ──────────────────────────────────────────────────────

test("applyDeleteField removes the field at the index", () => {
  const result = applyDeleteField([NAME, EMAIL, PHONE], 1);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.removed.id, "email");
  assert.deepEqual(result.fields.map((f) => f.id), ["fullName", "phone"]);
});

test("applyDeleteField refuses to leave 0 fields", () => {
  // Submitting a public intake form that has no fields makes no sense;
  // the operator deleting the last field is almost certainly a mistake.
  // Mirror landing-structure's "minimum 1" rule.
  const result = applyDeleteField([NAME], 0);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.errors.some((e) => /minimum|leave|empty/i.test(e)));
});

test("applyDeleteField rejects out-of-range index", () => {
  const fields = [NAME, EMAIL];
  assert.equal(applyDeleteField(fields, -1).ok, false);
  assert.equal(applyDeleteField(fields, 2).ok, false);
});

// ─── applyUpdateField ──────────────────────────────────────────────────────

test("applyUpdateField patches a single field by index", () => {
  const result = applyUpdateField(
    [NAME, EMAIL, PHONE],
    1,
    { label: "Best email to reach you", required: true },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.fields[1].label, "Best email to reach you");
  assert.equal(result.fields[1].required, true);
  // Other fields untouched.
  assert.equal(result.fields[0].id, "fullName");
  assert.equal(result.fields[2].id, "phone");
});

test("applyUpdateField allows changing the type and options together (e.g. text → select)", () => {
  const result = applyUpdateField(
    [{ id: "preferred_window", type: "text", label: "Preferred window" }, EMAIL],
    0,
    {
      type: "select",
      options: ["Morning", "Afternoon", "Evening"],
    },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.fields[0].type, "select");
  assert.deepEqual(result.fields[0].options, ["Morning", "Afternoon", "Evening"]);
});

test("applyUpdateField rejects an id-change to a colliding id", () => {
  // If the operator tries to rename email → fullName (when fullName
  // already exists), reject. ID is the binding key.
  const result = applyUpdateField([NAME, EMAIL], 1, { id: "fullName" });
  assert.equal(result.ok, false);
});

test("applyUpdateField allows id change to a fresh value", () => {
  const result = applyUpdateField([NAME, EMAIL], 1, { id: "primary_email" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.fields[1].id, "primary_email");
});

test("applyUpdateField rejects out-of-range index", () => {
  const fields = [NAME, EMAIL];
  assert.equal(applyUpdateField(fields, -1, { label: "X" }).ok, false);
  assert.equal(applyUpdateField(fields, 2, { label: "X" }).ok, false);
});

test("applyUpdateField rejects empty patch (nothing to do)", () => {
  const result = applyUpdateField([NAME, EMAIL], 0, {});
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.errors.some((e) => /empty|no.*update|patch/i.test(e)));
});

// ─── deriveFieldPreview ────────────────────────────────────────────────────

test("deriveFieldPreview shows label + type + required marker", () => {
  const r = deriveFieldPreview(EMAIL);
  assert.match(r, /Email/);
  assert.match(r, /email/i);
  assert.match(r, /required|\*/i);
});

test("deriveFieldPreview marks optional fields as optional (not required)", () => {
  const optional: IntakeQuestion = { id: "notes", type: "textarea", label: "Notes" };
  const r = deriveFieldPreview(optional);
  assert.ok(!/required/i.test(r), `expected no 'required' marker, got: ${r}`);
});

test("deriveFieldPreview shows option count for select fields", () => {
  const r = deriveFieldPreview(PROPERTY);
  assert.match(r, /3.*option/i);
});

test("deriveFieldPreview truncates long labels", () => {
  const long: IntakeQuestion = {
    id: "x",
    type: "text",
    label: "x".repeat(500),
  };
  const r = deriveFieldPreview(long);
  assert.ok(r.length <= 100);
});
