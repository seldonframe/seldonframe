import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/guard";
import { getBookingFromApi } from "@/lib/bookings/api";

export const runtime = "nodejs";

// Scope 3 Step 2a.1 — fetch a single scheduled booking by id. Mirrors
// the CRUD surface other v1 resources ship at /[id]. Appointment-type
// templates (status='template') are excluded by the helper; to read a
// template use /api/v1/booking/appointment-types/[slug].

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const { id } = await params;
  const booking = await getBookingFromApi({ orgId: guard.orgId, bookingId: id });
  if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ data: booking });
}
