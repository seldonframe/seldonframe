// ============================================================================
// v1.10.0 / v1.10.1 — upload_workspace_image
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
// v1.10.1 — fix the base64 round-trip cost. v1.10.0 required the agent
// to base64-encode bytes into a JSON tool argument; the resulting
// string had to fit in the agent's tool-input token budget (~16 KB
// base64 = ~12 KB raw before it gets uncomfortable). Operators with
// even a 100 KB logo had to manually resize until the encoded string
// fit. v1.10.1 adds image_url so the SERVER fetches bytes directly —
// no base64, no agent-side resize iteration. Local files use the new
// local_file_path branch on the MCP-client side (Node fs.readFileSync
// + base64) which also bypasses the agent's token budget because the
// agent only passes the path string.
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
import { setR1Media } from "@/lib/landing/set-r1-media";

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

// ─── pure: URL helpers (v1.10.1 image_url path) ────────────────────────────

const URL_EXTENSION_TO_CONTENT_TYPE: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

/**
 * Validate a user-supplied image source URL. v1.10.1 lets the SF backend
 * fetch images directly from a URL instead of accepting bytes in the
 * tool-call body (huge UX win for operators who already have an image
 * at a stable URL — Cloudinary, Unsplash, S3, brand asset library, etc.)
 *
 * SSRF guard rails because we're now executing fetches against
 * operator-supplied hostnames:
 *
 *   - HTTPS only. http:// / file:// / data:// / ftp:// rejected.
 *   - Loopback, RFC1918 private, link-local IP literals rejected
 *     (covers the AWS/GCP metadata service at 169.254.169.254 plus the
 *     usual private-network suspects). DNS-based hostnames are NOT
 *     resolved here — that's a much harder problem (TOCTOU, rebinding)
 *     and the threat model for operator-supplied URLs is mostly
 *     operator-self-pwn, where DNS resolution adds little.
 *
 * Returns structured errors so the route can surface them to the
 * operator for self-correction.
 */
export function validateImageSourceUrl(
  raw: string,
): { ok: true; url: URL } | { ok: false; errors: string[] } {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, errors: [`image_url is not a valid URL: ${raw}`] };
  }

  if (parsed.protocol !== "https:") {
    return {
      ok: false,
      errors: [`image_url must use https:// (got ${parsed.protocol})`],
    };
  }

  // Hostname can be a DNS name, IPv4 literal, or [IPv6] literal. We only
  // block IP literals — DNS resolution is intentionally skipped (see above).
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (host === "localhost") {
    return {
      ok: false,
      errors: ["image_url hostname rejected (loopback/local)"],
    };
  }

  // IPv4 literal: 4 dotted octets.
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    const isLoopback = a === 127;
    const isPrivate10 = a === 10;
    const isPrivate172 = a === 172 && b >= 16 && b <= 31;
    const isPrivate192 = a === 192 && b === 168;
    const isLinkLocal = a === 169 && b === 254;
    if (isLoopback || isPrivate10 || isPrivate172 || isPrivate192 || isLinkLocal) {
      return {
        ok: false,
        errors: [
          `image_url hostname ${host} is a loopback/private/link-local IP — rejected`,
        ],
      };
    }
  }

  // IPv6 loopback ::1 (after the bracket strip above this is just "::1").
  if (host === "::1") {
    return { ok: false, errors: ["image_url hostname ::1 is loopback — rejected"] };
  }

  return { ok: true, url: parsed };
}

/** Map a URL's path extension to a MIME type, or null if unknown. */
export function deriveContentTypeFromUrl(raw: string): string | null {
  let path: string;
  try {
    path = new URL(raw).pathname;
  } catch {
    // For malformed URLs, fall back to the raw string before "?" if any.
    path = raw.split("?")[0] ?? raw;
  }
  const lastDot = path.lastIndexOf(".");
  if (lastDot < 0 || lastDot === path.length - 1) return null;
  const ext = path.slice(lastDot + 1).toLowerCase();
  return URL_EXTENSION_TO_CONTENT_TYPE[ext] ?? null;
}

/** Pull the basename out of a URL path. Strips query string. */
export function deriveFileNameFromUrl(raw: string): string {
  let path: string;
  try {
    path = new URL(raw).pathname;
  } catch {
    path = raw.split("?")[0] ?? raw;
  }
  const segments = path.split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  if (!last) return "image";
  return last;
}

// ─── server-side URL fetch with size cap + content-type validation ─────────

export interface FetchedImage {
  bytes: Buffer;
  content_type: string;
  file_name: string;
}

export type FetchImageResult =
  | { ok: true; image: FetchedImage }
  | { ok: false; error: string; validation_errors: string[] };

/**
 * Fetch an image from a public HTTPS URL with SSRF guards, a size
 * cap that aborts mid-stream if exceeded, and a content-type allow-list
 * applied to whichever value is more reliable (URL extension wins when
 * present, server header is the fallback).
 *
 * Used by the v1.10.1 image_url path of POST /api/v1/workspace/v2/images.
 */
export async function fetchImageBytesFromUrl(
  rawUrl: string,
  hints: { file_name?: string; content_type?: string } = {},
): Promise<FetchImageResult> {
  const validation = validateImageSourceUrl(rawUrl);
  if (!validation.ok) {
    return {
      ok: false,
      error: "image_url_invalid",
      validation_errors: validation.errors,
    };
  }

  // 5-second timeout. Operator-supplied URLs hanging shouldn't keep the
  // request handler open — Vercel function execution is metered.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  let response: Response;
  try {
    response = await fetch(validation.url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "SeldonFrame/1.10 image-fetch" },
    });
  } catch (err) {
    clearTimeout(timeout);
    return {
      ok: false,
      error: "image_url_fetch_failed",
      validation_errors: [err instanceof Error ? err.message : String(err)],
    };
  }
  clearTimeout(timeout);

  if (!response.ok) {
    return {
      ok: false,
      error: "image_url_http_error",
      validation_errors: [
        `${response.status} ${response.statusText} from ${validation.url.toString()}`,
      ],
    };
  }

  // Cheap pre-flight: trust Content-Length when present to reject obvious
  // oversize without streaming.
  const advertised = Number(response.headers.get("content-length") ?? 0);
  if (advertised && advertised > IMAGE_MAX_BYTES) {
    return {
      ok: false,
      error: "image_url_too_large",
      validation_errors: [
        `Content-Length ${advertised} exceeds max ${IMAGE_MAX_BYTES}`,
      ],
    };
  }

  // Stream-read with running byte counter. Don't trust Content-Length;
  // an attacker could omit the header. Abort once we cross the cap.
  const reader = response.body?.getReader();
  if (!reader) {
    return {
      ok: false,
      error: "image_url_empty_body",
      validation_errors: ["fetch returned no readable body"],
    };
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > IMAGE_MAX_BYTES) {
      try {
        await reader.cancel();
      } catch {
        // Best-effort. We're rejecting either way.
      }
      return {
        ok: false,
        error: "image_url_too_large",
        validation_errors: [
          `streamed ${total} bytes; max is ${IMAGE_MAX_BYTES}`,
        ],
      };
    }
    chunks.push(value);
  }

  const bytes = Buffer.concat(chunks);
  if (bytes.length === 0) {
    return {
      ok: false,
      error: "image_url_empty_body",
      validation_errors: ["fetched 0 bytes"],
    };
  }

  // Resolve content-type. Priority: caller hint > URL extension > response header.
  // URL extension wins over server header because servers commonly mislabel
  // (Cloudinary serves `image/png` requests with `application/octet-stream`
  // when the asset's stored type is uncertain).
  const responseCt = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
  const urlCt = deriveContentTypeFromUrl(rawUrl);
  const contentType =
    (hints.content_type && ALLOWED_IMAGE_CONTENT_TYPES.includes(
      hints.content_type as (typeof ALLOWED_IMAGE_CONTENT_TYPES)[number],
    )
      ? hints.content_type
      : urlCt && ALLOWED_IMAGE_CONTENT_TYPES.includes(
          urlCt as (typeof ALLOWED_IMAGE_CONTENT_TYPES)[number],
        )
        ? urlCt
        : responseCt && ALLOWED_IMAGE_CONTENT_TYPES.includes(
            responseCt as (typeof ALLOWED_IMAGE_CONTENT_TYPES)[number],
          )
          ? responseCt
          : "");

  if (!contentType) {
    return {
      ok: false,
      error: "image_url_unsupported_content_type",
      validation_errors: [
        `Could not determine an allowed image content type. URL ext: ${urlCt ?? "none"}; server header: ${responseCt || "none"}.`,
      ],
    };
  }

  const fileName = hints.file_name ?? deriveFileNameFromUrl(rawUrl);

  return {
    ok: true,
    image: {
      bytes,
      content_type: contentType,
      file_name: fileName,
    },
  };
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
  // v1.10.2 fix — this function historically only looked up the legacy
  // slug='home' landing_pages row (the old single-hero blueprint builder).
  // r1 workspaces (slug='r1', see r1-save.ts) never match that lookup, so
  // `upload_workspace_image` with slot=hero_background silently no-op'd for
  // every r1 workspace. Try the r1 path FIRST via the canonical setR1Media
  // write seam; fall back to the legacy 'home' lookup below so any
  // remaining legacy (non-r1) workspace keeps working unchanged.
  const r1Result = await setR1Media(workspaceId, {
    slot: "hero_background",
    src: imageUrl,
    alt: "",
  });
  if (r1Result.ok) {
    return "r1.hero.backgroundImage";
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
