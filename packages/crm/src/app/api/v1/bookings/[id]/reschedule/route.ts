import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/guard";
import { RescheduleValidationError, rescheduleBookingFromApi } from "@/lib/bookings/api";

export const runtime = "nodejs";

// Scope 3 Step 2a.3 — reschedule a scheduled booking. Preserves the
// original duration; only starts_at changes. Past-dated new starts_at
// returns 400; cancelled bookings return 422 (revive-via-reschedule is
// a data-integrity red flag — create a new booking instead). Payments
// are NOT touched.

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const { id } = await params;

  const body = (await request.json().catch(() => ({}))) as {
    startsAt?: unknown;
    starts_at?: unknown;
    start_time?: unknown;
  };

  const startsAtRaw =
    typeof body.startsAt === "string"
      ? body.startsAt
      : typeof body.starts_at === "string"
        ? body.starts_at
        : typeof body.start_time === "string"
          ? body.start_time
          : null;

  if (!startsAtRaw) {
    return NextResponse.json({ error: "starts_at is required (ISO 8601 timestamp)" }, { status: 400 });
  }

  const startsAt = new Date(startsAtRaw);

  try {
    const result = await rescheduleBookingFromApi({ orgId: guard.orgId, bookingId: id, startsAt });
    if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ data: result });
  } catch (error) {
    if (error instanceof RescheduleValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Booking reschedule failed";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
