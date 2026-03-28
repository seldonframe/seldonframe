import { notFound } from "next/navigation";
import { PoweredByBadge } from "@seldonframe/core/virality";
import { PublicBookingForm } from "@/components/bookings/public-booking-form";
import { getPublicBookingContext } from "@/lib/bookings/actions";

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

  return (
    <main className="crm-page flex items-center justify-center">
      <div className="w-full max-w-xl space-y-4">
        <h1 className="text-3xl font-light tracking-tight">{bookingContext.appointmentName}</h1>
        <p className="text-label text-[hsl(var(--color-text-secondary))]">{bookingContext.appointmentDescription}</p>
        <PublicBookingForm
          orgSlug={orgSlug}
          bookingSlug={bookingSlug}
          durationMinutes={bookingContext.durationMinutes}
          confirmationFallback={bookingContext.confirmationMessage}
          price={bookingContext.price}
        />
        <div className="flex justify-center pt-2">
          <PoweredByBadge />
        </div>
      </div>
    </main>
  );
}
