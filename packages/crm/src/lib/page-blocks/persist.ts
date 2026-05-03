// ============================================================================
// v1.4.0 — block-instance persistence + landing re-render
// ============================================================================
//
// Single entry point for the v2 persist_block flow:
//
//   1. Validate raw props against the block's Zod schema.
//   2. Run the block's deterministic validators.
//   3. (For hero) resolve background_image_query → Unsplash URL.
//   4. Map props → LandingSection via block.toSection.
//   5. Load the workspace's existing blueprint.
//   6. Replace the matching section (by sectionType) with the v2 section.
//   7. Re-render the full landing via renderGeneralServiceV1.
//   8. Persist landing_pages.contentHtml/contentCss/blueprintJson.
//   9. Upsert the block_instances row (props, generation_prompt,
//      rendered_html = the section HTML extracted from the full render,
//      template_version = block.version, customizations preserved).
//
// Returns either the persisted block + the URL where it's now visible,
// OR a structured validation failure that the IDE agent can show its
// operator.
//
// Forever-frozen edits: when a customize_block call lands, the existing
// row's customizations array is appended to (NOT replaced). The
// generation_prompt stays as the initial generation; subsequent prompts
// are layered into customizations.

import { and, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db } from "@/db";
import {
  blockInstances,
  landingPages,
  organizations,
  type BlockCustomization,
} from "@/db/schema";
import { loadBlueprintOrFallback } from "@/lib/blueprint/persist";
import { renderGeneralServiceV1 } from "@/lib/blueprint/renderers/general-service-v1";
import type { Blueprint, LandingSection } from "@/lib/blueprint/types";
import { resolveHeroImageUrlForQuery } from "@/lib/crm/personality-images";
import { getBlock } from "./registry";

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
        `block "${input.blockName}" is not in the v1.4 registry. Known: hero, services, faq.`,
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

  // 3. Hero-specific: resolve background_image_query → real Unsplash URL.
  // For other block types this is a no-op.
  let section = block.toSection(validatedProps);
  if (block.name === "hero") {
    const query = (validatedProps as { background_image_query?: string })
      .background_image_query;
    if (query && section.type === "hero") {
      try {
        const url = await resolveHeroImageUrlForQuery(query);
        section = { ...section, imageUrl: url };
      } catch {
        // Unsplash resolution never throws today, but stay defensive —
        // a missing image is cosmetic, not a failure.
      }
    }
  }

  // 4. Load the workspace's existing landing page + blueprint.
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
        eq(landingPages.orgId, input.workspaceId),
        eq(landingPages.slug, "home"),
      ),
    )
    .limit(1);
  if (!landing) {
    return {
      ok: false,
      error: "workspace_landing_missing",
      validation_errors: [
        "Workspace has no landing_pages row with slug='home'. Run create_workspace_v2 before persisting blocks.",
      ],
    };
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

  // 5. Replace the matching section (by sectionType) in the blueprint.
  const replaced = replaceSection(blueprint, block.sectionType, section);

  // 6. Re-render full landing.
  const { html, css } = renderGeneralServiceV1(replaced);

  // 7. Persist the landing page update.
  await db
    .update(landingPages)
    .set({
      contentHtml: html,
      contentCss: css,
      blueprintJson: replaced as unknown as Record<string, unknown>,
      updatedAt: new Date(),
    })
    .where(eq(landingPages.id, landing.id));

  // 8. Extract the section's HTML for the block_instances row.
  const sectionHtml = extractSectionHtml(html, block.sectionType);
  const sectionHtmlForRow = sectionHtml ?? html;
  const renderedHash = sha1(sectionHtmlForRow);

  // 9. Upsert the block_instances row. Customization (if any) appends.
  const [existing] = await db
    .select({
      id: blockInstances.id,
      customizations: blockInstances.customizations,
    })
    .from(blockInstances)
    .where(
      and(
        eq(blockInstances.orgId, input.workspaceId),
        eq(blockInstances.blockName, input.blockName),
      ),
    )
    .limit(1);

  let blockId: string;
  if (existing) {
    const nextCustomizations: BlockCustomization[] = input.customization
      ? [
          ...(existing.customizations ?? []),
          {
            at: new Date().toISOString(),
            prompt: input.customization.prompt,
            actor: "operator",
            source: input.customization.source ?? "unknown",
          },
        ]
      : (existing.customizations ?? []);
    await db
      .update(blockInstances)
      .set({
        // For NEW generation (no customization), generation_prompt is replaced.
        // For customization, generation_prompt is left alone (the customization
        // record carries the new prompt instead).
        generationPrompt: input.customization
          ? undefined
          : input.generationPrompt,
        customizations: nextCustomizations,
        props: validatedProps as Record<string, unknown>,
        renderedHtml: sectionHtmlForRow,
        renderedHtmlHash: renderedHash,
        templateVersion: block.version,
        updatedAt: new Date(),
      })
      .where(eq(blockInstances.id, existing.id));
    blockId = existing.id;
  } else {
    const [created] = await db
      .insert(blockInstances)
      .values({
        orgId: input.workspaceId,
        blockName: input.blockName,
        templateVersion: block.version,
        generationPrompt: input.generationPrompt,
        customizations: [],
        props: validatedProps as Record<string, unknown>,
        renderedHtml: sectionHtmlForRow,
        renderedHtmlHash: renderedHash,
      })
      .returning({ id: blockInstances.id });
    blockId = created?.id ?? "";
  }

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
    public_url: publicUrl,
    validation_warnings: [],
  };
}

// ─── helpers ────────────────────────────────────────────────────────────────

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
 * class="sf-faq" on the section root. Returns null if not found (cosmetic
 * — caller falls back to the full HTML).
 */
function extractSectionHtml(
  html: string,
  sectionType: "hero" | "services-grid" | "faq",
): string | null {
  const className =
    sectionType === "hero"
      ? "sf-hero"
      : sectionType === "services-grid"
        ? "sf-services"
        : "sf-faq";
  const re = new RegExp(
    `<section[^>]*\\bclass="${className}[^"]*"[^>]*>[\\s\\S]*?<\\/section>`,
    "i",
  );
  const match = html.match(re);
  return match ? match[0] : null;
}

function sha1(s: string): string {
  return createHash("sha1").update(s).digest("hex");
}
