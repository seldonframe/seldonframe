// Pluggable booking backend — pure foundation (Task 1).
//
// A deployed agent's booking tools (find availability / create event) talk to a
// CalendarBackend rather than hard-wiring the native CRM booking store. This lets
// a deployment book into the CLIENT's own calendar (Google/Outlook via Composio)
// behind the exact same native tool surface. This module is the PURE seam:
//   - the CalendarBackend interface every adapter implements
//   - the shared input/output types
//   - resolveCalendarBackend(): pick the backend for a deployment's binding
//
// Native-fallback is the safety rule: book_external is only honored once the
// client's calendar is actually CONNECTED (calendarRef.accountId present). Until
// then — e.g. the operator chose external booking but hasn't finished the OAuth
// connect yet — we fall back to the native backend so a live call never breaks.
//
// No adapters, no DB, no network here. Adapters + tool wiring are later tasks.

export type CalendarBinding = {
  mode: "native" | "external_link" | "book_external";
  externalUrl?: string | null;
  // present only for book_external once the client's calendar is connected.
  // ownerOrgId = the agency org holding the Composio key; entityUserId = the
  // deployment id (the Composio entity the connected account lives under) — both
  // carried so the runtime re-opens the right session under one agency key.
  calendarRef?: {
    provider: "googlecalendar" | "outlook";
    accountId: string;
    calendarId?: string;
    ownerOrgId?: string;
    entityUserId?: string;
  } | null;
};

export type AvailabilityQuery = { date: string; durationMinutes: number; timezone: string };

export type LabeledSlot = { iso: string; label: string };

export type CreateEventInput = {
  startIso: string; durationMinutes: number; timezone: string; title: string;
  attendee: { name: string; email?: string; phone?: string }; notes?: string;
};

export type CalendarBackend = {
  findDayAvailability(q: AvailabilityQuery): Promise<{ slots: LabeledSlot[] }>;
  createEvent(input: CreateEventInput): Promise<{ ok: true; eventRef: string } | { ok: false; error: string }>;
};

export type ResolveDeps = {
  makeNative: () => CalendarBackend;
  makeComposio: (ref: NonNullable<CalendarBinding["calendarRef"]>) => CalendarBackend;
};

/** Pick the backend for a deployment's booking binding. book_external requires a
 *  CONNECTED calendar (calendarRef.accountId); until then we fall back to native
 *  so a live call never breaks. */
export function resolveCalendarBackend(binding: CalendarBinding | undefined, deps: ResolveDeps): CalendarBackend {
  if (binding?.mode === "book_external" && binding.calendarRef?.accountId) {
    return deps.makeComposio(binding.calendarRef);
  }
  return deps.makeNative();
}
