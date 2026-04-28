import { and, eq } from "drizzle-orm";
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

  // SLICE 8 G-8-3 (Option B): customer-facing test-mode indicator.
  const [orgTestMode] = await db
    .select({ testMode: organizations.testMode })
    .from(organizations)
    .where(eq(organizations.id, bookingContext.orgId))
    .limit(1);
  const isTestMode = orgTestMode?.testMode ?? false;

  // Wiring task: prefer the blueprint-rendered HTML/CSS pair (calcom-month-v1)
  // when present on the booking row. Falls back to the legacy
  // PublicBookingForm React component for rows that predate the wiring
  // (those will be backfilled by the seed-repair branch on next access).
  const [bookingTemplate] = await db
    .select({
      contentHtml: bookings.contentHtml,
      contentCss: bookings.contentCss,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.orgId, bookingContext.orgId),
        eq(bookings.bookingSlug, bookingSlug),
        eq(bookings.status, "template")
      )
    )
    .limit(1);

  const useBlueprintRender = Boolean(
    bookingTemplate?.contentHtml && bookingTemplate?.contentCss
  );

  if (useBlueprintRender) {
    // Render the rendered HTML/CSS straight into the page. The C4
    // renderer's output already carries the navbar / footer / theme
    // tokens / interactivity script — no wrapper chrome needed beyond
    // the optional badges below.
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: bookingTemplate!.contentCss! }} />
        <div dangerouslySetInnerHTML={{ __html: bookingTemplate!.contentHtml! }} />
        {(showBadge || isTestMode) ? (
          <div className="flex flex-col items-center gap-2 py-2">
            {isTestMode ? <TestModePublicBadge testMode={true} /> : null}
            {showBadge ? <PoweredByBadge /> : null}
          </div>
        ) : null}
      </>
    );
  }

  // Legacy fallback — pre-wiring rows + any place the renderer can't run.
  return (
    <PublicThemeProvider theme={theme}>
      <main className="crm-page flex items-center justify-center">
        <div className="w-full max-w-xl space-y-4">
          <h1 className="text-3xl font-light tracking-tight">{bookingContext.appointmentName}</h1>
          <p className="text-label" style={{ color: "var(--sf-muted)" }}>{bookingContext.appointmentDescription}</p>
          <PublicBookingForm
            orgSlug={orgSlug}
            bookingSlug={bookingSlug}
            durationMinutes={bookingContext.durationMinutes}
            confirmationFallback={bookingContext.confirmationMessage}
            price={bookingContext.price}
          />
          {(showBadge || isTestMode) ? (
            <div className="flex flex-col items-center gap-2 pt-2">
              {isTestMode ? <TestModePublicBadge testMode={true} /> : null}
              {showBadge ? <PoweredByBadge /> : null}
            </div>
          ) : null}
        </div>
      </main>
    </PublicThemeProvider>
  );
}
