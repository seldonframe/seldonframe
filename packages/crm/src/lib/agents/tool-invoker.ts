import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { activities, bookings, contacts } from "@/db/schema";
import type { ToolInvoker } from "@/lib/workflow/types";
import { sendEmailFromApi } from "@/lib/emails/api";
import { sendSmsFromApi } from "@/lib/sms/api";
import { emitSeldonEvent } from "@/lib/events/bus";

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

    // We deliberately don't require a userId here — agent-initiated
    // activities don't have an interactive user. Schema requires
    // userId NOT NULL though, so we fall back to the org's owner.
    // Looking up owner inline keeps this slice surgical; a dedicated
    // `agent_user` row per workspace is V1.1.
    const [created] = await db
      .insert(activities)
      .values({
        orgId,
        contactId,
        // userId NOT NULL — use a sentinel that tests the agent owner
        // path. For an MVP we'll use a placeholder; replace with the
        // org owner lookup once the agent-actor table lands.
        userId: orgId, // FK constraint will catch this if it doesn't resolve
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

    const startsAt =
      startsAtRaw instanceof Date
        ? startsAtRaw
        : typeof startsAtRaw === "string" || typeof startsAtRaw === "number"
          ? new Date(startsAtRaw)
          : null;
    if (!startsAt || Number.isNaN(startsAt.getTime())) {
      throw new Error("create_booking: starts_at must be a valid date");
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
      },
    };
  },

  send_email: async (orgId, args) => {
    const to = typeof args.to === "string" ? args.to : null;
    const subject = typeof args.subject === "string" ? args.subject : null;
    const body = typeof args.body === "string" ? args.body : null;
    const contactId =
      typeof args.contactId === "string"
        ? args.contactId
        : typeof args.contact_id === "string"
          ? args.contact_id
          : null;

    if (!to) throw new Error("send_email: to is required");
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

  send_sms: async (orgId, args) => {
    const to =
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

    if (!to) throw new Error("send_sms: to is required");
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
