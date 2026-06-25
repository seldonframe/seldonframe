// Composio calendar adapter (Task 3).
//
// Implements CalendarBackend by booking into the CLIENT's own connected calendar
// (Google / Outlook) through Composio. The single dependency is an injected
// `callTool(slug, args)` — the real impl (wired in a later task) dials Composio's
// MCP-over-HTTP `tools/call` for the client's connected account. Keeping it
// injected means this adapter stays pure and unit-testable with no network.
//
// Fail-soft is the WHOLE point: no method may throw. Every error path returns a
// typed failure (createEvent → { ok: false, error }) or empty slots
// (findDayAvailability → { slots: [] }), so the resolveCalendarBackend seam can
// fall back to the native backend and a live call never breaks.

import type {
  AvailabilityQuery,
  CalendarBackend,
  CreateEventInput,
  FreeWindow,
  LabeledSlot,
} from "./calendar-backend";

export type ComposioBackendDeps = {
  provider: "googlecalendar" | "outlook";
  /** Composio connectedAccountId — reserved for future use / logging. */
  accountId: string;
  /** Defaults to "primary". */
  calendarId?: string;
  callTool: (slug: string, args: Record<string, unknown>) => Promise<any>;
};

/** Per-provider Composio action slugs. The create slugs are confirmed in the
 *  repo catalog; the free-slots slugs are a best-guess pending live verification. */
const SLUGS = {
  googlecalendar: {
    create: "GOOGLECALENDAR_CREATE_EVENT",
    // TODO(T11): verify free-slots slug live
    free: "GOOGLECALENDAR_FIND_FREE_SLOTS",
  },
  outlook: {
    create: "OUTLOOK_CALENDAR_CREATE_EVENT",
    // TODO(T11): verify free-slots slug live
    free: "OUTLOOK_CALENDAR_GET_SCHEDULE",
  },
} as const;

/** Format a UTC ISO instant as a human label in the given IANA timezone,
 *  e.g. "Tue, Jul 1, 9:00 AM". Falls back to the raw ISO if the zone or the
 *  timestamp can't be formatted (never throws). */
function formatSlotLabel(iso: string, timeZone: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(d);
  } catch {
    return iso;
  }
}

/** Pull an array of free windows out of a few plausible Composio response
 *  shapes. Returns [] for anything unrecognized — the caller then falls back
 *  to native availability. Each window is { start, end } as ISO strings. */
function extractFreeWindows(res: any): Array<{ start: string; end: string }> {
  // Google free/busy via `tools.execute("GOOGLECALENDAR_FIND_FREE_SLOTS")`:
  //   res.data.calendars.<calendarId>.free = [{ start, end }, ...]   (ISO w/ TZ)
  const calendars = res?.data?.calendars;
  if (calendars && typeof calendars === "object") {
    const fromCalendars: Array<{ start: string; end: string }> = [];
    for (const cal of Object.values(calendars)) {
      const free = (cal as any)?.free;
      if (!Array.isArray(free)) continue;
      for (const w of free) {
        const start = (w as any)?.start;
        const end = (w as any)?.end;
        if (typeof start === "string" && typeof end === "string") {
          fromCalendars.push({ start, end });
        }
      }
    }
    if (fromCalendars.length > 0) return fromCalendars;
  }
  // Fallbacks for other shapes (Outlook / future actions).
  const candidates: unknown[] = [
    res?.data?.free_slots,
    res?.data?.freeSlots,
    res?.data?.free,
    res?.data?.slots,
    res?.data?.windows,
  ];
  const raw = candidates.find((c) => Array.isArray(c)) as unknown[] | undefined;
  if (!raw) return [];
  const out: Array<{ start: string; end: string }> = [];
  for (const w of raw) {
    if (!w || typeof w !== "object") continue;
    const start = (w as any).start ?? (w as any).start_time ?? (w as any).startTime;
    const end = (w as any).end ?? (w as any).end_time ?? (w as any).endTime;
    if (typeof start === "string" && typeof end === "string") out.push({ start, end });
  }
  return out;
}

/** Quantize a free window into back-to-back slots of `durationMinutes`,
 *  emitting one LabeledSlot per whole interval that fits inside [start, end). */
function quantizeWindow(
  window: { start: string; end: string },
  durationMinutes: number,
  timezone: string,
): LabeledSlot[] {
  const slots: LabeledSlot[] = [];
  const startMs = new Date(window.start).getTime();
  const endMs = new Date(window.end).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return slots;
  const stepMs = Math.max(1, durationMinutes) * 60_000;
  for (let t = startMs; t + stepMs <= endMs; t += stepMs) {
    const iso = new Date(t).toISOString();
    slots.push({ iso, label: formatSlotLabel(iso, timezone) });
  }
  return slots;
}

/** Build a Composio-backed CalendarBackend over the injected `callTool`.
 *  Both methods are fail-soft: a thrown error or unrecognized shape degrades to
 *  a typed failure / empty slots so the seam can fall back to native. */
export function makeComposioCalendarBackend(deps: ComposioBackendDeps): CalendarBackend {
  const slug = SLUGS[deps.provider];
  const calendarId = deps.calendarId ?? "primary";

  /** Fetch + normalize the day's FREE windows from Composio. Fail-soft: any
   *  thrown error / unrecognized shape → []. Shared by findDayAvailability (which
   *  quantizes them into slots) and findFreeWindows (which exposes them raw so the
   *  booking policy can intersect its candidate slots with real availability). */
  async function fetchFreeWindows(q: AvailabilityQuery): Promise<FreeWindow[]> {
    try {
      const res = await deps.callTool(slug.free, {
        calendar_id: calendarId,
        time_min: `${q.date}T00:00:00`,
        time_max: `${q.date}T23:59:59`,
        timezone: q.timezone,
      });
      return extractFreeWindows(res);
    } catch {
      return [];
    }
  }

  return {
    async findDayAvailability(q: AvailabilityQuery): Promise<{ slots: LabeledSlot[] }> {
      const windows = await fetchFreeWindows(q);
      const slots = windows.flatMap((w) =>
        quantizeWindow(w, q.durationMinutes, q.timezone),
      );
      return { slots };
    },

    async findFreeWindows(q: AvailabilityQuery): Promise<FreeWindow[]> {
      return fetchFreeWindows(q);
    },

    async createEvent(
      input: CreateEventInput,
    ): Promise<{ ok: true; eventRef: string } | { ok: false; error: string }> {
      try {
        // Build a meaningful event: "<title> — <caller>" + a details block, so
        // the calendar entry isn't a bare "default" with no context.
        const name = input.attendee.name?.trim();
        const summary = name ? `${input.title} — ${name}` : input.title;
        const description = [
          name ? `Booked by ${name}` : null,
          input.attendee.phone ? `Phone: ${input.attendee.phone}` : null,
          input.attendee.email ? `Email: ${input.attendee.email}` : null,
          input.notes ? `Notes: ${input.notes}` : null,
          "Booked by the AI receptionist via SeldonFrame.",
        ]
          .filter(Boolean)
          .join("\n");
        const res = await deps.callTool(slug.create, {
          calendar_id: calendarId,
          start_datetime: input.startIso,
          // Composio's GOOGLECALENDAR_CREATE_EVENT caps event_duration_minutes at
          // 59 (it has a SEPARATE event_duration_hour field) — so a 60-min slot
          // must be sent as 1h/0m, not 60 minutes (which 400s "≤ 59").
          event_duration_hour: Math.floor(input.durationMinutes / 60),
          event_duration_minutes: input.durationMinutes % 60,
          summary,
          attendees: input.attendee.email ? [input.attendee.email] : [],
          description,
        });
        // The MCP client (createMcpClient.callTool) THROWS on a tool error /
        // isError:true, so a RETURN here means the event was created. We still
        // honor an explicit SDK-shape `successful:false` defensively. The event
        // id is extracted from whichever response shape Composio returns (SDK
        // {data.id} or MCP {content:[{text}]}); a missing id is non-fatal (the
        // event exists). T12 confirms the exact live MCP content shape.
        if (res && typeof res === "object" && (res as { successful?: unknown }).successful === false) {
          return { ok: false, error: "create_failed" };
        }
        return { ok: true, eventRef: extractEventId(res) };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "composio_error" };
      }
    },
  };
}

/** Best-effort event-id extraction across Composio response shapes: the SDK
 *  `{data:{id}}` / `{id}` / `{response_data:{id}}` and the MCP `{content:[{text}]}`
 *  (text is usually JSON carrying the created event). Returns "" when no id is
 *  discoverable — the event still exists (callTool throws on real failure). The
 *  exact live MCP content shape is confirmed in T12. */
function extractEventId(res: unknown): string {
  if (!res || typeof res !== "object") return "";
  const r = res as Record<string, unknown>;
  const data = r.data as Record<string, unknown> | undefined;
  const responseData = r.response_data as Record<string, unknown> | undefined;
  if (data?.id != null) return String(data.id);
  if (r.id != null) return String(r.id);
  if (responseData?.id != null) return String(responseData.id);
  const content = r.content;
  if (Array.isArray(content)) {
    const textPart = content.find(
      (c): c is { text: string } => typeof (c as { text?: unknown })?.text === "string",
    );
    if (textPart) {
      try {
        const parsed = JSON.parse(textPart.text) as Record<string, unknown>;
        const pData = parsed.data as Record<string, unknown> | undefined;
        const pResp = parsed.response_data as Record<string, unknown> | undefined;
        return String(parsed.id ?? pData?.id ?? pResp?.id ?? "");
      } catch {
        // text isn't JSON — no id to extract.
      }
    }
  }
  return "";
}
