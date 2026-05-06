// ============================================================================
// v1.12.0 — composite-block persist
// ============================================================================
//
// Two operations:
//
//   addCompositeSection(workspaceId, tree, position?)
//     Inserts a new composite section into the landing's sections
//     array at `position` (default: end). Returns the index of the
//     newly-added section + the new sections list with previews.
//
//   updateCompositeSection(workspaceId, index, tree)
//     Replaces the tree at the given index. Index must point at a
//     section of type=composite (returns error otherwise).
//
// Both ops:
//   1. Validate the tree (Zod + structural rules)
//   2. Voice-scan against soul.voice.avoidWords; collect warnings
//   3. Persist updated blueprint + re-render landing
//   4. Return new sections list with previews
//
// Voice violations are WARNINGS (not errors) — same pattern as block
// validators today. The agent self-corrects on retry; the page still
// renders even with violations present.

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { landingPages, organizations } from "@/db/schema";
import { loadBlueprintOrFallback } from "@/lib/blueprint/persist";
import { renderGeneralServiceV1 } from "@/lib/blueprint/renderers/general-service-v1";
import type { Blueprint, LandingSection, SectionComposite } from "@/lib/blueprint/types";
import { derivePreview } from "@/lib/page-blocks/landing-structure";
import {
  validateCompositeTree,
  scanForVoiceViolations,
  type CompositeNode,
  type VoiceViolation,
} from "./schema";

// ─── public types ──────────────────────────────────────────────────────────

export interface CompositePersistedSection {
  index: number;
  type: string;
  preview: string;
}

export type CompositePersistResult =
  | {
      ok: true;
      index: number;
      sections: CompositePersistedSection[];
      validation_warnings: VoiceViolation[];
      public_url: string | null;
    }
  | {
      ok: false;
      error: string;
      validation_errors: string[];
    };

// ─── add ───────────────────────────────────────────────────────────────────

export async function addCompositeSection(
  workspaceId: string,
  tree: unknown,
  position?: number,
): Promise<CompositePersistResult> {
  // 1. Validate the tree.
  const validation = validateCompositeTree(tree);
  if (!validation.ok) {
    return {
      ok: false,
      error: "tree_invalid",
      validation_errors: validation.errors,
    };
  }
  const validTree = tree as CompositeNode;

  // 2. Top-level must be a section. We allow leaf-rooted trees in the
  //    pure validator (it's about structure), but composite SECTIONS
  //    require a section root by contract — the section's eyebrow /
  //    headline / subhead are the page-level header for the block.
  if (validTree.kind !== "section") {
    return {
      ok: false,
      error: "tree_root_must_be_section",
      validation_errors: [
        `composite section's root node must be kind="section"; got "${validTree.kind}"`,
      ],
    };
  }

  // 3. Load workspace + blueprint.
  const loaded = await loadLandingForMutation(workspaceId);
  if (!loaded.ok) return loaded;

  const newSection: SectionComposite = {
    type: "composite",
    tree: validTree,
  };

  // 4. Compute insertion position.
  const sections = loaded.blueprint.landing.sections;
  const len = sections.length;
  let insertAt = position ?? len;
  if (!Number.isInteger(insertAt) || insertAt < 0) insertAt = 0;
  if (insertAt > len) insertAt = len;

  const nextSections = [
    ...sections.slice(0, insertAt),
    newSection as LandingSection,
    ...sections.slice(insertAt),
  ];

  // 5. Voice-scan.
  const avoidWords =
    (loaded.orgSoul?.voice?.avoidWords as string[] | undefined) ?? [];
  const warnings = scanForVoiceViolations(validTree, avoidWords);

  // 6. Persist + re-render.
  const result = await persistAndRender(loaded, nextSections);
  return {
    ...result,
    index: insertAt,
    validation_warnings: warnings,
  };
}

// ─── update ────────────────────────────────────────────────────────────────

export async function updateCompositeSection(
  workspaceId: string,
  index: number,
  tree: unknown,
): Promise<CompositePersistResult> {
  const validation = validateCompositeTree(tree);
  if (!validation.ok) {
    return {
      ok: false,
      error: "tree_invalid",
      validation_errors: validation.errors,
    };
  }
  const validTree = tree as CompositeNode;
  if (validTree.kind !== "section") {
    return {
      ok: false,
      error: "tree_root_must_be_section",
      validation_errors: [
        `composite section's root node must be kind="section"; got "${validTree.kind}"`,
      ],
    };
  }

  const loaded = await loadLandingForMutation(workspaceId);
  if (!loaded.ok) return loaded;

  const sections = loaded.blueprint.landing.sections;
  if (!Number.isInteger(index) || index < 0 || index >= sections.length) {
    return {
      ok: false,
      error: "index_out_of_range",
      validation_errors: [
        `index ${index} out of range [0, ${sections.length - 1}]`,
      ],
    };
  }
  if (sections[index].type !== "composite") {
    return {
      ok: false,
      error: "section_not_composite",
      validation_errors: [
        `section at index ${index} is type="${sections[index].type}"; update_composite_section can only edit composite sections. Use update_landing_section or persist_block for typed sections.`,
      ],
    };
  }

  const updated: SectionComposite = { type: "composite", tree: validTree };
  const nextSections = sections.map((s, i) => (i === index ? (updated as LandingSection) : s));

  const avoidWords =
    (loaded.orgSoul?.voice?.avoidWords as string[] | undefined) ?? [];
  const warnings = scanForVoiceViolations(validTree, avoidWords);

  const result = await persistAndRender(loaded, nextSections);
  return {
    ...result,
    index,
    validation_warnings: warnings,
  };
}

// ─── shared loaders / persisters ───────────────────────────────────────────

interface LoadedLanding {
  ok: true;
  landingPageId: string;
  blueprint: Blueprint;
  slug: string | null;
  orgSoul: { voice?: { avoidWords?: string[] } } | null;
}

type LoadError = { ok: false; error: string; validation_errors: string[] };

async function loadLandingForMutation(
  workspaceId: string,
): Promise<LoadedLanding | LoadError> {
  const [orgRow] = await db
    .select({
      slug: organizations.slug,
      soul: organizations.soul,
    })
    .from(organizations)
    .where(eq(organizations.id, workspaceId))
    .limit(1);
  if (!orgRow) {
    return {
      ok: false,
      error: "workspace_not_found",
      validation_errors: [],
    };
  }

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
    return {
      ok: false,
      error: "workspace_landing_missing",
      validation_errors: [
        "no landing_pages row with slug='home'. Run create_workspace_v2 first.",
      ],
    };
  }

  const settings = (landing.settings ?? {}) as Record<string, unknown>;
  const industry =
    typeof settings.industry === "string" ? (settings.industry as string) : null;
  const blueprint = loadBlueprintOrFallback(
    { blueprintJson: landing.blueprintJson },
    landing.title,
    industry,
  );

  return {
    ok: true,
    landingPageId: landing.id,
    blueprint,
    slug: orgRow.slug ?? null,
    orgSoul: (orgRow.soul ?? null) as LoadedLanding["orgSoul"],
  };
}

async function persistAndRender(
  loaded: LoadedLanding,
  nextSections: LandingSection[],
): Promise<{
  ok: true;
  sections: CompositePersistedSection[];
  public_url: string | null;
}> {
  const nextBlueprint: Blueprint = {
    ...loaded.blueprint,
    landing: { ...loaded.blueprint.landing, sections: nextSections },
  };
  const { html, css } = renderGeneralServiceV1(nextBlueprint);

  await db
    .update(landingPages)
    .set({
      contentHtml: html,
      contentCss: css,
      blueprintJson: nextBlueprint as unknown as Record<string, unknown>,
      updatedAt: new Date(),
    })
    .where(eq(landingPages.id, loaded.landingPageId));

  const baseDomain =
    process.env.WORKSPACE_BASE_DOMAIN?.trim() || "app.seldonframe.com";
  const publicUrl = loaded.slug ? `https://${loaded.slug}.${baseDomain}/` : null;

  const sections = nextSections.map((section, index) => ({
    index,
    type: section.type,
    preview: derivePreview(section),
  }));

  return { ok: true, sections, public_url: publicUrl };
}
