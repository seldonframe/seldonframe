// Shared booking creation — used by BOTH the public booking page
// (submitPublicBookingAction) AND the agent's create_booking tool.
// Goal: agent-created bookings are structurally indistinguishable
// from customer-clicked bookings. Same row insert, same downstream
// events, same contact sync, same metadata shape (except for
// `source` which distinguishes the two paths for the operator's view).
//
// Spec: docs/superpowers/specs/2026-05-19-runcontext-architecture-design.md
// "Booking parity guarantee" section.
//
// Phase 3 Task 3.3 — RunContext architecture rollout.

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings as bookingsTable, contacts } from "@/db/schema";
import { emitSeldonEvent } from "@/lib/events/bus";

export type CreateBookingCustomerInput = {
  contactId: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  /** E.164 phone, or empty string if no phone known. */
  phone: string;
};

export type CreateBookingForCustomerInput = {
  orgId: string;
  customer: CreateBookingCustomerInput;
  /** ID of the appointment-type template row (status='template'). */
  appointmentTypeId: string;
  startsAt: Date;
  /** Optional duration override; otherwise pulled from appointment-type
   *  metadata.durationMinutes. */
  durationMinutes?: number;
  /** Optional status override. Public path uses "pending_payment" when
   *  the appointment-type carries a price > 0; agent path always uses
   *  the default "scheduled". */
  status?: "scheduled" | "pending_payment";
  /** Optional provider override; defaults to "manual" (matches the
   *  pre-Task-3.3 agent-path behavior). The public path may pass
   *  "google-calendar" or another resolved provider. */
  provider?: string;
  notes: string | null;
  /** Intake answers from the public booking form (or other
   *  form-driven flows). Stored on the booking row's metadata
   *  under `intakeResponses` for the operator's view. */
  intakeAnswers?: Record<string, unknown> | null;
  /** Identifies the source for the booking row's metadata. The operator
   *  can filter by source in /bookings to tell apart agent vs public. */
  source: "public_page" | "agent";
  /** When true, skip the contact upsert. The public action already
   *  upserts contacts upstream (with name/phone/customFields merge),
   *  so re-writing here would risk clobbering already-correct data. */
  skipContactRefresh?: boolean;
  /** Optional override for the booking row's `title` column. Defaults
   *  to template.title. The public action passes "Booked consultation"
   *  to preserve its historical behavior. */
  titleOverride?: string;
  /** Optional extra metadata keys merged onto the booking row's
   *  metadata. Useful for caller-specific fields (e.g. the public
   *  action's `price`) that don't belong in the helper's contract. */
  metadataExtra?: Record<string, unknown>;
};

export type CreateBookingForCustomerResult = {
  bookingId: string;
  startsAt: Date;
  endsAt: Date;
  appointmentTypeTitle: string | null;
  bookingSlug: string;
  durationMinutes: number;
};

export async function createBookingForCustomer(
  input: CreateBookingForCustomerInput,
): Promise<CreateBookingForCustomerResult> {
  // 1. Load the appointment-type template (status='template') to get
  //    duration + bookingSlug + title. The new booking inherits these
  //    so the public manage URL and operator /bookings list both link
  //    correctly.
  const [template] = await db
    .select({
      id: bookingsTable.id,
      bookingSlug: bookingsTable.bookingSlug,
      title: bookingsTable.title,
      metadata: bookingsTable.metadata,
    })
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.orgId, input.orgId),
        eq(bookingsTable.id, input.appointmentTypeId),
        eq(bookingsTable.status, "template"),
      ),
    )
    .limit(1);
  if (!template) {
    throw new Error(
      `createBookingForCustomer: appointment type ${input.appointmentTypeId} not found`,
    );
  }
  const meta = (template.metadata as Record<string, unknown> | null) ?? {};
  const durationMinutes =
    input.durationMinutes ??
    (typeof meta.durationMinutes === "number" && meta.durationMinutes > 0
      ? meta.durationMinutes
      : 30);
  const endsAt = new Date(
    input.startsAt.getTime() + durationMinutes * 60 * 1000,
  );

  // 2. Insert the booking row. The shape matches the pre-Task-3.3
  //    agent-path insert EXCEPT we now also include `intakeResponses`
  //    on metadata (to match the public path), and we accept the
  //    status/provider overrides the public path needs.
  const fullName = [input.customer.firstName, input.customer.lastName]
    .filter((part): part is string => Boolean(part))
    .join(" ") || null;

  const status = input.status ?? "scheduled";
  const provider = input.provider ?? "manual";

  const [created] = await db
    .insert(bookingsTable)
    .values({
      orgId: input.orgId,
      contactId: input.customer.contactId,
      title: input.titleOverride ?? template.title ?? "Booked consultation",
      bookingSlug: template.bookingSlug,
      fullName,
      email: input.customer.email,
      notes: input.notes,
      provider,
      status,
      startsAt: input.startsAt,
      endsAt,
      metadata: {
        // Caller-specific extras (e.g. the public action's `price`)
        // merged FIRST so the helper's canonical fields below take
        // precedence — callers can't accidentally clobber `source` /
        // `appointmentType` / `durationMinutes` / `intakeResponses`.
        ...(input.metadataExtra ?? {}),
        source: input.source,
        appointmentType: template.title,
        durationMinutes,
        // Public booking path stores form responses here so operators
        // see actionable lead context in /bookings. Agent path may
        // pass null (no form was involved) — empty object preserves
        // the shape so downstream consumers can rely on the key.
        intakeResponses: input.intakeAnswers ?? {},
      },
    })
    .returning({ id: bookingsTable.id });
  if (!created) {
    throw new Error("createBookingForCustomer: insert returned no row");
  }

  // 3. Refresh contact row's name/phone from the customer when the
  //    caller asked us to (agent path only — the public action has
  //    its own richer upsert that already ran upstream and would be
  //    clobbered by a naive overwrite here).
  if (!input.skipContactRefresh && input.customer.firstName) {
    try {
      const phoneUpdate = input.customer.phone || undefined;
      await db
        .update(contacts)
        .set({
          firstName: input.customer.firstName,
          lastName: input.customer.lastName,
          ...(phoneUpdate ? { phone: phoneUpdate } : {}),
          updatedAt: new Date(),
        })
        .where(eq(contacts.id, input.customer.contactId));
    } catch (err) {
      // Non-fatal — the booking still landed. Just log and proceed.
      console.warn(
        JSON.stringify({
          event: "createBookingForCustomer.contact_refresh_failed",
          orgId: input.orgId,
          contactId: input.customer.contactId,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }

  // 4. Emit booking.created event — the booking-confirmation outbound
  //    trigger picks this up and sends the customer's confirmation
  //    email/SMS. This is the SAME event the public submit path
  //    emits, so the messaging layer is caller-agnostic. Skipped when
  //    the booking is in pending_payment status (the Stripe webhook
  //    will emit booking.created once payment completes).
  if (status !== "pending_payment") {
    await emitSeldonEvent(
      "booking.created",
      {
        appointmentId: created.id,
        contactId: input.customer.contactId,
      },
      { orgId: input.orgId },
    );
  }

  return {
    bookingId: created.id,
    startsAt: input.startsAt,
    endsAt,
    appointmentTypeTitle: template.title,
    bookingSlug: template.bookingSlug,
    durationMinutes,
  };
}
