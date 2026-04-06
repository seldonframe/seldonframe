import { notFound } from "next/navigation";
import { PoweredByBadge } from "@seldonframe/core/virality";
import { PublicBookingForm } from "@/components/bookings/public-booking-form";
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
          {showBadge ? (
            <div className="flex justify-center pt-2">
              <PoweredByBadge />
            </div>
          ) : null}
        </div>
      </main>
    </PublicThemeProvider>
  );
}
