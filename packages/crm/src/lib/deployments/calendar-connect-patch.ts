// When a buyer connects a Google/Outlook calendar, the callback persists
// calendarRef — but bookingMode stays "native" (the default), so
// deploymentToBinding routes bookings to SF-native and the connected calendar
// is silently ignored. This pure helper computes the bookingMode part of the
// callback's patch: connecting a calendar flips native/unset → "api_mcp" so
// book_appointment reaches the connected calendar via Composio. Never downgrades
// an explicit external mode; never touches a non-calendar toolkit.

import type { BookingMode } from "@/lib/deployments/booking-providers";

const CALENDAR_TOOLKITS = new Set<string>(["googlecalendar", "outlook"]);

export function calendarConnectPatch(input: {
  currentBookingMode: string | null | undefined;
  toolkit: string;
}): { bookingMode?: BookingMode } {
  if (!CALENDAR_TOOLKITS.has(input.toolkit)) return {};
  const cur = input.currentBookingMode;
  // Already booking externally, or the operator chose an explicit handoff → leave it.
  if (cur === "api_mcp" || cur === "cal_com" || cur === "external_link") return {};
  // native / unset + a real calendar connection → route to the connected calendar.
  return { bookingMode: "api_mcp" };
}
