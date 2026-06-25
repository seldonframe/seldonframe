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

  return {
    async findDayAvailability(q: AvailabilityQuery): Promise<{ slots: LabeledSlot[] }> {
      try {
        const timeMin = `${q.date}T00:00:00`;
        const timeMax = `${q.date}T23:59:59`;
        const res = await deps.callTool(slug.free, {
          calendar_id: calendarId,
          time_min: timeMin,
          time_max: timeMax,
          timezone: q.timezone,
        });
        const windows = extractFreeWindows(res);
        if (windows.length === 0) return { slots: [] };
        const slots = windows.flatMap((w) =>
          quantizeWindow(w, q.durationMinutes, q.timezone),
        );
        return { slots };
      } catch {
        // Empty = caller falls back to native availability.
        return { slots: [] };
      }
    },

    async createEvent(
      input: CreateEventInput,
    ): Promise<{ ok: true; eventRef: string } | { ok: false; error: string }> {
      try {
        const res = await deps.callTool(slug.create, {
          calendar_id: calendarId,
          start_datetime: input.startIso,
          event_duration_minutes: input.durationMinutes,
          summary: input.title,
          attendees: input.attendee.email ? [input.attendee.email] : [],
          description: input.notes ?? "",
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
