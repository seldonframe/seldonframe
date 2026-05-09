import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PoweredByBadge } from "@seldonframe/core/virality";
import { db } from "@/db";
import { bookings, organizations } from "@/db/schema";
import { PublicBookingForm } from "@/components/bookings/public-booking-form";
import { TestModePublicBadge } from "@/components/layout/test-mode-public-badge";
import { PublicThemeProvider } from "@/components/theme/public-theme-provider";
import { shouldShowPoweredByBadgeForOrg } from "@/lib/billing/public";
import { getPublicBookingContext } from "@/lib/bookings/actions";
import { getPublicOrgThemeBySlug } from "@/lib/theme/actions";

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

  const showBadge = await shouldShowPoweredByBadgeForOrg(bookingContext.orgId);
  const theme = await getPublicOrgThemeBySlug(orgSlug);

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

