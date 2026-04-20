import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { bookings, organizations } from "@/db/schema";
import { resolveOrgIdForWrite, resolveV1Identity } from "@/lib/auth/v1-identity";
import { assertWritable, demoApiBlockedResponse, isDemoReadonly } from "@/lib/demo/server";
import { logEvent } from "@/lib/observability/log";

// CRUD for appointment types — template rows in `bookings` with
// status='template'. Pre-fix, the only MCP write path was `configure_booking`
// which hardcoded the single default template; this route lets the MCP
// surface create + list additional types.
//
// IMPORTANT: every query against `bookings` must include
// `status = 'template'` to avoid touching real scheduled bookings stored in
// the same table.

function toSlug(value: string) {
  const normalized = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "appointment";
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function resolveIdentityForList(request: Request) {
  return resolveV1Identity(request);
}

export async function GET(request: Request) {
  const auth = await resolveIdentityForList(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const requested = url.searchParams.get("workspace_id");
  const resolved = await resolveOrgIdForWrite(auth.identity, requested);
  if (!resolved.ok) return resolved.response;
  const orgId = resolved.orgId;

  const rows = await db
    .select({
      id: bookings.id,
      title: bookings.title,
      bookingSlug: bookings.bookingSlug,
      metadata: bookings.metadata,
      createdAt: bookings.createdAt,
      updatedAt: bookings.updatedAt,
    })
    .from(bookings)
    .where(and(eq(bookings.orgId, orgId), eq(bookings.status, "template")));

  return NextResponse.json({
    ok: true,
    workspace_id: orgId,
    appointment_types: rows.map((row) => ({
      id: row.id,
      title: row.title,
      booking_slug: row.bookingSlug,
      metadata: row.metadata,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    })),
  });
}

type CreateBody = {
  workspace_id?: unknown;
  title?: unknown;
  booking_slug?: unknown;
  duration_minutes?: unknown;
  description?: unknown;
  price?: unknown;
  buffer_before_minutes?: unknown;
  buffer_after_minutes?: unknown;
  max_bookings_per_day?: unknown;
};

export async function POST(request: Request) {
  if (isDemoReadonly()) return demoApiBlockedResponse();
  assertWritable();

  const auth = await resolveV1Identity(request);
  if (!auth.ok) return auth.response;
  const { identity } = auth;

  const body = (await request.json().catch(() => ({}))) as CreateBody;

  const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  const duration = clampInt(body.duration_minutes, 5, 240, 30);
  const price = clampInt(body.price, 0, 1_000_000, 0);
  const bufferBefore = clampInt(body.buffer_before_minutes, 0, 120, 0);
  const bufferAfter = clampInt(body.buffer_after_minutes, 0, 120, 0);
  const maxPerDay =
    body.max_bookings_per_day === undefined || body.max_bookings_per_day === null
      ? null
      : clampInt(body.max_bookings_per_day, 1, 100, 1);
  const description =
    typeof body.description === "string" ? body.description.trim().slice(0, 800) : "";
  const slugInput = typeof body.booking_slug === "string" ? body.booking_slug : title;
  const bookingSlug = toSlug(slugInput);

  const requestedWorkspaceId =
    typeof body.workspace_id === "string" ? body.workspace_id : null;
  const resolved = await resolveOrgIdForWrite(identity, requestedWorkspaceId);
  if (!resolved.ok) return resolved.response;
  const orgId = resolved.orgId;

  const [org] = await db
    .select({ slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }

  // Conflict guard — a template at this slug already exists.
  const [conflict] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(
        eq(bookings.orgId, orgId),
        eq(bookings.bookingSlug, bookingSlug),
        eq(bookings.status, "template"),
      ),
    )
    .limit(1);
  if (conflict) {
    return NextResponse.json(
      {
        error: `Appointment type with slug '${bookingSlug}' already exists. Use update_appointment_type to modify it.`,
        code: "slug_conflict",
      },
      { status: 409 },
    );
  }

  const now = new Date();
  const [created] = await db
    .insert(bookings)
    .values({
      orgId,
      title,
      bookingSlug,
      provider: "manual",
      status: "template",
      startsAt: now,
      endsAt: now,
      metadata: {
        kind: "appointment_type",
        durationMinutes: duration,
        description,
        price,
        bufferBeforeMinutes: bufferBefore,
        bufferAfterMinutes: bufferAfter,
        maxBookingsPerDay: maxPerDay,
        // Sensible default availability — Mon-Fri 9am-5pm. Dashboard edit
        // surface lets the builder override this; MCP create gives a usable
        // default instead of forcing every caller to specify availability.
        availability: {
          mon: { enabled: true, start: "09:00", end: "17:00" },
          tue: { enabled: true, start: "09:00", end: "17:00" },
          wed: { enabled: true, start: "09:00", end: "17:00" },
          thu: { enabled: true, start: "09:00", end: "17:00" },
          fri: { enabled: true, start: "09:00", end: "17:00" },
          sat: { enabled: false, start: "09:00", end: "17:00" },
          sun: { enabled: false, start: "09:00", end: "17:00" },
        },
      },
    })
    .returning({
      id: bookings.id,
      title: bookings.title,
      bookingSlug: bookings.bookingSlug,
      metadata: bookings.metadata,
    });

  logEvent(
    "appointment_type_create",
    { booking_slug: created.bookingSlug, duration_minutes: duration, price },
    { request, identity, orgId, status: 201 },
  );

  return NextResponse.json(
    {
      ok: true,
      workspace_id: orgId,
      appointment_type: {
        id: created.id,
        title: created.title,
        booking_slug: created.bookingSlug,
        metadata: created.metadata,
      },
      public_url: `https://${org.slug}.${process.env.WORKSPACE_BASE_DOMAIN?.trim() || "app.seldonframe.com"}/book/${created.bookingSlug}`,
    },
    { status: 201 },
  );
}
