import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  activities,
  bookings,
  contacts,
  organizations,
  orgMembers,
} from "@/db/schema";
import type { ToolInvoker } from "@/lib/workflow/types";
import { sendEmailFromApi } from "@/lib/emails/api";
import { sendSmsFromApi } from "@/lib/sms/api";
import { emitSeldonEvent } from "@/lib/events/bus";

// 2026-05-18 — agent-initiated activities have no human actor, but
// activities.user_id is NOT NULL with FK to users. We resolve a sane
// actor in this order:
//   1. organizations.ownerId (typical workspace shape)
//   2. orgMembers.userId for this org (any team member as fallback)
//   3. throw — no user to attribute the activity to, fail loudly so
//      the operator sees the configuration gap rather than silently
//      losing audit rows
// A dedicated `agent_user` per workspace is a cleaner V1.1 — for now
// the org owner is the right semantic owner of agent actions.
async function resolveAgentActorUserId(orgId: string): Promise<string> {
  const [org] = await db
    .select({ ownerId: organizations.ownerId })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (org?.ownerId) return org.ownerId;

  const [member] = await db
    .select({ userId: orgMembers.userId })
    .from(orgMembers)
    .where(eq(orgMembers.orgId, orgId))
    .limit(1);
  if (member?.userId) return member.userId;

  throw new Error(
    `resolveAgentActorUserId: no owner or member found for org ${orgId} — agent activities require a user_id (activities.user_id is NOT NULL)`,
  );
}

/**
 * WS3.1.3 — minimal in-process tool invoker for the agent runtime.
 *
 * The existing `notImplementedToolInvoker` throws — that's correct
 * default behavior for the test suite and for archetypes that haven't
 * been wired yet. For production agent runs we need a real invoker
 * that maps tool names to side-effecting actions on the workspace.
 *
 * Coverage in this slice:
 *   - `create_activity` — log an activity row on a contact for the
 *     audit trail. Always safe (no external API call).
 *
 * Tools NOT implemented yet (each fails the run with a clear error
 * the operator sees on the runs page):
 *   - `send_sms` — needs Twilio API config + per-org credentials
 *   - `send_email` — needs Resend API key + sender domain
 *   - `create_booking` — needs to call the existing booking API with
 *     the right authentication context
 *   - `create_coupon` — needs Stripe coupon API
 *
 * Each unimplemented tool throws with `tool_not_implemented:<name>`
 * so the runtime marks the run failed, and the run-page detail
 * drawer shows the operator exactly what's missing. That's V1-safe:
 * the agent UI is honest about what's wired.
 *
 * To add a new tool: add an entry to TOOL_HANDLERS keyed by the tool
 * name. Each handler receives (orgId, args) and returns the data
 * value the runtime captures into scope. Returning `{ data: ... }`
 * follows the convention captured from MCP tool calls (the runtime's
 * `capture` field unwraps `data` automatically).
 */

export type ToolHandler = (
  orgId: string,
  args: Record<string, unknown>
) => Promise<unknown>;

const TOOL_HANDLERS: Record<string, ToolHandler> = {
  create_activity: async (orgId, args) => {
    const contactId = typeof args.contact_id === "string" ? args.contact_id : null;
    const type = typeof args.type === "string" ? args.type : "agent_action";
    const subject = typeof args.subject === "string" ? args.subject : null;
    const body = typeof args.body === "string" ? args.body : null;

    if (!contactId) {
      throw new Error("create_activity: contact_id is required");
    }

    // 2026-05-18 — resolve a real user_id (org owner or fallback to
    // a member). Previously this passed orgId-as-userId which crashed
    // every speed-to-lead run at step 4 (log_booking_activity) with
    // FK violation against users(id). Visible in
    // workflow_step_results.error_message.
    const actorUserId = await resolveAgentActorUserId(orgId);

    const [created] = await db
      .insert(activities)
      .values({
        orgId,
        contactId,
        userId: actorUserId,
        type,
        subject,
        body,
        metadata: {
          source: "agent",
          ...(args.metadata && typeof args.metadata === "object"
            ? (args.metadata as Record<string, unknown>)
            : {}),
        },
      })
      .returning({ id: activities.id });

    return { data: { id: created?.id, contactId, type, subject } };
  },

  // 2026-05-18 — create_booking + send_email + send_sms wired so the
  // speed-to-lead pipeline actually completes. Previously every run
  // failed at the first mcp_tool_call step with "tool_not_implemented:
  // create_booking" — visible in workflow_step_results.error_message.
  // Each handler now maps to an in-process function call.

  create_booking: async (orgId, args) => {
    const contactId =
      typeof args.contact_id === "string" ? args.contact_id : null;
    const appointmentTypeId =
      typeof args.appointment_type_id === "string"
        ? args.appointment_type_id
        : null;
    const startsAtRaw = args.starts_at;
    const notes = typeof args.notes === "string" ? args.notes : null;

    if (!contactId) throw new Error("create_booking: contact_id is required");
    if (!appointmentTypeId)
      throw new Error("create_booking: appointment_type_id is required");

    // 2026-05-18 — try to parse starts_at. If the value is missing,
    // the literal placeholder string "{{preferred_start}}" (conversation
    // engine didn't extract it), or any other unparseable shape, fall
    // back to the next business-hours slot 24h+ from now. This
    // accommodates the speed-to-lead pipeline's current limitation:
    // the conversation step no-ops (engine not wired yet), so
    // preferred_start is never captured. Booking the next reasonable
    // slot is more useful than failing the run.
    const parseAttempt =
      startsAtRaw instanceof Date
        ? startsAtRaw
        : typeof startsAtRaw === "string" && !startsAtRaw.includes("{{")
          ? new Date(startsAtRaw)
          : typeof startsAtRaw === "number"
            ? new Date(startsAtRaw)
            : null;
    let startsAt: Date;
    let usedFallback = false;
    if (parseAttempt && !Number.isNaN(parseAttempt.getTime())) {
      startsAt = parseAttempt;
    } else {
      startsAt = nextBusinessHourSlot(new Date());
      usedFallback = true;
    }

    // Load the appointment-type template (status='template') to get
    // duration + bookingSlug; we need both to compute endsAt and to
    // link the new booking to the right slug for the public manage URL.
    const [template] = await db
      .select({
        id: bookings.id,
        bookingSlug: bookings.bookingSlug,
        title: bookings.title,
        metadata: bookings.metadata,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.orgId, orgId),
          eq(bookings.id, appointmentTypeId),
          eq(bookings.status, "template"),
        ),
      )
      .limit(1);
    if (!template) {
      throw new Error(
        `create_booking: appointment type ${appointmentTypeId} not found`,
      );
    }
    const meta = (template.metadata as Record<string, unknown> | null) ?? {};
    const durationMinutes =
      typeof meta.durationMinutes === "number" && meta.durationMinutes > 0
        ? meta.durationMinutes
        : 30;
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);

    // Pull the contact for fullName + email — needed on the bookings row.
    const [contact] = await db
      .select({
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
      })
      .from(contacts)
      .where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId)))
      .limit(1);
    const fullName = contact
      ? [contact.firstName, contact.lastName].filter(Boolean).join(" ")
      : null;

    const [created] = await db
      .insert(bookings)
      .values({
        orgId,
        contactId,
        title: template.title || "Booked consultation",
        bookingSlug: template.bookingSlug,
        fullName,
        email: contact?.email ?? null,
        notes,
        provider: "manual",
        status: "scheduled",
        startsAt,
        endsAt,
        metadata: {
          source: "agent",
          appointmentType: template.title,
          durationMinutes,
        },
      })
      .returning({ id: bookings.id });

    if (!created?.id) {
      throw new Error("create_booking: insert returned no row");
    }

    // Fire booking.created so the outbound messaging dispatcher sends
    // the confirmation email + SMS. Same event the public submit path
    // emits — the messaging layer is event-driven, not caller-driven,
    // so this is the right hook.
    await emitSeldonEvent(
      "booking.created",
      {
        appointmentId: created.id,
        contactId,
      },
      { orgId },
    );

    return {
      data: {
        id: created.id,
        contact_id: contactId,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        used_fallback_slot: usedFallback,
      },
    };
  },

  send_email: async (orgId, args) => {
    const rawTo = typeof args.to === "string" ? args.to : null;
    const subject = typeof args.subject === "string" ? args.subject : null;
    const body = typeof args.body === "string" ? args.body : null;
    const contactId =
      typeof args.contactId === "string"
        ? args.contactId
        : typeof args.contact_id === "string"
          ? args.contact_id
          : null;

    // 2026-05-18 — "to" is often supplied as a {{trigger.contact.email}}
    // placeholder that the variable resolver doesn't always match
    // (form.submitted payload nests email under data.email, not
    // contact.email). When the resolved value is empty, unresolved
    // placeholder (literal "{{...}}"), or missing, fall back to the
    // contact's email looked up by contactId. Same fallback shape as
    // create_booking's starts_at handling.
    let to: string | null = rawTo;
    if (!to || to.trim().length === 0 || to.includes("{{")) {
      if (contactId) {
        const [contactRow] = await db
          .select({ email: contacts.email })
          .from(contacts)
          .where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId)))
          .limit(1);
        if (contactRow?.email) to = contactRow.email;
      }
    }

    if (!to) throw new Error("send_email: to is required (and contactId lookup found no email)");
    if (!subject) throw new Error("send_email: subject is required");
    if (!body) throw new Error("send_email: body is required");

    const result = await sendEmailFromApi({
      orgId,
      userId: null,
      contactId,
      toEmail: to,
      subject,
      body,
    });
    return {
      data: {
        email_id: result.suppressed ? null : result.emailId,
        suppressed: result.suppressed,
        contact_id: result.contactId,
      },
    };
  },

  // 2026-05-18 — read-only availability lookup so the LLM can propose
  // real slots inside a conversation ("Tuesday 2pm or Wednesday 10am
  // work — which do you prefer?"). Returns the next N open slots for
  // an appointment type starting from `from_date` (ISO) up to
  // `max_results` (default 10). Each slot is a UTC ISO string the LLM
  // can echo back in a {{preferred_start}} extract or pass directly
  // to create_booking.
  check_availability: async (orgId, args) => {
    // 2026-05-18 (later) — KNOWN failure modes return a structured
    // `{ ok: false, soft_error, hint }` payload instead of throwing.
    // Why: when this tool throws, the conversation step's tool-use
    // loop pushes the raw error into the LLM's tool_result content
    // with is_error=true. The LLM then paraphrases — sometimes
    // emitting "we couldn't find your appointment. please call us."
    // straight to the customer. The system prompt now instructs the
    // LLM to treat ok:false as "ask the customer for a preferred
    // time and confirm internally" instead of paraphrasing the error.
    // Unrecognized failures still throw (so a real bug surfaces in
    // /automations/runs as a failed step instead of being silently
    // swallowed into an LLM reply).
    const appointmentTypeId =
      typeof args.appointment_type_id === "string"
        ? args.appointment_type_id
        : null;
    const fromDate =
      typeof args.from_date === "string" ? args.from_date : null;
    const maxResults =
      typeof args.max_results === "number" && args.max_results > 0
        ? Math.min(20, Math.floor(args.max_results))
        : 10;
    if (!appointmentTypeId) {
      return {
        data: {
          ok: false,
          soft_error: "missing_appointment_type",
          hint:
            "I don't have a specific calendar to read from. Ask the customer for their preferred day/time and confirm you'll get back to them.",
          by_day: [],
          total_slots: 0,
        },
      };
    }

    // Load the appointment-type template + workspace slug — slot
    // listing API is keyed on orgSlug/bookingSlug for public use; we
    // resolve both from the appointment-type row.
    const [template] = await db
      .select({ bookingSlug: bookings.bookingSlug, metadata: bookings.metadata })
      .from(bookings)
      .where(
        and(
          eq(bookings.orgId, orgId),
          eq(bookings.id, appointmentTypeId),
          eq(bookings.status, "template"),
        ),
      )
      .limit(1);
    if (!template) {
      return {
        data: {
          ok: false,
          soft_error: "appointment_type_not_found",
          hint:
            "The calendar id I have doesn't match a real appointment type — ask the customer for their preferred day/time and confirm you'll book it manually.",
          by_day: [],
          total_slots: 0,
        },
      };
    }
    const [orgRow] = await db
      .select({ slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    if (!orgRow?.slug) {
      // Workspace slug unresolvable is a REAL bug (workspace exists
      // but has no slug — should never happen). Throw so /runs
      // surfaces it.
      throw new Error("check_availability: workspace slug not resolvable");
    }

    // Walk the next 14 days starting from from_date or today, collect
    // slots until we hit max_results. Each day query reuses the public
    // listPublicBookingSlotsAction so availability + conflict checks
    // stay consistent with what the booking page renders.
    const { listPublicBookingSlotsAction } = await import(
      "@/lib/bookings/actions"
    );
    const start = fromDate ? new Date(fromDate) : new Date();
    const collected: Array<{ date: string; slots: string[] }> = [];
    let total = 0;
    for (let i = 0; i < 14 && total < maxResults; i += 1) {
      const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(d.getUTCDate()).padStart(2, "0");
      const dateStr = `${yyyy}-${mm}-${dd}`;
      const { slots } = await listPublicBookingSlotsAction({
        orgSlug: orgRow.slug,
        bookingSlug: template.bookingSlug,
        date: dateStr,
      });
      const take = slots.slice(0, maxResults - total);
      if (take.length > 0) {
        collected.push({ date: dateStr, slots: take });
        total += take.length;
      }
    }
    const meta = (template.metadata as Record<string, unknown> | null) ?? {};
    // 2026-05-18 (later) — explicit ok flag + zero-slots guidance.
    // When the 14-day window returns nothing (everything booked, or
    // availability window not configured), give the LLM a phrase to
    // use instead of leaving it to improvise.
    if (total === 0) {
      return {
        data: {
          ok: true,
          appointment_type_id: appointmentTypeId,
          duration_minutes: typeof meta.durationMinutes === "number" ? meta.durationMinutes : 30,
          by_day: [],
          total_slots: 0,
          hint:
            "No open slots in the next 14 days. Ask the customer if a date further out works, or offer to have someone call them back.",
        },
      };
    }
    return {
      data: {
        ok: true,
        appointment_type_id: appointmentTypeId,
        duration_minutes: typeof meta.durationMinutes === "number" ? meta.durationMinutes : 30,
        by_day: collected,
        total_slots: total,
      },
    };
  },

  send_sms: async (orgId, args) => {
    const rawTo =
      typeof args.to === "string"
        ? args.to
        : typeof args.to_number === "string"
          ? args.to_number
          : null;
    const body = typeof args.body === "string" ? args.body : null;
    const contactId =
      typeof args.contactId === "string"
        ? args.contactId
        : typeof args.contact_id === "string"
          ? args.contact_id
          : null;

    // Same contact-fallback pattern as send_email — recover from
    // unresolved placeholders like "{{trigger.contact.phone}}".
    let to: string | null = rawTo;
    if (!to || to.trim().length === 0 || to.includes("{{")) {
      if (contactId) {
        const [contactRow] = await db
          .select({ phone: contacts.phone })
          .from(contacts)
          .where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId)))
          .limit(1);
        if (contactRow?.phone) to = contactRow.phone;
      }
    }

    if (!to) throw new Error("send_sms: to is required (and contactId lookup found no phone)");
    if (!body) throw new Error("send_sms: body is required");

    const result = await sendSmsFromApi({
      orgId,
      userId: null,
      contactId,
      toNumber: to,
      body,
    });
    return {
      data: {
        external_message_id: result.suppressed ? null : result.externalMessageId,
        suppressed: result.suppressed,
        contact_id: result.contactId,
      },
    };
  },
};

// 2026-05-18 — fallback slot picker when create_booking is called
// without a valid starts_at. The speed-to-lead conversation engine
// isn't wired (separate slice), so {{preferred_start}} captures
// don't happen and the placeholder reaches create_booking unresolved.
// Rather than fail the run, we book the next reasonable slot.
//
// Heuristic:
//   - 24 hours from now
//   - Bumped to Monday if it lands on Sat or Sun
//   - Snapped to 10:00 UTC (rough business-hours anchor; per-workspace
//     timezone-aware version is a follow-up)
//
// This is intentionally crude — operators get a real meeting slot
// they can adjust through the contact's booking record. Better than
// "form submitted but no follow-through" which is the current state.
function nextBusinessHourSlot(now: Date): Date {
  const candidate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  // 0 = Sun, 6 = Sat — bump forward to Monday in either case.
  const day = candidate.getUTCDay();
  if (day === 0) candidate.setUTCDate(candidate.getUTCDate() + 1); // Sun → Mon
  if (day === 6) candidate.setUTCDate(candidate.getUTCDate() + 2); // Sat → Mon
  candidate.setUTCHours(15, 0, 0, 0); // 10 AM ET / 3 PM UTC — rough default
  return candidate;
}

/**
 * Build a runtime ToolInvoker for a given workspace. Closes over
 * the orgId so the runtime callers don't need to thread it through.
 *
 * Unknown tool names throw with a stable error code so the run-page
 * surface can format the failure ("Tool not implemented: send_sms")
 * rather than showing a stack trace.
 */
export function makeAgentToolInvoker(orgId: string): ToolInvoker {
  return async (toolName, args) => {
    const handler = TOOL_HANDLERS[toolName];
    if (!handler) {
      throw new Error(
        `tool_not_implemented:${toolName} — agent runtime can't invoke this tool yet. Available: ${Object.keys(TOOL_HANDLERS).join(", ") || "(none)"}.`
      );
    }
    return handler(orgId, args);
  };
}
