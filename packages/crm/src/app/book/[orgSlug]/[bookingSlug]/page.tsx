import { and, eq, or } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PoweredByBadge } from "@seldonframe/core/virality";
import { db } from "@/db";
import { bookings, landingPages, organizations } from "@/db/schema";
import { PublicBookingForm } from "@/components/bookings/public-booking-form";
import { TestModePublicBadge } from "@/components/layout/test-mode-public-badge";
import { PublicThemeProvider } from "@/components/theme/public-theme-provider";
import { shouldShowPoweredByBadgeForOrg } from "@/lib/billing/public";
import { getPublicBookingContext } from "@/lib/bookings/actions";
import { getPublicOrgThemeBySlug } from "@/lib/theme/actions";
import type { R1TestimonialsSection } from "@/lib/landing/r1-payload-prompt";
// 2026-05-18 (later) — agency-wide white-label REMOVED from public
// booking page. The end customer (the homeowner clicking the booking
// link) should see the SMB's identity ("Roofs by Shiloh"), not the
// agency that built the system ("Max agency"). Agency chrome lives
// in the OPERATOR's admin dashboard sidebar only — never on
// customer-facing surfaces. See operator dogfood feedback 2026-05-18.

// Fix C (r1) — extract testimonials from the workspace's r1 landing row.
// The r1 generator writes blueprint_json.payload.testimonials (an R1TestimonialsSection)
// to the landing_pages row with slug='r1' (source='r1-generator'). This is the
// data the live /w/<slug> website renders — we read the same source so the booking
// page always shows the same social proof the customer just saw on the landing page.
// Returns the testimonials array plus the section's eyebrow, heading, and reviewSummary
// so the booking page can render a "250 reviews · 4.9★" header.
export type BookingTestimonialsData = {
  testimonials: R1TestimonialsSection["testimonials"];
  eyebrow?: string;
  heading?: string;
  reviewSummary?: R1TestimonialsSection["reviewSummary"];
};

async function fetchBookingTestimonials(orgId: string): Promise<BookingTestimonialsData> {
  const empty: BookingTestimonialsData = { testimonials: [] };
  try {
    // Query the r1 landing row: prefer slug='r1', also accept source='r1-generator'
    // (both conditions should match the same row; OR covers any naming variation).
    const [row] = await db
      .select({ blueprintJson: landingPages.blueprintJson })
      .from(landingPages)
      .where(
        and(
          eq(landingPages.orgId, orgId),
          or(eq(landingPages.slug, "r1"), eq(landingPages.source, "r1-generator")),
        ),
      )
      .limit(1);

    if (!row) return empty;

    const payload = (row.blueprintJson as { payload?: { testimonials?: R1TestimonialsSection } } | null)
      ?.payload?.testimonials;

    if (!payload || !Array.isArray(payload.testimonials) || payload.testimonials.length === 0) {
      return empty;
    }

    return {
      testimonials: payload.testimonials,
      eyebrow: payload.eyebrow,
      heading: payload.heading,
      reviewSummary: payload.reviewSummary,
    };
  } catch {
    // Best-effort; never block the booking page for missing testimonials.
  }
  return empty;
}

// v1.36.1 — extract a business phone from the soul JSONB (best-effort).
// SeldonFrame doesn't have a dedicated `organizations.phone` column;
// phone tends to live under `soul.business.phone` or `soul.contact.phone`
// depending on how the workspace was scaffolded. We try both shapes
// and fall back to null. Used to render a "Call now" CTA in the
// booking page header when present.
function extractBusinessPhone(soul: unknown): string | null {
  if (!soul || typeof soul !== "object") return null;
  const s = soul as Record<string, unknown>;
  const business = (s.business ?? {}) as Record<string, unknown>;
  const contact = (s.contact ?? {}) as Record<string, unknown>;
  const candidates = [
    business.phone,
    business.phoneNumber,
    contact.phone,
    contact.phoneNumber,
    s.phone,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length > 0) return c.trim();
  }
  return null;
}

// persona-loop finding (2026-07-20): this route had no generateMetadata
// export, so Next.js fell back to the root layout's <title>/OG tags —
// SeldonFrame's own marketing copy ("Open-source alternative to
// GoHighLevel", $29/mo pricing) — on the client's own public booking page.
// A plumber sharing their booking link would have their customers see
// SeldonFrame's branding in the browser tab and link preview instead of
// their own business name. Mirrors the working pattern in
// app/(public)/s/[orgSlug]/[...slug]/page.tsx.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgSlug: string; bookingSlug: string }>;
}): Promise<Metadata> {
  const { orgSlug, bookingSlug } = await params;
  const bookingContext = await getPublicBookingContext(orgSlug, bookingSlug);
  if (!bookingContext) return {};

  const [orgRow] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, bookingContext.orgId))
    .limit(1);
  const businessName = orgRow?.name ?? "Schedule";
  const title = `Book ${bookingContext.appointmentName} — ${businessName}`;
  const description =
    bookingContext.appointmentDescription || `Schedule an appointment with ${businessName}.`;

  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
  };
}

export default async function PublicBookingPage({
  params,
}: {
  params: Promise<{ orgSlug: string; bookingSlug: string }>;
}) {
  const { orgSlug, bookingSlug } = await params;
  const bookingContext = await getPublicBookingContext(orgSlug, bookingSlug);

  if (!bookingContext) {
    notFound();
  }

  const [showBadge, theme, testimonialsData] = await Promise.all([
    shouldShowPoweredByBadgeForOrg(bookingContext.orgId),
    getPublicOrgThemeBySlug(orgSlug),
    fetchBookingTestimonials(bookingContext.orgId),
  ]);
  // 2026-05-18 (later) — SMB identity only on public booking page.
  // No agency override (see import comment above).
  const headerLogoUrl = theme.logoUrl || null;

  // v1.36.1 — fetch org name + soul + testMode in one query. Replaces
  // the separate testMode lookup. Soul is parsed for business phone
  // via extractBusinessPhone() above.
  const [orgRow] = await db
    .select({
      name: organizations.name,
      soul: organizations.soul,
      testMode: organizations.testMode,
    })
    .from(organizations)
    .where(eq(organizations.id, bookingContext.orgId))
    .limit(1);
  const businessName = orgRow?.name ?? "Schedule";
  const businessPhone = extractBusinessPhone(orgRow?.soul);
  const isTestMode = orgRow?.testMode ?? false;

  // v1.36.1 — the React PublicBookingForm is now the source of
  // truth. Pre-v1.36.1 we preferred a blueprint-rendered HTML/CSS
  // pair from `bookings.contentHtml` / `contentCss` (calcom-month-v1
  // renderer) when present, and only fell back to React for legacy
  // rows. The rendered HTML output looked unstyled / broken /
  // missing the rich shell (no header, no sidebar, no step
  // indicator) — confirmed via dogfood at atlantic-plumbing. We're
  // intentionally bypassing the blueprint render path so every
  // booking page gets the new richer UI immediately, regardless of
  // whether it was scaffolded with the old renderer.
  //
  // The blueprint-rendered HTML is still in the DB and the renderer
  // module still exists, but we don't read it here. Fixing the
  // renderer's output to match the new React UI is a separate
  // ship; for now React is the public face.
  void bookings;

  // v1.36.3 — force light mode on customer-facing booking pages.
  // The default workspace theme.mode is "dark" (which is fine for
  // operator dashboards), but customer-facing booking pages should
  // be light by industry convention (Cal.com, Calendly, every
  // booking SaaS). Operators' brand color (primaryColor) still
  // cascades — we only override the mode. If a workspace explicitly
  // wants a dark booking page we'll add an opt-in toggle later;
  // light is the right default for the 95% case.
  //
  // v1.38.4 — paired with className="light" wrapper below. The mode
  // override fixes our --sf-* CSS variables, but the booking form's
  // Tailwind utility classes (bg-card, text-foreground, bg-muted/15)
  // resolve to --card / --foreground / --muted-foreground which are
  // controlled by the global .dark class on <html>. Without the
  // explicit `light` class on the wrapper, those Tailwind utilities
  // stayed dark even when our --sf-bg flipped to white — that's why
  // v1.36.3's fix wasn't visible: half the page (header, calendar,
  // detail card) used Tailwind classes and rendered dark while the
  // outer main bg was white. Wrapping with `light` locally disables
  // the global .dark cascade for everything inside.
  const bookingTheme = { ...theme, mode: "light" as const };

  return (
    <PublicThemeProvider theme={bookingTheme}>
      <div className="light">
        <PublicBookingForm
          orgSlug={orgSlug}
          bookingSlug={bookingSlug}
          durationMinutes={bookingContext.durationMinutes}
          confirmationFallback={bookingContext.confirmationMessage}
          price={bookingContext.price}
          businessName={businessName}
          businessPhone={businessPhone}
          appointmentName={bookingContext.appointmentName}
          appointmentDescription={bookingContext.appointmentDescription}
          // v1.40.1 — vertical-aware booking intake field schema. When
          // PublicBookingForm renders, it now appends these fields after
          // name + email, populated per archetype during workspace
          // creation. Empty array for legacy templates → renders the
          // legacy name+email+notes flow.
          intakeFields={bookingContext.intakeFields}
          // v1.40.2 — workspace IANA TZ. Slots are UTC ISO; the form
          // formats them in this TZ for display so the customer sees
          // the operator's hours, not their browser-local reinterp.
          workspaceTimezone={bookingContext.workspaceTimezone}
          // 2026-05-18 (later) — SMB's own theme.logoUrl only.
          // null → text-only header showing the SMB business name.
          logoUrl={headerLogoUrl}
          // Fix C (r1) — surface r1 landing-page testimonials below the
          // booking calendar so customers see the same social proof that
          // the live website shows. Empty array → no testimonials block rendered.
          testimonials={testimonialsData.testimonials}
          testimonialsEyebrow={testimonialsData.eyebrow}
          testimonialsHeading={testimonialsData.heading}
          testimonialsReviewSummary={testimonialsData.reviewSummary}
        />
        {(showBadge || isTestMode) ? (
          <div className="flex flex-col items-center gap-2 py-3">
            {isTestMode ? <TestModePublicBadge testMode={true} /> : null}
            {showBadge ? <PoweredByBadge /> : null}
          </div>
        ) : null}
      </div>
    </PublicThemeProvider>
  );
}

