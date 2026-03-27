import { findAdapterById } from "@seldonframe/core/integrations";

export const bookingProviderOrder = ["zoom", "google-meet", "google-calendar", "microsoft-graph"] as const;

export type BookingProvider = (typeof bookingProviderOrder)[number] | "manual";

export async function getAvailableBookingProviders() {
  const checks = await Promise.all(
    bookingProviderOrder.map(async (id) => {
      const descriptor = await findAdapterById(id);
      return descriptor && descriptor.adapter.isConfigured() ? id : null;
    })
  );

  return checks.filter((item): item is (typeof bookingProviderOrder)[number] => Boolean(item));
}

export async function resolveBookingProvider(requested?: string | null): Promise<BookingProvider> {
  const available = await getAvailableBookingProviders();

  if (requested && available.includes(requested as (typeof bookingProviderOrder)[number])) {
    return requested as BookingProvider;
  }

  return available[0] ?? "manual";
}

export function buildMeetingUrl(provider: BookingProvider, bookingId: string) {
  switch (provider) {
    case "zoom":
      return `https://zoom.us/j/${bookingId.replace(/-/g, "").slice(0, 11)}`;
    case "google-meet":
      return `https://meet.google.com/${bookingId.replace(/-/g, "").slice(0, 3)}-${bookingId.replace(/-/g, "").slice(3, 7)}-${bookingId.replace(/-/g, "").slice(7, 10)}`;
    default:
      return null;
  }
}
