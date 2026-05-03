// ============================================================================
// v1.4.0 / v1.4.1 — block-instance persistence + landing/booking/intake re-render
// ============================================================================
//
// v1.4.0 introduced this module with one persist path: landing-section blocks
// (hero / services / faq) that mutate Blueprint.landing.sections and re-render
// via renderGeneralServiceV1.
//
// v1.4.1 extends to three surface kinds:
//
//   1. landing-section (hero, services, about, faq, cta)
//      - Mutate Blueprint.landing.sections in place
//      - Re-render via renderGeneralServiceV1
//      - Persist to landing_pages.contentHtml/contentCss/blueprintJson
//
//   2. booking
//      - Mutate Blueprint.booking { eventType, availability, formFields }
//      - Persist updated blueprint to landing_pages.blueprintJson
//      - Update bookings table row (title + metadata) so the operator's CRM
//        and the public booking flow agree
//      - Re-render booking template via renderCalcomMonthV1 → bookings.contentHtml
//
//   3. intake
//      - Mutate Blueprint.intake { title, questions, completion }
//      - Persist updated blueprint to landing_pages.blueprintJson
//      - Update intakeForms table row (name + fields)
//      - Re-render intake form via renderFormbricksStackV1 → intakeForms.contentHtml
//
// All three paths share: schema validation, deterministic copy validators,
// block_instances upsert with forever-frozen customizations, structured logs.
//
// The dispatch is a single switch on block.surface — adding a new surface
// kind in the future means adding one branch here, no changes elsewhere.

import { and, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db } from "@/db";
import {
  blockInstances,
  bookings,
  intakeForms,
  landingPages,
  organizations,
  type BlockCustomization,
} from "@/db/schema";
import { loadBlueprintOrFallback } from "@/lib/blueprint/persist";
import { renderCalcomMonthV1 } from "@/lib/blueprint/renderers/calcom-month-v1";
import { renderFormbricksStackV1 } from "@/lib/blueprint/renderers/formbricks-stack-v1";
import { renderGeneralServiceV1 } from "@/lib/blueprint/renderers/general-service-v1";
import type {
  Blueprint,
  Booking as BlueprintBooking,
  BookingFormField,
  Intake as BlueprintIntake,
  IntakeQuestion,
  LandingSection,
  WeeklyHours,
} from "@/lib/blueprint/types";
import { resolveHeroImageUrlForQuery } from "@/lib/crm/personality-images";
import { getBlock, type BookingProps, type IntakeProps } from "./registry";

export interface PersistBlockInput {
  workspaceId: string;
  blockName: string;
  generationPrompt: string;
  /** Raw props from the IDE agent — must match the block's prop schema. */
  props: unknown;
  /** Optional customization layered on top of an existing block instance.
   *  When set, appended to the row's customizations array; the row's
   *  generation_prompt is left unchanged. */
  customization?: { prompt: string; source?: string };
}

export type PersistBlockResult =
  | {
      ok: true;
      block_id: string;
      block_name: string;
      template_version: string;
      surface: string;
      public_url: string | null;
      validation_warnings: string[];
    }
  | {
      ok: false;
      error: string;
      validation_errors: string[];
    };

export async function persistBlockForWorkspace(
  input: PersistBlockInput,
): Promise<PersistBlockResult> {
  const block = getBlock(input.blockName);
  if (!block) {
    return {
      ok: false,
      error: "block_unknown",
      validation_errors: [
        `block "${input.blockName}" is not in the v1.4 registry. Known: hero, services, about, faq, cta, booking, intake.`,
      ],
    };
  }

  // 1. Schema validation.
  const parsed = block.propsSchema.safeParse(input.props);
  if (!parsed.success) {
    return {
      ok: false,
      error: "props_schema_invalid",
      validation_errors: parsed.error.issues.map(
        (i) => `${i.path.join(".")}: ${i.message}`,
      ),
    };
  }
  const validatedProps = parsed.data;

  // 2. Deterministic validators.
  const validatorErrors: string[] = [];
  for (const check of block.validators) {
    const result = check(validatedProps);
    if (result) validatorErrors.push(result);
  }
  if (validatorErrors.length > 0) {
    return {
      ok: false,
      error: "props_validators_failed",
      validation_errors: validatorErrors,
    };
  }

  // 3. Surface dispatch — different rendering pipelines per surface kind.
  let renderedHtmlForBlock: string;
  try {
    switch (block.surface) {
      case "landing-section":
        renderedHtmlForBlock = await persistLandingSectionBlock(
          input.workspaceId,
          block.sectionType,
          validatedProps,
          block.toSection,
          block.name,
        );
        break;
      case "booking":
        renderedHtmlForBlock = await persistBookingBlock(
          input.workspaceId,
          validatedProps as BookingProps,
        );
        break;
      case "intake":
        renderedHtmlForBlock = await persistIntakeBlock(
          input.workspaceId,
          validatedProps as IntakeProps,
        );
        break;
      default:
        return {
          ok: false,
          error: "surface_unknown",
          validation_errors: [
            `block "${block.name}" declares surface="${block.surface}" which has no persist handler`,
          ],
        };
    }
  } catch (err) {
    return {
      ok: false,
      error: "persist_failed",
      validation_errors: [
        err instanceof Error ? err.message : String(err),
      ],
    };
  }

  const renderedHash = sha1(renderedHtmlForBlock);

  // 4. Upsert the block_instances row. Customization (if any) appends.
  const blockId = await upsertBlockInstance({
    workspaceId: input.workspaceId,
    blockName: input.blockName,
    templateVersion: block.version,
    generationPrompt: input.generationPrompt,
    customization: input.customization,
    props: validatedProps as Record<string, unknown>,
    renderedHtml: renderedHtmlForBlock,
    renderedHtmlHash: renderedHash,
  });

  // Resolve the public URL for the operator-facing response.
  const [org] = await db
    .select({ slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, input.workspaceId))
    .limit(1);
  const baseDomain =
    process.env.WORKSPACE_BASE_DOMAIN?.trim() || "app.seldonframe.com";
  const publicUrl = org?.slug
    ? `https://${org.slug}.${baseDomain}/`
    : null;

  return {
    ok: true,
    block_id: blockId,
    block_name: input.blockName,
    template_version: block.version,
    surface: block.surface,
    public_url: publicUrl,
    validation_warnings: [],
  };
}

// ─── surface: landing-section ───────────────────────────────────────────────

async function persistLandingSectionBlock(
  workspaceId: string,
  sectionType: string,
  validatedProps: unknown,
  toSection: ((props: unknown) => LandingSection) | undefined,
  blockName: string,
): Promise<string> {
  if (!toSection) {
    throw new Error(
      `block "${blockName}" surface=landing-section but no toSection function — registry misconfigured`,
    );
  }

  let section = toSection(validatedProps);

  // Hero-specific: resolve background_image_query → real Unsplash URL.
  if (blockName === "hero") {
    const query = (validatedProps as { background_image_query?: string })
      .background_image_query;
    if (query && section.type === "hero") {
      try {
        const url = await resolveHeroImageUrlForQuery(query);
        section = { ...section, imageUrl: url };
      } catch {
        // resolveHeroImageUrlForQuery never throws today, but be defensive.
      }
    }
  }

  const { landing, landingPageId, blueprint } = await loadLandingForWorkspace(workspaceId);
  void landing;

  // Replace (or append) the matching section in the blueprint.
  const replaced = replaceSection(
    blueprint,
    sectionType as LandingSection["type"],
    section,
  );

  // Re-render the full landing.
  const { html, css } = renderGeneralServiceV1(replaced);

  // Persist landing_pages update.
  await db
    .update(landingPages)
    .set({
      contentHtml: html,
      contentCss: css,
      blueprintJson: replaced as unknown as Record<string, unknown>,
      updatedAt: new Date(),
    })
    .where(eq(landingPages.id, landingPageId));

  // Extract the section's HTML for the block_instances row (audit
  // artifact — section_html is the cached projection of THIS block).
  return (
    extractSectionHtml(html, sectionType as LandingSection["type"]) ?? html
  );
}

// ─── surface: booking ───────────────────────────────────────────────────────

async function persistBookingBlock(
  workspaceId: string,
  props: BookingProps,
): Promise<string> {
  const { landingPageId, blueprint } = await loadLandingForWorkspace(workspaceId);

  // Build the new Blueprint.booking object from v2 props. Preserve
  // existing fields the v1 bootstrap set that v2 doesn't manage
  // (e.g. confirmation copy is still v1's).
  const prevBooking = blueprint.booking;
  const nextBooking: BlueprintBooking = {
    renderer: "calcom-month-v1",
    eventType: {
      title: props.title,
      description: props.description,
      durationMinutes: props.duration_minutes,
      location: { kind: props.location_kind },
      bufferMinutes: prevBooking?.eventType?.bufferMinutes,
    },
    availability: {
      weekly: weeklyAvailabilityToWeeklyHours(props.weekly_availability),
      blackoutDates: prevBooking?.availability?.blackoutDates,
      leadTimeHours: prevBooking?.availability?.leadTimeHours,
      advanceWindowDays: prevBooking?.availability?.advanceWindowDays,
    },
    formFields: mergeBookingFormFields(props.form_fields ?? []),
    confirmation: prevBooking?.confirmation ?? {
      headline: "Your booking is confirmed",
      message: "We'll send a calendar invite shortly. If anything changes, just reply to that email.",
    },
  };

  const nextBlueprint: Blueprint = { ...blueprint, booking: nextBooking };

  // Persist updated blueprint (the booking renderer + landing renderer
  // both read from this).
  await db
    .update(landingPages)
    .set({
      blueprintJson: nextBlueprint as unknown as Record<string, unknown>,
      updatedAt: new Date(),
    })
    .where(eq(landingPages.id, landingPageId));

  // Re-render booking template HTML via calcom-month-v1.
  const { html, css } = renderCalcomMonthV1(nextBlueprint);

  // Update the bookings template row(s). Title + metadata get the new v2
  // values; contentHtml/contentCss get the freshly-rendered output. The
  // public booking flow (resolvePublicBookingContext) reads metadata, so
  // updating it here is what makes the v2 title/description actually
  // surface to bookers.
  const templateRows = await db
    .select({
      id: bookings.id,
      metadata: bookings.metadata,
    })
    .from(bookings)
    .where(and(eq(bookings.orgId, workspaceId), eq(bookings.status, "template")));

  for (const row of templateRows) {
    const existingMeta = (row.metadata ?? {}) as Record<string, unknown>;
    const nextMeta = {
      ...existingMeta,
      appointmentName: props.title,
      description: props.description,
      durationMinutes: props.duration_minutes,
      // Persist availability in the canonical { monday: {enabled,start,end}, ... }
      // shape that resolvePublicBookingContext + listPublicBookingSlotsAction
      // read. v1.3.1 standardized on this shape; bridge from the [open,close]
      // tuples v2 uses.
      availability: weeklyAvailabilityToCanonicalAvailability(
        props.weekly_availability,
      ),
    };
    await db
      .update(bookings)
      .set({
        title: props.title,
        metadata: nextMeta,
        contentHtml: html,
        contentCss: css,
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, row.id));
  }

  return html;
}

// ─── surface: intake ────────────────────────────────────────────────────────

async function persistIntakeBlock(
  workspaceId: string,
  props: IntakeProps,
): Promise<string> {
  const { landingPageId, blueprint } = await loadLandingForWorkspace(workspaceId);

  const nextIntake: BlueprintIntake = {
    renderer: "formbricks-stack-v1",
    title: props.title,
    description: props.description,
    questions: props.questions.map(
      (q): IntakeQuestion => ({
        id: q.id,
        label: q.label,
        type: q.type,
        required: q.required,
        helper: q.helper,
        options: q.options,
      }),
    ),
    completion: {
      headline: props.completion_headline,
      message: props.completion_message,
    },
  };

  const nextBlueprint: Blueprint = { ...blueprint, intake: nextIntake };

  await db
    .update(landingPages)
    .set({
      blueprintJson: nextBlueprint as unknown as Record<string, unknown>,
      updatedAt: new Date(),
    })
    .where(eq(landingPages.id, landingPageId));

  // Re-render intake form HTML via formbricks-stack-v1.
  const { html, css } = renderFormbricksStackV1(nextBlueprint);

  // Update the intakeForms row(s). The public intake POST handler reads
  // intake_forms.fields to validate submissions, so the schema must match
  // the rendered form.
  const formRows = await db
    .select({ id: intakeForms.id })
    .from(intakeForms)
    .where(eq(intakeForms.orgId, workspaceId));

  // Map v2 questions ({id, label, type, required?, options?, helper?}) onto
  // the existing IntakeFormField shape ({key, label, type, required, options?}).
  // The public intake POST handler reads `field.key` to extract answers,
  // so we must store with `key` (not `id`) for backward compat.
  const fieldsForRow = props.questions.map((q) => ({
    key: q.id,
    label: q.label,
    type: q.type,
    required: q.required ?? false,
    options: q.options,
  }));

  for (const row of formRows) {
    await db
      .update(intakeForms)
      .set({
        name: props.title,
        fields: fieldsForRow,
        contentHtml: html,
        contentCss: css,
        updatedAt: new Date(),
      })
      .where(eq(intakeForms.id, row.id));
  }

  return html;
}

// ─── shared helpers ─────────────────────────────────────────────────────────

async function loadLandingForWorkspace(workspaceId: string): Promise<{
  landing: { title: string; settings: Record<string, unknown> };
  landingPageId: string;
  blueprint: Blueprint;
}> {
  const [landing] = await db
    .select({
      id: landingPages.id,
      title: landingPages.title,
      settings: landingPages.settings,
      blueprintJson: landingPages.blueprintJson,
    })
    .from(landingPages)
    .where(
      and(
        eq(landingPages.orgId, workspaceId),
        eq(landingPages.slug, "home"),
      ),
    )
    .limit(1);
  if (!landing) {
    throw new Error(
      "workspace_landing_missing: no landing_pages row with slug='home'. Run create_workspace_v2 before persisting blocks.",
    );
  }
  const settings = (landing.settings ?? {}) as Record<string, unknown>;
  const industry =
    typeof settings.industry === "string"
      ? (settings.industry as string)
      : null;
  const blueprint = loadBlueprintOrFallback(
    { blueprintJson: landing.blueprintJson },
    landing.title,
    industry,
  );
  return {
    landing: {
      title: landing.title,
      settings,
    },
    landingPageId: landing.id,
    blueprint,
  };
}

async function upsertBlockInstance(args: {
  workspaceId: string;
  blockName: string;
  templateVersion: string;
  generationPrompt: string;
  customization?: { prompt: string; source?: string };
  props: Record<string, unknown>;
  renderedHtml: string;
  renderedHtmlHash: string;
}): Promise<string> {
  const [existing] = await db
    .select({
      id: blockInstances.id,
      customizations: blockInstances.customizations,
    })
    .from(blockInstances)
    .where(
      and(
        eq(blockInstances.orgId, args.workspaceId),
        eq(blockInstances.blockName, args.blockName),
      ),
    )
    .limit(1);

  if (existing) {
    const nextCustomizations: BlockCustomization[] = args.customization
      ? [
          ...(existing.customizations ?? []),
          {
            at: new Date().toISOString(),
            prompt: args.customization.prompt,
            actor: "operator",
            source: args.customization.source ?? "unknown",
          },
        ]
      : (existing.customizations ?? []);
    await db
      .update(blockInstances)
      .set({
        // For NEW generation (no customization), generation_prompt is replaced.
        // For customization, generation_prompt is left alone.
        generationPrompt: args.customization
          ? undefined
          : args.generationPrompt,
        customizations: nextCustomizations,
        props: args.props,
        renderedHtml: args.renderedHtml,
        renderedHtmlHash: args.renderedHtmlHash,
        templateVersion: args.templateVersion,
        updatedAt: new Date(),
      })
      .where(eq(blockInstances.id, existing.id));
    return existing.id;
  }
  const [created] = await db
    .insert(blockInstances)
    .values({
      orgId: args.workspaceId,
      blockName: args.blockName,
      templateVersion: args.templateVersion,
      generationPrompt: args.generationPrompt,
      customizations: [],
      props: args.props,
      renderedHtml: args.renderedHtml,
      renderedHtmlHash: args.renderedHtmlHash,
    })
    .returning({ id: blockInstances.id });
  return created?.id ?? "";
}

/**
 * Replace the FIRST section of the given type in a blueprint with `next`.
 * If no section of that type exists, append it. Returns a new blueprint
 * (does not mutate input).
 */
function replaceSection(
  blueprint: Blueprint,
  sectionType: LandingSection["type"],
  next: LandingSection,
): Blueprint {
  const sections = blueprint.landing.sections;
  const idx = sections.findIndex((s) => s.type === sectionType);
  const nextSections =
    idx === -1
      ? [...sections, next]
      : sections.map((s, i) => (i === idx ? next : s));
  return {
    ...blueprint,
    landing: { ...blueprint.landing, sections: nextSections },
  };
}

/**
 * Extract the rendered HTML for one section by class marker. The
 * general-service-v1 renderer emits class="sf-hero", class="sf-services",
 * class="sf-about", class="sf-faq", class="sf-mid-cta" on the section
 * root. Returns null if not found (cosmetic — caller falls back to the
 * full HTML).
 */
function extractSectionHtml(
  html: string,
  sectionType: LandingSection["type"],
): string | null {
  const className =
    sectionType === "hero"
      ? "sf-hero"
      : sectionType === "services-grid"
        ? "sf-services"
        : sectionType === "about"
          ? "sf-about"
          : sectionType === "faq"
            ? "sf-faq"
            : sectionType === "mid-cta"
              ? "sf-mid-cta"
              : null;
  if (!className) return null;
  const re = new RegExp(
    `<section[^>]*\\bclass="${className}[^"]*"[^>]*>[\\s\\S]*?<\\/section>`,
    "i",
  );
  const match = html.match(re);
  return match ? match[0] : null;
}

/**
 * Convert v2 weekly_availability ([open,close] tuples per day) to the
 * Blueprint.booking.availability.weekly shape (DayHourRange = [open, close] | null).
 * The shapes are nearly identical — this is mostly a type-narrow.
 */
function weeklyAvailabilityToWeeklyHours(
  v: BookingProps["weekly_availability"],
): WeeklyHours {
  return {
    mon: v.mon,
    tue: v.tue,
    wed: v.wed,
    thu: v.thu,
    fri: v.fri,
    sat: v.sat,
    sun: v.sun,
  };
}

/**
 * Convert v2 weekly_availability to the bookings.metadata.availability
 * shape that resolvePublicBookingContext + listPublicBookingSlotsAction
 * read: { monday: {enabled, start, end}, ... } with full day names and
 * "HH:MM" string times.
 *
 * v1.3.1 standardized on this shape; v2 uses tuples internally for
 * conciseness, this bridge maps to the canonical persistence shape.
 */
function weeklyAvailabilityToCanonicalAvailability(
  v: BookingProps["weekly_availability"],
): Record<string, { enabled: boolean; start: string; end: string }> {
  const dayMap: Array<[keyof BookingProps["weekly_availability"], string]> = [
    ["mon", "monday"],
    ["tue", "tuesday"],
    ["wed", "wednesday"],
    ["thu", "thursday"],
    ["fri", "friday"],
    ["sat", "saturday"],
    ["sun", "sunday"],
  ];
  const out: Record<string, { enabled: boolean; start: string; end: string }> = {};
  for (const [shortKey, longKey] of dayMap) {
    const tuple = v[shortKey];
    if (tuple === null) {
      out[longKey] = { enabled: false, start: "09:00", end: "17:00" };
    } else {
      const [open, close] = tuple;
      out[longKey] = {
        enabled: true,
        start: hourToTimeString(open),
        end: hourToTimeString(close),
      };
    }
  }
  return out;
}

function hourToTimeString(h: number): string {
  const wholeHours = Math.floor(h);
  const minutes = Math.round((h - wholeHours) * 60);
  return `${String(wholeHours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function sha1(s: string): string {
  return createHash("sha1").update(s).digest("hex");
}

/**
 * v1.4.2 — always include standard name + email fields in the booking
 * form, even when the LLM only provides operator-specific extras.
 *
 * Why: the calcom-month-v1 renderer reads Blueprint.booking.formFields
 * directly — it does NOT auto-prepend name/email. Pre-1.4.2 the v2
 * persist path replaced formFields with whatever the LLM generated,
 * wiping the standard fields v1's bootstrap had put there. Result:
 * every v2 workspace shipped a booking form with no name + email
 * inputs, and submitPublicBookingAction rejected every attempt with
 * "missing_required_field fullName_present:false email_present:false".
 *
 * The right behavior is for the SF backend to OWN the standard fields
 * (the renderer always needs them; the booking POST handler always
 * requires them). The LLM's job is to add operator-specific extras —
 * "Dog's name" for grooming, "Service address" for HVAC, "Party size"
 * for a restaurant. We dedupe on `id` so an LLM that DOES include name
 * or email doesn't produce two of each.
 */
function mergeBookingFormFields(
  llmFields: Array<{
    id: string;
    label: string;
    type: "text" | "email" | "phone" | "textarea" | "select";
    required?: boolean;
    placeholder?: string;
    options?: string[];
  }>,
): BookingFormField[] {
  const STANDARD_FIELDS: BookingFormField[] = [
    {
      id: "fullName",
      label: "Your name",
      type: "text",
      required: true,
    },
    {
      id: "email",
      label: "Email",
      type: "email",
      required: true,
    },
  ];
  const standardIds = new Set(STANDARD_FIELDS.map((f) => f.id));
  // Drop any LLM-provided field that conflicts with a standard id; the
  // server's standard takes precedence (the booking POST handler
  // expects exactly these ids).
  const extras = llmFields.filter((f) => !standardIds.has(f.id));
  return [...STANDARD_FIELDS, ...extras] as BookingFormField[];
}
