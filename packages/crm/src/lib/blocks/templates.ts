import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, intakeForms, landingPages } from "@/db/schema";
import {
  buildBlueprintForWorkspace,
  renderBlueprint,
} from "@/lib/blueprint/persist";
import { renderCalcomMonthV1 } from "@/lib/blueprint/renderers/calcom-month-v1";
import { renderFormbricksStackV1 } from "@/lib/blueprint/renderers/formbricks-stack-v1";
import type { Blueprint } from "@/lib/blueprint/types";
import type { PersonalityIntakeField } from "@/lib/crm/personality";

export type TemplateOpts = {
  theme?: "dark" | "light";
  /**
   * Wiring task: when the seed flow has already built a Blueprint (the
   * normal path through createAnonymousWorkspace), pass it in so the
   * booking and intake templates render their respective sections from
   * the SAME blueprint that produced the landing. Skipping this falls
   * back to the legacy seed (no blueprint-rendered HTML on the row;
   * route handlers serve the React component instead).
   */
  blueprint?: Blueprint;
  /**
   * Personality intake schema. When provided AND the blueprint doesn't
   * carry questions of its own, the default intake form's fields come
   * from the personality (e.g. HVAC asks for property_type / system_type
   * up front instead of the generic "What can we help with?").
   */
  personalityIntakeFields?: PersonalityIntakeField[];
  /**
   * v1.1.4 / Issue #5 — operator-supplied service list. When present,
   * the intake form gets a "Service interested in" select dropdown
   * populated from these strings (plus an "Other / not sure" option
   * tacked on the end). Without this, the form just asks free-text
   * "What's going on?" — leaving the operator with leads they have
   * to triage before they can route.
   */
  servicesForIntake?: string[];
  /**
   * v1.1.9 — personality-specific intake form title. When set, replaces
   * the default "Get in touch" / blueprint-derived title so a med spa
   * workspace ships "Request a Treatment Consultation" instead of
   * generic copy. Comes from CRMPersonality.intake.title.
   */
  intakeTitle?: string;
};

const DEFAULT_BOOKING_SLUG = "default";
const DEFAULT_INTAKE_SLUG = "intake";
const DEFAULT_LANDING_SLUG = "home";

export type TemplateOutcome = {
  slug: string;
  alreadyExisted: boolean;
};

// Idempotent — if a row with this slug already exists for this workspace,
// return it unchanged so re-installs don't clone templates.
//
// Wiring task: when `opts.blueprint` is provided, the renderer's
// HTML/CSS lands on the row's content_html/content_css columns and the
// public /book route serves them directly (Cal Sans typography, glass
// navbar, dark footer — same product feel as the landing). Without a
// blueprint we fall back to seeding only the metadata; the route's
// React-component path picks up legacy rows.
export async function createDefaultBookingTemplate(
  orgId: string,
  opts: TemplateOpts = {}
): Promise<TemplateOutcome & { title: string }> {
  const [existing] = await db
    .select({
      id: bookings.id,
      bookingSlug: bookings.bookingSlug,
      title: bookings.title,
      contentHtml: bookings.contentHtml,
    })
    .from(bookings)
    .where(and(eq(bookings.orgId, orgId), eq(bookings.bookingSlug, DEFAULT_BOOKING_SLUG)))
    .limit(1);

  if (existing) {
    // Repair branch: row exists but content_html is NULL and we have a
    // blueprint to render from. Top up so the public route swaps from
    // the React fallback to the blueprint-rendered HTML on next visit.
    if (!existing.contentHtml && opts.blueprint) {
      const rendered = renderCalcomMonthV1(opts.blueprint);
      await db
        .update(bookings)
        .set({
          contentHtml: rendered.html,
          contentCss: rendered.css,
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, existing.id));
    }
    return {
      slug: existing.bookingSlug,
      title: existing.title,
      alreadyExisted: true,
    };
  }

  // Pull title / description / duration from the blueprint when present.
  // For workspaces created without a blueprint (legacy callers), fall
  // back to the same defaults the route used pre-blueprint.
  const eventType = opts.blueprint?.booking.eventType;
  const title = eventType?.title ?? "Book a call";
  const description =
    eventType?.description ?? "Pick a time that works for you. We'll confirm by email.";
  const durationMinutes = eventType?.durationMinutes ?? 30;
  const confirmationMessage =
    opts.blueprint?.booking.confirmation.message ??
    "Thanks! Check your email for the confirmation.";

  // v1.3.1 / BUG 1 — metadata.availability MUST be in the shape
  // resolvePublicBookingContext / listPublicBookingSlotsAction expect:
  //   { monday: { enabled: bool, start: "HH:MM", end: "HH:MM" }, ... }
  // (full day names, not abbreviations).
  //
  // Prior code wrote { weekdays: ["mon",...], startHour, endHour } — a
  // completely different shape. The reader's normalizeAvailability fell
  // back to defaults silently (Mon-Fri 9-17 enabled) which MASKED the
  // bug for the happy path but broke:
  //   - the React fallback PublicBookingForm (slots came from defaults
  //     not from the blueprint's actual hours)
  //   - the per-personality booking hours (HVAC's Mon-Sat 7-19 was
  //     never honored because the template wrote the wrong shape)
  //   - the validator's booking_availability check
  //
  // Source the schedule from blueprint.booking.availability.weekly when
  // present (rich per-day data); fall back to a safe Mon-Fri 9-17.
  const blueprintWeekly = opts.blueprint?.booking.availability.weekly;
  const availability = buildAppointmentAvailabilityFromBlueprint(blueprintWeekly);

  const now = new Date();
  const metadata = {
    appointmentName: title,
    appointmentDescription: description,
    durationMinutes,
    confirmationMessage,
    theme: opts.theme ?? "dark",
    availability,
  };

  const rendered = opts.blueprint ? renderCalcomMonthV1(opts.blueprint) : null;

  await db.insert(bookings).values({
    orgId,
    title,
    bookingSlug: DEFAULT_BOOKING_SLUG,
    provider: "manual",
    status: "template",
    startsAt: now,
    endsAt: now,
    metadata,
    contentHtml: rendered?.html ?? null,
    contentCss: rendered?.css ?? null,
  });

  return { slug: DEFAULT_BOOKING_SLUG, title, alreadyExisted: false };
}

export async function createDefaultIntakeForm(
  orgId: string,
  opts: TemplateOpts = {}
): Promise<TemplateOutcome & { name: string }> {
  const [existing] = await db
    .select({
      id: intakeForms.id,
      slug: intakeForms.slug,
      name: intakeForms.name,
      contentHtml: intakeForms.contentHtml,
    })
    .from(intakeForms)
    .where(and(eq(intakeForms.orgId, orgId), eq(intakeForms.slug, DEFAULT_INTAKE_SLUG)))
    .limit(1);

  if (existing) {
    // Same repair branch as bookings — top up contentHtml/Css if a
    // blueprint is now available and the row predates the wiring.
    if (!existing.contentHtml && opts.blueprint) {
      const rendered = renderFormbricksStackV1(opts.blueprint);
      await db
        .update(intakeForms)
        .set({
          contentHtml: rendered.html,
          contentCss: rendered.css,
          updatedAt: new Date(),
        })
        .where(eq(intakeForms.id, existing.id));
    }
    return { slug: existing.slug, name: existing.name, alreadyExisted: true };
  }

  // When a blueprint is supplied, derive the form's name + fields from
  // it. The intakeForms row's `fields` shape is intentionally simpler
  // than the Blueprint's IntakeQuestion (the public form needs less
  // metadata server-side because the rendered HTML carries everything).
  // We map a minimal projection into the existing column.
  //
  // v1.1.9 — opts.intakeTitle (sourced from CRMPersonality.intake.title)
  // wins over the blueprint's title and the generic "Get in touch"
  // fallback. This is what makes the intake form ship with personality-
  // specific copy out of the box.
  const intake = opts.blueprint?.intake;
  const name = opts.intakeTitle?.trim() || intake?.title || "Get in touch";
  const personalityFields = opts.personalityIntakeFields ?? null;
  let mappedFields: Array<{
    key: string;
    label: string;
    type: string;
    required: boolean;
    options?: string[];
  }> = intake?.questions
    ? intake.questions.map((q) => ({
        key: q.id,
        label: q.label,
        type: q.type,
        required: Boolean(q.required),
        options: q.options,
      }))
    : personalityFields && personalityFields.length > 0
      ? personalityFields.map((f) => ({
          key: f.key,
          label: f.label,
          type: f.type,
          required: f.required,
          options: f.options,
        }))
      : [
          { key: "fullName", label: "Full name", type: "text", required: true },
          { key: "email", label: "Email", type: "email", required: true },
          { key: "phone", label: "Phone (optional)", type: "tel", required: false },
          {
            key: "message",
            label: "What can we help with?",
            type: "textarea",
            required: true,
          },
        ];

  // v1.1.4 / Issue #5 — inject a "Service interested in" select with the
  // operator's actual services as options. Idempotent: if a `service`
  // field already exists (e.g. seeded by the personality), we just back-
  // fill its options instead of duplicating it. The "Other / not sure"
  // tail lets visitors who don't fit the service list still convert.
  const services = (opts.servicesForIntake ?? [])
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .map((s) => s.trim());
  if (services.length > 0) {
    const options = [...services, "Other / not sure"];
    const existingIdx = mappedFields.findIndex(
      (f) => f.key === "service" || f.key === "service_type" || f.key === "service_interest"
    );
    if (existingIdx >= 0) {
      mappedFields[existingIdx] = {
        ...mappedFields[existingIdx],
        type: "select",
        options,
      };
    } else {
      // Insert just after the contact fields (name/email/phone) but
      // before the free-text "what's going on" field, so the operator
      // gets routed-by-service leads without losing the open prompt.
      const insertAfter = Math.max(
        mappedFields.findIndex((f) => f.key === "phone"),
        mappedFields.findIndex((f) => f.key === "email"),
        mappedFields.findIndex((f) => f.key === "fullName")
      );
      const insertAt = insertAfter >= 0 ? insertAfter + 1 : mappedFields.length;
      mappedFields = [
        ...mappedFields.slice(0, insertAt),
        {
          key: "service",
          label: "Which service are you interested in?",
          type: "select",
          required: true,
          options,
        },
        ...mappedFields.slice(insertAt),
      ];
    }
  }

  const rendered = opts.blueprint ? renderFormbricksStackV1(opts.blueprint) : null;

  await db.insert(intakeForms).values({
    orgId,
    name,
    slug: DEFAULT_INTAKE_SLUG,
    fields: mappedFields,
    settings: { theme: opts.theme ?? "dark", submitLabel: "Send" },
    contentHtml: rendered?.html ?? null,
    contentCss: rendered?.css ?? null,
    isActive: true,
  });

  return { slug: DEFAULT_INTAKE_SLUG, name, alreadyExisted: false };
}

export async function createDefaultLandingPage(
  orgId: string,
  opts: TemplateOpts & { workspaceName?: string; industry?: string | null } = {}
): Promise<TemplateOutcome & { title: string }> {
  const [existing] = await db
    .select({
      id: landingPages.id,
      slug: landingPages.slug,
      title: landingPages.title,
      contentHtml: landingPages.contentHtml,
      contentCss: landingPages.contentCss,
      source: landingPages.source,
    })
    .from(landingPages)
    .where(and(eq(landingPages.orgId, orgId), eq(landingPages.slug, DEFAULT_LANDING_SLUG)))
    .limit(1);

  if (existing) {
    // Repair branch: pre-fix seeds stored contentHtml with contentCss: null,
    // which falls through to the empty-sections renderer and shows a blank
    // page. If we find such a row AND it's still the original template
    // (source='template', not user-customized via /api/v1/landing/update or
    // Puck), top up the missing contentCss. User-customized rows are left
    // alone regardless.
    //
    // C3.3: also backfills `blueprintJson` on the same repair so the
    // customization loop (load → mutate → render → save) has a source to
    // round-trip through. Existing pre-C3.3 rows with contentHtml but no
    // blueprintJson get one written here on next access.
    if (existing.source === "template" && !existing.contentCss) {
      const repaired = buildAndRender(existing.title, opts.industry ?? null);
      await db
        .update(landingPages)
        .set({
          contentHtml: repaired.contentHtml,
          contentCss: repaired.contentCss,
          blueprintJson: repaired.blueprint as unknown as Record<string, unknown>,
          updatedAt: new Date(),
        })
        .where(eq(landingPages.id, existing.id));
    }
    return { slug: existing.slug, title: existing.title, alreadyExisted: true };
  }

  const title = opts.workspaceName ?? "Welcome";
  const subhead = SEEDED_HOME_SUBHEAD;
  const rendered = buildAndRender(title, opts.industry ?? null);

  await db.insert(landingPages).values({
    orgId,
    title,
    slug: DEFAULT_LANDING_SLUG,
    status: "published",
    pageType: "page",
    source: "template",
    sections: [],
    contentHtml: rendered.contentHtml,
    contentCss: rendered.contentCss,
    // C3.3: source-of-truth Blueprint JSON. Read by update_landing_*
    // tools when they need to mutate + re-render without losing C3.x
    // visual polish.
    blueprintJson: rendered.blueprint as unknown as Record<string, unknown>,
    seo: { title, description: subhead },
    // C3.3: stash `industry` in settings so the customization-loop
    // fallback path can re-derive a starter blueprint for legacy rows
    // (rows whose blueprint_json is NULL because they predate C3.3).
    settings: {
      theme: "light",
      blueprintRenderer: "general-service-v1",
      industry: opts.industry ?? null,
    },
  });

  return { slug: DEFAULT_LANDING_SLUG, title, alreadyExisted: false };
}

/**
 * Phase 3 C3.3: pick a starter blueprint by industry, customize the
 * workspace.name slot, run it through the renderer. Returns the
 * blueprint plus its rendered html/css — all three need to be persisted
 * together so the customization loop can round-trip.
 *
 * Light mode only in v1. Industry null/unknown → general fallback.
 */
function buildAndRender(workspaceName: string, industry: string | null) {
  const blueprint = buildBlueprintForWorkspace(workspaceName, industry);
  return renderBlueprint(blueprint);
}

// Subhead used for the landing page's seo.description metadata. The actual
// page body comes from the blueprint renderer (general-service-v1) which
// sources its own copy from the resolved blueprint's hero/about sections.
const SEEDED_HOME_SUBHEAD = "Book a call or send us a note — we'll get back to you.";

// v1.3.1 — convert blueprint's weekly schedule (e.g. { mon: [9, 17],
// tue: [9, 17], sat: null, ... }) into the per-day { enabled, start,
// end } shape the booking actions read. Keeps a single source of
// truth (blueprint.booking.availability.weekly) and writes it in the
// shape the rest of the system expects.
type BlueprintWeekly = NonNullable<
  NonNullable<Blueprint["booking"]>["availability"]
>["weekly"];

function pad2Hour(n: number): string {
  return n < 10 ? `0${n}:00` : `${n}:00`;
}

function buildAppointmentAvailabilityFromBlueprint(
  weekly: BlueprintWeekly | undefined | null,
): Record<string, { enabled: boolean; start: string; end: string }> {
  // Blueprint uses 3-letter keys (mon/tue); booking actions use full
  // names (monday/tuesday). Map between them.
  const dayMap: Array<[keyof NonNullable<BlueprintWeekly>, string]> = [
    ["sun", "sunday"],
    ["mon", "monday"],
    ["tue", "tuesday"],
    ["wed", "wednesday"],
    ["thu", "thursday"],
    ["fri", "friday"],
    ["sat", "saturday"],
  ];
  const out: Record<string, { enabled: boolean; start: string; end: string }> = {};
  for (const [shortKey, fullKey] of dayMap) {
    const range = weekly?.[shortKey];
    if (range && Array.isArray(range) && range.length === 2) {
      const [start, end] = range;
      if (typeof start === "number" && typeof end === "number" && start < end) {
        out[fullKey] = { enabled: true, start: pad2Hour(start), end: pad2Hour(end) };
        continue;
      }
    }
    // Default Mon-Fri 9-17 enabled, weekend disabled — matches the
    // server-side defaultAvailabilitySchedule() so behavior is the
    // same regardless of which path constructs the schedule.
    const isWeekend = fullKey === "saturday" || fullKey === "sunday";
    out[fullKey] = {
      enabled: !isWeekend,
      start: "09:00",
      end: "17:00",
    };
  }
  return out;
}

export const DEFAULT_SLUGS = {
  booking: DEFAULT_BOOKING_SLUG,
  intake: DEFAULT_INTAKE_SLUG,
  landing: DEFAULT_LANDING_SLUG,
};
