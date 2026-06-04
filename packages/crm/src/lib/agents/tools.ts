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
import { bookings, contacts } from "@/db/schema";
import { listPublicBookingSlotsAction } from "@/lib/bookings/actions";

export type ToolExecuteContext = {
  orgId: string;
  orgSlug: string;
  agentId: string;
  conversationId: string;
  /** True for status='test' conversations: tool execution returns
   *  synthetic responses, no DB writes. */
  testMode: boolean;
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

export const lookUpAvailability: AgentTool<
  z.infer<typeof lookUpAvailabilityInput>,
  { slots: LabeledSlot[]; durationMinutes: number; date: string; timezone: string }
> = {
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
  execute: async (input, ctx) => {
    const bookingSlug = input.bookingSlug ?? "default";
    // Parse the requested start date as a UTC noon moment so the walk
    // is stable across DST (it just increments by 24h in pure UTC).
    const startDate = new Date(`${input.date}T12:00:00Z`);

    // Track durationMinutes from the first non-empty day we hit. If
    // every queried day is empty (unconfigured availability, fully
    // booked horizon), fall back to 30 — matches the
    // listPublicBookingSlotsAction default.
    let durationMinutes = 30;
    let durationSeen = false;
    // Track the workspace timezone so we can label slots in the BUSINESS'S
    // local time (not UTC). listPublicBookingSlotsAction surfaces it as
    // `workspaceTimezone`, but omits it on its empty/early-return paths —
    // so default to UTC and latch the first real value we see.
    let timezone = "UTC";
    let timezoneSeen = false;

    const slots = await findNextAvailableSlots({
      startDate,
      maxSlots: CHATBOT_SLOT_CAP,
      maxDaysToWalk: CHATBOT_WALK_HORIZON_DAYS,
      fetchSlotsForDay: async (date) => {
        const result = await listPublicBookingSlotsAction({
          orgSlug: ctx.orgSlug,
          bookingSlug,
          date: formatDateYYYYMMDD(date),
        });
        if (!durationSeen && typeof result.durationMinutes === "number") {
          durationMinutes = result.durationMinutes;
          durationSeen = true;
        }
        // `workspaceTimezone` is absent on the action's early-return paths,
        // so read it defensively (the result type is a union without it).
        const tz = (result as { workspaceTimezone?: string }).workspaceTimezone;
        if (!timezoneSeen && typeof tz === "string" && tz) {
          timezone = tz;
          timezoneSeen = true;
        }
        return result.slots;
      },
    });

    return {
      // Each slot carries the raw `iso` (passed VERBATIM to book_appointment)
      // and a `label` already converted to the workspace timezone for the
      // agent to read aloud — so it can't quote the UTC hour by mistake.
      slots: labelSlots(slots, timezone),
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

// ─── book_appointment ──────────────────────────────────────────────────────

const bookAppointmentInput = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  slotIso: z.string(),
  notes: z.string().optional(),
  bookingSlug: z.string().optional(),
});

export const bookAppointment: AgentTool<
  z.infer<typeof bookAppointmentInput>,
  { ok: boolean; bookingId?: string; testMode?: boolean; error?: string }
> = {
  name: "book_appointment",
  description:
    "Create a confirmed booking. CALL ORDER: (1) look_up_availability({date}) FIRST to get real slots, (2) book_appointment with the chosen slot's `iso` field passed VERBATIM as slotIso. Never invent or hand-edit a slot — each slot's `iso` is a full UTC ISO timestamp ('2026-05-13T16:00:00Z') that carries timezone info; if you trim, reformat, or substitute the spoken `label` for it, the server will book the wrong time across timezones.",
  inputSchema: bookAppointmentInput,
  jsonSchema: {
    type: "object",
    properties: {
      fullName: { type: "string" },
      email: { type: "string", format: "email" },
      phone: { type: "string" },
      slotIso: {
        type: "string",
        description:
          "MUST be the `iso` field of one of the slots returned by look_up_availability, copied VERBATIM. Format is full UTC ISO with Z suffix (e.g. '2026-05-13T16:00:00Z'). Do NOT pass the human `label` (e.g. '10:00 AM PDT') or a naive local time like '2026-05-13T09:00' — those get misinterpreted and book the wrong time.",
      },
      notes: { type: "string" },
      bookingSlug: { type: "string" },
    },
    required: ["fullName", "email", "slotIso"],
  },
  execute: async (input, ctx) => {
    if (ctx.testMode) {
      return {
        ok: true,
        testMode: true,
        bookingId: `test-${Date.now()}`,
      };
    }
    // Lazy import — submitPublicBookingAction lives in bookings/actions
    // and imports many other modules; keeping it lazy reduces the
    // tools-module load cost during runtime startup.
    const { submitPublicBookingAction } = await import("@/lib/bookings/actions");
    try {
      // submitPublicBookingAction returns { success, confirmationMessage,
      // checkoutUrl }. We don't surface checkoutUrl to the LLM (would
      // need handoff to a payment flow which v1.26 doesn't model).
      // Phone goes into notes as a stop-gap until v1.26.1 widens the
      // public-booking signature to accept phone explicitly.
      const composedNotes = [
        input.notes,
        input.phone ? `Phone: ${input.phone}` : null,
      ]
        .filter(Boolean)
        .join("\n");
      await submitPublicBookingAction({
        orgSlug: ctx.orgSlug,
        bookingSlug: input.bookingSlug ?? "default",
        fullName: input.fullName,
        email: input.email,
        notes: composedNotes || undefined,
        startsAt: input.slotIso,
      });
      return { ok: true };
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
});

export const rescheduleAppointment: AgentTool<
  z.infer<typeof rescheduleAppointmentInput>,
  { ok: boolean; bookingId?: string; newStartsAt?: string; reason?: string }
> = {
  name: "reschedule_appointment",
  description:
    "ACTUALLY reschedule an existing appointment. Updates the booking row in the database to the new start time. " +
    "USE WHEN the visitor confirms a new time after find_my_existing_appointment matched their booking. " +
    "Args: booking_id from find_my_existing_appointment, new_starts_at_iso (ISO 8601 in UTC; resolve relative dates like 'next Monday' to a concrete ISO using the temporal anchor in your system prompt), customer_email (must match the booking's email — security check). " +
    "DO NOT confirm a reschedule to the visitor without calling this tool — saying 'done' without actually moving the booking is a critical failure. Tell them only AFTER ok=true.",
  inputSchema: rescheduleAppointmentInput,
  jsonSchema: {
    type: "object",
    properties: {
      booking_id: { type: "string", format: "uuid" },
      new_starts_at_iso: { type: "string", format: "date-time" },
      customer_email: { type: "string", format: "email" },
    },
    required: ["booking_id", "new_starts_at_iso", "customer_email"],
  },
  execute: async (input, ctx) => {
    const newStarts = new Date(input.new_starts_at_iso);
    if (Number.isNaN(newStarts.getTime())) {
      return { ok: false, reason: "invalid_date" };
    }

    // Look up the booking to compute the new endsAt (preserve duration)
    // and verify (orgId, email) match.
    const [existing] = await db
      .select({
        id: bookings.id,
        startsAt: bookings.startsAt,
        endsAt: bookings.endsAt,
        title: bookings.title,
        contactId: bookings.contactId,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.id, input.booking_id),
          eq(bookings.orgId, ctx.orgId),
          ilike(bookings.email, input.customer_email),
        ),
      )
      .limit(1);

    if (!existing) {
      return { ok: false, reason: "booking_not_found_or_email_mismatch" };
    }

    const start = existing.startsAt instanceof Date ? existing.startsAt : new Date(existing.startsAt);
    const end = existing.endsAt instanceof Date ? existing.endsAt : new Date(existing.endsAt);
    const durationMs = end.getTime() - start.getTime();
    const newEndsAt = new Date(newStarts.getTime() + Math.max(durationMs, 30 * 60 * 1000));

    const [updated] = await db
      .update(bookings)
      .set({
        startsAt: newStarts,
        endsAt: newEndsAt,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(bookings.id, input.booking_id),
          eq(bookings.orgId, ctx.orgId),
        ),
      )
      .returning({ id: bookings.id });

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
});

export const cancelAppointment: AgentTool<
  z.infer<typeof cancelAppointmentInput>,
  { ok: boolean; bookingId?: string; reason?: string }
> = {
  name: "cancel_appointment",
  description:
    "ACTUALLY cancel an existing appointment. Sets the booking's status to cancelled in the database. " +
    "USE WHEN the visitor confirms they want to cancel a booking matched by find_my_existing_appointment. " +
    "Args: booking_id, customer_email (must match booking's email — security), reason (optional, surfaces in operator's CRM activity feed). " +
    "DO NOT confirm a cancellation to the visitor without calling this tool. Tell them only AFTER ok=true.",
  inputSchema: cancelAppointmentInput,
  jsonSchema: {
    type: "object",
    properties: {
      booking_id: { type: "string", format: "uuid" },
      customer_email: { type: "string", format: "email" },
      reason: { type: "string", maxLength: 500 },
    },
    required: ["booking_id", "customer_email"],
  },
  execute: async (input, ctx) => {
    const [updated] = await db
      .update(bookings)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(
        and(
          eq(bookings.id, input.booking_id),
          eq(bookings.orgId, ctx.orgId),
          ilike(bookings.email, input.customer_email),
        ),
      )
      .returning({ id: bookings.id });

    if (!updated) {
      return { ok: false, reason: "booking_not_found_or_email_mismatch" };
    }

    return { ok: true, bookingId: updated.id };
  },
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
];

export function getToolsForCapabilities(
  capabilities: string[] | undefined,
): AgentTool[] {
  if (!capabilities || capabilities.length === 0) {
    return ALL_TOOLS;
  }
  return ALL_TOOLS.filter((tool) => capabilities.includes(tool.name));
}

export function findTool(name: string): AgentTool | undefined {
  return ALL_TOOLS.find((t) => t.name === name);
}
