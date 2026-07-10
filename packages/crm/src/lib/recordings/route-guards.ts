// Pure gate/authz/grant helpers for the /api/v1/recordings/* routes.
//
// These lived inside the route.ts files at first, but App Router route files
// may only export HTTP handlers + segment config — Next's build-time route
// type validation rejects any other value export ("X is not a valid Route
// export field"), and local tsc never catches it. So every pure helper the
// routes (and the authz specs) share lives here instead. No route file in
// this repo exports a non-handler; keep it that way.
//
// This module must stay free of `@vercel/blob` imports — that package does
// not resolve under the worktree node_modules junction, and keeping the
// grant logic here is what lets the specs test it at all.

import { z } from "zod";

import {
  isRecordToAgentOn,
  MAX_FRAMES_PER_RECORDING,
  MAX_RECORDINGS_PER_SESSION,
} from "@/lib/recordings/policy";
import { TranscriptSegmentSchema } from "@/lib/recordings/trace-schema";
import { IMAGE_MAX_BYTES } from "@/lib/page-blocks/images";
import { VIDEO_MAX_BYTES } from "@/lib/media/resolve-url";

// ─── session creation gate ──────────────────────────────────────────────────

export type SessionCreateGateResult =
  | { kind: "not_found" }
  | { kind: "rate_limited" }
  | { kind: "ok" };

/**
 * Flag check first (unconditional 404 regardless of rate), then the count
 * check. `countExisting` is a DI callback so the unit test pins all three
 * outcomes without a real DB (mirrors resolveWebBuildGate).
 */
export async function resolveSessionCreateGate(
  env: { SF_RECORD_TO_AGENT?: string | undefined },
  countExisting: () => Promise<number>,
  limit: number,
): Promise<SessionCreateGateResult> {
  if (!isRecordToAgentOn(env)) {
    return { kind: "not_found" };
  }
  const count = await countExisting();
  if (count >= limit) {
    return { kind: "rate_limited" };
  }
  return { kind: "ok" };
}

// ─── recording submission authz ─────────────────────────────────────────────

const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";

/** Host must end in the Vercel Blob public-store suffix AND the pathname
 *  must live under this session's own `recordings/<sessionId>/` prefix.
 *  Malformed URLs (throws in `new URL`) are rejected, never thrown through. */
export function isValidRecordingBlobUrl(url: string, sessionId: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (!parsed.hostname.endsWith(BLOB_HOST_SUFFIX)) {
    return false;
  }
  const pathname = parsed.pathname.replace(/^\//, "");
  return pathname.startsWith(`recordings/${sessionId}/`);
}

export const RecordingBodySchema = z.object({
  slotIndex: z.number().int().min(0).max(MAX_RECORDINGS_PER_SESSION - 1),
  label: z.string().nullable().optional(),
  transcript: z.array(TranscriptSegmentSchema),
  frameBlobUrls: z.array(z.string()).max(MAX_FRAMES_PER_RECORDING),
  videoBlobUrl: z.string().nullable().optional(),
});
export type RecordingBody = z.infer<typeof RecordingBodySchema>;

export type RecordingAuthzResult =
  | { kind: "ok"; sessionId: string; body: RecordingBody }
  | { kind: "unauthorized" }
  | { kind: "bad_request"; message: string };

/**
 * Pure-shaped authorization + validation for a recording submission: bearer
 * lookup is DI'd via `lookupSession` (never a raw db handle) so the authz
 * test exercises every rejection path with a fake callback, no DB stub
 * needed (mirrors resolveWebBuildGate's DI-callback style).
 */
export async function authorizeRecordingSubmission(params: {
  rawToken: string | null;
  body: unknown;
  lookupSession: (rawToken: string) => Promise<{ id: string } | null>;
}): Promise<RecordingAuthzResult> {
  if (!params.rawToken) {
    return { kind: "unauthorized" };
  }
  const session = await params.lookupSession(params.rawToken);
  if (!session) {
    return { kind: "unauthorized" };
  }

  const parsed = RecordingBodySchema.safeParse(params.body);
  if (!parsed.success) {
    return { kind: "bad_request", message: parsed.error.message };
  }

  for (const url of parsed.data.frameBlobUrls) {
    if (!isValidRecordingBlobUrl(url, session.id)) {
      return { kind: "bad_request", message: `frame blob url not allowed: ${url}` };
    }
  }
  if (parsed.data.videoBlobUrl && !isValidRecordingBlobUrl(parsed.data.videoBlobUrl, session.id)) {
    return { kind: "bad_request", message: `video blob url not allowed: ${parsed.data.videoBlobUrl}` };
  }

  return { kind: "ok", sessionId: session.id, body: parsed.data };
}

// ─── anonymous upload grant ─────────────────────────────────────────────────

// jpeg ONLY — never the workspace media route's wider image list (svg, gif, …):
// these blobs are written by ANONYMOUS visitors, and script-bearing formats on
// a public URL are a stored-XSS surface.
export const ALLOWED_IMAGE_CONTENT_TYPE = "image/jpeg";
export const ALLOWED_VIDEO_CONTENT_TYPE = "video/webm";

/** pathname must live under this session's own `recordings/<sessionId>/`
 *  prefix — same shape as isValidRecordingBlobUrl, but operating on the bare
 *  pathname handleUpload hands us (no host to check here; Blob itself owns
 *  the host). */
export function isAllowedRecordingPathname(pathname: string, sessionId: string): boolean {
  const normalized = pathname.replace(/^\//, "");
  return normalized.startsWith(`recordings/${sessionId}/`);
}

/** Pure grant resolution for a given content type — null when the type
 *  isn't one of the two the /record flow ever produces. */
export function resolveUploadGrant(params: {
  contentType: string;
}): { allowedContentTypes: string[]; maximumSizeInBytes: number } | null {
  if (params.contentType === ALLOWED_IMAGE_CONTENT_TYPE) {
    return { allowedContentTypes: [ALLOWED_IMAGE_CONTENT_TYPE], maximumSizeInBytes: IMAGE_MAX_BYTES };
  }
  if (params.contentType === ALLOWED_VIDEO_CONTENT_TYPE) {
    return { allowedContentTypes: [ALLOWED_VIDEO_CONTENT_TYPE], maximumSizeInBytes: VIDEO_MAX_BYTES };
  }
  return null;
}
