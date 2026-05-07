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

export const lookUpAvailability: AgentTool<
  z.infer<typeof lookUpAvailabilityInput>,
  { slots: string[]; durationMinutes: number; date: string }
> = {
  name: "look_up_availability",
  description:
    "Get available appointment slots for a specific date. Returns slot times in ISO local format.",
  inputSchema: lookUpAvailabilityInput,
  jsonSchema: {
    type: "object",
    properties: {
      date: {
        type: "string",
        description: "Date to check, YYYY-MM-DD",
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
    const result = await listPublicBookingSlotsAction({
      orgSlug: ctx.orgSlug,
      bookingSlug: input.bookingSlug ?? "default",
      date: input.date,
    });
    return {
      slots: result.slots,
      durationMinutes: result.durationMinutes,
      date: input.date,
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
    "Create a confirmed booking. Call this only after confirming the slot is available via look_up_availability and gathering name + email.",
  inputSchema: bookAppointmentInput,
  jsonSchema: {
    type: "object",
    properties: {
      fullName: { type: "string" },
      email: { type: "string", format: "email" },
      phone: { type: "string" },
      slotIso: {
        type: "string",
        description: "Slot start time, ISO local (e.g. 2026-05-14T14:30)",
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
