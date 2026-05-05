// ============================================================================
// v1.10.0 — upload_workspace_image
// ============================================================================
//
// Operator uploads a logo or hero background. Server validates the
// upload (slot, content type, byte size), uploads to Vercel Blob,
// writes the resulting URL to the right place in the data model:
//
//   slot=logo            → organizations.theme.logoUrl
//   slot=hero_background → Blueprint.landing.sections[hero].imageUrl
//                          (re-renders the landing page)
//
// Thin harness, fat skill. The IDE agent picks the slot from operator
// intent ("here's our new logo" → slot=logo). Server only enforces the
// data-model bounds (which slots exist, what file types, max size).
//
// Antifragility: as LLMs improve at understanding "this is the hero
// background not the logo," accuracy goes up without harness changes.

import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { landingPages, organizations } from "@/db/schema";
import { loadBlueprintOrFallback } from "@/lib/blueprint/persist";
import { renderGeneralServiceV1 } from "@/lib/blueprint/renderers/general-service-v1";
import type { Blueprint, LandingSection } from "@/lib/blueprint/types";
import type { OrgTheme } from "@/lib/theme/types";

// ─── public types + constants ───────────────────────────────────────────────

export type ImageSlot = "logo" | "hero_background";

export const IMAGE_SLOTS: readonly ImageSlot[] = ["logo", "hero_background"];

export const ALLOWED_IMAGE_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "image/gif",
] as const;

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export interface UploadImageInput {
  workspace_id: string;
  slot: ImageSlot;
  file_name: string;
  content_type: string;
  byte_size: number;
}

export type ValidateResult =
  | { ok: true }
  | { ok: false; errors: string[] };

// ─── pure: validation ───────────────────────────────────────────────────────

export function validateImageUploadInput(input: UploadImageInput): ValidateResult {
  const errors: string[] = [];

  if (!input.workspace_id || typeof input.workspace_id !== "string") {
    errors.push("workspace_id is required");
  }
  if (!IMAGE_SLOTS.includes(input.slot)) {
    errors.push(
      `slot must be one of: ${IMAGE_SLOTS.join(", ")}; got "${input.slot}"`,
    );
  }
  if (
    !ALLOWED_IMAGE_CONTENT_TYPES.includes(
      input.content_type as (typeof ALLOWED_IMAGE_CONTENT_TYPES)[number],
    )
  ) {
    errors.push(
      `content_type must be one of: ${ALLOWED_IMAGE_CONTENT_TYPES.join(", ")}; got "${input.content_type}"`,
    );
  }
  if (input.byte_size <= 0) {
    errors.push("byte_size must be > 0 (empty file)");
  }
  if (input.byte_size > IMAGE_MAX_BYTES) {
    errors.push(
      `byte_size ${input.byte_size} exceeds max ${IMAGE_MAX_BYTES} bytes (5 MB)`,
    );
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true };
}

// ─── pure: blob path builder ────────────────────────────────────────────────

export function buildImageBlobPath(args: {
  workspace_id: string;
  slot: ImageSlot;
  file_name: string;
}): string {
  // Sanitize filename: keep extension, strip everything else. Path
  // traversal (../), spaces, control chars, query strings — all gone.
  const safeName = args.file_name
    .replace(/^.*[\/\\]/, "") // strip any directory parts
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/^\.+/, "_") // no leading dots (avoids hidden-file paths)
    .slice(0, 80);

  // Random uuid suffix → distinct paths even when filename is the same
  // across uploads (re-uploads don't overwrite, old URLs keep working).
  const id = randomUUID();
  return `org/${args.workspace_id}/images/${args.slot}/${id}-${safeName || "image"}`;
}

// ─── upload + apply (DB writes — covered by integration tests) ─────────────

export interface UploadImageResult {
  ok: true;
  slot: ImageSlot;
  url: string;
  blob_path: string;
  applied_to: string[];
  public_url: string | null;
}

export interface UploadImageError {
  ok: false;
  error: string;
  validation_errors: string[];
}

/**
 * Upload an image to Vercel Blob, then apply the resulting URL to the
 * matching slot in the data model. Caller authorizes workspaceId.
 */
export async function uploadAndApplyWorkspaceImage(
  input: UploadImageInput & { bytes: Buffer },
): Promise<UploadImageResult | UploadImageError> {
  const validation = validateImageUploadInput(input);
  if (!validation.ok) {
    return {
      ok: false,
      error: "validation_failed",
      validation_errors: validation.errors,
    };
  }

  // Verify workspace exists before uploading bytes (don't burn Blob
  // quota on a bad request).
  const [orgRow] = await db
    .select({ id: organizations.id, slug: organizations.slug, theme: organizations.theme })
    .from(organizations)
    .where(eq(organizations.id, input.workspace_id))
    .limit(1);
  if (!orgRow) {
    return {
      ok: false,
      error: "workspace_not_found",
      validation_errors: [],
    };
  }

  const blobPath = buildImageBlobPath({
    workspace_id: input.workspace_id,
    slot: input.slot,
    file_name: input.file_name,
  });

  let blobUrl: string;
  try {
    const blob = await put(blobPath, input.bytes, {
      access: "public",
      contentType: input.content_type,
      addRandomSuffix: false,
    });
    blobUrl = blob.url;
  } catch (err) {
    return {
      ok: false,
      error: "blob_upload_failed",
      validation_errors: [err instanceof Error ? err.message : String(err)],
    };
  }

  const appliedTo: string[] = [];

  if (input.slot === "logo") {
    const nextTheme: OrgTheme = { ...orgRow.theme, logoUrl: blobUrl };
    await db
      .update(organizations)
      .set({ theme: nextTheme, updatedAt: new Date() })
      .where(eq(organizations.id, input.workspace_id));
    appliedTo.push("organizations.theme.logoUrl");
  } else if (input.slot === "hero_background") {
    const applied = await applyHeroBackground(input.workspace_id, blobUrl);
    if (applied) appliedTo.push(applied);
  }

  const baseDomain =
    process.env.WORKSPACE_BASE_DOMAIN?.trim() || "app.seldonframe.com";
  const publicUrl = orgRow.slug ? `https://${orgRow.slug}.${baseDomain}/` : null;

  return {
    ok: true,
    slot: input.slot,
    url: blobUrl,
    blob_path: blobPath,
    applied_to: appliedTo,
    public_url: publicUrl,
  };
}

async function applyHeroBackground(
  workspaceId: string,
  imageUrl: string,
): Promise<string | null> {
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

  if (!landing) return null;

  const settings = (landing.settings ?? {}) as Record<string, unknown>;
  const industry =
    typeof settings.industry === "string" ? (settings.industry as string) : null;
  const blueprint = loadBlueprintOrFallback(
    { blueprintJson: landing.blueprintJson },
    landing.title,
    industry,
  );

  const sections = blueprint.landing.sections;
  const heroIdx = sections.findIndex((s) => s.type === "hero");
  if (heroIdx === -1) return null;

  const updatedHero: LandingSection = {
    ...sections[heroIdx],
    imageUrl,
  } as LandingSection;
  const nextSections = sections.map((s, i) => (i === heroIdx ? updatedHero : s));
  const nextBlueprint: Blueprint = {
    ...blueprint,
    landing: { ...blueprint.landing, sections: nextSections },
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

  return "blueprint.landing.sections[hero].imageUrl";
}
