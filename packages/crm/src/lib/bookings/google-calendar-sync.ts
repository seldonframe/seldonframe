// ============================================================================
// Google Calendar sync — STUB.
// ============================================================================
//
// May 1, 2026 — Google Calendar integration removed for V1. The Cal.diy
// booking page IS the operator's calendar; external sync was redundant
// and the OAuth prefetch caused CORS errors on the dashboard.
//
// This file remains as a no-op shim so existing call sites in
// `lib/bookings/actions.ts` and `lib/bookings/api.ts` keep compiling
// without a deep refactor. Every export returns a "not synced" result
// without touching Google's API. The OAuth routes are deleted; the
// schema field `organizations.integrations.google` is left alone for
// backward compat (no migration risk, inert data).
//
// To re-enable Google Calendar in a future iteration: restore the OAuth
// routes, replace the stubs below with real Google Calendar Events API
// calls, re-add the UI surfaces.

export interface SyncBookingInput {
  /** Original sync input was loose; we accept any shape callers pass. */
  [key: string]: unknown;
}

export interface SyncBookingResult {
  ok: boolean;
  /** Stable false flag for legacy callers branching on this. */
  synced?: boolean;
  /** Google Calendar event id (null when not synced). */
  externalEventId: string | null;
  /** Meeting URL when present (Google Meet, etc.). Always null in stub. */
  meetingUrl: string | null;
  reason?: string;
}

/** No-op: returns a "not synced" result without any API calls. */
export async function syncBookingWithGoogleCalendar(
  _input: SyncBookingInput
): Promise<SyncBookingResult> {
  return {
    ok: false,
    synced: false,
    externalEventId: null,
    meetingUrl: null,
    reason: "google_calendar_disabled",
  };
}

export interface DeleteBookingEventInput {
  [key: string]: unknown;
}

/** No-op: returns "not deleted". Existing cancellation paths branch on
 *  the returned ok flag and treat false as "skip". */
export async function deleteGoogleCalendarBookingEvent(
  _input: DeleteBookingEventInput
): Promise<{ ok: boolean; reason?: string }> {
  return { ok: false, reason: "google_calendar_disabled" };
}

/** No-op reconciliation. Originally walked the org's bookings to align
 *  with Google Calendar events. With Google Calendar removed, this is
 *  a synchronous no-op returning a zero-counts summary. */
export async function reconcileGoogleCalendarBookings(
  _input: unknown
): Promise<{ ok: boolean; reconciled: number; reason?: string }> {
  return { ok: false, reconciled: 0, reason: "google_calendar_disabled" };
}
