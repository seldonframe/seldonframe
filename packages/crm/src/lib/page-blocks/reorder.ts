// ============================================================================
// v1.10.0 — reorder_landing_sections
// ============================================================================
//
// Pure mechanical reorder of Blueprint.landing.sections. The IDE agent
// translates "move FAQ to the bottom" into a section-type array; the
// server validates the multiset (no add/remove, only reorder) and
// produces the new sections array.
//
// No content changes — that's update_landing_section's job. No
// generative work — that's regenerate_block's job. Just a deterministic
// reorder.
//
// Antifragility: as LLMs improve, parsing operator intent into a type
// array gets more reliable; the harness doesn't care.

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { landingPages, organizations } from "@/db/schema";
import { loadBlueprintOrFallback } from "@/lib/blueprint/persist";
import { renderGeneralServiceV1 } from "@/lib/blueprint/renderers/general-service-v1";
import type { Blueprint, LandingSection } from "@/lib/blueprint/types";

// ─── pure function ──────────────────────────────────────────────────────────

export type ReorderResult =
  | { ok: true; sections: LandingSection[] }
  | { ok: false; errors: string[] };

export function reorderLandingSections(
  current: LandingSection[],
  newOrder: string[],
): ReorderResult {
  const errors: string[] = [];

  // Reject empty newOrder when current has sections — that's a delete,
  // not a reorder. Use update_landing_section for explicit deletes.
  if (current.length > 0 && newOrder.length === 0) {
    errors.push(
      "new_order is empty but current landing has sections — refusing to wipe the page. " +
        "Use update_landing_section to remove sections explicitly.",
    );
    return { ok: false, errors };
  }

  // Reject duplicates in current (ambiguous identity for type-based reorder).
  const currentCounts = new Map<string, number>();
  for (const s of current) {
    currentCounts.set(s.type, (currentCounts.get(s.type) ?? 0) + 1);
  }
  const dupes = [...currentCounts.entries()]
    .filter(([, n]) => n > 1)
    .map(([t]) => t);
  if (dupes.length > 0) {
    errors.push(
      `current landing has duplicate section types (${dupes.join(", ")}); ` +
        "reorder by type is ambiguous. Use update_landing_section to manage individual sections.",
    );
    return { ok: false, errors };
  }

  // Verify multiset equality between current types and newOrder.
  // Widen to Set<string> so .has() accepts plain strings from newOrder
  // without TS narrowing to the LandingSection["type"] union.
  const currentTypes: Set<string> = new Set(current.map((s) => s.type as string));
  const newOrderTypes: Set<string> = new Set(newOrder);

  for (const t of currentTypes) {
    if (!newOrderTypes.has(t)) {
      errors.push(`new_order missing section type "${t}" present in current landing`);
    }
  }
  for (const t of newOrderTypes) {
    if (!currentTypes.has(t)) {
      errors.push(`new_order contains unknown section type "${t}" not present in current landing`);
    }
  }
  // Also reject duplicates in newOrder (by symmetry — currentTypes is already
  // unique, so any duplicate in newOrder would mean it has more entries than
  // current).
  if (newOrder.length !== new Set(newOrder).size) {
    errors.push("new_order contains duplicate section types");
  }
  if (errors.length > 0) return { ok: false, errors };

  // Reorder by index lookup.
  const sectionsByType = new Map<string, LandingSection>();
  for (const s of current) sectionsByType.set(s.type, s);

  const reordered: LandingSection[] = [];
  for (const t of newOrder) {
    const sec = sectionsByType.get(t);
    if (!sec) {
      // Should be unreachable given the multiset check above, but
      // contract:throw-ok would be inappropriate — return structured.
      errors.push(`internal: section "${t}" missing during reorder`);
      return { ok: false, errors };
    }
    reordered.push(sec);
  }

  return { ok: true, sections: reordered };
}

// ─── DB-loading wrapper ─────────────────────────────────────────────────────

export type ApplyReorderResult =
  | {
      ok: true;
      sections_order: string[];
      public_url: string | null;
    }
  | {
      ok: false;
      error: string;
      validation_errors: string[];
    };

/**
 * Load the workspace's landing blueprint, reorder the sections array
 * by the given type-list, re-render, and persist. Caller authorizes
 * workspaceId (the API route uses guardApiRequest).
 */
export async function applyReorderForWorkspace(
  workspaceId: string,
  newOrder: string[],
): Promise<ApplyReorderResult> {
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

  const reordered = reorderLandingSections(blueprint.landing.sections, newOrder);
  if (!reordered.ok) {
    return {
      ok: false,
      error: "reorder_invalid",
      validation_errors: reordered.errors,
    };
  }

  const nextBlueprint: Blueprint = {
    ...blueprint,
    landing: { ...blueprint.landing, sections: reordered.sections },
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
    .where(eq(landingPages.id, landing.id));

  // Resolve public URL for the agent's confirmation message.
  const [org] = await db
    .select({ slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, workspaceId))
    .limit(1);
  const baseDomain =
    process.env.WORKSPACE_BASE_DOMAIN?.trim() || "app.seldonframe.com";
  const publicUrl = org?.slug ? `https://${org.slug}.${baseDomain}/` : null;

  return {
    ok: true,
    sections_order: reordered.sections.map((s) => s.type),
    public_url: publicUrl,
  };
}
