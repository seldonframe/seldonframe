// ============================================================================
// Media sources T2 — safe external-URL resolver
// ============================================================================
//
// INERT helper: not wired to any tool/UI yet (that's T3 — copilot media
// tools). Answers "is this operator-supplied URL safe to use as a media
// source, and if so, where does the bytes-of-record live?"
//
// SECURITY INVARIANT: the SSRF guard (`assertPublicHttpUrl`) runs FIRST,
// before any fetch of the candidate URL. A URL that fails the guard is
// rejected immediately — the guard's own DNS/IP checks handle localhost,
// RFC1918 private ranges, link-local/metadata addresses, and non-http(s)
// schemes; we don't re-implement any of that here.
//
// After the guard passes:
//   - kind="image": content-type must be in the image allow-list (reused
//     from lib/page-blocks/images.ts) and size must be under the existing
//     image cap. On pass, we RE-HOST to Vercel Blob (same `put(...)`
//     pattern as upload_workspace_image) so the stored reference never
//     depends on a hotlink/expiring third-party URL.
//   - kind="video": content-type must be in a video allow-list (new, this
//     module) and size must be under a larger video cap. We do NOT
//     re-host video (too large/costly to proxy through Blob) — the
//     validated public URL is returned as-is.

import { put } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import {
  assertPublicHttpUrl as defaultAssertPublicHttpUrl,
  SsrfBlockedError,
} from "@/lib/security/ssrf-guard";
import { ALLOWED_IMAGE_CONTENT_TYPES, IMAGE_MAX_BYTES } from "@/lib/page-blocks/images";

export type MediaKind = "image" | "video";

export type ResolveMediaResult =
  | { ok: true; url: string; contentType: string }
  | { ok: false; error: string };

/** Video content types we accept for a background-video source. */
export const ALLOWED_VIDEO_CONTENT_TYPES = ["video/mp4", "video/webm"] as const;

/** Video cap is larger than the image cap — background video clips are
 *  necessarily bigger — but still bounded so we never proxy an arbitrarily
 *  large file through the function runtime. */
export const VIDEO_MAX_BYTES = 50 * 1024 * 1024; // 50 MB

export interface ResolveExternalMediaDeps {
  fetch?: typeof fetch;
  put?: typeof put;
  assertPublicHttpUrl?: typeof defaultAssertPublicHttpUrl;
}

function contentTypeAllowed(kind: MediaKind, contentType: string): boolean {
  if (kind === "image") {
    return (ALLOWED_IMAGE_CONTENT_TYPES as readonly string[]).includes(contentType);
  }
  return (ALLOWED_VIDEO_CONTENT_TYPES as readonly string[]).includes(contentType);
}

function maxBytesFor(kind: MediaKind): number {
  return kind === "image" ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES;
}

/**
 * Validate an operator-supplied external URL as a media source and — for
 * images — re-host it to Blob. SSRF-guarded: the candidate URL is asserted
 * safe BEFORE any fetch is attempted.
 */
export async function resolveExternalMedia(
  url: string,
  kind: MediaKind,
  deps: ResolveExternalMediaDeps = {},
): Promise<ResolveMediaResult> {
  const assertPublicHttpUrl = deps.assertPublicHttpUrl ?? defaultAssertPublicHttpUrl;
  const fetchImpl = deps.fetch ?? fetch;
  const putImpl = deps.put ?? put;

  let validatedUrl: URL;
  try {
    const asserted = await assertPublicHttpUrl(url);
    validatedUrl = asserted.url;
  } catch (err) {
    if (err instanceof SsrfBlockedError) {
      return { ok: false, error: "unsafe_url" };
    }
    return { ok: false, error: "unsafe_url" };
  }

  let response: Response;
  try {
    response = await fetchImpl(validatedUrl.toString(), {
      method: "GET",
      redirect: "follow",
    });
  } catch {
    return { ok: false, error: "fetch_failed" };
  }

  if (!response.ok) {
    return { ok: false, error: "fetch_http_error" };
  }

  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
  if (!contentType || !contentTypeAllowed(kind, contentType)) {
    return { ok: false, error: "unsupported_content_type" };
  }

  const maxBytes = maxBytesFor(kind);
  const advertisedLength = Number(response.headers.get("content-length") ?? 0);
  if (advertisedLength && advertisedLength > maxBytes) {
    return { ok: false, error: "too_large" };
  }

  if (kind === "video") {
    // No re-hosting — return the SSRF-validated public URL as-is.
    return { ok: true, url: validatedUrl.toString(), contentType };
  }

  // Images: re-host to Blob so we never depend on the third-party hotlink.
  let bytes: ArrayBuffer;
  try {
    bytes = await response.arrayBuffer();
  } catch {
    return { ok: false, error: "fetch_failed" };
  }

  if (bytes.byteLength > maxBytes) {
    return { ok: false, error: "too_large" };
  }
  if (bytes.byteLength === 0) {
    return { ok: false, error: "empty_body" };
  }

  const ext = contentType.split("/")[1] ?? "bin";
  const blobPath = `media/external/${randomUUID()}.${ext}`;

  try {
    const blob = await putImpl(blobPath, Buffer.from(bytes), {
      access: "public",
      contentType,
      addRandomSuffix: false,
    });
    return { ok: true, url: blob.url, contentType };
  } catch {
    return { ok: false, error: "blob_upload_failed" };
  }
}
