// ============================================================================
// v1.15.0 — portal-template structural primitives
// ============================================================================
//
// Five atomic ops mirroring v1.11's landing-structure pattern, but
// for the portal template (CompositeNode[] stored on
// organizations.settings.portal_template). Each entry is a section-
// rooted composite tree.
//
//   - get_portal_structure(workspace_id)
//   - add_portal_section(workspace_id, tree, position?)
//   - update_portal_section(workspace_id, index, tree)
//   - move_portal_section(workspace_id, from_index, to_index)
//   - delete_portal_section(workspace_id, index)
//
// The portal template is what RENDERS on every customer's portal —
// rendered against a per-customer CustomerRenderContext at request
// time. Workspace owners define the template once; each customer
// sees their own data through it.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import {
  validateCompositeTree,
  scanForVoiceViolations,
  type CompositeNode,
  type VoiceViolation,
} from "@/lib/page-blocks/composite/schema";

// ─── public types ──────────────────────────────────────────────────────────

export type PortalSectionResult =
  | { ok: true; sections: CompositeNode[] }
  | { ok: false; errors: string[] };

export type PortalDeleteResult =
  | { ok: true; sections: CompositeNode[]; removed: CompositeNode }
  | { ok: false; errors: string[] };

// ─── pure: applyAddPortalSection ───────────────────────────────────────────

export function applyAddPortalSection(
  current: CompositeNode[],
  newSection: CompositeNode,
  position?: number,
): PortalSectionResult {
  const errors: string[] = [];

  if (!newSection || newSection.kind !== "section") {
    errors.push(
      `portal section's tree root must be kind="section"; got "${newSection?.kind ?? "undefined"}"`,
    );
    return { ok: false, errors };
  }

  const pos = position ?? current.length;
  if (!Number.isInteger(pos) || pos < 0 || pos > current.length) {
    errors.push(`position ${pos} out of range [0, ${current.length}]`);
    return { ok: false, errors };
  }

  return {
    ok: true,
    sections: [...current.slice(0, pos), newSection, ...current.slice(pos)],
  };
}

// ─── pure: applyMovePortalSection ──────────────────────────────────────────

export function applyMovePortalSection(
  current: CompositeNode[],
  fromIndex: number,
  toIndex: number,
): PortalSectionResult {
  const errors: string[] = [];

  if (current.length === 0) {
    errors.push("cannot move within an empty sections array");
    return { ok: false, errors };
  }
  if (
    !Number.isInteger(fromIndex) ||
    fromIndex < 0 ||
    fromIndex >= current.length
  ) {
    errors.push(`from_index ${fromIndex} out of range [0, ${current.length - 1}]`);
  }
  if (
    !Number.isInteger(toIndex) ||
    toIndex < 0 ||
    toIndex >= current.length
  ) {
    errors.push(`to_index ${toIndex} out of range [0, ${current.length - 1}]`);
  }
  if (errors.length > 0) return { ok: false, errors };

  if (fromIndex === toIndex) return { ok: true, sections: [...current] };

  const next = [...current];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return { ok: true, sections: next };
}

// ─── pure: applyDeletePortalSection ────────────────────────────────────────

export function applyDeletePortalSection(
  current: CompositeNode[],
  index: number,
): PortalDeleteResult {
  if (!Number.isInteger(index) || index < 0 || index >= current.length) {
    return {
      ok: false,
      errors: [`index ${index} out of range [0, ${current.length - 1}]`],
    };
  }
  // Empty portal template is valid (different from landing's
  // minimum-1 rule). The customer just sees built-in tabs
  // (Documents, Bookings) without the Custom tab.
  const next = [...current];
  const [removed] = next.splice(index, 1);
  return { ok: true, sections: next, removed };
}

// ─── pure: applyUpdatePortalSection ────────────────────────────────────────

export function applyUpdatePortalSection(
  current: CompositeNode[],
  index: number,
  newTree: CompositeNode,
): PortalSectionResult {
  if (!Number.isInteger(index) || index < 0 || index >= current.length) {
    return {
      ok: false,
      errors: [`index ${index} out of range [0, ${current.length - 1}]`],
    };
  }
  if (!newTree || newTree.kind !== "section") {
    return {
      ok: false,
      errors: [
        `portal section's tree root must be kind="section"; got "${newTree?.kind ?? "undefined"}"`,
      ],
    };
  }
  return {
    ok: true,
    sections: current.map((s, i) => (i === index ? newTree : s)),
  };
}

// ─── pure: derivePortalSectionPreview ──────────────────────────────────────

const PREVIEW_MAX = 80;

function truncate(s: string, max = PREVIEW_MAX): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

export function derivePortalSectionPreview(section: CompositeNode): string {
  if (section.kind !== "section") return `(${section.kind})`;
  const headline = section.headline ?? "";
  const eyebrow = section.eyebrow ?? "";
  const children = section.children ?? [];
  const label = headline || eyebrow || "(composite — no headline)";
  return truncate(`${label} (${children.length} child${children.length === 1 ? "" : "ren"})`);
}

// ─── DB-loading wrappers ───────────────────────────────────────────────────

const PORTAL_TEMPLATE_KEY = "portal_template";

export interface PortalSectionSummary {
  index: number;
  preview: string;
}

export interface PortalStructureResult {
  ok: true;
  workspace_id: string;
  slug: string | null;
  preview_url: string | null;
  sections: PortalSectionSummary[];
}

export interface PortalStructureError {
  ok: false;
  error: string;
  validation_errors: string[];
}

async function loadPortalTemplate(
  workspaceId: string,
): Promise<
  | { ok: true; sections: CompositeNode[]; slug: string | null; orgSoul: { voice?: { avoidWords?: string[] } } | null; settings: Record<string, unknown> }
  | PortalStructureError
> {
  const [orgRow] = await db
    .select({
      slug: organizations.slug,
      settings: organizations.settings,
      soul: organizations.soul,
    })
    .from(organizations)
    .where(eq(organizations.id, workspaceId))
    .limit(1);
  if (!orgRow) {
    return { ok: false, error: "workspace_not_found", validation_errors: [] };
  }

  const settings = (orgRow.settings ?? {}) as Record<string, unknown>;
  const raw = settings[PORTAL_TEMPLATE_KEY];
  const sections: CompositeNode[] = Array.isArray(raw) ? (raw as CompositeNode[]) : [];

  return {
    ok: true,
    sections,
    slug: orgRow.slug ?? null,
    orgSoul: (orgRow.soul ?? null) as { voice?: { avoidWords?: string[] } } | null,
    settings,
  };
}

async function persistPortalTemplate(
  workspaceId: string,
  sections: CompositeNode[],
  baseSettings: Record<string, unknown>,
): Promise<void> {
  const nextSettings = { ...baseSettings, [PORTAL_TEMPLATE_KEY]: sections };
  await db
    .update(organizations)
    .set({ settings: nextSettings, updatedAt: new Date() })
    .where(eq(organizations.id, workspaceId));
}

export async function getPortalStructureForWorkspace(
  workspaceId: string,
): Promise<PortalStructureResult | PortalStructureError> {
  const loaded = await loadPortalTemplate(workspaceId);
  if (!loaded.ok) return loaded;

  const baseDomain =
    process.env.WORKSPACE_BASE_DOMAIN?.trim() || "app.seldonframe.com";
  // Preview URL — operators use this to render the template against
  // an arbitrary contact for visual inspection. ?contact_id=... is
  // appended by the caller.
  const previewUrl = loaded.slug
    ? `https://${loaded.slug}.${baseDomain}/api/v1/workspace/v2/portal/preview`
    : null;

  return {
    ok: true,
    workspace_id: workspaceId,
    slug: loaded.slug,
    preview_url: previewUrl,
    sections: loaded.sections.map((section, index) => ({
      index,
      preview: derivePortalSectionPreview(section),
    })),
  };
}

// ─── DB-loading mutators ───────────────────────────────────────────────────

export type PortalApplyResult =
  | {
      ok: true;
      sections: PortalSectionSummary[];
      validation_warnings: VoiceViolation[];
      preview_url: string | null;
      index?: number;
    }
  | {
      ok: false;
      error: string;
      validation_errors: string[];
    };

export async function addPortalSectionForWorkspace(
  workspaceId: string,
  rawTree: unknown,
  position?: number,
): Promise<PortalApplyResult> {
  // 1. Validate the tree (Zod + structural rules).
  const validation = validateCompositeTree(rawTree);
  if (!validation.ok) {
    return {
      ok: false,
      error: "tree_invalid",
      validation_errors: validation.errors,
    };
  }
  const tree = rawTree as CompositeNode;

  const loaded = await loadPortalTemplate(workspaceId);
  if (!loaded.ok) return loaded;

  const result = applyAddPortalSection(loaded.sections, tree, position);
  if (!result.ok) {
    return { ok: false, error: "section_invalid", validation_errors: result.errors };
  }

  // Voice-scan against soul.voice.avoidWords.
  const avoidWords =
    (loaded.orgSoul?.voice?.avoidWords as string[] | undefined) ?? [];
  const warnings = scanForVoiceViolations(tree, avoidWords);

  await persistPortalTemplate(workspaceId, result.sections, loaded.settings);

  const insertedAt = position ?? loaded.sections.length;
  return {
    ok: true,
    sections: result.sections.map((section, index) => ({
      index,
      preview: derivePortalSectionPreview(section),
    })),
    validation_warnings: warnings,
    preview_url: previewUrlFor(loaded.slug),
    index: insertedAt,
  };
}

export async function updatePortalSectionForWorkspace(
  workspaceId: string,
  index: number,
  rawTree: unknown,
): Promise<PortalApplyResult> {
  const validation = validateCompositeTree(rawTree);
  if (!validation.ok) {
    return { ok: false, error: "tree_invalid", validation_errors: validation.errors };
  }
  const tree = rawTree as CompositeNode;

  const loaded = await loadPortalTemplate(workspaceId);
  if (!loaded.ok) return loaded;

  const result = applyUpdatePortalSection(loaded.sections, index, tree);
  if (!result.ok) {
    return { ok: false, error: "section_invalid", validation_errors: result.errors };
  }

  const avoidWords =
    (loaded.orgSoul?.voice?.avoidWords as string[] | undefined) ?? [];
  const warnings = scanForVoiceViolations(tree, avoidWords);

  await persistPortalTemplate(workspaceId, result.sections, loaded.settings);

  return {
    ok: true,
    sections: result.sections.map((section, i) => ({
      index: i,
      preview: derivePortalSectionPreview(section),
    })),
    validation_warnings: warnings,
    preview_url: previewUrlFor(loaded.slug),
    index,
  };
}

export async function movePortalSectionForWorkspace(
  workspaceId: string,
  fromIndex: number,
  toIndex: number,
): Promise<PortalApplyResult> {
  const loaded = await loadPortalTemplate(workspaceId);
  if (!loaded.ok) return loaded;

  const result = applyMovePortalSection(loaded.sections, fromIndex, toIndex);
  if (!result.ok) {
    return { ok: false, error: "move_invalid", validation_errors: result.errors };
  }

  await persistPortalTemplate(workspaceId, result.sections, loaded.settings);

  return {
    ok: true,
    sections: result.sections.map((section, i) => ({
      index: i,
      preview: derivePortalSectionPreview(section),
    })),
    validation_warnings: [],
    preview_url: previewUrlFor(loaded.slug),
  };
}

export async function deletePortalSectionForWorkspace(
  workspaceId: string,
  index: number,
): Promise<PortalApplyResult> {
  const loaded = await loadPortalTemplate(workspaceId);
  if (!loaded.ok) return loaded;

  const result = applyDeletePortalSection(loaded.sections, index);
  if (!result.ok) {
    return { ok: false, error: "delete_invalid", validation_errors: result.errors };
  }

  await persistPortalTemplate(workspaceId, result.sections, loaded.settings);

  return {
    ok: true,
    sections: result.sections.map((section, i) => ({
      index: i,
      preview: derivePortalSectionPreview(section),
    })),
    validation_warnings: [],
    preview_url: previewUrlFor(loaded.slug),
  };
}

function previewUrlFor(slug: string | null): string | null {
  if (!slug) return null;
  const baseDomain =
    process.env.WORKSPACE_BASE_DOMAIN?.trim() || "app.seldonframe.com";
  return `https://${slug}.${baseDomain}/api/v1/workspace/v2/portal/preview`;
}

// ─── render-time loader (for the preview endpoint + future portal route) ──

/**
 * Read the portal template for a workspace. Returns [] if not yet
 * configured (operator hasn't called add_portal_section yet).
 */
export async function loadPortalTemplateForRender(
  workspaceId: string,
): Promise<CompositeNode[]> {
  const loaded = await loadPortalTemplate(workspaceId);
  if (!loaded.ok) return [];
  return loaded.sections;
}
