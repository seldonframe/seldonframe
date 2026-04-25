import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PoweredByBadge } from "@seldonframe/core/virality";
import { db } from "@/db";
import { organizations } from "@/db/schema";
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
