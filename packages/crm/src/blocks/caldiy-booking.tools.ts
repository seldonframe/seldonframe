// Cal.diy Booking block — tool schemas (Scope 3 Step 2b.2 Booking migration).
//
// Zod-authored schemas for the 9 MCP tools in the Booking block.
// Source of truth for the tool surface; the emit step (PR 1 C6) calls
// z.toJSONSchema() on each and renders the result into
// caldiy-booking.block.md between the <!-- TOOLS:START --> / <!-- TOOLS:END -->
// markers on next `pnpm emit:blocks`.
//
// Follows the CRM pattern from PR 1 C4 (crm.tools.ts). Install tool
// (`install_caldiy_booking`) is NOT included — it's install-time
// infrastructure, not an agent-callable runtime tool, and doesn't belong
// in the synthesis surface. 9 tools total:
//   Bookings (5):           list / create / get / cancel / reschedule
//   Appointment types (3):  list / create / update
//   Legacy alias (1):       configure_booking (deprecated — alias for
//                           update_appointment_type({booking_slug:"default"}))
//
// Events (booking.created / booking.cancelled / booking.rescheduled)
// come from the SeldonEvent union (packages/core/src/events/index.ts);
// the composition-contract validator cross-refs emits against the
// block's produces list in the BLOCK.md.

import { z } from "zod";

import type { ToolDefinition } from "../lib/blocks/contract-v2";

// ---------------------------------------------------------------------
// Shared primitives — reused across all 9 tool schemas.
// ---------------------------------------------------------------------

const workspaceIdArg = z
  .string()
  .uuid()
  .optional()
  .describe("Optional. Falls back to the active workspace.");

const bookingStatus = z.enum(["scheduled", "completed", "cancelled", "no_show"]);

// Return shapes — narrow to the fields downstream {{interpolation}}
// is most likely to reach for. Templates stored in bookings table
// with status='template' use AppointmentTypeRecord; real bookings
// (status='scheduled' / 'cancelled' / etc.) use BookingRecord.

const BookingRecord = z.object({
  id: z.string().uuid(),
  contactId: z.string().uuid().nullable(),
  title: z.string(),
  bookingSlug: z.string(),
  status: bookingStatus,
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  fullName: z.string().nullable(),
  email: z.string().email().nullable(),
  notes: z.string().nullable(),
  provider: z.string(),
  meetingUrl: z.string().nullable(),
  cancelledAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()),
});

const AppointmentTypeRecord = z.object({
  id: z.string().uuid(),
  title: z.string(),
  bookingSlug: z.string(),
  durationMinutes: z.number().int().positive(),
  description: z.string().nullable(),
  price: z.number().nonnegative(),
  bufferBeforeMinutes: z.number().int().nonnegative(),
  bufferAfterMinutes: z.number().int().nonnegative(),
  maxBookingsPerDay: z.number().int().positive().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ---------------------------------------------------------------------
// Booking tools (5)
// ---------------------------------------------------------------------

export const listBookings: ToolDefinition = {
  name: "list_bookings",
  description:
    "List scheduled bookings (not appointment-type templates — see list_appointment_types for those). Supports filtering by contact, status, and date range. Default sort: most-recent-first; if `from` is set, switches to earliest-upcoming-first for reminder flows.",
  args: z.object({
    contact_id: z.string().uuid().optional().describe("Optional. Filter to a specific contact's bookings."),
    status: bookingStatus.optional().describe("Optional. Filter by status."),
    from: z.string().datetime().optional().describe("Optional ISO timestamp. Only bookings starting at or after this moment."),
    to: z.string().datetime().optional().describe("Optional ISO timestamp. Only bookings starting at or before this moment."),
    limit: z.number().int().positive().max(200).optional().describe("Max rows (default 50, max 200)."),
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({ data: z.array(BookingRecord) }),
  emits: [],
};

export const createBooking: ToolDefinition = {
  name: "create_booking",
  description:
    "Schedule a real booking against an existing appointment type. Looks up the template by id, creates a scheduled row on the workspace calendar, stamps the contact's name + email, emits booking.created. If the appointment type has a price > 0, returns a Stripe Checkout URL routed to the SMB's connected Stripe account so the builder / agent can text or email the payment link to the contact.",
  args: z.object({
    contact_id: z.string().uuid().describe("Required. CRM contact being booked."),
    appointment_type_id: z.string().uuid().describe("Required. Appointment-type template id from list_appointment_types."),
    starts_at: z.string().datetime().describe("Required. ISO 8601 timestamp for the appointment start. Duration is read from the appointment type."),
    notes: z.string().optional().describe("Optional free-form booking notes."),
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({
    data: z.object({
      booking: BookingRecord,
      checkout: z.object({ url: z.string().url().nullable(), sessionId: z.string() }).nullable(),
    }),
  }),
  emits: ["booking.created"],
};

export const getBooking: ToolDefinition = {
  name: "get_booking",
  description:
    "Fetch one scheduled booking by id. Returns the full detail (contact, times, status, notes, meeting URL, cancellation timestamp, metadata). Appointment-type templates are NOT returned here — use list_appointment_types for those. 404s if the id is unknown OR belongs to a different workspace.",
  args: z.object({
    booking_id: z.string().uuid().describe("Required. UUID of the booking."),
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({ ok: z.literal(true), booking: BookingRecord.nullable() }),
  emits: [],
};

export const cancelBooking: ToolDefinition = {
  name: "cancel_booking",
  description:
    "Cancel a scheduled booking. Sets status to 'cancelled', stamps cancelledAt, deletes the Google Calendar event, and emits booking.cancelled. Idempotent — re-cancelling an already-cancelled booking is a 200 no-op with alreadyCancelled=true (no duplicate events, no calendar errors). Past-dated bookings CAN be cancelled. Does NOT touch linked payments — linkedPaymentIds is returned so the agent can compose refund_payment explicitly if the business rule is 'cancel AND refund'.",
  args: z.object({
    booking_id: z.string().uuid().describe("Required. UUID of the booking to cancel."),
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({
    ok: z.literal(true),
    booking: BookingRecord,
    alreadyCancelled: z.boolean(),
    linkedPaymentIds: z.array(z.string().uuid()),
  }),
  emits: ["booking.cancelled"],
};

export const rescheduleBooking: ToolDefinition = {
  name: "reschedule_booking",
  description:
    "Move a scheduled booking to a new starts_at. Preserves the original duration — endsAt tracks the move so a 30-min consult stays 30 mins at the new time. Updates the Google Calendar event in place (event id preserved; attendees see the time change on their existing invite) and emits booking.rescheduled with both previousStartsAt and newStartsAt so follow-up agents can describe the change. Rejects past-dated new starts_at (400) and refuses to reschedule a cancelled booking (422). Does NOT change appointment type; does NOT touch linked payments.",
  args: z.object({
    booking_id: z.string().uuid().describe("Required. UUID of the booking to move."),
    starts_at: z.string().datetime().describe("Required. New ISO 8601 timestamp. Must be in the future. Duration is preserved from the current booking."),
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({
    ok: z.literal(true),
    booking: BookingRecord,
    previousStartsAt: z.string().datetime(),
    newStartsAt: z.string().datetime(),
  }),
  emits: ["booking.rescheduled"],
};

// ---------------------------------------------------------------------
// Appointment-type tools (3)
// ---------------------------------------------------------------------

export const listAppointmentTypes: ToolDefinition = {
  name: "list_appointment_types",
  description: "List all appointment types (bookable templates) in the workspace.",
  args: z.object({ workspace_id: workspaceIdArg }),
  returns: z.object({ ok: z.literal(true), appointment_types: z.array(AppointmentTypeRecord) }),
  emits: [],
};

export const createAppointmentType: ToolDefinition = {
  name: "create_appointment_type",
  description:
    "Create a new appointment type with its own public /book/<slug> URL. Defaults availability to Mon–Fri 9am–5pm (edit on /bookings to change).",
  args: z.object({
    title: z.string().min(1).max(200).describe("Required. Human-readable name, e.g., 'Strategy call'."),
    booking_slug: z.string().optional().describe("Optional. URL-safe slug. Auto-derived from title if omitted."),
    duration_minutes: z
      .number()
      .int()
      .min(5)
      .max(240)
      .optional()
      .describe("Optional. 5–240. Defaults to 30."),
    description: z.string().max(800).optional().describe("Optional. Up to 800 chars. Shown on the public booking page."),
    price: z
      .number()
      .nonnegative()
      .optional()
      .describe("Optional. Defaults to 0 (free). Non-zero prices route through Stripe checkout on submit (requires Stripe connected)."),
    buffer_before_minutes: z.number().int().min(0).max(120).optional().describe("Optional. 0–120. Defaults to 0."),
    buffer_after_minutes: z.number().int().min(0).max(120).optional().describe("Optional. 0–120. Defaults to 0."),
    max_bookings_per_day: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Optional. Hard daily cap (1–100). Omit for unlimited."),
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({
    ok: z.literal(true),
    appointment_type: AppointmentTypeRecord,
    public_url: z.string().url(),
  }),
  emits: [],
};

export const updateAppointmentType: ToolDefinition = {
  name: "update_appointment_type",
  description:
    "Update an existing appointment type. Partial — omit fields to keep them. Pass booking_slug='default' to edit the auto-seeded 'Book a call' template.",
  args: z.object({
    booking_slug: z.string().min(1).describe("Slug of the appointment type. Use 'default' for the auto-seeded template."),
    title: z.string().min(1).max(200).optional().describe("Optional new title."),
    duration_minutes: z.number().int().min(5).max(240).optional().describe("Optional new duration (5–240)."),
    description: z.string().max(800).optional().describe("Optional new description (≤800 chars). Empty string clears it."),
    price: z.number().nonnegative().optional().describe("Optional new price. 0 = free."),
    buffer_before_minutes: z.number().int().min(0).max(120).optional().describe("Optional. 0–120."),
    buffer_after_minutes: z.number().int().min(0).max(120).optional().describe("Optional. 0–120."),
    max_bookings_per_day: z
      .number()
      .int()
      .min(1)
      .max(100)
      .nullable()
      .optional()
      .describe("Optional. 1–100. Pass null to remove cap."),
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({
    ok: z.literal(true),
    appointment_type: AppointmentTypeRecord,
  }),
  emits: [],
};

// ---------------------------------------------------------------------
// Deprecated alias (1) — kept for backward compatibility per tools.js
// comment. Agents should prefer update_appointment_type in new specs.
// ---------------------------------------------------------------------

export const configureBooking: ToolDefinition = {
  name: "configure_booking",
  description:
    "DEPRECATED alias for update_appointment_type({ booking_slug: 'default', ... }). Kept so existing Claude Code sessions don't break. Prefer update_appointment_type for new scripts.",
  args: z.object({
    title: z.string().min(1).max(200).optional().describe("Optional new title."),
    duration_minutes: z.number().int().min(5).max(240).optional().describe("Optional new duration in minutes."),
    description: z.string().max(800).optional().describe("Optional description."),
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({
    ok: z.literal(true),
    appointment_type: AppointmentTypeRecord,
  }),
  emits: [],
};

// ---------------------------------------------------------------------
// Exported tuple — order matches tools.js for byte-stable emission.
// ---------------------------------------------------------------------

export const BOOKING_TOOLS: readonly ToolDefinition[] = [
  listBookings,
  createBooking,
  getBooking,
  cancelBooking,
  rescheduleBooking,
  listAppointmentTypes,
  createAppointmentType,
  updateAppointmentType,
  configureBooking,
] as const;
