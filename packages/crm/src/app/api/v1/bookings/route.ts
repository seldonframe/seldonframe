import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/guard";
import { createBookingFromApi } from "@/lib/bookings/api";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const body = (await request.json()) as {
    contactId?: unknown;
    contact_id?: unknown;
    appointmentTypeId?: unknown;
    appointment_type_id?: unknown;
    startsAt?: unknown;
    starts_at?: unknown;
    notes?: unknown;
  };

  const contactId = typeof body.contactId === "string" ? body.contactId : typeof body.contact_id === "string" ? body.contact_id : null;
  const appointmentTypeId =
    typeof body.appointmentTypeId === "string"
      ? body.appointmentTypeId
      : typeof body.appointment_type_id === "string"
        ? body.appointment_type_id
        : null;
  const startsAtRaw = typeof body.startsAt === "string" ? body.startsAt : typeof body.starts_at === "string" ? body.starts_at : null;

  if (!contactId) {
    return NextResponse.json({ error: "contact_id is required" }, { status: 400 });
  }
  if (!appointmentTypeId) {
    return NextResponse.json({ error: "appointment_type_id is required" }, { status: 400 });
  }
  if (!startsAtRaw) {
    return NextResponse.json({ error: "starts_at is required (ISO 8601 timestamp)" }, { status: 400 });
  }
  const startsAt = new Date(startsAtRaw);
  if (Number.isNaN(startsAt.getTime())) {
    return NextResponse.json({ error: "starts_at is not a valid ISO 8601 timestamp" }, { status: 400 });
  }

  try {
    const result = await createBookingFromApi({
      orgId: guard.orgId,
      contactId,
      appointmentTypeId,
      startsAt,
      notes: typeof body.notes === "string" ? body.notes : null,
    });
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Booking create failed";
    const status = message.includes("not found") ? 404 : 422;
    return NextResponse.json({ error: message }, { status });
  }
}
