// Native calendar adapter (Task 2).
//
// A thin, dependency-injected wrapper that implements CalendarBackend over
// SeldonFrame's two existing booking actions:
//   - availability  → listPublicBookingSlotsAction
//   - booking create → submitPublicBookingAction
//
// The actions are INJECTED (not imported) so this adapter stays pure and
// unit-testable with no DB / network. The real wiring — passing the actual
// listPublicBookingSlotsAction / submitPublicBookingAction — happens in a
// later task. This keeps the native path flowing through the same interface
// the (later) Composio adapter implements.

import type {
  AvailabilityQuery,
  CalendarBackend,
  CreateEventInput,
  LabeledSlot,
} from "./calendar-backend";

export type NativeBackendDeps = {
  orgSlug: string;
  bookingSlug: string;
  listSlots: (a: {
    orgSlug: string;
    bookingSlug: string;
    date: string;
  }) => Promise<{ slots: string[]; durationMinutes: number; workspaceTimezone?: string }>;
  submitBooking: (a: {
    orgSlug: string;
    bookingSlug: string;
    fullName: string;
    email?: string;
    notes?: string;
    startsAt: string;
    intakeResponses?: Record<string, string>;
  }) => Promise<{ ok: boolean; bookingId?: string; error?: string }>;
};

/** Format a UTC ISO instant as a human label in the given IANA timezone,
 *  e.g. "Tue, Jul 1, 9:00 AM". Falls back to the raw ISO if the zone or the
 *  timestamp can't be formatted (never throws — a live call must not break). */
function formatSlotLabel(iso: string, timeZone: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(d);
  } catch {
    return iso;
  }
}

/** Build a native CalendarBackend over the two existing booking actions.
 *  The workspace identity (orgSlug/bookingSlug) and the actions are injected
 *  so callers (and tests) supply real or fake implementations. */
export function makeNativeCalendarBackend(deps: NativeBackendDeps): CalendarBackend {
  return {
    async findDayAvailability(q: AvailabilityQuery): Promise<{ slots: LabeledSlot[] }> {
      // durationMinutes is ignored for the native lookup — the booking template
      // already encodes duration; we only need the day's open slots.
      const result = await deps.listSlots({
        orgSlug: deps.orgSlug,
        bookingSlug: deps.bookingSlug,
        date: q.date,
      });
      const zone = result.workspaceTimezone ?? q.timezone;
      const slots: LabeledSlot[] = result.slots.map((iso) => ({
        iso,
        label: formatSlotLabel(iso, zone),
      }));
      return { slots };
    },

    async createEvent(
      input: CreateEventInput,
    ): Promise<{ ok: true; eventRef: string } | { ok: false; error: string }> {
      const res = await deps.submitBooking({
        orgSlug: deps.orgSlug,
        bookingSlug: deps.bookingSlug,
        fullName: input.attendee.name,
        email: input.attendee.email,
        notes: input.notes ?? input.title,
        startsAt: input.startIso,
        intakeResponses: input.attendee.phone ? { phone: input.attendee.phone } : undefined,
      });
      if (res.ok) {
        return { ok: true, eventRef: res.bookingId ?? "" };
      }
      return { ok: false, error: res.error ?? "native_booking_failed" };
    },
  };
}
