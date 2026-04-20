import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { bookings, organizations } from "@/db/schema";
import { resolveOrgIdForWrite, resolveV1Identity } from "@/lib/auth/v1-identity";
import { assertWritable, demoApiBlockedResponse, isDemoReadonly } from "@/lib/demo/server";
import { logEvent } from "@/lib/observability/log";

// Per-slug appointment-type operations. Companion to the collection route
// at ../route.ts. Same `status = 'template'` filter invariant — never
// touch real scheduled bookings here.

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = await resolveV1Identity(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const requested = url.searchParams.get("workspace_id");
  const resolved = await resolveOrgIdForWrite(auth.identity, requested);
  if (!resolved.ok) return resolved.response;
  const orgId = resolved.orgId;

  const { slug } = await params;
  const [row] = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.orgId, orgId),
        eq(bookings.bookingSlug, slug),
        eq(bookings.status, "template"),
      ),
    )
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    appointment_type: {
      id: row.id,
      title: row.title,
      booking_slug: row.bookingSlug,
      metadata: row.metadata,
    },
  });
}

type PatchBody = {
  workspace_id?: unknown;
  title?: unknown;
  duration_minutes?: unknown;
  description?: unknown;
  price?: unknown;
  buffer_before_minutes?: unknown;
  buffer_after_minutes?: unknown;
  max_bookings_per_day?: unknown;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (isDemoReadonly()) return demoApiBlockedResponse();
  assertWritable();

  const auth = await resolveV1Identity(request);
  if (!auth.ok) return auth.response;
  const { identity } = auth;

  const body = (await request.json().catch(() => ({}))) as PatchBody;
  const { slug } = await params;

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

  const [existing] = await db
    .select({ id: bookings.id, title: bookings.title, metadata: bookings.metadata })
    .from(bookings)
    .where(
      and(
        eq(bookings.orgId, orgId),
        eq(bookings.bookingSlug, slug),
        eq(bookings.status, "template"),
      ),
    )
    .limit(1);

  if (!existing) {
    return NextResponse.json(
      { error: `Appointment type '${slug}' not found.`, code: "not_found" },
      { status: 404 },
    );
  }

  const prev = (existing.metadata ?? {}) as Record<string, unknown>;
  const next: Record<string, unknown> = { ...prev };
  const applied: Record<string, unknown> = {};

  const newTitle =
    typeof body.title === "string" && body.title.trim().length > 0
      ? body.title.trim().slice(0, 120)
      : null;
  if (newTitle) {
    next.appointmentName = newTitle;
    applied.title = newTitle;
  }

  if (body.duration_minutes !== undefined) {
    const n = clampInt(body.duration_minutes, 5, 240, Number(prev.durationMinutes) || 30);
    next.durationMinutes = n;
    applied.duration_minutes = n;
  }
  if (body.price !== undefined) {
    const n = clampInt(body.price, 0, 1_000_000, Number(prev.price) || 0);
    next.price = n;
    applied.price = n;
  }
  if (body.buffer_before_minutes !== undefined) {
    const n = clampInt(body.buffer_before_minutes, 0, 120, Number(prev.bufferBeforeMinutes) || 0);
    next.bufferBeforeMinutes = n;
    applied.buffer_before_minutes = n;
  }
  if (body.buffer_after_minutes !== undefined) {
    const n = clampInt(body.buffer_after_minutes, 0, 120, Number(prev.bufferAfterMinutes) || 0);
    next.bufferAfterMinutes = n;
    applied.buffer_after_minutes = n;
  }
  if (body.max_bookings_per_day !== undefined) {
    next.maxBookingsPerDay =
      body.max_bookings_per_day === null
        ? null
        : clampInt(body.max_bookings_per_day, 1, 100, 1);
    applied.max_bookings_per_day = next.maxBookingsPerDay;
  }
  if (typeof body.description === "string") {
    const d = body.description.trim().slice(0, 800);
    next.description = d;
    next.appointmentDescription = d;
    applied.description_updated = true;
  }

  if (Object.keys(applied).length === 0) {
    return NextResponse.json(
      { error: "No patchable fields provided.", code: "empty_patch" },
      { status: 400 },
    );
  }

  const patch: Partial<typeof bookings.$inferInsert> = {
    metadata: next,
    updatedAt: new Date(),
  };
  if (newTitle) patch.title = newTitle;

  await db.update(bookings).set(patch).where(eq(bookings.id, existing.id));

  logEvent(
    "appointment_type_update",
    { booking_slug: slug, applied_keys: Object.keys(applied) },
    { request, identity, orgId, status: 200 },
  );

  return NextResponse.json({
    ok: true,
    workspace_id: orgId,
    booking_slug: slug,
    applied,
  });
}
