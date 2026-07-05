// Task 8 — push new bookings into the org's OWN connected Google/Outlook
// calendar via Composio (org-level connection, /integrations surface), so a
// booking that lands in SeldonFrame also lands where the operator actually
// looks: their real calendar. This is DIFFERENT from booking-invite.ts (which
// emails an .ics to everyone) — this pushes a live event via Composio's
// managed-OAuth connection when one exists, and is a complete no-op otherwise.
//
// FAIL-SOFT BY DESIGN: this must never disturb the booking flow. No connection
// → silent no-op (the common case — most orgs haven't connected a calendar
// yet, so this must not spam logs). Any other failure (throw, bad shape) is
// swallowed and logged via the existing logEvent helper (no PII — never log
// customer phone/email).
//
// KNOWN CAVEAT (recorded in project memory): the Composio calendar action
// slug + response shape has never been live-smoked end-to-end for this
// org-level path (only the per-deployment entity path in
// agents/booking/composio-calendar-backend.ts has partial confirmation, and
// even that flags free-slots slugs as best-guess). If GOOGLECALENDAR_CREATE_EVENT
// or the response shape differs from what's coded here, this module degrades
// to a logged no-op (never a thrown error into the booking flow) — but it
// means the push silently doesn't happen. The deploy smoke test for this task
// MUST exercise one real push against a connected test org to confirm the
// slug + userId/connectedAccountId argument shape actually creates an event.
//
// INVESTIGATION FINDING (this task): the codebase has ONE existing pattern for
// executing a Composio calendar action directly (not via the MCP tool-router,
// which only exposes COMPOSIO_SEARCH_TOOLS in per-deployment sessions) — see
// packages/crm/src/lib/agents/tools.ts `buildCalendarBackendDeps.makeComposio`:
// it lazily imports `@composio/core`, resolves the API key via
// resolveComposioKey, constructs `new Composio({ apiKey })`, and calls
// `composio.tools.execute(slug, { userId, connectedAccountId, arguments })`
// directly (bypassing the MCP session entirely). That is shape (a) from the
// brief. This module reuses composioForOrg (already does the same
// resolveComposioKey + `new Composio({apiKey})` construction) and calls
// `composio.tools.execute` the same way, scoped to the ORG's own user_id
// (orgId) and the org-level connectedAccountId from listConnections — the
// /integrations surface's connection model, NOT a deployment entity.

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { composioForOrg, listConnections } from "@/lib/integrations/composio/client";
import { logEvent } from "@/lib/observability/log";

export type CalendarProvider = "googlecalendar" | "outlook";

/** Per-provider Composio create-event action slug. Mirrors the slugs used by
 *  the per-deployment Composio calendar backend (composio-calendar-backend.ts)
 *  — kept in sync there; NOT yet live-confirmed for the org-level path. */
const CREATE_EVENT_SLUG: Record<CalendarProvider, string> = {
  googlecalendar: "GOOGLECALENDAR_CREATE_EVENT",
  outlook: "OUTLOOK_CALENDAR_CREATE_EVENT",
};

export type CalendarConnection = {
  provider: CalendarProvider;
  connectedAccountId: string;
};

export type BookingForPush = {
  title: string;
  fullName: string | null;
  /** Loaded for completeness but MUST NEVER be included in the event payload
   *  sent to Composio — calendar events sync widely (privacy). */
  email: string | null;
  phone: string | null;
  startsAt: Date;
  endsAt: Date;
};

export type CreateEventArgs = {
  orgId: string;
  provider: CalendarProvider;
  connectedAccountId: string;
  summary: string;
  description: string;
  startIso: string;
  endIso: string;
};

export type PushBookingToConnectedCalendarInput = {
  orgId: string;
  bookingId: string;
};

export type PushBookingToConnectedCalendarResult =
  | { pushed: true }
  | { pushed: false; reason: "no_connection" | "no_booking" | "push_failed" };

export type CalendarPushDeps = {
  /** Resolve the org's own connected Google/Outlook calendar, or null when
   *  none is connected. Prefers googlecalendar, falling back to outlook. */
  getConnection: (orgId: string) => Promise<CalendarConnection | null>;
  /** Execute the create-event action against Composio. Throws on failure —
   *  the caller catches and degrades to { pushed:false }. */
  executeCreateEvent: (args: CreateEventArgs) => Promise<unknown>;
  /** Load the booking row needed to build the event payload, or null if the
   *  booking can't be found (e.g. deleted between event emit and this call). */
  loadBooking: (orgId: string, bookingId: string) => Promise<BookingForPush | null>;
  /** Injectable for tests; defaults to the shared logEvent helper. */
  logEvent: (event: string, data?: Record<string, unknown>) => void;
};

// M2 latency fix (2026-07-05) — most orgs have never connected a calendar,
// so every single booking.created was paying a full Composio
// listConnections() round-trip (network call) just to learn "no
// connection" — the common case. This module-level, per-instance memo
// short-circuits that round-trip: once we've resolved "no connection" (or
// resolved a connection) for an org, we reuse the answer for TTL_MS before
// asking Composio again.
//
// Deliberately simple (v1): in-memory, per-lambda-instance only — it does
// NOT survive across serverless instances/cold starts, and a fresh instance
// always does one real lookup. That's fine: the goal is cutting the common
// "N bookings in a row, same org, no connection" cost, not a perfect cache.
// A stale `false` for up to TTL_MS right after an org's FIRST-EVER connect
// is acceptable — the next booking after the memo expires (or the next
// cold start) will see the real connection and push then.
const CONNECTION_MEMO_TTL_MS = 5 * 60 * 1000; // 5 minutes
const connectionMemo = new Map<string, { connection: CalendarConnection | null; at: number }>();

/** Test-only escape hatch — clears the module-level memo between specs. */
export function __resetCalendarPushMemoForTests(): void {
  connectionMemo.clear();
}

/**
 * TTL-memoized wrapper around a (possibly expensive/network-bound) per-org
 * connection resolver. Extracted as its own function (rather than inlined
 * in `defaultGetConnection`) so it's directly unit-testable with a fake
 * `resolve` — no DB/Composio required — while production wires the real
 * `composioForOrg` + `listConnections` lookup through it unchanged.
 */
export async function memoizedGetConnection(
  orgId: string,
  resolve: (orgId: string) => Promise<CalendarConnection | null>,
): Promise<CalendarConnection | null> {
  const cached = connectionMemo.get(orgId);
  if (cached && Date.now() - cached.at < CONNECTION_MEMO_TTL_MS) {
    return cached.connection;
  }

  const resolved = await resolve(orgId);
  connectionMemo.set(orgId, { connection: resolved, at: Date.now() });
  return resolved;
}

/** Default connection resolver: reads the org's live Composio connections via
 *  the same listConnections used by the /integrations dashboard, preferring
 *  googlecalendar over outlook when both happen to be connected. Memoized
 *  per-org for CONNECTION_MEMO_TTL_MS to avoid a Composio round-trip on
 *  every booking for orgs with no (or an already-known) connection. */
async function defaultGetConnection(orgId: string): Promise<CalendarConnection | null> {
  return memoizedGetConnection(orgId, async (id) => {
    const composio = await composioForOrg(id);
    if (!composio) return null;
    const connections = await listConnections(id, { client: composio });
    const byPreference: CalendarProvider[] = ["googlecalendar", "outlook"];
    for (const provider of byPreference) {
      const match = connections.find((c) => c.slug === provider && c.connected && c.connectedAccountId);
      if (match?.connectedAccountId) {
        return { provider, connectedAccountId: match.connectedAccountId };
      }
    }
    return null;
  });
}

/** Default create-event executor: direct Composio SDK `tools.execute`, the
 *  same shape as buildCalendarBackendDeps.makeComposio in agents/tools.ts,
 *  scoped to the ORG's own user_id (no deployment entity). */
async function defaultExecuteCreateEvent(args: CreateEventArgs): Promise<unknown> {
  const composio = await composioForOrg(args.orgId);
  if (!composio) throw new Error("composio_key_unavailable");
  const slug = CREATE_EVENT_SLUG[args.provider];
  return composio.tools.execute(slug, {
    userId: args.orgId,
    connectedAccountId: args.connectedAccountId,
    dangerouslySkipVersionCheck: true,
    arguments: {
      calendar_id: "primary",
      start_datetime: args.startIso,
      end_datetime: args.endIso,
      summary: args.summary,
      description: args.description,
    },
  });
}

/** Default booking loader: pulls just the fields needed for the event
 *  payload. Never includes phone/email in the returned object's use beyond
 *  passing them along — the CALLER is responsible for excluding them from
 *  the Composio payload (enforced below). */
async function defaultLoadBooking(orgId: string, bookingId: string): Promise<BookingForPush | null> {
  const [row] = await db
    .select({
      title: bookings.title,
      fullName: bookings.fullName,
      email: bookings.email,
      startsAt: bookings.startsAt,
      endsAt: bookings.endsAt,
    })
    .from(bookings)
    .where(and(eq(bookings.id, bookingId), eq(bookings.orgId, orgId)))
    .limit(1);
  if (!row) return null;
  return {
    title: row.title,
    fullName: row.fullName ?? null,
    email: row.email ?? null,
    // bookings has no dedicated phone column visible to this loader (the
    // BookingForPush.phone slot exists for callers that may extend metadata
    // later); left null here since it isn't queried.
    phone: null,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
  };
}

export const defaultDeps: CalendarPushDeps = {
  getConnection: defaultGetConnection,
  executeCreateEvent: defaultExecuteCreateEvent,
  loadBooking: defaultLoadBooking,
  logEvent,
};

/** Build the workspace admin URL referenced in the event description. Never
 *  includes any customer PII — just the org-scoped dashboard deep link. */
function adminUrlFor(orgId: string): string {
  return `https://app.seldonframe.com/dashboard?workspace=${orgId}`;
}

/**
 * Push a newly created booking into the org's own connected Google/Outlook
 * calendar via Composio. Fail-soft: NEVER throws. Silent no-op (no error log)
 * when the org has no connection — that is the common, expected case.
 */
export async function pushBookingToConnectedCalendar(
  input: PushBookingToConnectedCalendarInput,
  deps: CalendarPushDeps = defaultDeps,
): Promise<PushBookingToConnectedCalendarResult> {
  try {
    const connection = await deps.getConnection(input.orgId);
    if (!connection) {
      // Common case — no org-level calendar connected yet. Silent: no log.
      return { pushed: false, reason: "no_connection" };
    }

    const booking = await deps.loadBooking(input.orgId, input.bookingId);
    if (!booking) {
      // Booking vanished between event emit and this call — silent no-op,
      // nothing actionable to log (not a Composio failure).
      return { pushed: false, reason: "no_booking" };
    }

    const summary = booking.fullName
      ? `${booking.title} — ${booking.fullName}`
      : booking.title;
    // NEVER include booking.email / booking.phone here — calendar events
    // sync widely across the operator's devices/shares (privacy).
    const description = [
      "Booked via SeldonFrame.",
      `View in your workspace: ${adminUrlFor(input.orgId)}`,
    ].join("\n");

    await deps.executeCreateEvent({
      orgId: input.orgId,
      provider: connection.provider,
      connectedAccountId: connection.connectedAccountId,
      summary,
      description,
      startIso: booking.startsAt.toISOString(),
      endIso: booking.endsAt.toISOString(),
    });

    return { pushed: true };
  } catch (err) {
    // Any failure (connection lookup, Composio execute, unexpected shape)
    // degrades to a logged no-op. No PII in the log payload.
    deps.logEvent("calendar_push_failed", {
      orgId: input.orgId,
      bookingId: input.bookingId,
      error: err instanceof Error ? err.message.slice(0, 200) : "unknown_error",
    });
    return { pushed: false, reason: "push_failed" };
  }
}
