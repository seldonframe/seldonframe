import { and, asc, desc, eq, gte, lte, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { guardApiRequest } from "@/lib/api/guard";
import { createBookingFromApi } from "@/lib/bookings/api";

export const runtime = "nodejs";

// GET shipped in 2026-04-21 pre-7.c micro-slice. Completes the
// booking CRUD surface alongside create_booking (7.h). Appointment-
// type templates (status='template') are excluded — this route only
// returns real scheduled bookings.
export async function GET(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);
  const contactId = url.searchParams.get("contact_id");
  const status = url.searchParams.get("status");
  const fromRaw = url.searchParams.get("from");
  const toRaw = url.searchParams.get("to");

  const filters = [eq(bookings.orgId, guard.orgId), ne(bookings.status, "template")];
  if (contactId) filters.push(eq(bookings.contactId, contactId));
  if (status) filters.push(eq(bookings.status, status));
  if (fromRaw) {
    const from = new Date(fromRaw);
    if (!Number.isNaN(from.getTime())) filters.push(gte(bookings.startsAt, from));
  }
  if (toRaw) {
    const to = new Date(toRaw);
    if (!Number.isNaN(to.getTime())) filters.push(lte(bookings.startsAt, to));
  }

  // Future bookings sorted earliest-first is the more-useful default
  // for reminder-style agents; past bookings are reverse-chronological.
  // Sort by startsAt asc when a future filter is in play, desc otherwise.
  const orderCol = fromRaw ? asc(bookings.startsAt) : desc(bookings.startsAt);

  const rows = await db
    .select({
      id: bookings.id,
      contactId: bookings.contactId,
      title: bookings.title,
      bookingSlug: bookings.bookingSlug,
      status: bookings.status,
      startsAt: bookings.startsAt,
      endsAt: bookings.endsAt,
      fullName: bookings.fullName,
      email: bookings.email,
      meetingUrl: bookings.meetingUrl,
      createdAt: bookings.createdAt,
    })
    .from(bookings)
    .where(and(...filters))
    .orderBy(orderCol)
    .limit(limit);

  return NextResponse.json({ data: rows });
}

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
    // `start_time` is a defensive alias added 2026-04-21 after the 7.h
    // post-ship probe showed Claude-synthesized specs sometimes using
    // `start_time` instead of the documented `starts_at`. The
    // V1.1 composition-contract-schema-v2 (typed tool inputs) will
    // subsume this alias by giving the synthesis prompt canonical
    // arg names; until then, tolerate the drift at the API boundary.
    start_time?: unknown;
    notes?: unknown;
  };

  const contactId = typeof body.contactId === "string" ? body.contactId : typeof body.contact_id === "string" ? body.contact_id : null;
  const appointmentTypeId =
    typeof body.appointmentTypeId === "string"
      ? body.appointmentTypeId
      : typeof body.appointment_type_id === "string"
        ? body.appointment_type_id
        : null;
  const startsAtRaw =
    typeof body.startsAt === "string"
      ? body.startsAt
      : typeof body.starts_at === "string"
        ? body.starts_at
        : typeof body.start_time === "string"
          ? body.start_time
          : null;

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
