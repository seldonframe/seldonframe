import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/guard";
import { cancelBookingFromApi } from "@/lib/bookings/api";

export const runtime = "nodejs";

// Scope 3 Step 2a.2 — cancel a scheduled booking. Idempotent: re-cancelling
// an already-cancelled booking is a 200 no-op with alreadyCancelled=true
// rather than a 409, because agent retries are normal and we don't want
// doubled event traffic or duplicate calendar deletes. Payments linked to
// the booking stay untouched; linkedPaymentIds is returned so agents can
// compose refund_payment separately if the business rule demands it.

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const { id } = await params;

  try {
    const result = await cancelBookingFromApi({ orgId: guard.orgId, bookingId: id });
    if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Booking cancel failed";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
