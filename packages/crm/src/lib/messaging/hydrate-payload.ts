// 2026-05-18 — Hydrate sparse event payloads with the data the
// messaging layer needs (plan v2, slice 6 — also retroactively fixing
// slice 2's blank {{bookingTitle}} placeholders).
//
// Why this exists: the booking.* events emit only `appointmentId` +
// `contactId` to keep the event payload small. The messaging layer
// needs the full booking row (title, startsAt, endsAt, bookingSlug,
// metadata) to:
//   - Build accurate {{bookingTitle}} / {{bookingStartsAtLocal}}
//     render-vars at compose time.
//   - Compute fireAt = startsAt - delayMinutes for the 24h reminder
//     scheduler.
//   - Match cancellation payloads against scheduled rows by
//     payload.bookingId.
//
// We do this in a dedicated helper (rather than expanding every
// emitSeldonEvent call) so the messaging layer is self-sufficient and
// existing listeners that read appointmentId/contactId-only payloads
// keep working unchanged.

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import type { DispatchEventPayload } from "./render-vars";

/**
 * Augment a booking.* event payload with the full booking row data
 * the messaging layer references. No-op for non-booking events.
 *
 * Idempotent: if the payload already carries `bookingId` + `startsAt`
 * (e.g. because a richer emit site pre-filled), we skip the DB hit.
 *
 * Falls back to returning the original payload on errors so a missing
 * row doesn't break the dispatch loop — the audit row will just show
 * empty {{bookingTitle}} etc., which surfaces the data gap.
 */
export async function hydrateMessagingPayload(
  orgId: string,
  eventType: string,
  payload: DispatchEventPayload,
): Promise<DispatchEventPayload> {
  if (!eventType.startsWith("booking.")) return payload;

  // If already hydrated, skip.
  if (typeof payload.bookingId === "string" && payload.startsAt) {
    return payload;
  }

  const bookingId =
    typeof payload.bookingId === "string"
      ? payload.bookingId
      : typeof payload.appointmentId === "string"
        ? payload.appointmentId
        : null;
  if (!bookingId) return payload;

  try {
    const [row] = await db
      .select({
        id: bookings.id,
        title: bookings.title,
        startsAt: bookings.startsAt,
        endsAt: bookings.endsAt,
        bookingSlug: bookings.bookingSlug,
        status: bookings.status,
      })
      .from(bookings)
      .where(and(eq(bookings.id, bookingId), eq(bookings.orgId, orgId)))
      .limit(1);
    if (!row) return payload;

    return {
      ...payload,
      bookingId: row.id,
      title: row.title,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      bookingSlug: row.bookingSlug,
      status: row.status,
    };
  } catch {
    return payload;
  }
}
