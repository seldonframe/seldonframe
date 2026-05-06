import { NextResponse } from "next/server";
import { submitPublicBookingAction } from "@/lib/bookings/actions";
import {
  resolveWorkspaceSlugFromRequest,
  resolveWorkspaceSlugFromRequestWithCustomDomains,
} from "@/lib/workspace/host-to-slug";

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

// v1.3.3 — every reject path emits a single-line structured JSON log
// to stderr so Vercel function logs become queryable. Pattern from the
// output-contract-validator: one event-typed line per outcome.
//
// Why this matters: pre-1.3.3 the route returned 400 with NO LOG (the
// "No logs found for this request" message in the Vercel UI). Booking
// confirmation was rejected silently for every workspace; we couldn't
// tell whether the timezone fix landed because the error path was
// invisible. Karpathy: observability before fix.
function rejectionLog(
  reason: string,
  details: Record<string, unknown>,
): void {
  console.error(
    JSON.stringify({
      event: "public_booking_rejected",
      reason,
      ...details,
    }),
  );
}

export async function POST(request: Request) {
  let body: SubmitBody;
  try {
    body = (await request.json()) as SubmitBody;
  } catch (err) {
    rejectionLog("invalid_json_body", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // v1.3.5 — orgSlug resolution is body-FIRST, host-FALLBACK for the
  // <slug>.app.seldonframe.com case.
  //
  // v1.16.2 — custom-domain override. On a custom domain (e.g.
  // hvac.tirionforge.com) the C4 client falls back to
  // hostname.split('.')[0] which yields "hvac" — wrong, the real
  // workspace slug is `cypress-pine-hvac`. The host-fallback for
  // <slug>.app.seldonframe.com returns null on custom domains. So
  // we add a workspace_domains lookup: if the host matches a
  // verified custom domain, we resolve the canonical slug and PREFER
  // it over the body's value (the body is whatever the client guessed).
  const bodyOrgSlug = typeof body.orgSlug === "string" ? body.orgSlug.trim() : "";
  const customDomainSlug = await resolveWorkspaceSlugFromRequestWithCustomDomains(request);
  const subdomainSlug = customDomainSlug ? null : resolveWorkspaceSlugFromRequest(request);
  // Order of preference:
  //   1. customDomainSlug (host says "this is workspace X via verified custom domain")
  //   2. bodyOrgSlug (operator-supplied, trusted on standard domains)
  //   3. subdomainSlug (fallback when body is missing on subdomains)
  const orgSlug = customDomainSlug || bodyOrgSlug || subdomainSlug || "";
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
    rejectionLog("missing_required_field", {
      orgSlug_present: Boolean(orgSlug),
      fullName_present: Boolean(fullName),
      email_present: Boolean(email),
      startsAt_present: Boolean(startsAt),
      booking_slug: bookingSlug,
      // Hash email for diagnostics without leaking PII
      email_domain: email.split("@")[1] ?? null,
      host_header: request.headers.get("host"),
      x_forwarded_host: request.headers.get("x-forwarded-host"),
    });
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
    // Success log — useful for funnel analytics + confirming the
    // booking actually persisted.
    console.log(
      JSON.stringify({
        event: "public_booking_succeeded",
        org_slug: orgSlug,
        booking_slug: bookingSlug,
        starts_at: startsAt,
        email_domain: email.split("@")[1] ?? null,
        had_checkout: Boolean(result.checkoutUrl),
        // v1.3.5 — track how often the host-fallback rescues a request
        // the body would have missed. If this stays at 100% we can
        // simplify by dropping body.orgSlug entirely; if it stays at 0%
        // we know the C4 client patch is doing its job.
        slug_source: customDomainSlug
          ? "custom_domain"
          : bodyOrgSlug
            ? "body"
            : "subdomain_fallback",
      }),
    );
    return NextResponse.json({
      ok: true,
      checkoutUrl: result.checkoutUrl ?? null,
      confirmationMessage: result.confirmationMessage ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Booking failed.";
    rejectionLog("submit_action_threw", {
      org_slug: orgSlug,
      booking_slug: bookingSlug,
      starts_at: startsAt,
      error: message,
      stack: error instanceof Error ? error.stack?.slice(0, 800) : null,
    });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
