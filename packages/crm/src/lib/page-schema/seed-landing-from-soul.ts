// ============================================================================
// seedLandingFromSoul — render the landing page from a workspace Soul.
// ============================================================================
//
// May 1, 2026 — primitives architecture A5/B7. Walks the new pipeline
// end-to-end:
//   org.soul → schemaFromSoul()         (B1 content-pack-aware schema)
//             → tokensForPersonality()   (per-business-type defaults)
//             → renderWithGeneralServiceV1()  (adapter → existing renderer)
//             → persist HTML + CSS + Blueprint to landing_pages
//
// Called from the Soul submit handler so a freshly-submitted Soul (with a
// SaaS classification) immediately re-renders the landing page using the
// SaaS content pack — no operator action required.
//
// Best-effort: failures log but don't propagate. The legacy seed/re-render
// path (`reRenderAllSurfacesForOrg`) remains as the canonical fallback for
// plan-change webhooks.

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { landingPages, organizations } from "@/db/schema";
import { canRemoveBranding, resolvePlanFromPlanId } from "@/lib/billing/entitlements";
import { schemaFromSoul } from "./schema-from-soul";
import { tokensForPersonality } from "./design-tokens";
import { renderWithGeneralServiceV1 } from "./renderers/general-service-v1-adapter";
import { blueprintFromSchema } from "./renderers/blueprint-from-schema";
import { classifyBusinessTypeFromSoul } from "./classify-business";
import { validateFullPipeline } from "./pipeline-validator";
import {
  readPersonalityFromSettings,
  resolvePersonalityContent,
  type CRMPersonality,
  type PersonalityTemplateVars,
  type ResolvedPersonalityContent,
} from "@/lib/crm/personality";
import { iconForTitle } from "@/lib/blueprint/renderers/lucide-icons";
import {
  getPersonalityImages,
  resolveHeroImageUrlForQuery,
} from "@/lib/crm/personality-images";
import type { BusinessType, PageSchema } from "./types";
import type { PagePersonality } from "./design-tokens";

/** Map a business type to a default personality. May 1, 2026 — drives
 *  both the cinematic overlay (dark, glassmorphism, Instrument Serif
 *  italic headings, blur-in animations) AND the light/professional
 *  overlay (white bg with dark hero band, Inter throughout, white
 *  service cards with hover-lift). Operators override later via
 *  update_design_tokens / set_page_style.
 *
 *  Mapping per user spec:
 *    saas / agency           → cinematic (dark + glass)
 *    professional_service    → light mode, Inter (clean personality has
 *                              the right tokens — light + Inter — even
 *                              though the name suggests minimalism; the
 *                              `editorial` personality uses serif which
 *                              feels wrong for service businesses)
 *    local_service           → clean (light + Inter)
 *    ecommerce               → clean (light + Inter)
 *    other                   → clean (safe default)
 */
function defaultPersonalityForType(type: BusinessType): PagePersonality {
  switch (type) {
    case "saas":
    case "agency":
      return "cinematic";
    case "professional_service":
    case "local_service":
    case "ecommerce":
    case "other":
      return "clean";
  }
}

export interface SeedLandingResult {
  ok: boolean;
  landingId?: string;
  reason?: string;
}

/**
 * Build a PageSchema from the org's Soul, render via the V1 renderer
 * adapter, and persist the result to the org's primary landing page row
 * (slug = "home"). Idempotent — safe to call on every Soul submission.
 *
 * If the org has no landing page row yet, this function does NOT create
 * one (workspace creation handles that). It only updates an existing row.
 * Reason: we don't want to race the workspace-creation seed flow, which
 * has its own atomic transaction.
 */
export async function seedLandingFromSoul(orgId: string): Promise<SeedLandingResult> {
  if (!orgId) return { ok: false, reason: "no_org_id" };

  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      soul: organizations.soul,
      plan: organizations.plan,
      theme: organizations.theme,
      settings: organizations.settings,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) return { ok: false, reason: "org_not_found" };
  if (!org.soul) return { ok: false, reason: "no_soul" };

  // Build the schema + tokens.
  const businessType = classifyBusinessTypeFromSoul(
    org.soul as unknown as Record<string, unknown>
  );

  // v1.1.4 — Personality-Driven Content Layer.
  // Read the CRMPersonality from org.settings (set at workspace creation
  // by selectCRMPersonality / defensive override in createFullWorkspace),
  // build template vars from the soul, and resolve the personality's
  // content_templates into final substituted strings.
  const crmPersonality = readPersonalityFromSettings(
    (org.settings as Record<string, unknown> | null)?.crmPersonality
  );

  // v1.3.3 — render-mode resolution. Personality's theme.mode is the
  // canonical source. Default ALWAYS falls to "clean" (light) per
  // the user spec — premium verticals must opt in to dark via
  // theme.mode === "dark". Previously the fallback used the
  // BusinessType heuristic which routed saas/agency to cinematic by
  // default, but for LLM-generated personalities without an explicit
  // theme.mode that produced unwanted dark renders for ordinary
  // service businesses (the Bright Futures Tutoring failure mode).
  const personality: PagePersonality =
    crmPersonality.theme?.mode === "dark" ? "cinematic" : "clean";
  // Reference the now-unused fallback so the function doesn't get
  // tree-shaken. Kept callable for legacy paths + tests.
  void defaultPersonalityForType;

  // v1.1.7 — per-CRMPersonality default accent. Operators can still
  // override via update_theme; we only fall through to the personality
  // default when org.theme.accentColor is unset (the workspace just
  // got created and no operator customization happened yet). Without
  // this, every workspace ships with the generic teal #14b8a6 accent
  // even when the personality has a clear brand archetype (medspa →
  // gold, dental → fresh blue, hvac → vivid orange).
  const personalityAccent = personalityDefaultAccent(crmPersonality.vertical);
  const accent =
    typeof org.theme?.accentColor === "string"
      ? org.theme.accentColor
      : personalityAccent ?? "#14b8a6";
  const tokens = tokensForPersonality(personality, {
    palette: { accent },
  });
  const soulRecordRaw = org.soul as unknown as Record<string, unknown>;
  const templateVars = buildPersonalityVars(soulRecordRaw, org.name);
  const resolvedContent = resolvePersonalityContent(
    crmPersonality,
    templateVars
  );
  const enrichedSoul = applyResolvedContentToSoul(soulRecordRaw, resolvedContent);

  const schema = schemaFromSoul(enrichedSoul, {
    business_type: businessType,
    // May 2, 2026 — pass the workspace name as an override so we
    // never render the literal "Your Business" placeholder when
    // soul.business_name is missing. The workspace.name is always
    // populated (it's a NOT NULL column) so this guarantees the
    // rendered nav / hero / footer show the real company name even
    // when the operator hasn't filled out a Soul yet.
    business_overrides: {
      name: org.name,
    },
  });

  // v1.1.4 — direct section overrides for slots schemaFromSoul does
  // not enrich from the soul (trust_bar, services_heading) and the
  // stats grid (which #8 says must come from input.review_count /
  // .review_rating, never fabricated).
  applyResolvedContentToSchema(schema, resolvedContent, crmPersonality);
  applyStatsFromSoul(schema, soulRecordRaw, crmPersonality);

  // v1.1.8 — Aggressive CTA-label override. The previous v1.1.4 path
  // overlaid hero_headline / faqs / cta_headline onto the soul, but
  // CTA BUTTON labels (the "Start for $0 →" / "Get started →" copy
  // on the actual buttons) flow through PageSchema.actions which are
  // pack-defined and don't read from the personality. Without this,
  // a fresh medspa workspace shipped with the SAAS_PACK's "Get
  // started →" button instead of "Book your consultation →" — the
  // personality's voice didn't carry through to the CTAs that
  // matter most for conversion.
  applyResolvedContentToActions(schema, resolvedContent);

  // v1.1.5 / Issue #2 — assign per-service Lucide icons based on the
  // service title + personality vertical. Without this, every service
  // card falls through to the generic "sparkles" fallback because the
  // operator's input.services strings are bare names ("AC Repair",
  // "Cleanings") with no icon hint. iconForTitle keyword-matches first,
  // then falls back to the vertical default (dental → smile, hvac →
  // wrench, legal → scale).
  applyServiceIconsFromPersonality(schema, crmPersonality);

  // v1.1.5 / Issue #3 — assign personality-curated Unsplash hero
  // image (and per-service images) so a fresh dental workspace renders
  // with a dental-office hero photo, not a text-only band. Operators
  // can override per-section via update_landing_section once they see
  // the rendered preview.
  // v1.3.4 — now async (Unsplash API fetch path). Awaited so the
  // hero image URL lands in the rendered HTML before persistence.
  await applyPersonalityImagesToSchema(schema, crmPersonality);

  // Plan-tier branding flag.
  const plan = resolvePlanFromPlanId(org.plan ?? null);
  const removePoweredBy = canRemoveBranding(plan);

  // Render via the adapter (PageSchema → Blueprint → V1 HTML+CSS+font-link).
  let html: string;
  let css: string;
  let blueprint: ReturnType<typeof blueprintFromSchema>;
  try {
    const output = renderWithGeneralServiceV1(schema, tokens, schema.media, {
      removePoweredBy,
    });

    // The adapter's `head` contains: optional <link> font preconnects +
    // `<style>...</style>` wrapping the CSS. Split them: font links get
    // prepended to contentHtml (so the served page picks them up at the
    // top of the body — modern browsers handle <link> in body fine);
    // CSS gets stored raw in contentCss per the column convention.
    const fontLinkMatch = output.head.match(/^([\s\S]*?)<style>([\s\S]*)<\/style>\s*$/);
    let fontLinks = "";
    if (fontLinkMatch) {
      fontLinks = fontLinkMatch[1].trim();
      css = fontLinkMatch[2];
    } else {
      // Defensive — when the renderer returns no head (light mode legacy
      // path), the head is just the <style> block. Fall back to existing
      // behavior.
      css = output.head.replace(/^<style>/, "").replace(/<\/style>$/, "");
    }
    html = fontLinks ? `${fontLinks}\n${output.html}` : output.html;
    blueprint = blueprintFromSchema(schema, tokens);
  } catch (err) {
    console.warn(`[seed-landing-from-soul] render failed for org ${orgId}:`, err);
    return { ok: false, reason: "render_failed" };
  }

  // Find the org's "home" landing row. We never create rows here — that's
  // the workspace-creation flow's job.
  const [row] = await db
    .select({ id: landingPages.id })
    .from(landingPages)
    .where(and(eq(landingPages.orgId, orgId), eq(landingPages.slug, "home")))
    .limit(1);

  if (!row) return { ok: false, reason: "no_landing_row" };

  // May 1, 2026 — Soul → Render pipeline contract assertions. Run
  // BEFORE persisting so failures show up in function logs paired
  // with the actual render output. Non-blocking: a partial render
  // is better than no render. Validation errors drive alerts and
  // catch regressions in renderer / content-pack changes before
  // they reach production.
  // v1.1.4 — reuse soulRecordRaw from above to avoid a redundant cast.
  const soulRecord = soulRecordRaw;
  const inputForValidator = {
    phone:
      typeof soulRecord.phone === "string" ? (soulRecord.phone as string) : null,
    services: Array.isArray(soulRecord.offerings)
      ? (soulRecord.offerings as Array<{ name: string; description?: string | null }>)
      : null,
    businessName:
      (typeof soulRecord.business_name === "string"
        ? (soulRecord.business_name as string)
        : null) || org.name,
    businessDescription:
      typeof soulRecord.soul_description === "string"
        ? (soulRecord.soul_description as string)
        : typeof soulRecord.description === "string"
          ? (soulRecord.description as string)
          : null,
    businessType,
    tagline:
      typeof soulRecord.tagline === "string" ? (soulRecord.tagline as string) : null,
    testimonials: Array.isArray(soulRecord.testimonials)
      ? (soulRecord.testimonials as Array<{
          quote: string;
          name?: string | null;
          role?: string | null;
          company?: string | null;
        }>)
      : null,
    faqs: Array.isArray(soulRecord.faqs)
      ? (soulRecord.faqs as Array<{ question: string; answer: string }>)
      : null,
  };
  validateFullPipeline(inputForValidator, soulRecord, schema, html, { orgId });

  await db
    .update(landingPages)
    .set({
      contentHtml: html,
      contentCss: css,
      blueprintJson: blueprint as unknown as Record<string, unknown>,
      updatedAt: new Date(),
    })
    .where(eq(landingPages.id, row.id));

  return { ok: true, landingId: row.id };
}

// ─── v1.1.7 — Per-CRMPersonality default accent color ────────────────────────
// Mapped to brand archetypes that read as appropriate for each vertical.
// Operators override via update_theme — we only apply these when no
// operator customization is on file yet.
function personalityDefaultAccent(vertical: string | undefined): string | null {
  switch (vertical) {
    case "medspa":
      return "#c9a96e"; // luxury gold
    case "dental":
      return "#2e90fa"; // fresh, friendly blue
    case "hvac":
      return "#f97316"; // vivid orange (warm + service-trade energetic)
    case "legal":
      return "#1e3a8a"; // deep navy (trust, gravitas)
    case "agency":
      return "#a855f7"; // creative violet
    case "coaching":
      return "#14b8a6"; // teal
    case "general":
      // v1.2.0 — generic trade / contractor accent. Saturated steel
      // blue reads professional + trustworthy without being any
      // specific industry's color (gold = medspa, navy = legal, orange
      // = hvac, etc.).
      return "#0e7490";
    default:
      return null;
  }
}

// ─── v1.1.4 — Personality-Driven Content helpers ─────────────────────────────

function readSoulString(soul: Record<string, unknown>, key: string): string | null {
  const v = soul[key];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function readSoulNumber(soul: Record<string, unknown>, key: string): number | null {
  const v = soul[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function readSoulStringArray(soul: Record<string, unknown>, key: string): string[] {
  const v = soul[key];
  if (!Array.isArray(v)) return [];
  return v.filter((s): s is string => typeof s === "string" && s.trim().length > 0);
}

function buildPersonalityVars(
  soul: Record<string, unknown>,
  workspaceName: string
): PersonalityTemplateVars {
  const offerings = Array.isArray(soul.offerings)
    ? (soul.offerings as Array<{ name?: string }>)
    : [];
  const servicesList = offerings
    .map((o) => (typeof o.name === "string" ? o.name.trim() : ""))
    .filter((s) => s.length > 0)
    .slice(0, 6) // keep substituted copy short
    .join(", ");

  const serviceAreaList = readSoulStringArray(soul, "service_area").slice(0, 4);
  const certifications = readSoulStringArray(soul, "certifications");

  return {
    city: readSoulString(soul, "city"),
    state: readSoulString(soul, "state"),
    phone: readSoulString(soul, "phone"),
    rating: readSoulNumber(soul, "review_rating"),
    review_count: readSoulNumber(soul, "review_count"),
    services_list: servicesList || null,
    service_area: serviceAreaList.length > 0 ? serviceAreaList.join(", ") : null,
    certifications: certifications.length > 0 ? certifications : null,
    business_name: readSoulString(soul, "business_name") || workspaceName,
  };
}

/**
 * Overlay resolved content onto a soul COPY so schemaFromSoul's existing
 * enrichHero / enrichFaq / enrichCta paths pick up the personality copy
 * without operator-provided overrides being lost. Operator-provided
 * fields always win — when soul.hero_headline is already set, we leave it.
 */
function applyResolvedContentToSoul(
  soul: Record<string, unknown>,
  resolved: ResolvedPersonalityContent | null
): Record<string, unknown> {
  if (!resolved) return soul;
  const next: Record<string, unknown> = { ...soul };

  if (!readSoulString(next, "hero_headline") && resolved.hero_headline) {
    next.hero_headline = resolved.hero_headline;
  }
  if (!readSoulString(next, "hero_subheadline") && resolved.hero_subheadline) {
    next.hero_subheadline = resolved.hero_subheadline;
  }
  if (!readSoulString(next, "cta_headline") && resolved.bottom_cta_heading) {
    next.cta_headline = resolved.bottom_cta_heading;
  }
  // Only inject FAQs when the operator hasn't supplied any — operator
  // FAQs always win.
  const existingFaqs = Array.isArray(next.faqs) ? (next.faqs as unknown[]) : [];
  if (existingFaqs.length === 0 && resolved.faqs.length > 0) {
    next.faqs = resolved.faqs;
  }

  return next;
}

/**
 * Direct section overrides for slots schemaFromSoul sources from the
 * BusinessType content pack (not the personality):
 *   - trust_bar bullets
 *   - services-grid headline (only the "services" intent — features /
 *     products / how_it_works keep their pack defaults)
 *
 * Mutates the schema in place. No-op when no resolved content (older
 * personalities without templates fall back to the pack defaults).
 */
function applyResolvedContentToSchema(
  schema: PageSchema,
  resolved: ResolvedPersonalityContent | null,
  personality: CRMPersonality
): void {
  if (!resolved) return;

  for (const section of schema.sections) {
    if (section.intent === "trust_bar" && resolved.trust_badges.length > 0) {
      section.content = {
        ...section.content,
        bullets: resolved.trust_badges,
      };
      section.visible = true;
      continue;
    }
    if (
      section.intent === "services" &&
      resolved.services_heading.trim().length > 0
    ) {
      section.content = {
        ...section.content,
        headline: resolved.services_heading,
      };
      continue;
    }
  }

  // Touch personality so the lint/type checker keeps the import live for
  // future per-vertical branching (e.g. a different services_heading rule
  // for SaaS vs local-service personalities). No behavioral effect today.
  void personality;
}

/**
 * v1.1.8 / v1.1.9 — Override hero + footer CTA button labels with the
 * personality's content_templates.cta_button_primary /
 * cta_button_secondary, AND structurally enforce the CTA href
 * contract: primary ALWAYS points at /book, secondary ALWAYS points
 * at /intake. The href is hardcoded here, never read from the pack
 * or personality config — making the historical "CTA swap" bug
 * (LOCAL_SERVICE_PACK had primary→/intake, SAAS_PACK same, etc.)
 * structurally impossible.
 *
 * Operators who manually edit a CTA via update_landing_section after
 * workspace creation retain their override; this runs at seed time only.
 */
function applyResolvedContentToActions(
  schema: PageSchema,
  resolved: ResolvedPersonalityContent | null
): void {
  const primaryLabel = resolved?.cta_button_primary?.trim();
  const secondaryLabel = resolved?.cta_button_secondary?.trim();

  schema.actions = schema.actions.map((action) => {
    if (action.id === "hero_primary") {
      // v1.1.9 — primary CTA is ALWAYS /book. Label from personality
      // when available, otherwise leave the pack-default label
      // (already operator-friendly).
      return {
        ...action,
        href: "/book",
        text: primaryLabel || action.text,
      };
    }
    if (action.id === "hero_secondary") {
      // v1.1.9 — secondary CTA is ALWAYS /intake.
      return {
        ...action,
        href: "/intake",
        text: secondaryLabel || action.text,
      };
    }
    return action;
  });
}

/**
 * v1.1.5 / Issue #3 — assign personality-curated Unsplash images.
 * Hero gets the bundle's hero_url; service cards get round-robin
 * assignment from service_grid_image_urls. Items already carrying an
 * `image` value (e.g. operator-uploaded) are left alone.
 */
async function applyPersonalityImagesToSchema(
  schema: PageSchema,
  personality: CRMPersonality
): Promise<void> {
  // v1.3.4 — image source priority:
  //   1. LLM personality.images.hero_query → resolveHeroImageUrlForQuery
  //      (real per-niche photo via Unsplash API or source.unsplash.com)
  //   2. Curated bundle from getPersonalityImages (7 seed verticals
  //      get hand-picked photos; everything else falls to GENERAL)
  //   3. Skip (operator-set imageUrl wins; null = no image)
  //
  // Tier 1 produces an actually-relevant image for ANY niche — the
  // LLM picked the search query that fits the business's voice.
  // Tier 2 is the v1.1.5 system that's been in place; kept as a
  // hot path for the seed verticals to avoid a network hop.
  const llmHeroQuery = personality.images?.hero_query?.trim();
  const bundle = getPersonalityImages(personality.vertical);
  let resolvedHeroUrl: string | null = null;

  if (llmHeroQuery) {
    try {
      resolvedHeroUrl = await resolveHeroImageUrlForQuery(llmHeroQuery);
    } catch (err) {
      // resolveHeroImageUrlForQuery never throws today, but be defensive.
      console.warn(
        JSON.stringify({
          event: "hero_query_resolve_failed",
          query: llmHeroQuery,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }
  // Fallback to curated bundle when LLM didn't provide a query.
  if (!resolvedHeroUrl && bundle?.hero_url) {
    resolvedHeroUrl = bundle.hero_url;
  }

  for (const section of schema.sections) {
    if (
      section.intent === "hero" &&
      !section.content.imageUrl &&
      resolvedHeroUrl
    ) {
      section.content = { ...section.content, imageUrl: resolvedHeroUrl };
      continue;
    }
    if (
      (section.intent === "services" ||
        section.intent === "features" ||
        section.intent === "products") &&
      bundle &&
      bundle.service_grid_image_urls.length > 0
    ) {
      const items = section.content.items;
      if (!items || items.length === 0) continue;
      section.content = {
        ...section.content,
        items: items.map((item, idx) => {
          if (item.image) return item;
          const url =
            bundle.service_grid_image_urls[
              idx % bundle.service_grid_image_urls.length
            ];
          return { ...item, image: url };
        }),
      };
    }
  }
}

/**
 * v1.1.5 / Issue #2 — assign Lucide icons to service cards by walking
 * the schema's services-intent items and calling iconForTitle with the
 * personality's vertical hint. Items that already carry an `icon`
 * attribute (e.g. operator-edited via update_landing_section, or a
 * SaaS pack with hardcoded icons) are left alone. Mutates the schema
 * in place.
 */
function applyServiceIconsFromPersonality(
  schema: PageSchema,
  personality: CRMPersonality
): void {
  // v1.3.3 — when the LLM personality includes services_enrichment,
  // its per-service icon picks take precedence over both the
  // keyword classifier AND any pre-set item.icon. The LLM sees the
  // operator's exact service list and picks one icon per service from
  // the same allowlist the renderer knows about — distinct icons
  // per card by design. Falls back to keyword classifier for items
  // without an enrichment match.
  const enrichmentByName = new Map<string, string>();
  for (const e of personality.services_enrichment ?? []) {
    if (e.icon && e.service_name) {
      enrichmentByName.set(e.service_name, e.icon);
    }
  }

  for (const section of schema.sections) {
    if (
      section.intent !== "services" &&
      section.intent !== "features" &&
      section.intent !== "products"
    ) {
      continue;
    }
    const items = section.content.items;
    if (!items || items.length === 0) continue;
    section.content = {
      ...section.content,
      items: items.map((item) => {
        // 1. LLM enrichment wins (distinct per-service icon).
        const enrichedIcon = item.title
          ? enrichmentByName.get(item.title)
          : undefined;
        if (enrichedIcon) {
          return { ...item, icon: enrichedIcon };
        }
        // 2. Operator-supplied icon (e.g. via update_landing_section).
        if (item.icon && item.icon.trim().length > 0) return item;
        // 3. Fallback: keyword classifier with vertical hint.
        return {
          ...item,
          icon: iconForTitle(item.title, personality.vertical),
        };
      }),
    };
  }
}

/**
 * v1.1.4 / Issue #8 — stats section is fed exclusively from operator
 * input. When soul carries review_count + review_rating, render those
 * (plus a third stat from soul.years_in_business or jobs_completed when
 * present). When neither is set, hide the stats section entirely so we
 * never ship fabricated "500+ Jobs" / "4.8★" / "24hr" defaults from
 * the content pack.
 */
function applyStatsFromSoul(
  schema: PageSchema,
  soul: Record<string, unknown>,
  personality: CRMPersonality
): void {
  const reviewCount = readSoulNumber(soul, "review_count");
  const reviewRating = readSoulNumber(soul, "review_rating");
  const yearsInBusiness = readSoulNumber(soul, "years_in_business");
  const jobsCompleted = readSoulNumber(soul, "jobs_completed");

  // Pick a customer-noun appropriate for the personality so dental
  // workspaces show "Patients" instead of "Customers".
  const customerLabel =
    personality.terminology.contact.plural || "Customers";

  const stats: Array<{ value: string; label: string }> = [];
  if (reviewRating) {
    stats.push({ value: `${reviewRating}★`, label: "Google Rating" });
  }
  if (reviewCount) {
    stats.push({
      value: `${reviewCount.toLocaleString("en-US")}+`,
      label: customerLabel,
    });
  }
  if (yearsInBusiness) {
    stats.push({ value: `${yearsInBusiness}+`, label: "Years in Business" });
  } else if (jobsCompleted) {
    stats.push({ value: `${jobsCompleted.toLocaleString("en-US")}+`, label: "Jobs Completed" });
  }

  for (const section of schema.sections) {
    if (section.intent !== "stats") continue;
    if (stats.length === 0) {
      // Hide rather than ship fabricated defaults.
      section.visible = false;
      section.content = { ...section.content, stats: [] };
      continue;
    }
    section.visible = true;
    section.content = {
      ...section.content,
      stats,
    };
  }
}

