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
import { activities, bookings, users } from "@/db/schema";
import { assertWritable } from "@/lib/demo/server";
import { emitSeldonEvent } from "@/lib/events/bus";
import { trackEvent } from "@/lib/analytics/track";
import { requirePortalSessionForOrg } from "@/lib/portal/auth";

/**
 * v1.21.1 — Resolve the workspace owner's userId for activities.
 * activities.userId is NOT NULL; for customer-side actions (where
 * the actor is a contact, not a user) we anchor the activity row
 * to the workspace owner so it shows in their timeline.
 */
async function resolveOwnerUserId(orgId: string): Promise<string | null> {
  // v1.21.2 — match the existing booking-activity pattern (first
  // user in org). The role='owner' filter was too strict — some
  // workspace users have role='admin'/'member'/null depending on
  // how they were created, causing the activity-bridge insert to
  // silently skip on certain workspaces.
  const [owner] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.orgId, orgId))
    .limit(1);
  return owner?.id ?? null;
}

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

  // v1.21.1 — bridge to operator's contact activity feed.
  const ownerUserId = await resolveOwnerUserId(session.orgId);
  if (ownerUserId) {
    await db.insert(activities).values({
      orgId: session.orgId,
      userId: ownerUserId,
      contactId: session.contact.id,
      type: "booking_cancelled",
      subject: `Customer cancelled: ${updated.title}`,
      body: input.reason?.trim() || "(no reason given)",
      metadata: {
        source: "customer_portal",
        bookingId: updated.id,
      },
      completedAt: new Date(),
    });
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

export type RescheduleBookingResult =
  | { ok: true; bookingId: string; newStartsAt: string }
  | { ok: false; reason: string };

/**
 * v1.22.0 — TRUE self-service reschedule. Customer picks a real slot
 * from the workspace's availability via the slot-picker page; we
 * validate the slot is allowed (workday hours, no overlap, in-window),
 * atomic UPDATE bookings.startsAt + endsAt, write activity row.
 *
 * Slot validation re-uses the existing public-booking slot generator
 * (listPublicBookingSlotsAction). If the slot the customer clicked is
 * not in the current generated set, we reject — the slot may have been
 * taken by another booking between page-load and click.
 */
export async function rescheduleBookingAction(input: {
  orgSlug: string;
  bookingId: string;
  newStartsAtIso: string;
}): Promise<RescheduleBookingResult> {
  assertWritable();

  if (!input.orgSlug || !input.bookingId || !input.newStartsAtIso) {
    return { ok: false, reason: "missing_required_field" };
  }

  const session = await requirePortalSessionForOrg(input.orgSlug);

  // Look up the existing booking + verify ownership.
  const [existing] = await db
    .select({
      id: bookings.id,
      title: bookings.title,
      bookingSlug: bookings.bookingSlug,
      startsAt: bookings.startsAt,
      endsAt: bookings.endsAt,
      status: bookings.status,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.id, input.bookingId),
        eq(bookings.orgId, session.orgId),
        eq(bookings.contactId, session.contact.id),
      ),
    )
    .limit(1);
  if (!existing) {
    return { ok: false, reason: "booking_not_found" };
  }
  if (existing.status === "cancelled" || existing.status === "completed") {
    return { ok: false, reason: "booking_not_reschedulable" };
  }

  const newStartsAt = new Date(input.newStartsAtIso);
  if (Number.isNaN(newStartsAt.getTime())) {
    return { ok: false, reason: "invalid_datetime" };
  }
  if (newStartsAt.getTime() <= Date.now()) {
    return { ok: false, reason: "slot_in_the_past" };
  }

  // Validate the slot against the workspace's published availability.
  // Lazy-imported to keep this module's top-level imports tight.
  const { listPublicBookingSlotsAction } = await import(
    "@/lib/bookings/actions"
  );
  const dateKey = newStartsAt.toISOString().slice(0, 10);
  const slotResult = await listPublicBookingSlotsAction({
    orgSlug: input.orgSlug,
    bookingSlug: existing.bookingSlug,
    date: dateKey,
  });
  // listPublicBookingSlotsAction returns slots as toDateTimeLocalValue
  // (e.g. "2026-05-14T14:30"). Convert our newStartsAt to the same
  // format for comparison (workspace-local-ish; the picker UI we ship
  // uses the same format).
  const expected = `${newStartsAt.getFullYear()}-${String(newStartsAt.getMonth() + 1).padStart(2, "0")}-${String(newStartsAt.getDate()).padStart(2, "0")}T${String(newStartsAt.getHours()).padStart(2, "0")}:${String(newStartsAt.getMinutes()).padStart(2, "0")}`;
  if (!slotResult.slots.includes(expected)) {
    return { ok: false, reason: "slot_unavailable" };
  }

  // Compute new endsAt preserving the original duration.
  const originalDurationMs =
    new Date(existing.endsAt).getTime() -
    new Date(existing.startsAt).getTime();
  const newEndsAt = new Date(newStartsAt.getTime() + originalDurationMs);

  // Atomic update.
  const [updated] = await db
    .update(bookings)
    .set({
      startsAt: newStartsAt,
      endsAt: newEndsAt,
      // Reset status to scheduled if it was confirmed previously —
      // operator may want to re-confirm at the new time.
      status: existing.status === "confirmed" ? "scheduled" : existing.status,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(bookings.id, input.bookingId),
        eq(bookings.orgId, session.orgId),
        eq(bookings.contactId, session.contact.id),
      ),
    )
    .returning({ id: bookings.id });

  if (!updated) {
    return { ok: false, reason: "update_failed" };
  }

  // Activity row for operator timeline.
  const ownerUserId = await resolveOwnerUserId(session.orgId);
  if (ownerUserId) {
    await db.insert(activities).values({
      orgId: session.orgId,
      userId: ownerUserId,
      contactId: session.contact.id,
      type: "booking_rescheduled",
      subject: `Customer rescheduled: ${existing.title}`,
      body:
        `From ${new Date(existing.startsAt).toISOString()} ` +
        `to ${newStartsAt.toISOString()}`,
      metadata: {
        source: "customer_portal",
        bookingId: existing.id,
        oldStartsAt: existing.startsAt.toISOString(),
        newStartsAt: newStartsAt.toISOString(),
      },
      scheduledAt: newStartsAt,
    });
  }

  await emitSeldonEvent(
    "portal.booking_rescheduled",
    {
      bookingId: existing.id,
      oldStartsAt: existing.startsAt.toISOString(),
      newStartsAt: newStartsAt.toISOString(),
      contactId: session.contact.id,
    },
    { orgId: session.orgId },
  );

  trackEvent(
    "portal_booking_rescheduled",
    {},
    { orgId: session.orgId, contactId: session.contact.id },
  );

  return {
    ok: true,
    bookingId: existing.id,
    newStartsAt: newStartsAt.toISOString(),
  };
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

  // v1.21.1 — bridge to operator's contact activity feed.
  const ownerUserId = await resolveOwnerUserId(session.orgId);
  if (ownerUserId) {
    await db.insert(activities).values({
      orgId: session.orgId,
      userId: ownerUserId,
      contactId: session.contact.id,
      type: "reschedule_requested",
      subject: `Reschedule requested: ${booking.title}`,
      body: input.reason.trim() || "(no reason given)",
      metadata: {
        source: "customer_portal",
        bookingId: booking.id,
      },
      completedAt: new Date(),
    });
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
