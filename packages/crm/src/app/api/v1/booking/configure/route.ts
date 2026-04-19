import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { bookings, organizations } from "@/db/schema";
import {
  resolveOrgIdForWrite,
  resolveV1Identity,
} from "@/lib/auth/v1-identity";
import { assertWritable, demoApiBlockedResponse, isDemoReadonly } from "@/lib/demo/server";

type ConfigureBody = {
  workspace_id?: unknown;
  title?: unknown;
  duration_minutes?: unknown;
  description?: unknown;
};

const BOOKING_SLUG = "default";

export async function POST(request: Request) {
  if (isDemoReadonly()) return demoApiBlockedResponse();
  assertWritable();

  const auth = await resolveV1Identity(request);
  if (!auth.ok) return auth.response;
  const { identity } = auth;

  const body = (await request.json().catch(() => ({}))) as ConfigureBody;

  const newTitle =
    typeof body.title === "string" && body.title.trim().length > 0
      ? body.title.trim().slice(0, 120)
      : null;
  const newDuration =
    typeof body.duration_minutes === "number" &&
    body.duration_minutes >= 5 &&
    body.duration_minutes <= 240
      ? Math.round(body.duration_minutes)
      : null;
  const newDescription =
    typeof body.description === "string"
      ? body.description.trim().slice(0, 800)
      : null;

  if (!newTitle && newDuration === null && !newDescription) {
    return NextResponse.json(
      { error: "At least one of title, duration_minutes, or description is required." },
      { status: 400 }
    );
  }

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
    .select({
      id: bookings.id,
      title: bookings.title,
      metadata: bookings.metadata,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.orgId, orgId),
        eq(bookings.bookingSlug, BOOKING_SLUG),
        // CRITICAL: filter to template rows only. The bookings table is shared
        // between templates and real scheduled bookings; updating a row without
        // this filter could clobber a customer's meeting.
        eq(bookings.status, "template")
      )
    )
    .limit(1);

  if (!existing) {
    return NextResponse.json(
      {
        error:
          "No default booking template exists. Install caldiy-booking first, then configure.",
      },
      { status: 404 }
    );
  }

  const prevMetadata = (existing.metadata ?? {}) as Record<string, unknown>;
  const nextMetadata: Record<string, unknown> = { ...prevMetadata };
  if (newTitle) nextMetadata.appointmentName = newTitle;
  if (newDuration !== null) nextMetadata.durationMinutes = newDuration;
  if (newDescription) nextMetadata.appointmentDescription = newDescription;

  const patch: Partial<typeof bookings.$inferInsert> = {
    metadata: nextMetadata,
    updatedAt: new Date(),
  };
  if (newTitle) patch.title = newTitle;

  await db.update(bookings).set(patch).where(eq(bookings.id, existing.id));

  const effectiveDuration =
    newDuration ??
    (typeof prevMetadata.durationMinutes === "number"
      ? prevMetadata.durationMinutes
      : null);

  return NextResponse.json({
    ok: true,
    workspace_id: orgId,
    slug: BOOKING_SLUG,
    applied: {
      title: newTitle ?? existing.title,
      duration_minutes: effectiveDuration,
      description_updated: Boolean(newDescription),
    },
    public_url: `https://${org.slug}.${process.env.WORKSPACE_BASE_DOMAIN?.trim() || "app.seldonframe.com"}/book`,
    next: ["Visit /book on your subdomain to verify the new booking details."],
  });
}
