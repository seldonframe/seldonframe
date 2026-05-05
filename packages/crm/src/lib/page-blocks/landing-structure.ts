// ============================================================================
// v1.11.0 — landing-structure primitives
// ============================================================================
//
// Three thin-harness primitives over Blueprint.landing.sections:
//
//   - get_landing_structure(workspace_id)
//     Returns the ordered section list with INDEX as the addressing
//     primitive plus a 1-line preview per section so the agent can
//     disambiguate duplicate types (services-grid×2 etc.)
//
//   - move_section(workspace_id, from_index, to_index)
//     Moves ONE section atomically. Splice semantics: the section is
//     removed from from_index and inserted into the resulting array
//     at to_index.
//
//   - delete_section(workspace_id, index)
//     Removes ONE section. Refuses to leave 0 sections (empty landing
//     pages are broken UX).
//
// Why index, not type: type-based addressing breaks on duplicate types
// (the case v1.10's reorder_landing_sections refused). Indices are
// unambiguous within a single round-trip; the agent re-reads structure
// between mutating calls. Stable section IDs would let multi-step
// plans compose without re-reads, but that's a schema migration —
// punted to v1.13+.
//
// Antifragility: server-side these primitives do NO creative work. As
// LLMs improve at parsing operator intent ("put hero below FAQ" →
// "from_index=0, to_index=5") and at picking the right duplicate via
// the preview text, output quality rises with zero harness changes.

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { landingPages, organizations } from "@/db/schema";
import { loadBlueprintOrFallback } from "@/lib/blueprint/persist";
import { renderGeneralServiceV1 } from "@/lib/blueprint/renderers/general-service-v1";
import type { Blueprint, LandingSection } from "@/lib/blueprint/types";

// ─── pure: applyMove ───────────────────────────────────────────────────────

export type MoveResult =
  | { ok: true; sections: LandingSection[] }
  | { ok: false; errors: string[] };

/**
 * Move section at `fromIndex` so it ends up at `toIndex` in the result.
 *
 * Splice semantics — equivalent to:
 *   const moved = sections.splice(fromIndex, 1)[0];
 *   sections.splice(toIndex, 0, moved);
 *
 * EXCEPT this returns a new array; the input is untouched (immutability
 * makes server-side error recovery easier).
 */
export function applyMove(
  sections: LandingSection[],
  fromIndex: number,
  toIndex: number,
): MoveResult {
  const errors: string[] = [];

  if (sections.length === 0) {
    errors.push("cannot move within an empty sections array");
    return { ok: false, errors };
  }
  if (!Number.isInteger(fromIndex) || fromIndex < 0 || fromIndex >= sections.length) {
    errors.push(
      `from_index ${fromIndex} out of range [0, ${sections.length - 1}]`,
    );
  }
  if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= sections.length) {
    errors.push(
      `to_index ${toIndex} out of range [0, ${sections.length - 1}]`,
    );
  }
  if (errors.length > 0) return { ok: false, errors };

  if (fromIndex === toIndex) {
    // No-op. Return a fresh copy regardless so callers can't mutate
    // the input by holding the result.
    return { ok: true, sections: [...sections] };
  }

  const next = [...sections];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return { ok: true, sections: next };
}

// ─── pure: applyDelete ─────────────────────────────────────────────────────

export type DeleteResult =
  | { ok: true; sections: LandingSection[]; removed: LandingSection }
  | { ok: false; errors: string[] };

export function applyDelete(
  sections: LandingSection[],
  index: number,
): DeleteResult {
  const errors: string[] = [];

  if (!Number.isInteger(index) || index < 0 || index >= sections.length) {
    errors.push(
      `index ${index} out of range [0, ${sections.length - 1}]`,
    );
    return { ok: false, errors };
  }
  if (sections.length <= 1) {
    errors.push(
      "delete refused: would leave 0 sections (empty landing). The minimum is 1; use update_landing_section to edit instead, or persist_block to replace the section's content.",
    );
    return { ok: false, errors };
  }

  const next = [...sections];
  const [removed] = next.splice(index, 1);
  return { ok: true, sections: next, removed };
}

// ─── pure: derivePreview ───────────────────────────────────────────────────
//
// One-liner per section so the agent can disambiguate duplicates and
// understand "what's at index N" without reading the raw blueprint.
// Each branch reads ONE field (or counts items) and produces a string
// under ~80 chars. Truncation is enforced for safety.

const PREVIEW_MAX_CHARS = 80;

function truncate(s: string, max = PREVIEW_MAX_CHARS): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

export function derivePreview(section: LandingSection): string {
  const s = section as unknown as Record<string, unknown>;
  const type = String(s.type ?? "");
  switch (type) {
    case "hero": {
      const headline = typeof s.headline === "string" ? s.headline : "";
      return truncate(headline || "(hero — no headline)");
    }
    case "trust-strip": {
      const items = Array.isArray(s.items) ? s.items : [];
      return `${items.length} trust signal${items.length === 1 ? "" : "s"}`;
    }
    case "services-grid": {
      const items = Array.isArray(s.items) ? s.items : [];
      const layout = typeof s.layout === "string" ? s.layout : "";
      if (layout === "stats") {
        return `stats — ${items.length} number${items.length === 1 ? "" : "s"}`;
      }
      return `${items.length} service${items.length === 1 ? "" : "s"}${layout ? ` (${layout})` : ""}`;
    }
    case "about": {
      const headline = typeof s.headline === "string" ? s.headline : "";
      return truncate(headline || "(about — no headline)");
    }
    case "mid-cta": {
      const headline = typeof s.headline === "string" ? s.headline : "";
      return truncate(headline || "(cta — no headline)");
    }
    case "faq": {
      const items = Array.isArray(s.items) ? s.items : [];
      return `${items.length} question${items.length === 1 ? "" : "s"}`;
    }
    case "testimonials": {
      const items = Array.isArray(s.items) ? s.items : [];
      const headline = typeof s.headline === "string" ? s.headline : "";
      return truncate(
        `${items.length} testimonial${items.length === 1 ? "" : "s"}${headline ? ` — ${headline}` : ""}`,
      );
    }
    case "service-area": {
      const cities = Array.isArray(s.cities) ? s.cities : [];
      return `service area — ${cities.length} cit${cities.length === 1 ? "y" : "ies"}`;
    }
    case "partners": {
      const items = Array.isArray(s.items) ? s.items : [];
      return `partners — ${items.length} item${items.length === 1 ? "" : "s"}`;
    }
    case "emergency-strip": {
      const label = typeof s.label === "string" ? s.label : "";
      return truncate(label || "(emergency strip)");
    }
    case "footer": {
      return "footer";
    }
    default:
      // Defensive — unknown section types still need a usable preview
      // so get_landing_structure never returns an empty string.
      return type ? `(${type})` : "(unknown section)";
  }
}

// ─── DB-loading wrappers (integration territory) ───────────────────────────

export interface LandingStructureSection {
  index: number;
  type: string;
  preview: string;
}

export interface LandingStructureResult {
  ok: true;
  workspace_id: string;
  slug: string | null;
  public_url: string | null;
  sections: LandingStructureSection[];
}

export interface LandingStructureError {
  ok: false;
  error: string;
  validation_errors: string[];
}

/**
 * Read the workspace's landing blueprint and return its ordered section
 * list with previews. Caller is responsible for auth (the API route
 * uses guardApiRequest + workspace bearer match).
 */
export async function getLandingStructureForWorkspace(
  workspaceId: string,
): Promise<LandingStructureResult | LandingStructureError> {
  const [orgRow] = await db
    .select({ id: organizations.id, slug: organizations.slug })
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

  const baseDomain =
    process.env.WORKSPACE_BASE_DOMAIN?.trim() || "app.seldonframe.com";
  const publicUrl = orgRow.slug ? `https://${orgRow.slug}.${baseDomain}/` : null;

  const sections = blueprint.landing.sections.map((section, index) => ({
    index,
    type: section.type,
    preview: derivePreview(section),
  }));

  return {
    ok: true,
    workspace_id: workspaceId,
    slug: orgRow.slug ?? null,
    public_url: publicUrl,
    sections,
  };
}

export type ApplyMoveDeleteResult =
  | {
      ok: true;
      sections: LandingStructureSection[];
      public_url: string | null;
    }
  | {
      ok: false;
      error: string;
      validation_errors: string[];
    };

/**
 * Load the workspace's blueprint, apply a single move, re-render,
 * persist. Returns the new sections list with previews so the agent
 * can confirm without a follow-up get_landing_structure.
 */
export async function moveSectionForWorkspace(
  workspaceId: string,
  fromIndex: number,
  toIndex: number,
): Promise<ApplyMoveDeleteResult> {
  const loaded = await loadLandingForMutation(workspaceId);
  if (!loaded.ok) return loaded;

  const moved = applyMove(loaded.blueprint.landing.sections, fromIndex, toIndex);
  if (!moved.ok) {
    return {
      ok: false,
      error: "move_invalid",
      validation_errors: moved.errors,
    };
  }

  return await persistAndRender(loaded, moved.sections);
}

/**
 * Load the workspace's blueprint, apply a single delete, re-render,
 * persist. Returns the new sections list with previews.
 */
export async function deleteSectionForWorkspace(
  workspaceId: string,
  index: number,
): Promise<ApplyMoveDeleteResult> {
  const loaded = await loadLandingForMutation(workspaceId);
  if (!loaded.ok) return loaded;

  const deleted = applyDelete(loaded.blueprint.landing.sections, index);
  if (!deleted.ok) {
    return {
      ok: false,
      error: "delete_invalid",
      validation_errors: deleted.errors,
    };
  }

  return await persistAndRender(loaded, deleted.sections);
}

// ─── shared loaders / persisters ───────────────────────────────────────────

interface LoadedLanding {
  ok: true;
  landingPageId: string;
  blueprint: Blueprint;
  slug: string | null;
}

async function loadLandingForMutation(
  workspaceId: string,
): Promise<LoadedLanding | { ok: false; error: string; validation_errors: string[] }> {
  const [orgRow] = await db
    .select({ slug: organizations.slug })
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
  };
}

async function persistAndRender(
  loaded: LoadedLanding,
  nextSections: LandingSection[],
): Promise<ApplyMoveDeleteResult> {
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

  const indexed = nextSections.map((section, index) => ({
    index,
    type: section.type,
    preview: derivePreview(section),
  }));

  return {
    ok: true,
    sections: indexed,
    public_url: publicUrl,
  };
}
