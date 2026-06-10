// ============================================================================
// v1.14.0 — booking-form structural primitives
// ============================================================================
//
// Five atomic primitives over Blueprint.booking.formFields. Mirrors
// the v1.13 intake-structure pattern but with one critical addition:
// STANDARD FIELDS (fullName, email) are unmovable + un-deletable +
// un-renamable.
//
// Why: the v1.4.2 fix (mergeBookingFormFields) made the server own
// fullName + email — the renderer requires them, the public POST
// handler binds answers to them by id. If an operator deletes
// fullName, the booking form breaks. Server enforces the contract
// by rejecting destructive ops on indices 0/1 in these primitives.
//
// Five tools:
//   - get_booking_structure(workspace_id)
//   - add_booking_field(workspace_id, field, position?)
//   - move_booking_field(workspace_id, from_index, to_index)
//   - delete_booking_field(workspace_id, index)
//   - update_booking_field(workspace_id, index, patch)
//
// Persistence touches BOTH Blueprint.booking.formFields AND
// bookings.metadata (where the public booking flow reads form
// definitions). After mutation, mergeBookingFormFields runs to
// re-prepend the standards (defense in depth — even if a primitive
// somehow let a mutation through, the merge ensures standards stay).

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, landingPages, organizations } from "@/db/schema";
import { loadBlueprintOrFallback } from "@/lib/blueprint/persist";
import { renderCalcomMonthV1 } from "@/lib/blueprint/renderers/calcom-month-v1";
import type { Blueprint, BookingFormField } from "@/lib/blueprint/types";
import { mergeBookingFormFields } from "./persist";

// ─── standard-field contract ───────────────────────────────────────────────

/** IDs the server owns. Cannot be added, deleted, moved, or
 *  re-purposed. mergeBookingFormFields re-prepends them on every
 *  persist as a defense-in-depth. */
export const STANDARD_BOOKING_FIELD_IDS: ReadonlySet<string> = new Set([
  "fullName",
  "email",
]);

const STANDARD_SLOT_COUNT = STANDARD_BOOKING_FIELD_IDS.size;

// ─── pure: applyAddBookingField ────────────────────────────────────────────

export type FieldOpResult =
  | { ok: true; fields: BookingFormField[] }
  | { ok: false; errors: string[] };

export function applyAddBookingField(
  fields: BookingFormField[],
  newField: BookingFormField,
  position?: number,
): FieldOpResult {
  const errors: string[] = [];

  if (!newField.id || typeof newField.id !== "string") {
    errors.push("new field requires a non-empty id");
  }
  if (!newField.label || typeof newField.label !== "string") {
    errors.push("new field requires a non-empty label");
  }
  if (STANDARD_BOOKING_FIELD_IDS.has(newField.id)) {
    errors.push(
      `cannot add field with reserved standard id "${newField.id}". Standards (fullName, email) are server-owned.`,
    );
  }
  if (fields.some((f) => f.id === newField.id)) {
    errors.push(`duplicate field id "${newField.id}" already exists in the form`);
  }
  // Position bounds: [STANDARD_SLOT_COUNT, effectiveLen]. Inserting at 0 or 1
  // would visually displace the standards — refuse. A freshly-seeded booking
  // can have an EMPTY formFields array (the standards are virtual — the
  // renderer + persistAndRender re-prepend them on persist), so the effective
  // length is at least STANDARD_SLOT_COUNT. Without this, the very first custom
  // field could never be added: the range would compute to an empty [2, 0].
  const effectiveLen = Math.max(fields.length, STANDARD_SLOT_COUNT);
  const pos = position ?? effectiveLen;
  if (!Number.isInteger(pos) || pos < STANDARD_SLOT_COUNT || pos > effectiveLen) {
    errors.push(
      `position ${pos} out of range [${STANDARD_SLOT_COUNT}, ${effectiveLen}]. Indices 0/1 are reserved for the standard fullName + email fields.`,
    );
  }
  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    fields: [...fields.slice(0, pos), newField, ...fields.slice(pos)],
  };
}

// ─── pure: applyMoveBookingField ───────────────────────────────────────────

export function applyMoveBookingField(
  fields: BookingFormField[],
  fromIndex: number,
  toIndex: number,
): FieldOpResult {
  const errors: string[] = [];

  if (fields.length === 0) {
    errors.push("cannot move within an empty fields array");
    return { ok: false, errors };
  }
  if (!Number.isInteger(fromIndex) || fromIndex < 0 || fromIndex >= fields.length) {
    errors.push(`from_index ${fromIndex} out of range [0, ${fields.length - 1}]`);
  }
  if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= fields.length) {
    errors.push(`to_index ${toIndex} out of range [0, ${fields.length - 1}]`);
  }
  if (errors.length > 0) return { ok: false, errors };

  // Refuse to MOVE a standard.
  if (fromIndex < STANDARD_SLOT_COUNT) {
    errors.push(
      `cannot move standard field at index ${fromIndex} (${fields[fromIndex]?.id}). Standards are pinned at the top.`,
    );
  }
  // Refuse to displace standards by moving INTO their slots.
  if (toIndex < STANDARD_SLOT_COUNT) {
    errors.push(
      `cannot move into index ${toIndex} — that's a standard's slot. Minimum to_index is ${STANDARD_SLOT_COUNT}.`,
    );
  }
  if (errors.length > 0) return { ok: false, errors };

  if (fromIndex === toIndex) return { ok: true, fields: [...fields] };

  const next = [...fields];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return { ok: true, fields: next };
}

// ─── pure: applyDeleteBookingField ─────────────────────────────────────────

export type DeleteFieldResult =
  | { ok: true; fields: BookingFormField[]; removed: BookingFormField }
  | { ok: false; errors: string[] };

export function applyDeleteBookingField(
  fields: BookingFormField[],
  index: number,
): DeleteFieldResult {
  const errors: string[] = [];

  if (!Number.isInteger(index) || index < 0 || index >= fields.length) {
    errors.push(`index ${index} out of range [0, ${fields.length - 1}]`);
    return { ok: false, errors };
  }
  if (index < STANDARD_SLOT_COUNT) {
    errors.push(
      `cannot delete standard field at index ${index} (${fields[index]?.id}). Standards are server-owned.`,
    );
    return { ok: false, errors };
  }

  const next = [...fields];
  const [removed] = next.splice(index, 1);
  return { ok: true, fields: next, removed };
}

// ─── pure: applyUpdateBookingField ─────────────────────────────────────────

export type BookingFieldPatch = Partial<BookingFormField>;

export function applyUpdateBookingField(
  fields: BookingFormField[],
  index: number,
  patch: BookingFieldPatch,
): FieldOpResult {
  const errors: string[] = [];

  if (!Number.isInteger(index) || index < 0 || index >= fields.length) {
    errors.push(`index ${index} out of range [0, ${fields.length - 1}]`);
    return { ok: false, errors };
  }
  if (!patch || Object.keys(patch).length === 0) {
    errors.push("patch is empty — no update requested");
    return { ok: false, errors };
  }
  if (index < STANDARD_SLOT_COUNT) {
    errors.push(
      `cannot patch standard field at index ${index} (${fields[index]?.id}). Standards are server-owned (label / type / required are fixed).`,
    );
    return { ok: false, errors };
  }
  if (patch.id && STANDARD_BOOKING_FIELD_IDS.has(patch.id)) {
    errors.push(
      `cannot rename a field to reserved standard id "${patch.id}".`,
    );
    return { ok: false, errors };
  }
  if (patch.id && patch.id !== fields[index].id) {
    if (fields.some((f, i) => i !== index && f.id === patch.id)) {
      errors.push(`new id "${patch.id}" already used by another field`);
      return { ok: false, errors };
    }
  }

  const next = fields.map((f, i) =>
    i === index ? ({ ...f, ...patch } as BookingFormField) : f,
  );
  return { ok: true, fields: next };
}

// ─── pure: deriveBookingFieldPreview ───────────────────────────────────────

const PREVIEW_MAX = 80;

function truncate(s: string, max = PREVIEW_MAX): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

export function deriveBookingFieldPreview(field: BookingFormField): string {
  const isStandard = STANDARD_BOOKING_FIELD_IDS.has(field.id);
  const required = field.required ? " *required" : "";
  const optionsHint =
    field.type === "select" ? ` (${(field.options ?? []).length} options)` : "";
  const standardMarker = isStandard ? " [standard, locked]" : "";
  return truncate(
    `${field.label} — ${field.type}${optionsHint}${required}${standardMarker}`,
  );
}

// ─── DB-loading wrappers ───────────────────────────────────────────────────

export interface BookingFieldSummary {
  index: number;
  id: string;
  type: string;
  label: string;
  required: boolean;
  is_standard: boolean;
  preview: string;
}

export interface BookingStructureResult {
  ok: true;
  workspace_id: string;
  slug: string | null;
  public_url: string | null;
  booking: {
    title: string;
    description?: string;
    duration_minutes: number;
  };
  fields: BookingFieldSummary[];
}

export interface BookingStructureError {
  ok: false;
  error: string;
  validation_errors: string[];
}

export async function getBookingStructureForWorkspace(
  workspaceId: string,
): Promise<BookingStructureResult | BookingStructureError> {
  const loaded = await loadBookingForMutation(workspaceId);
  if (!loaded.ok) return loaded;

  const baseDomain =
    process.env.WORKSPACE_BASE_DOMAIN?.trim() || "app.seldonframe.com";
  const bookingUrl = loaded.slug ? `https://${loaded.slug}.${baseDomain}/book` : null;

  const fields = (loaded.bookingFields ?? []).map((field, index) => ({
    index,
    id: field.id,
    type: field.type,
    label: field.label,
    required: Boolean(field.required),
    is_standard: STANDARD_BOOKING_FIELD_IDS.has(field.id),
    preview: deriveBookingFieldPreview(field),
  }));

  return {
    ok: true,
    workspace_id: workspaceId,
    slug: loaded.slug,
    public_url: bookingUrl,
    booking: {
      title: loaded.bookingTitle,
      description: loaded.bookingDescription,
      duration_minutes: loaded.bookingDurationMinutes,
    },
    fields,
  };
}

export type ApplyBookingFieldOpResult =
  | {
      ok: true;
      fields: BookingFieldSummary[];
      public_url: string | null;
    }
  | {
      ok: false;
      error: string;
      validation_errors: string[];
    };

export async function addBookingFieldForWorkspace(
  workspaceId: string,
  field: BookingFormField,
  position?: number,
): Promise<ApplyBookingFieldOpResult> {
  const loaded = await loadBookingForMutation(workspaceId);
  if (!loaded.ok) return loaded;
  const result = applyAddBookingField(loaded.bookingFields, field, position);
  if (!result.ok) {
    return { ok: false, error: "field_invalid", validation_errors: result.errors };
  }
  return await persistAndRender(loaded, result.fields);
}

export async function moveBookingFieldForWorkspace(
  workspaceId: string,
  fromIndex: number,
  toIndex: number,
): Promise<ApplyBookingFieldOpResult> {
  const loaded = await loadBookingForMutation(workspaceId);
  if (!loaded.ok) return loaded;
  const result = applyMoveBookingField(loaded.bookingFields, fromIndex, toIndex);
  if (!result.ok) {
    return { ok: false, error: "move_invalid", validation_errors: result.errors };
  }
  return await persistAndRender(loaded, result.fields);
}

export async function deleteBookingFieldForWorkspace(
  workspaceId: string,
  index: number,
): Promise<ApplyBookingFieldOpResult> {
  const loaded = await loadBookingForMutation(workspaceId);
  if (!loaded.ok) return loaded;
  const result = applyDeleteBookingField(loaded.bookingFields, index);
  if (!result.ok) {
    return { ok: false, error: "delete_invalid", validation_errors: result.errors };
  }
  return await persistAndRender(loaded, result.fields);
}

export async function updateBookingFieldForWorkspace(
  workspaceId: string,
  index: number,
  patch: BookingFieldPatch,
): Promise<ApplyBookingFieldOpResult> {
  const loaded = await loadBookingForMutation(workspaceId);
  if (!loaded.ok) return loaded;
  const result = applyUpdateBookingField(loaded.bookingFields, index, patch);
  if (!result.ok) {
    return { ok: false, error: "update_invalid", validation_errors: result.errors };
  }
  return await persistAndRender(loaded, result.fields);
}

// ─── shared loaders / persisters ───────────────────────────────────────────

interface LoadedBooking {
  ok: true;
  workspaceId: string;
  landingPageId: string;
  blueprint: Blueprint;
  bookingFields: BookingFormField[];
  bookingTitle: string;
  bookingDescription?: string;
  bookingDurationMinutes: number;
  slug: string | null;
}

interface LoadError {
  ok: false;
  error: string;
  validation_errors: string[];
}

async function loadBookingForMutation(
  workspaceId: string,
): Promise<LoadedBooking | LoadError> {
  const [orgRow] = await db
    .select({ slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, workspaceId))
    .limit(1);
  if (!orgRow) {
    return { ok: false, error: "workspace_not_found", validation_errors: [] };
  }

  const [landing] = await db
    .select({
      id: landingPages.id,
      title: landingPages.title,
      settings: landingPages.settings,
      blueprintJson: landingPages.blueprintJson,
    })
    .from(landingPages)
    .where(
      and(
        eq(landingPages.orgId, workspaceId),
        eq(landingPages.slug, "home"),
      ),
    )
    .limit(1);
  if (!landing) {
    return {
      ok: false,
      error: "workspace_landing_missing",
      validation_errors: [
        "no landing_pages row with slug='home'. Run create_workspace_v2 first.",
      ],
    };
  }

  const settings = (landing.settings ?? {}) as Record<string, unknown>;
  const industry =
    typeof settings.industry === "string" ? (settings.industry as string) : null;
  const blueprint = loadBlueprintOrFallback(
    { blueprintJson: landing.blueprintJson },
    landing.title,
    industry,
  );

  const booking = blueprint.booking;
  if (!booking) {
    return {
      ok: false,
      error: "workspace_booking_missing",
      validation_errors: [
        "blueprint has no booking event-type. Use persist_block(booking) or create_workspace_v2 to bootstrap one.",
      ],
    };
  }

  return {
    ok: true,
    workspaceId,
    landingPageId: landing.id,
    blueprint,
    bookingFields: booking.formFields ?? [],
    bookingTitle: booking.eventType?.title ?? "Booking",
    bookingDescription: booking.eventType?.description,
    bookingDurationMinutes: booking.eventType?.durationMinutes ?? 30,
    slug: orgRow.slug ?? null,
  };
}

async function persistAndRender(
  loaded: LoadedBooking,
  nextFields: BookingFormField[],
): Promise<ApplyBookingFieldOpResult> {
  // Defense in depth: re-merge through mergeBookingFormFields. Our
  // primitives already enforce the standards contract, but if an
  // upstream change introduces a bug, the merge is the final guard
  // that fullName + email always make it to persistence.
  const merged = mergeBookingFormFields(
    nextFields.filter((f) => !STANDARD_BOOKING_FIELD_IDS.has(f.id)),
  );
  // mergeBookingFormFields prepends standards from its hardcoded
  // STANDARD_FIELDS — that's the canonical shape. Any non-standard
  // fields the operator had keep their order.
  // BUT we also want to preserve the operator's order if standards
  // were intermixed in nextFields. Since our primitives forbid moving
  // standards, this should be a no-op in practice.

  const nextBooking = {
    ...(loaded.blueprint.booking ?? {}),
    formFields: merged,
  } as Blueprint["booking"];
  const nextBlueprint: Blueprint = {
    ...loaded.blueprint,
    booking: nextBooking,
  };

  // Re-render booking template HTML/CSS via calcom-month-v1.
  const { html, css } = renderCalcomMonthV1(nextBlueprint);

  // Persist blueprint update on landing_pages.
  await db
    .update(landingPages)
    .set({
      blueprintJson: nextBlueprint as unknown as Record<string, unknown>,
      updatedAt: new Date(),
    })
    .where(eq(landingPages.id, loaded.landingPageId));

  // Persist bookings template row(s). The public booking flow
  // resolvePublicBookingContext + listPublicBookingSlotsAction read
  // from bookings.metadata; we update contentHtml/contentCss with
  // the freshly-rendered output.
  const templateRows = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(and(eq(bookings.orgId, loaded.workspaceId), eq(bookings.status, "template")));

  for (const row of templateRows) {
    await db
      .update(bookings)
      .set({
        contentHtml: html,
        contentCss: css,
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, row.id));
  }

  const baseDomain =
    process.env.WORKSPACE_BASE_DOMAIN?.trim() || "app.seldonframe.com";
  const publicUrl = loaded.slug ? `https://${loaded.slug}.${baseDomain}/book` : null;

  const summaries = merged.map((field, index) => ({
    index,
    id: field.id,
    type: field.type,
    label: field.label,
    required: Boolean(field.required),
    is_standard: STANDARD_BOOKING_FIELD_IDS.has(field.id),
    preview: deriveBookingFieldPreview(field),
  }));

  return { ok: true, fields: summaries, public_url: publicUrl };
}
