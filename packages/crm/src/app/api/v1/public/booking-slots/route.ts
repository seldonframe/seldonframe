// v1.23.0 — public GET endpoint that returns available slots for a date.
//
// Used by the customer-portal reschedule calendar (and could be used
// by any other client-side calendar that needs slot data without
// re-running the full /book renderer). Wraps the existing
// listPublicBookingSlotsAction.
//
// Auth: anonymous. The action enforces its own org/slug resolution
// and the slot enumerator is purely a function of the workspace's
// PUBLIC availability + already-booked slots. No PII leaks.

import { NextResponse } from "next/server";
import { listPublicBookingSlotsAction } from "@/lib/bookings/actions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orgSlug = searchParams.get("orgSlug")?.trim() ?? "";
  const bookingSlug = searchParams.get("bookingSlug")?.trim() || "default";
  const date = searchParams.get("date")?.trim() ?? "";

  if (!orgSlug || !date) {
    return NextResponse.json(
      { slots: [], error: "missing_orgSlug_or_date" },
      { status: 400 },
    );
  }

  try {
    const result = await listPublicBookingSlotsAction({
      orgSlug,
      bookingSlug,
      date,
    });
    return NextResponse.json({
      slots: result.slots,
      durationMinutes: result.durationMinutes,
    });
  } catch (err) {
    console.error(
      `[public/booking-slots] error org_slug=${orgSlug} date=${date}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return NextResponse.json(
      { slots: [], error: "internal_error" },
      { status: 500 },
    );
  }
}
