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
  SectionHero,
  WeeklyHours,
} from "@/lib/blueprint/types";
import {
  resolveHeroImage,
  resolveHeroImageUrlForQuery,
} from "@/lib/crm/personality-images";
import { searchPexelsVideo } from "@/lib/assets/pexels";
import { getBlock, type BookingProps, type IntakeProps } from "./registry";
import type { LandingPageSection } from "@/components/landing/sections/types";
import {
  ARCHETYPES,
  classifyArchetype,
  type AestheticArchetypeId,
} from "@/lib/workspace/aesthetic-archetypes";
import type { OrgTheme } from "@/lib/theme/types";
import type { OrgSoul } from "@/lib/soul/types";

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

/**
 * v1.54.0 — Resolves the aesthetic archetype for an org, with lazy
 * backfill for workspaces created before v1.54 (whose theme JSONB
 * lacks aestheticArchetype).
 *
 * Happy path: returns org.theme.aestheticArchetype, no DB write.
 * Backfill: re-classifies from soul + writes patched theme via the
 * dbUpdate callback, returns the freshly classified id.
 *
 * dbUpdate is injected for testability — the real callsite passes a
 * closure over db.update(organizations).
 */
export async function resolveOrgArchetype(
  workspaceId: string,
  org: { theme: OrgTheme; soul: OrgSoul | null; name: string },
  dbUpdate: (patch: { theme: OrgTheme }) => Promise<void>,
): Promise<AestheticArchetypeId> {
  if (org.theme.aestheticArchetype) {
    return org.theme.aestheticArchetype;
  }

  // Lazy backfill — re-classify from soul + patch theme so subsequent
  // persists read from theme directly.
  //
  // The organizations.soul JSONB stores snake_case keys (personality_vertical,
  // emergency_service, etc. — see anonymous-workspace.ts) but the OrgSoul TS
  // interface is camelCase. Cast through `Record<string, unknown>` to read
  // the actual runtime shape — the same pattern used in create-full.ts,
  // forms/submit, deals/actions, generate-with-claude, etc.
  const soulRecord = (org.soul as unknown as Record<string, unknown> | null) ?? null;
  const reclassified = classifyArchetype({
    vertical: (soulRecord?.personality_vertical as string | undefined) ?? "",
    emergencyService: (soulRecord?.emergency_service as boolean | null | undefined) ?? null,
    sameDay: (soulRecord?.same_day as boolean | null | undefined) ?? null,
    reviewRating: (soulRecord?.review_rating as number | null | undefined) ?? null,
    reviewCount: (soulRecord?.review_count as number | null | undefined) ?? null,
    businessDescription: (soulRecord?.business_description as string | null | undefined) ?? null,
  });

  console.warn(
    JSON.stringify({
      event: "org_archetype_lazy_backfilled",
      workspace_id: workspaceId,
      archetype: reclassified,
    }),
  );

  await dbUpdate({
    theme: { ...org.theme, aestheticArchetype: reclassified },
  });

  return reclassified;
}

const KNOWN_TEMPLATES = new Set([
  "cinematic-aura",
  "viktor-light",
  "velorah-editorial",
  "nexora-light",
  "securify-bold",
  "stellar-tabs-white",
]);

export interface HeroEnforcementInput {
  workspaceId: string;
  archetypeId: AestheticArchetypeId;
  /** What the CC agent's LLM put in the `template` prop (may be empty,
   *  undefined, or invalid). */
  llmTemplate: string | undefined;
  /** What the CC agent's LLM put in the `variant` prop. */
  llmVariant: string | undefined;
}

export interface HeroEnforcementResult {
  /** Final template id to write into landing_pages.sections. */
  finalTemplate: string;
  /** Final variant to write. */
  finalVariant: string;
  /** True iff finalTemplate ≠ what the LLM picked. */
  templateOverridden: boolean;
  /** True iff finalVariant ≠ what the LLM picked. */
  variantOverridden: boolean;
}

/**
 * v1.54.0 — Pure decision function: given archetype + LLM picks, decide
 * the final template + variant. Trust the LLM ONLY when it agrees with
 * the archetype's defaults. Otherwise override to archetype defaults.
 *
 * Logging happens in the caller using the boolean flags returned here.
 */
export function enforceArchetypeOnHero(
  input: HeroEnforcementInput,
): HeroEnforcementResult {
  const archetype = ARCHETYPES[input.archetypeId];
  const llmTemplate = input.llmTemplate ?? "";
  const llmVariant = input.llmVariant ?? "";

  // Template: trust LLM only when it picked a known template that
  // matches the archetype's default. Empty string also "matches" when
  // archetype.defaultTemplate is "".
  const llmTemplateValid =
    llmTemplate === "" || KNOWN_TEMPLATES.has(llmTemplate);
  const templateAgrees =
    llmTemplateValid && llmTemplate === archetype.defaultTemplate;
  const finalTemplate = templateAgrees ? llmTemplate : archetype.defaultTemplate;

  // Variant: trust LLM only when it exactly matches archetype.heroVariant.
  const variantAgrees = llmVariant === archetype.heroVariant;
  const finalVariant = variantAgrees ? llmVariant : archetype.heroVariant;

  return {
    finalTemplate,
    finalVariant,
    templateOverridden: !templateAgrees,
    variantOverridden: !variantAgrees,
  };
}

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
    // contract:throw-ok: registry misconfiguration — every
    // surface=landing-section block MUST have toSection. This branch
    // is unreachable in valid registry state and is caught by the
    // top-level try/catch in persistBlockForWorkspace which returns
    // a structured error response.
    throw new Error(
      `block "${blockName}" surface=landing-section but no toSection function — registry misconfigured`,
    );
  }

  let section = toSection(validatedProps);

  // v1.54.0 — Resolve archetype for hero blocks BEFORE image resolution
  // and section construction so we can (a) override template/variant
  // server-side and (b) thread archetypeContext into resolveHeroImage's
  // Phase 2 fallback.
  let heroArchetypeContext:
    | { archetype: AestheticArchetypeId; businessName: string }
    | undefined = undefined;
  if (blockName === "hero" && section.type === "hero") {
    const [org] = await db
      .select({
        name: organizations.name,
        theme: organizations.theme,
        soul: organizations.soul,
      })
      .from(organizations)
      .where(eq(organizations.id, workspaceId))
      .limit(1);
    if (org) {
      const archetypeId = await resolveOrgArchetype(
        workspaceId,
        { theme: org.theme, soul: org.soul, name: org.name },
        async (patch) => {
          await db
            .update(organizations)
            .set({ theme: patch.theme })
            .where(eq(organizations.id, workspaceId));
        },
      );
      heroArchetypeContext = {
        archetype: archetypeId,
        businessName: org.name,
      };

      // Server-side enforcement of template + variant.
      const enforcement = enforceArchetypeOnHero({
        workspaceId,
        archetypeId,
        llmTemplate: (validatedProps as { template?: string }).template,
        llmVariant: section.variant,
      });
      if (enforcement.templateOverridden) {
        console.warn(
          JSON.stringify({
            event: "hero_template_overridden",
            workspace_id: workspaceId,
            archetype: archetypeId,
            llm_picked: (validatedProps as { template?: string }).template ?? "",
            archetype_default: enforcement.finalTemplate,
          }),
        );
      }
      if (enforcement.variantOverridden) {
        console.warn(
          JSON.stringify({
            event: "hero_variant_overridden",
            workspace_id: workspaceId,
            archetype: archetypeId,
            llm_picked: section.variant ?? "",
            archetype_default: enforcement.finalVariant,
          }),
        );
      }
      // Mutate downstream inputs to use the enforced values.
      (validatedProps as { template?: string }).template = enforcement.finalTemplate || undefined;
      section = { ...section, variant: enforcement.finalVariant as SectionHero["variant"] };
    }
  }

  // v1.44.0 — hero-specific asset resolution. We now resolve BOTH the
  // Unsplash hero image (for legacy renders + heroImage prop) AND a
  // Pexels video (for cinematic templates that need looping motion).
  // Both fire in parallel via Promise.all so latency is just max(image,
  // video) instead of image+video sequential.
  let heroImageAttribution:
    | LandingPageSection["content"]["heroImageAttribution"]
    | undefined;
  let heroVideoUrl: string | undefined;
  let heroVideoAttribution:
    | LandingPageSection["content"]["heroVideoAttribution"]
    | undefined;
  if (blockName === "hero" && section.type === "hero") {
    const imageQuery = (validatedProps as { background_image_query?: string })
      .background_image_query;
    const videoQuery = (validatedProps as { background_video_query?: string })
      .background_video_query;
    // Only fire the Pexels call when the chosen template actually uses
    // a video (cinematic-aura, velorah-editorial, securify-bold). Light
    // templates skip it — saves a Pexels call per workspace creation.
    const templateUsesVideo = (() => {
      const t = (validatedProps as { template?: string }).template;
      return t === "cinematic-aura" || t === "velorah-editorial" || t === "securify-bold";
    })();
    const [imageResult, videoResult] = await Promise.allSettled([
      imageQuery ? resolveHeroImage(imageQuery, heroArchetypeContext) : Promise.resolve(null),
      videoQuery && templateUsesVideo
        ? searchPexelsVideo(videoQuery, {
            orientation: "landscape",
            size: "medium",
          })
        : Promise.resolve(null),
    ]);
    if (imageResult.status === "fulfilled" && imageResult.value) {
      section = { ...section, imageUrl: imageResult.value.url };
      heroImageAttribution = imageResult.value.attribution;
    } else if (imageQuery) {
      // Fallback to the legacy URL-only resolver path that the pre-1.44
      // code used (preserves behavior when resolveHeroImage returned a
      // null result but the legacy resolver had a cached URL).
      try {
        const url = await resolveHeroImageUrlForQuery(imageQuery);
        if (url) section = { ...section, imageUrl: url };
      } catch {
        /* Soft-fail — empty image triggers the branded-gradient empty state. */
      }
    }
    if (videoResult.status === "fulfilled" && videoResult.value) {
      heroVideoUrl = videoResult.value.url;
      heroVideoAttribution = {
        photographer_name: videoResult.value.attribution.photographer_name,
        photographer_url: videoResult.value.attribution.photographer_url,
        source_url: videoResult.value.attribution.source_url,
        video_id: videoResult.value.attribution.video_id,
      };
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

  // v1.44.0 — when the hero carries a `template` field, ALSO populate
  // landing_pages.sections with a LandingPageSection[] so the public
  // page renderer can dispatch to the HERO_TEMPLATES registry instead
  // of the legacy static-HTML path. We merge with any existing sections
  // (enhance-blocks may have written them earlier) so non-hero sections
  // stay intact.
  const sectionsUpdate = await maybeBuildSectionsUpdate({
    workspaceId,
    landingPageId,
    blockName,
    section,
    validatedProps,
    heroImageAttribution,
    heroVideoUrl,
    heroVideoAttribution,
  });

  // Persist landing_pages update. When sectionsUpdate is non-null we
  // also write to sections JSONB and NULL out contentHtml so the
  // sections-based renderer wins (richer React tree with templates +
  // Framer Motion). When sectionsUpdate is null (template not set) we
  // keep the legacy static-HTML path intact.
  await db
    .update(landingPages)
    .set({
      ...(sectionsUpdate
        ? { contentHtml: null, contentCss: null, sections: sectionsUpdate }
        : { contentHtml: html, contentCss: css }),
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

// v1.44.0 — when persist_block writes a hero with a `template` field,
// also update landing_pages.sections JSONB so the React PageRenderer
// can dispatch to HERO_TEMPLATES[template]. Loads the existing sections
// array (which enhance-blocks may have populated) and upserts the
// hero entry; returns null when no template is set (legacy path).
async function maybeBuildSectionsUpdate(args: {
  workspaceId: string;
  landingPageId: string;
  blockName: string;
  section: LandingSection;
  validatedProps: unknown;
  heroImageAttribution: LandingPageSection["content"]["heroImageAttribution"] | undefined;
  heroVideoUrl: string | undefined;
  heroVideoAttribution: LandingPageSection["content"]["heroVideoAttribution"] | undefined;
}): Promise<LandingPageSection[] | null> {
  if (args.blockName !== "hero" || args.section.type !== "hero") return null;
  const template = (args.validatedProps as { template?: string }).template;
  if (!template) return null;

  // Load existing sections (may have been populated by enhance-blocks
  // during create_workspace_v2's server-side setup).
  const [row] = await db
    .select({ sections: landingPages.sections })
    .from(landingPages)
    .where(eq(landingPages.id, args.landingPageId))
    .limit(1);
  const existing = (row?.sections as LandingPageSection[] | null) ?? [];

  const heroSection: LandingPageSection = {
    type: "hero",
    order: 1,
    content: {
      kicker: args.section.eyebrow,
      headline: args.section.headline,
      subheadline: args.section.subhead ?? "",
      ctaText: args.section.ctaPrimary.label,
      ctaLink: args.section.ctaPrimary.href,
      secondaryCta: args.section.ctaSecondary
        ? {
            text: args.section.ctaSecondary.label,
            link: args.section.ctaSecondary.href,
          }
        : undefined,
      heroImage: args.section.imageUrl ?? "",
      heroImageAttribution: args.heroImageAttribution,
      heroVideo: args.heroVideoUrl ?? "",
      heroVideoAttribution: args.heroVideoAttribution,
      shinyWord: args.section.shinyWord,
      template: template as LandingPageSection["content"]["template"],
      variant: args.section.variant,
    },
  };

  // Upsert the hero section (replace by type) while preserving any
  // other sections enhance-blocks wrote (navbar, about, services, etc.).
  // If existing has no hero, prepend; else replace.
  //
  // v1.55.0 — Always evict the chatbotPreview placeholder section
  // (default public surface for new workspaces) when ANY real landing
  // block is persisted. The chatbotPreview is the demo shown until
  // the operator runs the landing-page-creation SKILL.md; once they
  // do, hero/services/etc replace it. Without this filter, the
  // chatbotPreview would persist BELOW the new landing sections and
  // produce a hybrid page that overlaps the marketing landing with
  // the chatbot demo.
  const hadChatbotPreview = existing.some(
    (s) => s.type === "chatbotPreview",
  );
  if (hadChatbotPreview) {
    console.warn(
      JSON.stringify({
        event: "chatbot_preview_evicted",
        workspace_id: args.workspaceId,
        replaced_by_block: args.blockName,
      }),
    );
  }
  const others = existing.filter(
    (s) => s.type !== "hero" && s.type !== "chatbotPreview",
  );
  if (existing.some((s) => s.type === "hero")) {
    // Preserve other sections' order; just substitute hero in place
    // AND strip any chatbotPreview placeholder in the same pass.
    return existing
      .filter((s) => s.type !== "chatbotPreview")
      .map((s) => (s.type === "hero" ? heroSection : s));
  }
  // No prior hero — prepend after navbar if present, else at the front.
  const navbarIdx = others.findIndex((s) => s.type === "navbar");
  if (navbarIdx >= 0) {
    return [
      ...others.slice(0, navbarIdx + 1),
      heroSection,
      ...others.slice(navbarIdx + 1),
    ];
  }
  return [heroSection, ...others];
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
    // contract:throw-ok: workspace doesn't have a landing page row —
    // create_workspace_v2 always creates one, so this means the
    // workspace was created via a path that didn't bootstrap the
    // landing. Caught by top-level try/catch in
    // persistBlockForWorkspace; surfaced as 422 to the IDE agent.
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
export function mergeBookingFormFields(
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
