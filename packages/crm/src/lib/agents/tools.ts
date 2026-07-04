// v1.26.0 — agent tool allowlist (typed callable tools the LLM uses)
//
// Each tool is { name, description, inputSchema, execute }. The
// runtime exposes inputSchema to Anthropic via the tool-use API,
// validates inputs at the harness layer (Zod), and routes execute()
// through the existing CRM primitives (submitPublicBookingAction,
// listPublicBookingSlotsAction, etc.) — same source of truth, same
// security guardrails, same activity-bridge wiring.
//
// Tool execution is workspace-scoped: every tool receives orgId +
// agentId from the runtime, never trusts the LLM's word for which
// workspace's data to read/write.

import { and, eq, gte, ilike, or } from "drizzle-orm";
import { PUBLIC_BOOKING_WINDOW_DAYS } from "@/lib/bookings/booking-window";
import { z } from "zod";
import { db } from "@/db";
import { activities, agents, bookings, contacts, users } from "@/db/schema";
import { listPublicBookingSlotsAction } from "@/lib/bookings/actions";
import type { AgentBlueprint } from "@/db/schema/agents";
import type {
  CalendarBackend,
  CalendarBinding,
} from "@/lib/agents/booking/calendar-backend";
import { resolveCalendarBackend } from "@/lib/agents/booking/calendar-backend";
import { makeNativeCalendarBackend } from "@/lib/agents/booking/native-calendar-backend";
import { makeComposioCalendarBackend } from "@/lib/agents/booking/composio-calendar-backend";
import {
  type BookingPolicy,
  generateCandidateSlots,
  resolveBookingPolicy,
  slotFitsFreeWindows,
} from "@/lib/agents/booking/booking-policy";
import { COPILOT_CAPABILITY } from "@/lib/agents/copilot/tools";

export type ToolExecuteContext = {
  orgId: string;
  orgSlug: string;
  agentId: string;
  conversationId: string;
  /** True for status='test' conversations: tool execution returns
   *  synthetic responses, no DB writes. */
  testMode: boolean;
  /** voice-only — the caller's phone number from the inbound call's caller ID
   *  (From / P-Asserted-Identity SIP headers). Set by the voice webhook after
   *  the workspace resolves; undefined for anonymous/blocked callers and for
   *  every non-voice surface (web booking, text chatbot never set it).
   *  book_appointment uses it to auto-fill the contact phone when the model
   *  didn't collect one — so the caller never has to be asked for the number
   *  the call already carries. A model-supplied phone still wins. */
  callerPhone?: string;
  /** The workspace's IANA timezone (e.g. "America/Toronto"), set by the voice
   *  webhook after the persona inputs load. Used to format spoken times in the
   *  booking/reschedule read-backs so the caller hears "June 25 at 9:00 AM EDT"
   *  instead of the raw UTC ISO. Web/text callers may omit it → formatting
   *  falls back to UTC, still human-readable, never a raw ISO. */
  timezone?: string;
  /** DEPLOYED-agent only (ICP-3). How this deployment books: `native` →
   *  the existing availability + booking chain (unchanged); `external_link`
   *  → the agent hands off the client's own booking URL; `api_mcp` / `cal_com`
   *  → capture-the-lead handoff (real adapters TBD). ABSENT for workspace /
   *  operator agents, so their booking tools keep the byte-for-byte native
   *  path (the tool branch reads `ctx.booking?.mode ?? "native"`). */
  booking?: {
    mode: import("@/lib/deployments/booking-providers").BookingMode;
    externalUrl?: string | null;
    /** ICP-3 pluggable calendar backend (Task 4). When `binding.mode` is
     *  `book_external` AND the client's calendar is connected
     *  (`calendarRef.accountId`), the native booking tools route through the
     *  CalendarBackend seam — booking into / reading availability from the
     *  CLIENT's own Google/Outlook calendar via Composio, behind the exact same
     *  tool surface. Absent (or any other binding mode) keeps the byte-for-byte
     *  native path. The `mode` field above is the legacy handoff selector
     *  (external_link/api_mcp/cal_com) and is independent of this binding. */
    binding?: CalendarBinding;
    /** The RESOLVED per-client booking policy (P1, 2026-06-25): appointment
     *  duration, buffer, daily cap, lead time, business-hours window
     *  (weekdays + start/end + tz), and required-fields gate. Threaded by the
     *  voice + chat/SMS/email callers via resolveBookingPolicy → bindingToCtxBooking.
     *  look_up_availability shapes its offered slots from this (candidate window ∩
     *  real free/busy, capped at maxPerDay); book_appointment gates on
     *  requiredFields + books at policy.durationMinutes. ABSENT → the tools fall
     *  back to resolveBookingPolicy(null, null, ctx.timezone) (system defaults). */
    policy?: BookingPolicy;
  };
};

export type AgentTool<I = unknown, O = unknown> = {
  name: string;
  description: string;
  inputSchema: z.ZodType<I>;
  /** JSON Schema shape for Anthropic's tool-use API. Generated from
   *  the Zod schema, but Anthropic expects raw JSON Schema. */
  jsonSchema: Record<string, unknown>;
  execute: (input: I, ctx: ToolExecuteContext) => Promise<O>;
};

// ─── look_up_availability ──────────────────────────────────────────────────

const lookUpAvailabilityInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD"),
  bookingSlug: z.string().optional(),
});

// 2026-05-22 — chatbot UX cap. Surfacing 6+ slots in a chat bubble
// overwhelms visitors and tanks pick-rate (Hick's law: more options =
// slower / no decision). Three is the sweet spot for chat — enough to
// feel like a real offer, few enough to read in one glance.
//
// This is the CHATBOT cap only. The /book/[slug] public booking page
// still shows every slot (different surface, different UX). The
// `check_availability` tool in tool-invoker.ts (automations path)
// has its own caller-controlled limit and is NOT affected.
//
// 2026-05-22 (later same day) — "if today only has 1 slot, the
// chatbot only offers 1 slot, which feels broken" — so the tool now
// WALKS forward day-by-day, accumulating up to 3 slots total, capped
// at a 14-day horizon (same as check_availability). This way the
// chatbot can always say "the next 3 available slots are…" — even
// when the requested day is mostly booked.
export const CHATBOT_SLOT_CAP = 3;

// Mirrors the public booking window (PUBLIC_BOOKING_WINDOW_DAYS) that
// listPublicBookingSlotsAction enforces — requests outside today..today+N
// return empty. Keeping the walk horizon equal to that window means the
// chatbot surfaces the same far-out slots the booking page offers (e.g. a
// workspace whose first availability is 3 weeks out) and never burns an
// iteration on a date the action would trivially reject. The walk still
// stops early once CHATBOT_SLOT_CAP slots are found.
export const CHATBOT_WALK_HORIZON_DAYS = PUBLIC_BOOKING_WINDOW_DAYS;

/**
 * Pure helper — walks forward day-by-day starting from `startDate`,
 * accumulating slots from each day's `fetchSlotsForDay()` until either
 * `maxSlots` are collected or `maxDaysToWalk` days have been queried.
 *
 * Why pure + injected fetcher: lets the unit tests exercise the walk
 * math (sparse days, hitting the horizon, partial fills, ordering)
 * without spinning up DB / Next runtime / Anthropic client. The
 * runtime tool wraps `listPublicBookingSlotsAction` in a closure that
 * matches the fetcher shape.
 *
 * Date stepping is in UTC by 24-hour increments. The downstream
 * `listPublicBookingSlotsAction` resolves the date string back to the
 * workspace's local day, so DST shifts only ever slip the boundary
 * within the same calendar day (the action handles its own
 * workspace-TZ math).
 */
export async function findNextAvailableSlots(opts: {
  startDate: Date;
  maxSlots: number;
  maxDaysToWalk: number;
  fetchSlotsForDay: (date: Date) => Promise<readonly string[]>;
}): Promise<string[]> {
  const collected: string[] = [];
  const dayMs = 24 * 60 * 60 * 1000;

  for (let i = 0; i < opts.maxDaysToWalk; i += 1) {
    if (collected.length >= opts.maxSlots) {
      break;
    }
    const date = new Date(opts.startDate.getTime() + i * dayMs);
    const daySlots = await opts.fetchSlotsForDay(date);
    const remaining = opts.maxSlots - collected.length;
    // Take only what fits — never push past maxSlots even if the day
    // returned more than we need.
    for (let j = 0; j < daySlots.length && j < remaining; j += 1) {
      collected.push(daySlots[j]!);
    }
  }

  return collected;
}

/**
 * Format a Date as `YYYY-MM-DD` in UTC. Matches the input shape
 * `listPublicBookingSlotsAction` expects. Pure helper.
 */
function formatDateYYYYMMDD(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * A bookable slot as the agent sees it: a human-readable `label` to SPEAK
 * / show, and the machine `iso` to pass back to book_appointment verbatim.
 */
export type LabeledSlot = { iso: string; label: string };

/**
 * Format a UTC ISO slot string into a spoken label in the workspace's IANA
 * timezone — e.g. `formatSlotLabel("2026-06-01T17:00:00Z", "America/Los_Angeles")`
 * → "Monday, June 1 at 10:00 AM PDT".
 *
 * WHY this exists: look_up_availability returns slots as UTC ISO strings.
 * Before this helper the agent read the raw "T17:00:00Z" and spoke the UTC
 * hour ("5pm") even when the workspace is in Pacific — where 17:00Z is
 * 10:00 AM. LLMs do timezone arithmetic unreliably (the chatbot's own
 * temporal-reasoning skill explicitly warns against computing slot times),
 * so we format the spoken label SERVER-SIDE and hand the agent a ready
 * string. The machine `iso` still travels to book_appointment unchanged, so
 * the booking is unambiguous regardless of the caller's timezone.
 *
 * Pure (Intl.DateTimeFormat). Defensive:
 *   - a malformed `iso` echoes back unchanged (a bad slot never crashes a call)
 *   - an unknown `timeZone` falls back to UTC (still emits a usable label)
 */
export function formatSlotLabel(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const opts: Intl.DateTimeFormatOptions = {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  };
  try {
    return new Intl.DateTimeFormat("en-US", { ...opts, timeZone }).format(date);
  } catch {
    // Invalid/unknown IANA zone — never throw mid-call; label in UTC.
    return new Intl.DateTimeFormat("en-US", { ...opts, timeZone: "UTC" }).format(date);
  }
}

/**
 * Map raw UTC ISO slot strings to {iso, label} pairs, labelling each in the
 * workspace timezone. The agent reads `label`; book_appointment receives
 * `iso` verbatim.
 */
export function labelSlots(slots: readonly string[], timeZone: string): LabeledSlot[] {
  return slots.map((iso) => ({ iso, label: formatSlotLabel(iso, timeZone) }));
}

// ─── pluggable calendar backend wiring (ICP-3, Task 4) ─────────────────────
//
// The booking tools talk to a CalendarBackend (find availability / create
// event) rather than hard-wiring the native booking store. resolveCalendarBackend
// picks the backend from the deployment's `ctx.booking.binding`:
//   - book_external + a CONNECTED calendar → the Composio backend (books into
//     the CLIENT's own Google/Outlook calendar over MCP)
//   - anything else (native, or book_external before the OAuth connect lands)
//     → the native backend (the existing booking chain)
//
// This factory builds the ResolveDeps. makeNative wraps the SAME availability
// + submit primitives the native tool path uses today; makeComposio dials a
// fresh Composio MCP session per call (lazily — no network until used).

/** Build the ResolveDeps for resolveCalendarBackend from a tool context.
 *  `listSlots` / `submitBooking` are the native primitives (injected so tests
 *  can fake them). The Composio backend resolves a live session lazily inside
 *  its own callTool, so constructing this does NO network work. */
export function buildCalendarBackendDeps(
  ctx: ToolExecuteContext,
  bookingSlug: string,
  nativeSubmit: NativeBackendSubmit,
  nativeListSlots: NativeBackendListSlots,
): {
  makeNative: () => CalendarBackend;
  makeComposio: (
    ref: NonNullable<CalendarBinding["calendarRef"]>,
  ) => CalendarBackend;
} {
  return {
    makeNative: () =>
      makeNativeCalendarBackend({
        orgSlug: ctx.orgSlug,
        bookingSlug,
        listSlots: nativeListSlots,
        submitBooking: nativeSubmit,
      }),
    makeComposio: (ref) =>
      makeComposioCalendarBackend({
        provider: ref.provider,
        accountId: ref.accountId,
        calendarId: ref.calendarId,
        callTool: async (slug, args) => {
          // Execute the calendar action via the Composio SDK — NOT the MCP
          // session. The per-deployment MCP session runs in "tool-router" mode
          // (it exposes only COMPOSIO_SEARCH_TOOLS / _MULTI_EXECUTE_TOOL, so a
          // direct callTool("GOOGLECALENDAR_…") 404s "tool not found"). The SDK's
          // tools.execute hits the action directly: the agency's Composio KEY
          // (ref.ownerOrgId), the DEPLOYMENT as the entity (ref.entityUserId), and
          // the specific connected account (ref.accountId).
          // dangerouslySkipVersionCheck uses the toolkit's latest version (none
          // pinned). Lazy import keeps the Node SDK off the eager module graph.
          const [{ Composio }, { resolveComposioKey }] = await Promise.all([
            import("@composio/core"),
            import("@/lib/integrations/composio/keys"),
          ]);
          const keyOrg = ref.ownerOrgId ?? ctx.orgId;
          const { apiKey } = await resolveComposioKey(keyOrg);
          if (!apiKey) throw new Error("composio_key_unavailable");
          const composio = new Composio({ apiKey });
          return composio.tools.execute(slug, {
            userId: ref.entityUserId ?? keyOrg,
            connectedAccountId: ref.accountId,
            dangerouslySkipVersionCheck: true,
            arguments: args,
          });
        },
      }),
  };
}

/** The native availability primitive shape (matches makeNativeCalendarBackend's
 *  `listSlots` dep, i.e. listPublicBookingSlotsAction). */
type NativeBackendListSlots = (a: {
  orgSlug: string;
  bookingSlug: string;
  date: string;
}) => Promise<{
  slots: string[];
  durationMinutes: number;
  workspaceTimezone?: string;
}>;

/** The native submit primitive shape (matches makeNativeCalendarBackend's
 *  `submitBooking` dep). Returns the backend's typed `{ ok, bookingId, error }`. */
type NativeBackendSubmit = (a: {
  orgSlug: string;
  bookingSlug: string;
  fullName: string;
  email?: string;
  notes?: string;
  startsAt: string;
  intakeResponses?: Record<string, string>;
}) => Promise<{ ok: boolean; bookingId?: string; error?: string }>;

/** Injectable seam for look_up_availability (per-client booking policy, P1):
 *  lets a unit test inject a fake CalendarBackend (free windows) + a fake native
 *  list-slots without any network / DB. Defaults are the real
 *  `resolveCalendarBackend` and `listPublicBookingSlotsAction`. Consulted by both
 *  the book_external (free-windows ∩ candidates) and native (slots ∩ candidates)
 *  paths; production passes no deps so the defaults are used unchanged. */
export type LookUpAvailabilityDeps = {
  resolveBackend?: (
    binding: CalendarBinding | undefined,
    deps: {
      makeNative: () => CalendarBackend;
      makeComposio: (
        ref: NonNullable<CalendarBinding["calendarRef"]>,
      ) => CalendarBackend;
    },
  ) => CalendarBackend;
  listSlots?: NativeBackendListSlots;
};

export const lookUpAvailability: AgentTool<
  z.infer<typeof lookUpAvailabilityInput>,
  // Native result, OR a booking-mode handoff (ICP-3, deployed agents on a
  // non-native mode — no slot lookup, just the handoff message/url).
  | { slots: LabeledSlot[]; durationMinutes: number; date: string; timezone: string }
  | { bookingHandoff: "external_link" | "followup"; message: string; url?: string | null }
> & {
  execute: (
    input: z.infer<typeof lookUpAvailabilityInput>,
    ctx: ToolExecuteContext,
    deps?: LookUpAvailabilityDeps,
  ) => Promise<
    | { slots: LabeledSlot[]; durationMinutes: number; date: string; timezone: string }
    | { bookingHandoff: "external_link" | "followup"; message: string; url?: string | null }
  >;
} = {
  name: "look_up_availability",
  description:
    "Get the next available appointment slots starting from a given date. Walks forward day-by-day, accumulating up to 3 slots total across at most 14 days. Returns `slots` as {iso, label} pairs PLUS the workspace `timezone`. `label` is the time already converted to the BUSINESS'S local timezone and ready to read aloud / show (e.g. 'Monday, June 1 at 10:00 AM PDT') — ALWAYS quote the `label`, never the raw `iso`, and never convert times yourself. `iso` is the machine timestamp — pass it VERBATIM to book_appointment as slotIso.",
  inputSchema: lookUpAvailabilityInput,
  jsonSchema: {
    type: "object",
    properties: {
      date: {
        type: "string",
        description: "Date to START searching from, YYYY-MM-DD. The tool walks forward from this date until it collects 3 slots or hits the 14-day horizon.",
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
      },
      bookingSlug: {
        type: "string",
        description: "Optional booking type slug (default: 'default')",
      },
    },
    required: ["date"],
  },
  execute: async (input, ctx, deps: LookUpAvailabilityDeps = {}) => {
    const listSlots = deps.listSlots ?? ((a) => listPublicBookingSlotsAction(a));
    // ── booking-mode branch (ICP-3, deployed agents only) ──
    // Workspace/operator agents never set ctx.booking → mode is 'native' and the
    // existing availability chain below runs byte-for-byte unchanged. A deployed
    // agent on a non-native mode hands off here BEFORE any slot lookup or DB read.
    const mode = ctx.booking?.mode ?? "native";
    if (mode === "external_link") {
      const url = ctx.booking?.externalUrl ?? null;
      return {
        bookingHandoff: "external_link",
        message: url
          ? `We book through our online scheduler. I can text you the link: ${url}`
          : "We book through our online scheduler — I can have someone send you the link.",
        url,
      };
    }
    if (mode === "api_mcp" || mode === "cal_com") {
      return {
        bookingHandoff: "followup",
        message:
          "I've got your details — our team will reach out shortly to lock in a time.",
      };
    }
    // mode === "native": existing code path continues unchanged ↓
    const bookingSlug = input.bookingSlug ?? "default";

    // ── per-client booking policy (P1) ──
    // A DEPLOYED agent's slots are SHAPED by the client's policy (duration /
    // buffer / hours window / lead time / max-per-day). The policy-shaping below
    // fires ONLY when a per-client policy is actually threaded onto
    // ctx.booking.policy — a workspace/operator agent (no ctx.booking) keeps the
    // byte-for-byte original native walk (no intersection, no cap, duration from
    // the action). `candidates` are the policy-shaped UTC ISO starts for the
    // REQUESTED day; an offered slot must be BOTH a candidate AND free on the
    // real calendar. Off-policy days yield no candidates → [].
    const hasPolicy = Boolean(ctx.booking?.policy);
    const policy = ctx.booking?.policy ?? resolveBookingPolicy(null, null, ctx.timezone);

    // ── pluggable-backend availability (ICP-3, Task 4 + P1 policy) ──
    // When this deployment books into the CLIENT's own connected calendar
    // (binding.mode === "book_external" AND a connected calendarRef), get that
    // calendar's FREE windows for the day and offer the policy candidates that
    // FIT inside a free window. If the backend exposes no windows (the composio
    // adapter degrades to [] on any error / unrecognized shape), FALL THROUGH to
    // the existing native availability walk so the agent always has times to
    // offer. resolveCalendarBackend itself returns the native backend until the
    // calendar is actually connected, so this only fires for a truly
    // book_external + connected deployment.
    if (ctx.booking?.binding?.mode === "book_external") {
      const backendDeps = buildCalendarBackendDeps(
        ctx,
        bookingSlug,
        // The native primitives are only reached on fallback (makeNative) — the
        // book_external path uses the composio backend. submitBooking is unused
        // by free-window lookup, so a throwing stub documents that.
        async () => {
          throw new Error("submit not used in availability lookup");
        },
        listSlots,
      );
      const resolveBackend = deps.resolveBackend ?? resolveCalendarBackend;
      const backend = resolveBackend(ctx.booking.binding, backendDeps);
      const tz = policy.timezone;
      try {
        // Walk forward up to 14 days from input.date, accumulating up to 3
        // offered slots total. The OLD code checked input.date ONLY, so a call
        // landing on an off-policy weekday (or late, past the policy window)
        // yielded zero candidates and the agent said "no availability". We now
        // mirror the native walk below: for each day we generate that day's
        // policy candidates and intersect them with THAT day's real free windows.
        // The day is stepped as a UTC-noon instant so the walk is DST-stable
        // (it just increments by 24h in pure UTC).
        const collected: string[] = [];
        for (let d = 0; d < 14 && collected.length < CHATBOT_SLOT_CAP; d++) {
          const dayISO = new Date(
            Date.parse(`${input.date}T12:00:00Z`) + d * 86_400_000,
          )
            .toISOString()
            .slice(0, 10);
          const dayCandidates = generateCandidateSlots(policy, dayISO, new Date());
          if (dayCandidates.length === 0) continue; // off-policy weekday / all past

          // Prefer the explicit free-windows surface (P1); fall back to deriving
          // windows from findDayAvailability's quantized slots when a backend
          // doesn't implement findFreeWindows. Query THIS day, not input.date.
          const windows = backend.findFreeWindows
            ? await backend.findFreeWindows({
                date: dayISO,
                durationMinutes: policy.durationMinutes,
                timezone: tz,
              })
            : await backend
                .findDayAvailability({
                  date: dayISO,
                  durationMinutes: policy.durationMinutes,
                  timezone: tz,
                })
                .then(({ slots }) =>
                  slots.map((s) => ({
                    start: s.iso,
                    end: new Date(
                      Date.parse(s.iso) + policy.durationMinutes * 60_000,
                    ).toISOString(),
                  })),
                );
          if (windows.length === 0) continue;

          let dayFits = dayCandidates.filter((iso) =>
            slotFitsFreeWindows(iso, policy.durationMinutes, windows),
          );
          // Cap per day at policy.maxPerDay (when a policy is set + a cap exists).
          if (hasPolicy && typeof policy.maxPerDay === "number") {
            dayFits = dayFits.slice(0, policy.maxPerDay);
          }
          for (const iso of dayFits) {
            if (collected.length >= CHATBOT_SLOT_CAP) break;
            collected.push(iso);
          }
        }
        if (collected.length > 0) {
          return {
            slots: labelSlots(collected, tz),
            durationMinutes: policy.durationMinutes,
            date: input.date,
            timezone: tz,
          };
        }
        // No day in the 14-day horizon had a free in-policy slot → fall through
        // to the native availability walk below.
      } catch {
        // Backend threw despite its fail-soft contract — never break the call;
        // fall through to native availability below.
      }
    }

    // Parse the requested start date as a UTC noon moment so the walk
    // is stable across DST (it just increments by 24h in pure UTC).
    const startDate = new Date(`${input.date}T12:00:00Z`);

    // Track durationMinutes from the first non-empty day we hit. If
    // every queried day is empty (unconfigured availability, fully
    // booked horizon), fall back to the policy duration.
    let durationMinutes = policy.durationMinutes;
    let durationSeen = false;
    // Track the workspace timezone so we can label slots in the BUSINESS'S
    // local time (not UTC). listPublicBookingSlotsAction surfaces it as
    // `workspaceTimezone`, but omits it on its empty/early-return paths —
    // so default to the policy tz and latch the first real value we see.
    let timezone = policy.timezone;
    let timezoneSeen = false;
    // Did the native availability action ever report a configuration (a real
    // duration)? A deployment with a connected calendar but NO native booking
    // config returns empty everywhere; in that case we still offer the policy
    // window directly (below) rather than going silent.
    let nativeConfigSeen = false;

    const slots = await findNextAvailableSlots({
      startDate,
      maxSlots: CHATBOT_SLOT_CAP,
      maxDaysToWalk: CHATBOT_WALK_HORIZON_DAYS,
      fetchSlotsForDay: async (date) => {
        const dayISO = formatDateYYYYMMDD(date);
        const result = await listSlots({
          orgSlug: ctx.orgSlug,
          bookingSlug,
          date: dayISO,
        });
        if (typeof result.durationMinutes === "number") {
          nativeConfigSeen = true;
          if (!durationSeen) {
            durationMinutes = result.durationMinutes;
            durationSeen = true;
          }
        }
        // `workspaceTimezone` is absent on the action's early-return paths,
        // so read it defensively (the result type is a union without it).
        const tz = (result as { workspaceTimezone?: string }).workspaceTimezone;
        if (!timezoneSeen && typeof tz === "string" && tz) {
          timezone = tz;
          timezoneSeen = true;
        }
        // No per-client policy (workspace/operator agent) → return the native
        // slots untouched (byte-for-byte original behavior). With a policy,
        // intersect: only offer a native slot that is ALSO a policy candidate for
        // that day (weekday window + duration cadence + lead time).
        if (!hasPolicy) return result.slots;
        const dayCandidates = new Set(
          generateCandidateSlots(policy, dayISO, new Date()),
        );
        return result.slots.filter((iso) => dayCandidates.has(iso));
      },
    });

    // Cap a slot list at policy.maxPerDay (when a policy is set + a cap exists).
    // The book_external loop above caps inline per day; the native walk below
    // applies the same cap at its two emit sites.
    const capToMax = (list: string[]): string[] =>
      hasPolicy && typeof policy.maxPerDay === "number"
        ? list.slice(0, policy.maxPerDay)
        : list;

    // A DEPLOYED agent (hasPolicy) whose calendar is connected but has NO native
    // booking config (the action returned empty everywhere) should still offer
    // its policy window for the requested day — the candidates, capped at
    // maxPerDay. Workspace agents skip this (they have no policy window to offer).
    const fallbackCandidates = generateCandidateSlots(policy, input.date, new Date());
    if (
      hasPolicy &&
      slots.length === 0 &&
      !nativeConfigSeen &&
      fallbackCandidates.length > 0
    ) {
      const offered = capToMax(fallbackCandidates);
      return {
        slots: labelSlots(offered, policy.timezone),
        durationMinutes: policy.durationMinutes,
        date: input.date,
        timezone: policy.timezone,
      };
    }

    return {
      // Each slot carries the raw `iso` (passed VERBATIM to book_appointment)
      // and a `label` already converted to the workspace timezone for the
      // agent to read aloud — so it can't quote the UTC hour by mistake.
      slots: labelSlots(capToMax(slots), timezone),
      durationMinutes,
      // `date` echoes back the START date the LLM requested. The slot
      // ISOs themselves carry the real calendar dates (which may span
      // multiple days now that the walk is enabled), so the LLM should
      // parse those rather than rely on this field.
      date: input.date,
      // The IANA timezone the labels are in — lets the agent name the zone
      // if the caller is plainly somewhere else.
      timezone,
    };
  },
};

// ─── confirmation read-back gate (voice R1) ────────────────────────────────
//
// Before any state-changing write (book / reschedule / cancel) the agent must
// READ BACK the details and get a yes. We enforce this at the TOOL layer, not
// just in the prompt: each write tool takes a `confirmed: boolean` arg, and
// when it isn't exactly `true` the tool performs NO write — it returns the
// spoken read-back summary plus an instruction telling the model to confirm
// with the caller and then call again with confirmed:true. Only confirmed:true
// touches the database. This makes "the agent booked the wrong slot because it
// skipped the confirmation" structurally impossible, even if the prompt drifts.

/**
 * Build the spoken read-back the agent says before a booking write. Pure.
 * Ends in "…is that correct?" so the model naturally pauses for a yes.
 * `slotIso` is formatted into the workspace timezone when one is supplied (so
 * the caller hears "Monday, June 1 at 10:00 AM PDT", never the raw UTC iso).
 */
export function buildBookingReadBack(args: {
  fullName: string;
  slotIso: string;
  service?: string;
  timezone?: string;
}): string {
  const when = args.timezone
    ? formatSlotLabel(args.slotIso, args.timezone)
    : args.slotIso;
  const parts = [args.fullName, args.service, when].filter(
    (p): p is string => typeof p === "string" && p.trim().length > 0,
  );
  return `So that's ${parts.join(", ")} — is that correct?`;
}

/** The shape every write tool returns when it needs the caller to confirm
 *  first. `ok:false` so the model never tells the caller "done"; `readBack` is
 *  the exact sentence to speak; `instruction` nudges it to re-call with
 *  confirmed:true after the caller says yes. */
export type NeedsConfirmation = {
  ok: false;
  needsConfirmation: true;
  readBack: string;
  instruction: string;
};

const CONFIRM_INSTRUCTION =
  "Read the readBack sentence to the caller verbatim and wait for them to say " +
  "yes. Only after they confirm, call this tool again with confirmed:true to " +
  "actually make the change. Do NOT tell the caller it's done until then.";

// ─── book_appointment ──────────────────────────────────────────────────────

const bookAppointmentInput = z
  .object({
    fullName: z.string().min(2),
    // voice R1 — email is OPTIONAL. A plumber workspace collects phone +
    // address + service (no email); the agency collects email. The refine
    // below requires AT LEAST ONE contact method.
    email: z.string().email().optional(),
    phone: z.string().optional(),
    slotIso: z.string(),
    notes: z.string().optional(),
    bookingSlug: z.string().optional(),
    /** voice R1 — vertical-aware intake field responses keyed by field id
     *  (e.g. { phone, address, service }). Threaded to
     *  submitPublicBookingAction → stored on the booking + contact so the
     *  operator sees actionable lead context. */
    intakeResponses: z.record(z.string(), z.string()).optional(),
    /** voice R1 — confirmation gate. The tool writes ONLY when this is true.
     *  Anything else (false / omitted) returns the spoken read-back instead. */
    confirmed: z.boolean().optional(),
  })
  .refine(
    (v) =>
      (typeof v.email === "string" && v.email.trim().length > 0) ||
      (typeof v.phone === "string" && v.phone.trim().length > 0) ||
      (typeof v.intakeResponses?.phone === "string" &&
        v.intakeResponses.phone.trim().length > 0),
    {
      message:
        "Collect at least one contact method: an email OR a phone number.",
      path: ["email"],
    },
  );

/** The exact arg shape book_appointment hands to submitPublicBookingAction.
 *  Exported so the unit test can assert it without a live DB. */
export type SubmitPublicBookingArgs = {
  orgSlug: string;
  bookingSlug: string;
  fullName: string;
  /** Empty string when the caller gave no email — submitPublicBookingAction
   *  then resolves/creates the contact by phone (from intakeResponses.phone). */
  email: string;
  notes?: string;
  startsAt: string;
  intakeResponses?: Record<string, string>;
};

/** Injectable DB seam for book_appointment — lets the unit test assert the
 *  args that reach submitPublicBookingAction (email passthrough, phone folded
 *  into intakeResponses) without a live database. Mirrors RescheduleDeps /
 *  CancelDeps.
 *
 *  `resolveBackend` is the ICP-3 (Task 4) pluggable-calendar seam: given the
 *  deployment's binding and the resolved ResolveDeps, it returns the
 *  CalendarBackend the confirmed booking writes through. It defaults to the real
 *  `resolveCalendarBackend` (native-or-composio), and is overridable so a test
 *  can inject a fake backend without any network. It is consulted ONLY on the
 *  book_external path — the native path keeps calling `submitBooking` directly,
 *  byte-for-byte unchanged. */
export type BookAppointmentDeps = {
  submitBooking: (args: SubmitPublicBookingArgs) => Promise<unknown>;
  resolveBackend?: (
    binding: CalendarBinding | undefined,
    deps: {
      makeNative: () => CalendarBackend;
      makeComposio: (
        ref: NonNullable<CalendarBinding["calendarRef"]>,
      ) => CalendarBackend;
    },
  ) => CalendarBackend;
};

function defaultBookAppointmentDeps(): BookAppointmentDeps {
  return {
    submitBooking: async (args) => {
      // Lazy import — submitPublicBookingAction lives in bookings/actions and
      // imports many other modules; keeping it lazy reduces the tools-module
      // load cost during runtime startup.
      const { submitPublicBookingAction } = await import("@/lib/bookings/actions");
      return submitPublicBookingAction(args);
    },
    resolveBackend: resolveCalendarBackend,
  };
}

/** The result a booking tool returns for a non-native deployment booking mode
 *  (ICP-3): instead of writing a booking, the deployed agent hands off — either
 *  sharing the client's own scheduler link (`external_link`) or promising a
 *  human follow-up (`followup`, for the coming-soon api_mcp/cal_com modes). The
 *  realtime layer JSON-stringifies this; the agent speaks `message`. */
export type BookingHandoffResult = {
  ok: boolean;
  bookingHandoff: "external_link" | "followup";
  message: string;
  url?: string | null;
};

/** Per-client booking policy (P1): the result when one or more of the policy's
 *  `requiredFields` weren't collected yet. NO booking is written — the agent
 *  reads `message`, asks the caller for the named fields, and re-calls. */
export type BookingNeedsFieldsResult = {
  ok: false;
  needs: string[];
  message: string;
};

export const bookAppointment: AgentTool<
  z.infer<typeof bookAppointmentInput>,
  | { ok: boolean; bookingId?: string; testMode?: boolean; error?: string }
  | BookingHandoffResult
  | BookingNeedsFieldsResult
  | NeedsConfirmation
> & {
  execute: (
    input: z.infer<typeof bookAppointmentInput>,
    ctx: ToolExecuteContext,
    deps?: BookAppointmentDeps,
  ) => Promise<
    | { ok: boolean; bookingId?: string; testMode?: boolean; error?: string }
    | BookingHandoffResult
    | BookingNeedsFieldsResult
    | NeedsConfirmation
  >;
} = {
  name: "book_appointment",
  description:
    "Create a confirmed booking. CALL ORDER: (1) look_up_availability({date}) FIRST to get real slots, (2) book_appointment with the chosen slot's `iso` field passed VERBATIM as slotIso. Never invent or hand-edit a slot — each slot's `iso` is a full UTC ISO timestamp ('2026-05-13T16:00:00Z') that carries timezone info; if you trim, reformat, or substitute the spoken `label` for it, the server will book the wrong time across timezones. " +
    "CONFIRMATION REQUIRED: call FIRST with confirmed omitted to get a `readBack` sentence — say it to the caller, get a yes — THEN call again with confirmed:true to actually book. Without confirmed:true nothing is written.",
  inputSchema: bookAppointmentInput,
  jsonSchema: {
    type: "object",
    properties: {
      fullName: { type: "string" },
      email: {
        type: "string",
        format: "email",
        description:
          "The caller's email. OPTIONAL — only collect it if this workspace's booking fields ask for it (see your system prompt's 'To book, collect…' line). Many service businesses (plumber, HVAC) take a phone instead. You MUST collect at least one of email or phone.",
      },
      phone: {
        type: "string",
        description:
          "The caller's phone number in E.164 if possible (e.g. '+15551234567'). Collect this when the workspace's booking fields list a phone (most service businesses). You MUST collect at least one of email or phone.",
      },
      slotIso: {
        type: "string",
        description:
          "MUST be the `iso` field of one of the slots returned by look_up_availability, copied VERBATIM. Format is full UTC ISO with Z suffix (e.g. '2026-05-13T16:00:00Z'). Do NOT pass the human `label` (e.g. '10:00 AM PDT') or a naive local time like '2026-05-13T09:00' — those get misinterpreted and book the wrong time.",
      },
      intakeResponses: {
        type: "object",
        description:
          "The workspace's collected intake fields, keyed by field id, as a flat object of strings (e.g. { \"phone\":\"+15551234567\", \"address\":\"1234 Main St\", \"service\":\"Leak repair\" }). Put EVERY field your system prompt's 'To book, collect…' line names here, using the exact field id given there. Phone may go here as \"phone\" or in the top-level phone arg — either works.",
        additionalProperties: { type: "string" },
      },
      notes: {
        type: "string",
        description:
          "Optional free-text notes only (e.g. an aside the caller mentioned). Do NOT stuff structured fields like phone/address here — use intakeResponses for those.",
      },
      bookingSlug: { type: "string" },
      confirmed: {
        type: "boolean",
        description:
          "Set true ONLY after you've read the details back to the caller and they confirmed. Omit (or false) on the first call to receive the read-back; the booking is written only when this is true.",
      },
    },
    required: ["fullName", "slotIso"],
  },
  execute: async (
    input,
    ctx,
    deps: BookAppointmentDeps = defaultBookAppointmentDeps(),
  ) => {
    // ── booking-mode branch (ICP-3, deployed agents only) ──
    // Runs BEFORE the confirmation gate so a non-native deployment hands off
    // immediately (no read-back of a booking we won't make, no DB write).
    // Workspace/operator agents never set ctx.booking → mode is 'native' and the
    // entire existing chain below (confirmation gate + submitBooking) runs
    // byte-for-byte unchanged.
    const mode = ctx.booking?.mode ?? "native";
    if (mode === "external_link") {
      const url = ctx.booking?.externalUrl ?? null;
      return {
        ok: true,
        bookingHandoff: "external_link",
        message: url
          ? `We take bookings through our online scheduler — here's the link to grab a time: ${url}`
          : "We take bookings through our online scheduler — I'll have someone send you the link to grab a time.",
        url,
      };
    }
    if (mode === "api_mcp" || mode === "cal_com") {
      return {
        ok: true,
        bookingHandoff: "followup",
        message:
          "I've got your details — our team will reach out shortly to confirm and schedule your time.",
      };
    }
    // mode === "native": existing code path continues unchanged ↓
    // Confirmation gate — no write until the caller has confirmed the read-back.
    if (input.confirmed !== true) {
      return {
        ok: false,
        needsConfirmation: true,
        readBack: buildBookingReadBack({
          fullName: input.fullName,
          slotIso: input.slotIso,
          // Voice calls carry the workspace timezone → the read-back speaks a
          // human-local time, never the raw UTC ISO. Web/text omit it (UTC).
          timezone: ctx.timezone,
        }),
        instruction: CONFIRM_INSTRUCTION,
      };
    }
    if (ctx.testMode) {
      return {
        ok: true,
        testMode: true,
        bookingId: `test-${Date.now()}`,
      };
    }

    // ── required-fields gate (per-client booking policy, P1) ──
    // The client's policy names the fields that MUST be collected before a
    // booking is written (e.g. a plumber requires name+phone+address). This is a
    // DEPLOYED-agent gate: it fires ONLY when a per-client policy is actually
    // threaded onto ctx.booking.policy. Workspace/operator agents (no
    // ctx.booking) keep the byte-for-byte original behavior — never gated by the
    // system-default required fields. When a policy IS present, validate before
    // any write: a missing/blank field returns the needs-list so the agent asks
    // the caller and re-calls — never a partial booking. Field → source mapping
    // mirrors how the write resolves contact info:
    //   name  → input.fullName
    //   phone → intakeResponses.phone | input.phone | caller ID (any present)
    //   email → input.email
    //   other → intakeResponses[field]
    const policy = ctx.booking?.policy ?? resolveBookingPolicy(null, null, ctx.timezone);
    if (ctx.booking?.policy) {
      const fieldValue = (field: string): string | undefined => {
        if (field === "name") return input.fullName;
        if (field === "phone") {
          return (
            input.intakeResponses?.phone ??
            input.phone ??
            (typeof ctx.callerPhone === "string" ? ctx.callerPhone : undefined)
          );
        }
        if (field === "email") return input.email;
        return input.intakeResponses?.[field];
      };
      const missing = policy.requiredFields.filter(
        (f) => !(typeof fieldValue(f) === "string" && fieldValue(f)!.trim().length > 0),
      );
      if (missing.length > 0) {
        return {
          ok: false,
          needs: missing,
          message: `Please collect: ${missing.join(", ")}`,
        };
      }
    }

    try {
      // voice R1 — thread the workspace's collected intake fields through to
      // submitPublicBookingAction. Phone is folded INTO intakeResponses.phone
      // (the submit action derives the contact phone from there) — UNLESS the
      // model already supplied an intakeResponses.phone, which wins.
      const intakeResponses: Record<string, string> = { ...(input.intakeResponses ?? {}) };
      const hasPhone = () =>
        typeof intakeResponses.phone === "string" && intakeResponses.phone.trim().length > 0;
      if (input.phone && !hasPhone()) {
        intakeResponses.phone = input.phone;
      }
      // voice R1+ — caller-ID fallback. If the model collected NO phone (neither
      // top-level `phone` nor intakeResponses.phone), default to the caller's
      // number from the inbound call's caller ID (ctx.callerPhone, set by the
      // voice webhook). Anonymous callers leave ctx.callerPhone undefined so
      // nothing is added. Voice-only: web / text surfaces never set callerPhone,
      // so their behavior is unchanged.
      if (!hasPhone() && typeof ctx.callerPhone === "string" && ctx.callerPhone.trim().length > 0) {
        intakeResponses.phone = ctx.callerPhone.trim();
      }
      // voice R1+ (FIX 1) — caller-ID AUTHORITATIVE OVERRIDE. On a VOICE call the
      // real caller ID (ctx.callerPhone) is the ground truth: the model cannot
      // know the caller's actual number and routinely HALLUCINATES junk into the
      // phone field (observed on real calls: "+10000000000", "[caller ID captured
      // automatically]"). So whenever a caller ID is present, it WINS over
      // whatever the model supplied — overwriting the top-level/intake phone
      // folded in above. This runs last so it is the final word. Web/text callers
      // never set ctx.callerPhone, so their model-supplied phone passes through
      // untouched (this block is a no-op for them).
      if (typeof ctx.callerPhone === "string" && ctx.callerPhone.trim().length > 0) {
        intakeResponses.phone = ctx.callerPhone.trim();
      }
      // submitPublicBookingAction returns { success, confirmationMessage,
      // checkoutUrl }. We don't surface checkoutUrl to the LLM (would need
      // handoff to a payment flow which v1.26 doesn't model). When email is
      // absent we pass "" — the submit action treats empty email as "resolve
      // the contact by phone" and stores null for the email columns.
      const bookingSlug = input.bookingSlug ?? "default";
      const intakeArg =
        Object.keys(intakeResponses).length > 0 ? intakeResponses : undefined;

      // The native booking write — the EXISTING path, byte-for-byte. Reused both
      // for the native deployment AND as the book_external fallback below, so the
      // args + return shape are guaranteed identical. Returns { ok: true } today.
      const writeNative = async () => {
        await deps.submitBooking({
          orgSlug: ctx.orgSlug,
          bookingSlug,
          fullName: input.fullName,
          email: input.email ?? "",
          notes: input.notes || undefined,
          startsAt: input.slotIso,
          intakeResponses: intakeArg,
        });
        return { ok: true } as { ok: boolean; bookingId?: string };
      };

      // ── pluggable-backend write (ICP-3, Task 4) ──
      // ONLY when this deployment books into the CLIENT's own connected calendar
      // (binding.mode === "book_external"). Native + every legacy handoff mode
      // skip this block entirely and use writeNative() below — so the native
      // path is unchanged. resolveCalendarBackend still returns native until the
      // calendar is actually connected (no calendarRef.accountId), so even a
      // book_external deployment falls back cleanly pre-connect.
      if (ctx.booking?.binding?.mode === "book_external") {
        const resolveBackend = deps.resolveBackend ?? resolveCalendarBackend;
        const backendDeps = buildCalendarBackendDeps(
          ctx,
          bookingSlug,
          // makeNative's submitBooking → the SAME native submit the tool uses.
          // Adapts the tool's `Promise<unknown>` submit to the backend's typed
          // `{ ok }` contract so makeNative().createEvent works if ever used.
          async (a) => {
            await deps.submitBooking(a as SubmitPublicBookingArgs);
            return { ok: true };
          },
          (a) => listPublicBookingSlotsAction(a),
        );
        const backend = resolveBackend(ctx.booking.binding, backendDeps);
        const res = await backend.createEvent({
          startIso: input.slotIso,
          // Per-client booking policy (P1) — the event runs for the client's
          // configured appointment length, not a hardcoded 30 minutes.
          durationMinutes: policy.durationMinutes,
          timezone: policy.timezone,
          // Prefer an explicit service from intake, else a clean generic (NOT
          // the machine booking-slug, which surfaced as a literal "default" on
          // the calendar event). The adapter appends the caller's name.
          title: intakeResponses.service || "Appointment",
          attendee: {
            name: input.fullName,
            email: input.email,
            phone: intakeResponses.phone,
          },
          notes: input.notes || undefined,
        });
        if (res.ok) {
          return { ok: true, bookingId: res.eventRef };
        }
        // External backend failed → fall back to the native booking store so a
        // live call never drops. Structured log for ops visibility.
        console.warn(
          JSON.stringify({
            event: "booking_external_fallback",
            orgId: ctx.orgId,
            reason: res.error,
          }),
        );
        return writeNative();
      }

      // Native (and every legacy handoff mode that reached here): unchanged.
      return writeNative();
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};

// ─── find_my_existing_appointment ──────────────────────────────────────────

const findMyExistingAppointmentInput = z.object({
  email: z.string().email(),
});

type AppointmentLookupResult = {
  appointments: Array<{
    id: string;
    title: string;
    startsAtIso: string;
    status: string;
  }>;
  /** v1.27.7 — linked contact info so the agent doesn't have to re-ask
   *  for name/phone after identifying the customer by email. The system
   *  prompt's "Be smart by default" rule #2 instructs the LLM to USE
   *  this data instead of asking the visitor to re-type it. */
  contact: {
    id: string;
    fullName: string | null;
    email: string;
    phone: string | null;
  } | null;
};

export const findMyExistingAppointment: AgentTool<
  z.infer<typeof findMyExistingAppointmentInput>,
  AppointmentLookupResult
> = {
  name: "find_my_existing_appointment",
  description:
    "Look up upcoming appointments AND linked contact info for a customer by email. Use when the visitor says they want to reschedule or cancel an existing booking. Returns both `appointments` (upcoming bookings) AND `contact` (their name/phone on file). USE THE CONTACT FIELDS — don't re-ask the visitor for info we already have.",
  inputSchema: findMyExistingAppointmentInput,
  jsonSchema: {
    type: "object",
    properties: { email: { type: "string", format: "email" } },
    required: ["email"],
  },
  execute: async (input, ctx) => {
    const now = new Date();
    const rows = await db
      .select({
        id: bookings.id,
        title: bookings.title,
        startsAt: bookings.startsAt,
        status: bookings.status,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.orgId, ctx.orgId),
          ilike(bookings.email, input.email),
          gte(bookings.startsAt, now),
        ),
      )
      .limit(5);

    // Linked contact lookup — the same email may already exist in the
    // CRM with a fuller record (name, phone). Surface it so the agent
    // doesn't have to re-ask.
    const [contactRow] = await db
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
        phone: contacts.phone,
      })
      .from(contacts)
      .where(
        and(eq(contacts.orgId, ctx.orgId), ilike(contacts.email, input.email)),
      )
      .limit(1);

    return {
      appointments: rows.map((row) => ({
        id: row.id,
        title: row.title,
        startsAtIso:
          row.startsAt instanceof Date
            ? row.startsAt.toISOString()
            : String(row.startsAt),
        status: row.status,
      })),
      contact: contactRow
        ? {
            id: contactRow.id,
            fullName:
              [contactRow.firstName, contactRow.lastName]
                .filter(Boolean)
                .join(" ") || null,
            email: contactRow.email ?? input.email,
            phone: contactRow.phone ?? null,
          }
        : null,
    };
  },
};

// ─── escalate_to_human ─────────────────────────────────────────────────────

const escalateToHumanInput = z.object({
  reason: z.string().min(3),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  contactName: z.string().optional(),
});

export const escalateToHuman: AgentTool<
  z.infer<typeof escalateToHumanInput>,
  { ok: boolean; ticketId?: string }
> = {
  name: "escalate_to_human",
  description:
    "Hand off to a human team member. Use when: (1) user explicitly asks for a human, (2) you've failed to answer the user's question 2+ times, (3) the request is outside your capabilities. The team will follow up via email or phone.",
  inputSchema: escalateToHumanInput,
  jsonSchema: {
    type: "object",
    properties: {
      reason: {
        type: "string",
        description: "One-sentence summary of why escalation is needed",
      },
      contactEmail: { type: "string", format: "email" },
      contactPhone: { type: "string" },
      contactName: { type: "string" },
    },
    required: ["reason"],
  },
  execute: async (input, ctx) => {
    if (ctx.testMode) {
      return { ok: true, ticketId: `test-escalation-${Date.now()}` };
    }
    // v1.26.0: write a portal-message + activity row so the
    // operator's CRM picks it up. Lightweight - no separate
    // "tickets" table.
    const { db: dbInstance } = await import("@/db");
    const { activities, portalMessages, users } = await import("@/db/schema");
    const { eq: eqFn, and: andFn } = await import("drizzle-orm");

    // Try to thread the escalation onto an existing contact.
    let contactId: string | null = null;
    if (input.contactEmail) {
      const [existing] = await dbInstance
        .select({ id: contacts.id })
        .from(contacts)
        .where(
          andFn(
            eqFn(contacts.orgId, ctx.orgId),
            ilike(contacts.email, input.contactEmail),
          ),
        )
        .limit(1);
      contactId = existing?.id ?? null;
    }

    // Find the workspace owner for the activity row attribution.
    const [owner] = await dbInstance
      .select({ id: users.id })
      .from(users)
      .where(eqFn(users.orgId, ctx.orgId))
      .limit(1);

    if (contactId) {
      await dbInstance.insert(portalMessages).values({
        orgId: ctx.orgId,
        contactId,
        senderType: "client",
        senderName: input.contactName ?? "Agent escalation",
        subject: "Agent escalation",
        body: input.reason,
      });
    }

    if (owner?.id && contactId) {
      await dbInstance.insert(activities).values({
        orgId: ctx.orgId,
        userId: owner.id,
        contactId,
        type: "agent_escalation",
        subject: "Agent escalated to human",
        body: input.reason,
        metadata: {
          source: "agent",
          agentId: ctx.agentId,
          conversationId: ctx.conversationId,
        },
        completedAt: new Date(),
      });
    }

    return { ok: true };
  },
};

// ─── provide_faq_answer ────────────────────────────────────────────────────
//
// v1.26.0: simple inline-FAQ search (operator-curated Q&A pairs in
// blueprint.faq). v1.27 will swap this for vector RAG over uploaded
// docs.

const provideFaqAnswerInput = z.object({
  query: z.string().min(2),
});

export const provideFaqAnswer: AgentTool<
  z.infer<typeof provideFaqAnswerInput>,
  { matches: Array<{ question: string; answer: string; score: number }> }
> = {
  name: "provide_faq_answer",
  description:
    "Search the operator's FAQ knowledge for an answer to a visitor's question. Returns up to 3 best matches with relevance scores.",
  inputSchema: provideFaqAnswerInput,
  jsonSchema: {
    type: "object",
    properties: { query: { type: "string" } },
    required: ["query"],
  },
  execute: async (input, ctx) => {
    void ctx;
    // v1.26.0 placeholder — runtime injects blueprint.faq into the
    // system prompt directly, so this tool is redundant for v1.26.
    // Kept in the allowlist so the LLM has a "where do I look?"
    // mental hook. v1.27 will activate it for doc-RAG.
    return { matches: [] };
  },
};

// ─── reschedule_appointment ────────────────────────────────────────────────
//
// v1.27.8 — REAL state-changing reschedule. Without this tool the agent
// could only CLAIM to reschedule (a hallucination). Now it actually
// updates bookings.startsAt + endsAt + writes an activity row, atomically
// scoped to (orgId, bookingId, customer_email).
//
// Security: requires customer_email match in the WHERE clause so a
// hallucinated bookingId from a different workspace can't slip through.

const rescheduleAppointmentInput = z.object({
  booking_id: z.string().uuid(),
  new_starts_at_iso: z.string().datetime(),
  customer_email: z.string().email(),
  /** voice R1 — confirmation gate. Writes ONLY when true. */
  confirmed: z.boolean().optional(),
});

/** Injectable DB seam for reschedule_appointment — lets the unit tests assert
 *  the email-match guard + the write without a live database. `loadBooking` is
 *  scoped to (orgId, bookingId, email) so a hallucinated id from another
 *  workspace returns null; `updateBookingStart` is scoped to (orgId, id). */
export type RescheduleDeps = {
  loadBooking: (args: {
    id: string;
    orgId: string;
    email: string;
  }) => Promise<{ id: string; startsAt: Date; endsAt: Date } | null>;
  updateBookingStart: (args: {
    bookingId: string;
    orgId: string;
    startsAt: Date;
    endsAt: Date;
  }) => Promise<{ id: string } | null>;
};

function defaultRescheduleDeps(): RescheduleDeps {
  return {
    loadBooking: async ({ id, orgId, email }) => {
      const [row] = await db
        .select({
          id: bookings.id,
          startsAt: bookings.startsAt,
          endsAt: bookings.endsAt,
        })
        .from(bookings)
        .where(
          and(
            eq(bookings.id, id),
            eq(bookings.orgId, orgId),
            ilike(bookings.email, email),
          ),
        )
        .limit(1);
      if (!row) return null;
      return {
        id: row.id,
        startsAt: row.startsAt instanceof Date ? row.startsAt : new Date(row.startsAt),
        endsAt: row.endsAt instanceof Date ? row.endsAt : new Date(row.endsAt),
      };
    },
    updateBookingStart: async ({ bookingId, orgId, startsAt, endsAt }) => {
      const [updated] = await db
        .update(bookings)
        .set({ startsAt, endsAt, updatedAt: new Date() })
        .where(and(eq(bookings.id, bookingId), eq(bookings.orgId, orgId)))
        .returning({ id: bookings.id });
      return updated ?? null;
    },
  };
}

export const rescheduleAppointment: AgentTool<
  z.infer<typeof rescheduleAppointmentInput>,
  | { ok: boolean; bookingId?: string; newStartsAt?: string; reason?: string }
  | NeedsConfirmation
> & {
  execute: (
    input: z.infer<typeof rescheduleAppointmentInput>,
    ctx: ToolExecuteContext,
    deps?: RescheduleDeps,
  ) => Promise<
    | { ok: boolean; bookingId?: string; newStartsAt?: string; reason?: string }
    | NeedsConfirmation
  >;
} = {
  name: "reschedule_appointment",
  description:
    "ACTUALLY reschedule an existing appointment. Updates the booking row in the database to the new start time. " +
    "USE WHEN the visitor confirms a new time after find_my_existing_appointment matched their booking. " +
    "Args: booking_id from find_my_existing_appointment, new_starts_at_iso (ISO 8601 in UTC; resolve relative dates like 'next Monday' to a concrete ISO using the temporal anchor in your system prompt), customer_email (must match the booking's email — security check). " +
    "CONFIRMATION REQUIRED: call FIRST with confirmed omitted to get a `readBack` sentence — say it, get a yes — THEN call again with confirmed:true. " +
    "DO NOT confirm a reschedule to the visitor without ok=true — saying 'done' without actually moving the booking is a critical failure.",
  inputSchema: rescheduleAppointmentInput,
  jsonSchema: {
    type: "object",
    properties: {
      booking_id: { type: "string", format: "uuid" },
      new_starts_at_iso: { type: "string", format: "date-time" },
      customer_email: { type: "string", format: "email" },
      confirmed: {
        type: "boolean",
        description:
          "Set true ONLY after the caller confirms the read-back. Omit on the first call to receive the read-back; the booking moves only when this is true.",
      },
    },
    required: ["booking_id", "new_starts_at_iso", "customer_email"],
  },
  execute: async (input, ctx, deps: RescheduleDeps = defaultRescheduleDeps()) => {
    const newStarts = new Date(input.new_starts_at_iso);
    if (Number.isNaN(newStarts.getTime())) {
      return { ok: false, reason: "invalid_date" };
    }

    // Confirmation gate — read back BEFORE we touch (or even read) the DB.
    if (input.confirmed !== true) {
      return {
        ok: false,
        needsConfirmation: true,
        // Speak a human-local time, not the raw UTC ISO. formatSlotLabel needs
        // a concrete zone; voice supplies ctx.timezone, web/text fall back to
        // UTC (formatSlotLabel itself also degrades a bad zone to UTC).
        readBack: `So I'll move your appointment to ${formatSlotLabel(
          input.new_starts_at_iso,
          ctx.timezone ?? "UTC",
        )} — is that correct?`,
        instruction: CONFIRM_INSTRUCTION,
      };
    }

    // Look up the booking to compute the new endsAt (preserve duration) and
    // verify (orgId, email) match — the security guard.
    const existing = await deps.loadBooking({
      id: input.booking_id,
      orgId: ctx.orgId,
      email: input.customer_email,
    });

    if (!existing) {
      return { ok: false, reason: "booking_not_found_or_email_mismatch" };
    }

    const durationMs = existing.endsAt.getTime() - existing.startsAt.getTime();
    const newEndsAt = new Date(newStarts.getTime() + Math.max(durationMs, 30 * 60 * 1000));

    const updated = await deps.updateBookingStart({
      bookingId: input.booking_id,
      orgId: ctx.orgId,
      startsAt: newStarts,
      endsAt: newEndsAt,
    });

    if (!updated) {
      return { ok: false, reason: "update_failed" };
    }

    return {
      ok: true,
      bookingId: updated.id,
      newStartsAt: newStarts.toISOString(),
    };
  },
};

// ─── cancel_appointment ───────────────────────────────────────────────────
//
// v1.27.8 — same shape as reschedule. Sets bookings.status='cancelled'
// rather than deleting the row (audit trail).

const cancelAppointmentInput = z.object({
  booking_id: z.string().uuid(),
  customer_email: z.string().email(),
  reason: z.string().max(500).optional(),
  /** voice R1 — confirmation gate. Cancels ONLY when true. */
  confirmed: z.boolean().optional(),
});

/** Injectable DB seam for cancel_appointment — one scoped update returning the
 *  row (or null when the (orgId, id, email) guard matched nothing). */
export type CancelDeps = {
  cancelBooking: (args: {
    bookingId: string;
    orgId: string;
    email: string;
  }) => Promise<{ id: string } | null>;
};

function defaultCancelDeps(): CancelDeps {
  return {
    cancelBooking: async ({ bookingId, orgId, email }) => {
      const [updated] = await db
        .update(bookings)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(
          and(
            eq(bookings.id, bookingId),
            eq(bookings.orgId, orgId),
            ilike(bookings.email, email),
          ),
        )
        .returning({ id: bookings.id });
      return updated ?? null;
    },
  };
}

export const cancelAppointment: AgentTool<
  z.infer<typeof cancelAppointmentInput>,
  { ok: boolean; bookingId?: string; reason?: string } | NeedsConfirmation
> & {
  execute: (
    input: z.infer<typeof cancelAppointmentInput>,
    ctx: ToolExecuteContext,
    deps?: CancelDeps,
  ) => Promise<
    { ok: boolean; bookingId?: string; reason?: string } | NeedsConfirmation
  >;
} = {
  name: "cancel_appointment",
  description:
    "ACTUALLY cancel an existing appointment. Sets the booking's status to cancelled in the database. " +
    "USE WHEN the visitor confirms they want to cancel a booking matched by find_my_existing_appointment. " +
    "Args: booking_id, customer_email (must match booking's email — security), reason (optional, surfaces in operator's CRM activity feed). " +
    "CONFIRMATION REQUIRED: call FIRST with confirmed omitted to get a `readBack` sentence — say it, get a yes — THEN call again with confirmed:true. " +
    "DO NOT confirm a cancellation to the visitor without ok=true.",
  inputSchema: cancelAppointmentInput,
  jsonSchema: {
    type: "object",
    properties: {
      booking_id: { type: "string", format: "uuid" },
      customer_email: { type: "string", format: "email" },
      reason: { type: "string", maxLength: 500 },
      confirmed: {
        type: "boolean",
        description:
          "Set true ONLY after the caller confirms the read-back. Omit on the first call to receive the read-back; the cancellation happens only when this is true.",
      },
    },
    required: ["booking_id", "customer_email"],
  },
  execute: async (input, ctx, deps: CancelDeps = defaultCancelDeps()) => {
    // Confirmation gate — read back BEFORE we touch the DB.
    if (input.confirmed !== true) {
      return {
        ok: false,
        needsConfirmation: true,
        readBack: "Just to confirm — you'd like me to cancel your appointment, is that correct?",
        instruction: CONFIRM_INSTRUCTION,
      };
    }

    const updated = await deps.cancelBooking({
      bookingId: input.booking_id,
      orgId: ctx.orgId,
      email: input.customer_email,
    });

    if (!updated) {
      return { ok: false, reason: "booking_not_found_or_email_mismatch" };
    }

    return { ok: true, bookingId: updated.id };
  },
};

// ─── take_message (voice R1) ───────────────────────────────────────────────
//
// The safe exit. When the caller asks something out of scope, the agent is
// unsure, or it's after-hours, the agent takes a message instead of guessing:
// it upserts the caller as a contact, writes a "Callback requested" CRM
// activity, AND fires an operator SMS so the team knows to call back. Returns a
// short spoken confirmation. Reuses createContactForOrg (contact upsert) and
// sendSmsFromApi (the same Twilio path the post-call SMS uses).

const takeMessageInput = z.object({
  caller_name: z.string().min(1),
  caller_phone: z.string().min(1),
  message: z.string().min(1),
});

/** Injectable side-effect seam for take_message — lets the unit tests assert
 *  the contact upsert + activity + operator notify without a DB or Twilio. */
export type TakeMessageDeps = {
  upsertContact: (args: {
    orgId: string;
    fullName: string;
    phone: string | null;
  }) => Promise<{ id: string | null }>;
  writeCallbackActivity: (args: {
    orgId: string;
    contactId: string | null;
    subject: string;
    body: string;
    agentId: string;
    conversationId: string;
  }) => Promise<void>;
  notifyOperator: (args: { orgId: string; body: string }) => Promise<void>;
};

/**
 * Split a free-text caller name into first/last for the contacts table.
 * "Jane Doe" → { first:"Jane", last:"Doe" }; single token → last:null.
 */
function splitName(full: string): { first: string; last: string | null } {
  const parts = full.trim().split(/\s+/);
  const first = parts.shift() ?? full.trim();
  const last = parts.length > 0 ? parts.join(" ") : null;
  return { first, last };
}

function defaultTakeMessageDeps(): TakeMessageDeps {
  return {
    upsertContact: async ({ orgId, fullName, phone }) => {
      // Reuse the canonical contact create helper (emits contact.created +
      // infers lifecycle). Callback leads land as status 'lead', source 'voice'.
      const { createContactForOrg } = await import("@/lib/contacts/create-for-org");
      const { first, last } = splitName(fullName);
      return createContactForOrg({
        orgId,
        firstName: first,
        lastName: last,
        email: null,
        phone,
        status: "lead",
        source: "voice-callback",
      });
    },
    writeCallbackActivity: async ({ orgId, contactId, subject, body, agentId, conversationId }) => {
      // activities.userId is NOT NULL — attribute to the workspace owner, the
      // same way escalate_to_human does.
      const [owner] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.orgId, orgId))
        .limit(1);
      if (!owner?.id) return; // no owner to attribute to — skip (best-effort)
      await db.insert(activities).values({
        orgId,
        userId: owner.id,
        contactId,
        type: "voice_callback",
        subject,
        body,
        metadata: { source: "voice", agentId, conversationId },
        completedAt: new Date(),
      });
    },
    notifyOperator: async ({ orgId, body }) => {
      // Resolve the team's callback number: blueprint.notifyPhone if set, else
      // the workspace's own voice number. Send via the same Twilio path the
      // post-call SMS uses (sendSmsFromApi).
      const [agentRow] = await db
        .select({ blueprint: agents.blueprint })
        .from(agents)
        .where(and(eq(agents.orgId, orgId), eq(agents.archetype, "voice-receptionist")))
        .limit(1);
      const blueprint = (agentRow?.blueprint ?? {}) as AgentBlueprint;
      let to = blueprint.notifyPhone?.trim() || "";
      if (!to) {
        const { organizations } = await import("@/db/schema");
        const [org] = await db
          .select({ integrations: organizations.integrations })
          .from(organizations)
          .where(eq(organizations.id, orgId))
          .limit(1);
        const integrations = (org?.integrations ?? {}) as {
          twilio?: { fromNumber?: string };
        };
        to = integrations.twilio?.fromNumber?.trim() || "";
      }
      if (!to) return; // nowhere to send — skip (best-effort)
      const { sendSmsFromApi } = await import("@/lib/sms/api");
      await sendSmsFromApi({ orgId, userId: null, contactId: null, toNumber: to, body });
    },
  };
}

const TAKE_MESSAGE_SPOKEN =
  "Got it — I've passed your message to the team and they'll call you right back.";

/**
 * Core take_message logic. Pure of I/O except through `deps`. Contact upsert
 * and activity write are awaited (they're the record of the callback); the
 * operator SMS is best-effort — a flaky gateway must never fail the call, so a
 * throw there is swallowed and the caller still hears the confirmation.
 */
export async function runTakeMessage(
  input: z.infer<typeof takeMessageInput>,
  ctx: ToolExecuteContext,
  deps: TakeMessageDeps = defaultTakeMessageDeps(),
): Promise<{ ok: true; spoken: string }> {
  if (ctx.testMode) {
    return { ok: true, spoken: TAKE_MESSAGE_SPOKEN };
  }

  const { id: contactId } = await deps.upsertContact({
    orgId: ctx.orgId,
    fullName: input.caller_name,
    phone: input.caller_phone,
  });

  const body = `${input.caller_name} (${input.caller_phone}) asked for a callback: ${input.message}`;
  await deps.writeCallbackActivity({
    orgId: ctx.orgId,
    contactId,
    subject: "Callback requested",
    body,
    agentId: ctx.agentId,
    conversationId: ctx.conversationId,
  });

  // Operator SMS — best-effort. Never let a Twilio hiccup break the call.
  try {
    await deps.notifyOperator({
      orgId: ctx.orgId,
      body: `New callback request from ${input.caller_name} (${input.caller_phone}): ${input.message}`,
    });
  } catch {
    // swallow — the contact + activity already captured the message
  }

  return { ok: true, spoken: TAKE_MESSAGE_SPOKEN };
}

export const takeMessage: AgentTool<
  z.infer<typeof takeMessageInput>,
  { ok: true; spoken: string }
> = {
  name: "take_message",
  description:
    "Take a message and have the team call the caller back. USE THIS as the safe exit whenever you can't help directly: the caller asks something out of scope, you're unsure of the answer, or it's after-hours — DON'T guess, take a message. " +
    "Captures the caller as a contact, logs a callback request in the CRM, and alerts the team by text. " +
    "Args: caller_name, caller_phone (a number the team can reach them at), message (what they need). After it returns, tell the caller their message was passed along and the team will call back.",
  inputSchema: takeMessageInput,
  jsonSchema: {
    type: "object",
    properties: {
      caller_name: { type: "string", description: "The caller's name." },
      caller_phone: {
        type: "string",
        description: "A phone number the team can call them back on.",
      },
      message: {
        type: "string",
        description: "What the caller needs — captured for the team to act on.",
      },
    },
    required: ["caller_name", "caller_phone", "message"],
  },
  execute: (input, ctx) => runTakeMessage(input, ctx),
};

// ─── get_quote_range (voice R1 — quote guard) ──────────────────────────────
//
// Pricing becomes a tool that returns a RANGE, never a firm number. The agent
// NEVER states a price itself; it calls get_quote_range, which reads the
// operator-configured ranges off the voice agent's blueprint and returns a
// {low, high} band plus an "a technician confirms on-site" note. No range
// configured for the asked service → { hasRange:false }, and the agent says a
// tech will confirm (and may take_message).

const getQuoteRangeInput = z.object({
  service: z.string().min(1),
});

/** A configured per-service price band. Matches AgentBlueprint.quoteRanges. */
export type QuoteRange = { service: string; low: number; high: number; note?: string };

/**
 * Pure service→range matcher. Case-insensitive, trims whitespace. Returns the
 * matching range or null. Exact (normalized) match only — we never guess a
 * price for a service the operator didn't price.
 */
export function resolveQuoteRange(
  service: string,
  ranges: readonly QuoteRange[],
): QuoteRange | null {
  const needle = service.trim().toLowerCase();
  if (!needle) return null;
  return ranges.find((r) => r.service.trim().toLowerCase() === needle) ?? null;
}

const ON_SITE_NOTE = "a technician confirms the exact price on-site";

export type GetQuoteRangeResult =
  | { hasRange: true; service: string; low: number; high: number; note: string }
  | { hasRange: false };

/** Injectable seam: load the workspace's configured quote ranges. */
export type GetQuoteRangeDeps = {
  loadQuoteRanges: (ctx: ToolExecuteContext) => Promise<QuoteRange[]>;
};

function defaultGetQuoteRangeDeps(): GetQuoteRangeDeps {
  return {
    loadQuoteRanges: async (ctx) => {
      const [agentRow] = await db
        .select({ blueprint: agents.blueprint })
        .from(agents)
        .where(
          and(eq(agents.orgId, ctx.orgId), eq(agents.archetype, "voice-receptionist")),
        )
        .limit(1);
      const blueprint = (agentRow?.blueprint ?? {}) as AgentBlueprint;
      return blueprint.quoteRanges ?? [];
    },
  };
}

/** Core get_quote_range logic — loads ranges via deps, matches purely. */
export async function runGetQuoteRange(
  input: z.infer<typeof getQuoteRangeInput>,
  ctx: ToolExecuteContext,
  deps: GetQuoteRangeDeps = defaultGetQuoteRangeDeps(),
): Promise<GetQuoteRangeResult> {
  const ranges = await deps.loadQuoteRanges(ctx);
  const match = resolveQuoteRange(input.service, ranges);
  if (!match) {
    return { hasRange: false };
  }
  return {
    hasRange: true,
    service: match.service,
    low: match.low,
    high: match.high,
    note: match.note?.trim() || ON_SITE_NOTE,
  };
}

export const getQuoteRange: AgentTool<
  z.infer<typeof getQuoteRangeInput>,
  GetQuoteRangeResult
> = {
  name: "get_quote_range",
  description:
    "Get the price RANGE for a service. ALWAYS call this when a caller asks 'how much' — NEVER state a price yourself and NEVER commit to a firm number. " +
    "Returns { hasRange:true, low, high, note } — quote the range as a ballpark and add the note ('a technician confirms the exact price on-site'). " +
    "If hasRange:false, the service isn't priced — tell the caller a technician will confirm the price, and offer to take a message (take_message) so the team can follow up.",
  inputSchema: getQuoteRangeInput,
  jsonSchema: {
    type: "object",
    properties: {
      service: {
        type: "string",
        description: "The service the caller is asking the price of (e.g. 'furnace repair').",
      },
    },
    required: ["service"],
  },
  execute: (input, ctx) => runGetQuoteRange(input, ctx),
};

// ─── allowlist ─────────────────────────────────────────────────────────────

export const ALL_TOOLS: AgentTool[] = [
  lookUpAvailability as AgentTool,
  bookAppointment as AgentTool,
  findMyExistingAppointment as AgentTool,
  rescheduleAppointment as AgentTool,
  cancelAppointment as AgentTool,
  escalateToHuman as AgentTool,
  provideFaqAnswer as AgentTool,
  takeMessage as AgentTool,
  getQuoteRange as AgentTool,
];

/** Compute the NATIVE (capability-filtered) tool list. This is the ENTIRE
 *  pre-connector behavior, preserved byte-for-byte: no capabilities → the full
 *  ALL_TOOLS (same references, same order); otherwise the same filter. Pulling
 *  it into a helper lets getToolsForCapabilities stay obviously-identical on the
 *  no-connectors path (it just returns this). */
export function nativeToolsForCapabilities(
  capabilities: string[] | undefined,
): AgentTool[] {
  if (!capabilities || capabilities.length === 0) {
    return ALL_TOOLS;
  }
  return ALL_TOOLS.filter((tool) => capabilities.includes(tool.name));
}

/** Options for the connector merge. ABSENT/empty → the native path, unchanged. */
export type GetToolsOptions = {
  /** Workspace id — threaded to each wrapped MCP tool's secret lookup. */
  orgId?: string;
  /** Per-agent connector bindings (blueprint.connectors). */
  connectors?: import("./mcp/connectors").ConnectorBinding[];
  /** Injectable MCP deps (default = real encrypted-secret read + inline client).
   *  Tests pass fakes so no network/DB is touched. */
  mcpDeps?: import("./mcp/wrap-tool").WrapMcpDeps;
  /** Injectable Composio deps (default = real session adapter + inline client).
   *  Tests pass fakes/stubs so no network/DB is touched. */
  composioDeps?: import("@/lib/integrations/composio/connector").ComposioWrapDeps;
  /** Injectable Composio-key presence check (default = real resolver). Returns
   *  true when the workspace has a usable Composio key (BYO or platform). When
   *  false, composio bindings are dropped entirely (fail-closed to native-only,
   *  so the model never even sees the toolkit's tools). */
  hasComposioKey?: (orgId: string) => Promise<boolean>;
};

/** Lazily-built default MCP deps: read the bearer from the encrypted
 *  workspaceSecrets store (skipAccessCheck — the runtime has no user session in
 *  voice/SMS/public-chat), and build the inline MCP-over-HTTP client. Imported
 *  lazily so the connector path never loads on the native-only hot path. */
async function defaultMcpDeps(): Promise<
  import("./mcp/wrap-tool").WrapMcpDeps
> {
  const [{ getSecretValue }, { createMcpClient }] = await Promise.all([
    import("@/lib/secrets"),
    import("./mcp/client"),
  ]);
  return {
    getSecret: async (orgId, serviceName) =>
      getSecretValue({ workspaceId: orgId, serviceName, skipAccessCheck: true }),
    makeClient: (endpoint, bearer) => createMcpClient({ endpoint, bearer }),
  };
}

/** Lazily-built default Composio wrap deps (real session adapter + inline
 *  client). Imported lazily so the native-only hot path never loads Composio. */
async function defaultComposioWrapDeps(): Promise<
  import("@/lib/integrations/composio/connector").ComposioWrapDeps
> {
  const { defaultComposioWrapDeps: build } = await import(
    "@/lib/integrations/composio/connector"
  );
  return build();
}

/** Default Composio-key presence probe (BYO secret or platform env). */
async function defaultHasComposioKey(orgId: string): Promise<boolean> {
  const { resolveComposioKey } = await import("@/lib/integrations/composio/keys");
  const { source } = await resolveComposioKey(orgId);
  return source !== "none";
}

/**
 * THE SEAM. Returns the agent's tool set = native (capability-filtered) tools,
 * then — if any connectors are bound — their enabled + cached tools wrapped as
 * AgentTools (namespaced `${serviceName}__${tool}`), appended AFTER the natives.
 *
 * REGRESSION INVARIANT: with no connectors (the live voice/web/SMS agents), the
 * return is the IDENTICAL native list this function produced before connectors
 * existed — same tools, same order, same object references. Proven by
 * wrap-tool.spec.ts. Native tools are never copied, re-wrapped, or reordered.
 *
 * Async because building wrapped tools may need the (lazy) MCP deps; the
 * no-connectors branch returns synchronously-equivalent natives (no deps loaded).
 */
export async function getToolsForCapabilities(
  capabilities: string[] | undefined,
  opts?: GetToolsOptions,
): Promise<AgentTool[]> {
  let native = nativeToolsForCapabilities(capabilities);

  // SeldonChat operator copilot (win-ladder P0): its 8 admin tools aren't in
  // ALL_TOOLS (they're not caller-facing voice/chat tools), so the capability
  // filter above never surfaces them. Append explicitly when requested. Spread
  // into a NEW array — `native` may be the literal ALL_TOOLS reference when
  // capabilities is empty/undefined, and mutating that shared array would leak
  // copilot tools into every other caller.
  if (capabilities?.includes(COPILOT_CAPABILITY)) {
    const { buildCopilotTools } = await import("./copilot/tools");
    native = [...native, ...buildCopilotTools()];
  }

  const connectors = opts?.connectors;
  if (!connectors || connectors.length === 0) {
    // No connectors → byte-for-byte the native list. Nothing loaded, nothing
    // appended. This is the path every live agent takes today.
    return native;
  }

  // Connector path. Only reached when an agent actually has bindings. Split the
  // bindings: vetted/byo resolve a static endpoint + stored bearer (wrap-tool);
  // composio resolves a LIVE per-workspace session (lib/integrations/composio).
  const staticBindings = connectors.filter(
    (b): b is Exclude<typeof b, { kind: "composio" }> => b.kind !== "composio",
  );
  const composioBindings = connectors.filter((b) => b.kind === "composio");

  const wrapped: AgentTool[] = [];

  if (staticBindings.length > 0) {
    const { wrapMcpTool } = await import("./mcp/wrap-tool");
    const deps = opts?.mcpDeps ?? (await defaultMcpDeps());
    for (const binding of staticBindings) {
      const cached = binding.tools ?? [];
      const enabled = new Set(binding.enabledTools);
      for (const mcpTool of cached) {
        // Allowlist: only the binding's enabledTools are exposed. A cached but
        // disabled tool (or an enabled name with no cached schema) is skipped.
        if (!enabled.has(mcpTool.name)) continue;
        wrapped.push(wrapMcpTool(binding, mcpTool, deps) as AgentTool);
      }
    }
  }

  if (composioBindings.length > 0) {
    // FAIL-CLOSED: if the workspace has no Composio key (no platform env + no BYO
    // secret), drop every composio binding so the agent simply gets its native
    // tools — no throw, no crash, and the model never sees a composio tool.
    const orgId = opts?.orgId;
    const hasKey = orgId
      ? await (opts?.hasComposioKey ?? defaultHasComposioKey)(orgId)
      : false;
    if (hasKey) {
      const { resolveComposioBinding } = await import(
        "@/lib/integrations/composio/connector"
      );
      const composioDeps =
        opts?.composioDeps ?? (await defaultComposioWrapDeps());
      for (const binding of composioBindings) {
        for (const tool of resolveComposioBinding(binding, composioDeps)) {
          wrapped.push(tool);
        }
      }
    }
  }

  // Natives FIRST (unchanged), then the wrapped MCP/Composio tools.
  return [...native, ...wrapped];
}

export function findTool(name: string): AgentTool | undefined {
  return ALL_TOOLS.find((t) => t.name === name);
}
