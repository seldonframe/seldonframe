// packages/crm/src/lib/deployments/booking-binding.ts
//
// Pure mapping: a deployment's STORED booking config → the runtime
// CalendarBinding the booking tools read (see calendar-backend.ts). Shared by
// every surface so voice / chat / SMS / email derive the binding identically —
// no I/O, no DB, trivially unit-tested.

import type { CalendarBinding } from "@/lib/agents/booking/calendar-backend";

/** The deployment fields the binding depends on (structural — works for the full
 *  Deployment row and any subset). */
export type BindingSource = {
  bookingMode: string | null | undefined;
  externalBookingUrl?: string | null;
  calendarRef?: { provider?: string | null; accountId?: string | null; calendarId?: string | null } | null;
};

/** Map a deployment's stored booking config → the runtime CalendarBinding the
 *  booking tools read. The DB bookingMode enum is native|external_link|api_mcp|cal_com;
 *  api_mcp + cal_com mean "book into the client's external calendar" → binding.mode
 *  "book_external". calendarRef is carried only when a calendar is actually connected
 *  (accountId present + a recognized provider); otherwise null so resolveCalendarBackend
 *  falls back to native. */
export function deploymentToBinding(d: BindingSource): CalendarBinding {
  if (d.bookingMode === "external_link") {
    return { mode: "external_link", externalUrl: d.externalBookingUrl ?? null };
  }
  if (d.bookingMode === "api_mcp" || d.bookingMode === "cal_com") {
    const ref = d.calendarRef;
    // Bind the raw provider to a local so TS narrows it to the literal union in
    // the true branch (re-reading ref?.provider across `||` widens back to string).
    const raw = ref?.provider;
    const provider: "googlecalendar" | "outlook" | null =
      raw === "googlecalendar" || raw === "outlook" ? raw : null;
    const calendarRef = provider && ref?.accountId
      ? { provider, accountId: ref.accountId, calendarId: ref.calendarId ?? undefined }
      : null;
    return { mode: "book_external", calendarRef };
  }
  return { mode: "native" };
}
