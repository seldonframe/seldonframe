// ============================================================================
// v1.21.0 — customer-portal appointment self-service actions
// ============================================================================
//
// Two server actions the homeowner / patient / client can trigger
// from /customer/<slug>/appointments:
//
//   - cancelBookingAction({ orgSlug, bookingId, reason? })
//     Atomic update bookings.status='cancelled', emits a
//     portal.booking_cancelled event so the operator's CRM gets the
//     signal (the deal moves, an activity logs, etc.). Best-effort
//     notification email queued in v1.21.1.
//
//   - requestRescheduleAction({ orgSlug, bookingId, reason })
//     Doesn't actually change the booking. Logs a
//     portal.reschedule_requested event so the operator knows the
//     customer wants to reschedule. The operator follows up via the
//     CRM (call, message, or proposes a new time). v1.22 will add
//     true self-service reschedule (customer picks a new slot from
//     the workspace's availability).
//
// Both actions enforce the customer-session scope: the booking must
// belong to (a) the workspace tied to orgSlug AND (b) the contact_id
// that signed the portal session. A customer can't cancel another
// customer's booking even if they guess the booking_id.

"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { assertWritable } from "@/lib/demo/server";
import { emitSeldonEvent } from "@/lib/events/bus";
import { trackEvent } from "@/lib/analytics/track";
import { requirePortalSessionForOrg } from "@/lib/portal/auth";

export type CancelBookingResult =
  | { ok: true; bookingId: string }
  | { ok: false; reason: string };

export async function cancelBookingAction(input: {
  orgSlug: string;
  bookingId: string;
  reason?: string;
}): Promise<CancelBookingResult> {
  assertWritable();

  if (!input.orgSlug || !input.bookingId) {
    return { ok: false, reason: "missing_required_field" };
  }

  const session = await requirePortalSessionForOrg(input.orgSlug);

  // Atomic, scoped cancel: the WHERE clause enforces both org and
  // contact ownership. If the booking belongs to a different contact
  // OR a different org, returning() yields no row and we surface
  // not_found (without leaking why).
  const [updated] = await db
    .update(bookings)
    .set({
      status: "cancelled",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(bookings.id, input.bookingId),
        eq(bookings.orgId, session.orgId),
        eq(bookings.contactId, session.contact.id),
      ),
    )
    .returning({ id: bookings.id, title: bookings.title });

  if (!updated) {
    return { ok: false, reason: "booking_not_found" };
  }

  await emitSeldonEvent(
    "portal.booking_cancelled",
    {
      bookingId: updated.id,
      bookingTitle: updated.title,
      contactId: session.contact.id,
      reason: input.reason?.trim() || null,
    },
    { orgId: session.orgId },
  );

  trackEvent(
    "portal_booking_cancelled",
    { has_reason: Boolean(input.reason?.trim()) },
    { orgId: session.orgId, contactId: session.contact.id },
  );

  return { ok: true, bookingId: updated.id };
}

export type RequestRescheduleResult =
  | { ok: true; bookingId: string }
  | { ok: false; reason: string };

export async function requestRescheduleAction(input: {
  orgSlug: string;
  bookingId: string;
  reason: string;
}): Promise<RequestRescheduleResult> {
  assertWritable();

  if (!input.orgSlug || !input.bookingId) {
    return { ok: false, reason: "missing_required_field" };
  }

  const session = await requirePortalSessionForOrg(input.orgSlug);

  // Verify booking ownership (without mutating).
  const [booking] = await db
    .select({ id: bookings.id, title: bookings.title })
    .from(bookings)
    .where(
      and(
        eq(bookings.id, input.bookingId),
        eq(bookings.orgId, session.orgId),
        eq(bookings.contactId, session.contact.id),
      ),
    )
    .limit(1);

  if (!booking) {
    return { ok: false, reason: "booking_not_found" };
  }

  await emitSeldonEvent(
    "portal.reschedule_requested",
    {
      bookingId: booking.id,
      bookingTitle: booking.title,
      contactId: session.contact.id,
      reason: input.reason.trim() || "(no reason given)",
    },
    { orgId: session.orgId },
  );

  trackEvent(
    "portal_reschedule_requested",
    {},
    { orgId: session.orgId, contactId: session.contact.id },
  );

  return { ok: true, bookingId: booking.id };
}
