import { eq, and, count } from "drizzle-orm";
import { db } from "@/db";
// Appointment types are stored as `bookings` rows with status='template'
// — there's no separate appointment_types table. Same for intake forms
// (a single `intake_forms` table) and the integrations bag on the org row.
import { bookings, intakeForms, organizations } from "@/db/schema";

/**
 * WS3.1.2 — Operator-readable setup checklist for an archetype.
 *
 * The dev-jargon "Required blocks" callout (`crm · formbricks-intake
 * · sms · caldiy-booking · email`) was the #1 thing the operator
 * audit asked to remove. This module computes a human-readable
 * progress checklist per archetype: each requirement reads as a
 * sentence, has a green check or empty circle, and (when unmet) a
 * link to the page that fixes it.
 *
 * Resolution is data-driven:
 *   - Some checks query DB (does the org have an intake form? a
 *     booking type? a Resend / Twilio API key?).
 *   - Some checks are static (the CRM block is always installed for
 *     workspaces minted via create_workspace).
 */

export type ChecklistItem = {
  /** Stable id for the row key — not shown to the operator. */
  id: string;
  /** Human-readable requirement, e.g. "Intake form". */
  label: string;
  /**
   * Status flavored copy. When met, this should reference the
   * concrete thing connected (e.g., "Coaching inquiry connected").
   * When unmet, this is the actionable phrase ("Twilio API key needed").
   */
  detail: string;
  status: "met" | "unmet";
  /** When unmet, the path to the fix surface. Can be relative. */
  fixPath: string | null;
  fixLabel: string | null;
};

export type Checklist = {
  items: ChecklistItem[];
  metCount: number;
  totalCount: number;
  allReady: boolean;
};

type ResourceProbe = {
  hasIntakeForm: boolean;
  intakeFormName: string | null;
  hasAppointmentType: boolean;
  appointmentTypeName: string | null;
  hasResend: boolean;
  hasTwilio: boolean;
  hasGoogleCalendar: boolean;
};

async function probeWorkspaceResources(orgId: string): Promise<ResourceProbe> {
  const [orgRow] = await db
    .select({ integrations: organizations.integrations })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const integrations =
    (orgRow?.integrations as Record<string, { connected?: boolean }> | null) ?? {};

  const [intakeFormProbe] = await db
    .select({ id: intakeForms.id, name: intakeForms.name })
    .from(intakeForms)
    .where(and(eq(intakeForms.orgId, orgId), eq(intakeForms.isActive, true)))
    .limit(1);

  const [appointmentProbe] = await db
    .select({ id: bookings.id, title: bookings.title })
    .from(bookings)
    .where(and(eq(bookings.orgId, orgId), eq(bookings.status, "template")))
    .limit(1);

  const [intakeFormCount] = await db
    .select({ n: count() })
    .from(intakeForms)
    .where(eq(intakeForms.orgId, orgId));

  return {
    hasIntakeForm: (intakeFormCount?.n ?? 0) > 0,
    intakeFormName: intakeFormProbe?.name ?? null,
    hasAppointmentType: Boolean(appointmentProbe?.id),
    appointmentTypeName: appointmentProbe?.title ?? null,
    hasResend: Boolean(integrations.resend?.connected),
    hasTwilio: Boolean(integrations.twilio?.connected),
    hasGoogleCalendar: Boolean(
      (integrations.google as { calendarConnected?: boolean } | undefined)?.calendarConnected
    ),
  };
}

function crmCheckItem(): ChecklistItem {
  // Built-in CRM block is always present for workspaces created via
  // the standard flow — no ambient state to check. This row exists
  // mostly to set the operator's mental model: "yes, contacts are
  // already wired."
  return {
    id: "crm",
    label: "Contact management",
    detail: "Built-in CRM connected — contacts auto-create on form submit.",
    status: "met",
    fixPath: null,
    fixLabel: null,
  };
}

function intakeFormItem(probe: ResourceProbe): ChecklistItem {
  return probe.hasIntakeForm
    ? {
        id: "intake_form",
        label: "Intake form",
        detail: probe.intakeFormName
          ? `${probe.intakeFormName} connected.`
          : "Intake form connected.",
        status: "met",
        fixPath: null,
        fixLabel: null,
      }
    : {
        id: "intake_form",
        label: "Intake form",
        detail: "Need at least one intake form for the agent to listen on.",
        status: "unmet",
        fixPath: "/forms",
        fixLabel: "Create one →",
      };
}

function bookingItem(probe: ResourceProbe): ChecklistItem {
  return probe.hasAppointmentType
    ? {
        id: "booking",
        label: "Booking calendar",
        detail: probe.appointmentTypeName
          ? `${probe.appointmentTypeName} connected.`
          : "Booking type connected.",
        status: "met",
        fixPath: null,
        fixLabel: null,
      }
    : {
        id: "booking",
        label: "Booking calendar",
        detail: "Need at least one bookable appointment type.",
        status: "unmet",
        fixPath: "/bookings",
        fixLabel: "Create one →",
      };
}

function smsItem(probe: ResourceProbe): ChecklistItem {
  return probe.hasTwilio
    ? {
        id: "sms",
        label: "SMS messaging",
        detail: "Twilio connected.",
        status: "met",
        fixPath: null,
        fixLabel: null,
      }
    : {
        id: "sms",
        label: "SMS messaging",
        detail: "Twilio API key needed to send and receive SMS.",
        status: "unmet",
        fixPath: "/settings/integrations",
        fixLabel: "Set up SMS →",
      };
}

function emailItem(probe: ResourceProbe): ChecklistItem {
  return probe.hasResend
    ? {
        id: "email",
        label: "Email sending",
        detail: "Resend connected.",
        status: "met",
        fixPath: null,
        fixLabel: null,
      }
    : {
        id: "email",
        label: "Email sending",
        detail: "Resend API key needed for outbound email.",
        status: "unmet",
        fixPath: "/settings/integrations",
        fixLabel: "Set up Email →",
      };
}

function bookingHistoryItem(probe: ResourceProbe): ChecklistItem {
  return probe.hasAppointmentType
    ? {
        id: "booking_history",
        label: "Booking history",
        detail: "At least one bookable appointment type configured.",
        status: "met",
        fixPath: null,
        fixLabel: null,
      }
    : {
        id: "booking_history",
        label: "Booking history",
        detail: "Need a booking page so completed bookings exist to review.",
        status: "unmet",
        fixPath: "/bookings",
        fixLabel: "Set up booking →",
      };
}

function weatherApiItem(): ChecklistItem {
  // The weather-aware-booking archetype uses Open-Meteo (free, no
  // key required) per the archetype README. Mark as always met.
  return {
    id: "weather_api",
    label: "Weather forecast",
    detail: "Open-Meteo (free, no API key needed).",
    status: "met",
    fixPath: null,
    fixLabel: null,
  };
}

/**
 * Per-archetype required item set. Mirrors the actual code paths
 * each archetype's specTemplate calls — keep this in sync when an
 * archetype's required tools change.
 */
const ARCHETYPE_REQUIREMENTS: Record<string, (probe: ResourceProbe) => ChecklistItem[]> = {
  "speed-to-lead": (p) => [
    crmCheckItem(),
    intakeFormItem(p),
    smsItem(p),
    bookingItem(p),
    emailItem(p),
  ],
  "win-back": (p) => [crmCheckItem(), emailItem(p), smsItem(p)],
  "review-requester": (p) => [
    crmCheckItem(),
    emailItem(p),
    bookingHistoryItem(p),
    smsItem(p),
  ],
  "daily-digest": (p) => [crmCheckItem(), emailItem(p)],
  "weather-aware-booking": (p) => [
    crmCheckItem(),
    bookingItem(p),
    weatherApiItem(),
    emailItem(p),
  ],
  "appointment-confirm-sms": (p) => [crmCheckItem(), smsItem(p), bookingItem(p)],
};

/**
 * Compute the checklist for a given archetype + workspace. Returns
 * the items + tally. The configure page renders this directly.
 */
export async function getArchetypeSetupChecklist(
  archetypeId: string,
  orgId: string
): Promise<Checklist> {
  const probe = await probeWorkspaceResources(orgId);
  const builder = ARCHETYPE_REQUIREMENTS[archetypeId];
  const items = builder ? builder(probe) : [crmCheckItem()];
  const metCount = items.filter((i) => i.status === "met").length;
  return {
    items,
    metCount,
    totalCount: items.length,
    allReady: metCount === items.length,
  };
}
