import { NextResponse } from "next/server";
import { submitPublicBookingAction } from "@/lib/bookings/actions";

/**
 * POST /api/v1/public/bookings
 *
 * The HTTP endpoint the C4 booking renderer's vanilla-JS client posts
 * to when a booking is confirmed. Thin wrapper over the existing
 * `submitPublicBookingAction` so the public-facing surface stays
 * identical whether the booking flow is React (legacy fallback) or
 * blueprint-rendered (post-wiring).
 *
 * Request body:
 *   {
 *     orgSlug: string,        // workspace subdomain prefix
 *     bookingSlug: string,    // event-type slug (default: "default")
 *     fullName: string,
 *     email: string,
 *     notes?: string,
 *     slot: string            // ISO datetime; mapped to `startsAt` for
 *                             // compatibility with the underlying action
 *   }
 *
 * The route is intentionally permissive on the body shape — the C4
 * client also includes extra form fields beyond name/email/notes.
 * Anything unrecognized falls into `notes` if present, or is dropped.
 *
 * Auth: anonymous. The submitPublicBookingAction enforces its own
 * org/slug resolution and rate-limits internally.
 */

type SubmitBody = {
  orgSlug?: unknown;
  bookingSlug?: unknown;
  fullName?: unknown;
  name?: unknown; // C4 client uses `name` from the form fields
  email?: unknown;
  notes?: unknown;
  slot?: unknown;     // C4 client posts the chosen slot as `slot`
  startsAt?: unknown; // older clients post as `startsAt`
};

export async function POST(request: Request) {
  let body: SubmitBody;
  try {
    body = (await request.json()) as SubmitBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const orgSlug = typeof body.orgSlug === "string" ? body.orgSlug.trim() : "";
  const bookingSlug =
    typeof body.bookingSlug === "string" && body.bookingSlug.trim().length > 0
      ? body.bookingSlug.trim()
      : "default";
  // Accept either `name` (from the C4 client form fields) or `fullName`.
  const fullName =
    typeof body.fullName === "string" && body.fullName.trim().length > 0
      ? body.fullName.trim()
      : typeof body.name === "string"
        ? body.name.trim()
        : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  const startsAt =
    typeof body.slot === "string" && body.slot.length > 0
      ? body.slot
      : typeof body.startsAt === "string"
        ? body.startsAt
        : "";

  if (!orgSlug || !fullName || !email || !startsAt) {
    return NextResponse.json(
      {
        error:
          "orgSlug, fullName (or name), email, and slot (or startsAt) are required.",
      },
      { status: 400 }
    );
  }

  try {
    const result = await submitPublicBookingAction({
      orgSlug,
      bookingSlug,
      fullName,
      email,
      notes: notes.length > 0 ? notes : undefined,
      startsAt,
    });
    return NextResponse.json({
      ok: true,
      checkoutUrl: result.checkoutUrl ?? null,
      confirmationMessage: result.confirmationMessage ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Booking failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
