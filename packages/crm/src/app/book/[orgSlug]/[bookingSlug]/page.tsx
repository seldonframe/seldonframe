import { PoweredByBadge } from "@seldonframe/core/virality";
import { PublicBookingForm } from "@/components/bookings/public-booking-form";

export default async function PublicBookingPage({
  params,
}: {
  params: Promise<{ orgSlug: string; bookingSlug: string }>;
}) {
  const { orgSlug, bookingSlug } = await params;

  return (
    <main className="crm-page flex items-center justify-center">
      <div className="w-full max-w-xl space-y-4">
        <h1 className="text-2xl font-semibold">Book a Session</h1>
        <p className="text-label text-[hsl(var(--color-text-secondary))]">Choose a time that works for you and we will confirm with meeting details.</p>
        <PublicBookingForm orgSlug={orgSlug} bookingSlug={bookingSlug} />
        <div className="flex justify-center pt-2">
          <PoweredByBadge />
        </div>
      </div>
    </main>
  );
}
