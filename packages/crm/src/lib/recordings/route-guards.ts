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

// ─── shared bearer-token extraction ─────────────────────────────────────────

/** Same idiom every recordings route uses: `Authorization: Bearer <token>`,
 *  trimmed, empty-after-trim treated as absent. Pure (takes the raw header
 *  value, never a Request) so it lives here alongside the other route
 *  helpers and is directly unit-testable. */
export function extractBearerToken(headerValue: string | null): string | null {
  if (!headerValue?.startsWith("Bearer ")) return null;
  const token = headerValue.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

// ─── session creation gate ──────────────────────────────────────────────────

export type SessionCreateGateResult =
  | { kind: "not_found" }
  | { kind: "rate_limited" }
  | { kind: "ok" };

/**
 * Flag check first (unconditional 404 regardless of rate), then the count
 * check. `countExisting` is a DI callback so the unit test pins all three
 * outcomes without a real DB (mirrors resolveWebBuildGate).
 *
 * `options.isAuthed` (2026-07-10 live-test fix): a signed-in caller skips the
 * anonymous per-IP count check entirely — the cap exists to bound anonymous
 * abuse, not to block a founder (or any authed operator) testing their own
 * flow. The flag check still applies unconditionally: an authed caller with
 * the flag off still gets `not_found`, never a bypass of the gate itself.
 */
export async function resolveSessionCreateGate(
  env: { SF_RECORD_TO_AGENT?: string | undefined },
  countExisting: () => Promise<number>,
  limit: number,
  options?: { isAuthed?: boolean },
): Promise<SessionCreateGateResult> {
  if (!isRecordToAgentOn(env)) {
    return { kind: "not_found" };
  }
  if (options?.isAuthed) {
    return { kind: "ok" };
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

// ─── session fetch (rehydration) authz ─────────────────────────────────────

export type SessionFetchGateResult =
  | { kind: "not_found" }
  | { kind: "unauthorized" }
  | { kind: "ok"; sessionId: string };

/**
 * Pure-shaped authorization for GET /api/v1/recordings/session — this is the
 * rehydration read the client makes on mount (fresh reload AND the
 * post-claim return) to recover flowModel/openQuestions/slot state that only
 * ever lived in memory. Flag check first (same 404-first shape as every
 * other gate here), then the same bearer-token-owns-the-session check as
 * authorizeRecordingSubmission. `lookupSession` is DI'd so the authz test
 * exercises every rejection path with a plain fake, no DB stub needed.
 */
export async function resolveSessionFetchGate(params: {
  env: { SF_RECORD_TO_AGENT?: string | undefined };
  rawToken: string | null;
  lookupSession: (rawToken: string) => Promise<{ id: string } | null>;
}): Promise<SessionFetchGateResult> {
  if (!isRecordToAgentOn(params.env)) {
    return { kind: "not_found" };
  }
  if (!params.rawToken) {
    return { kind: "unauthorized" };
  }
  const session = await params.lookupSession(params.rawToken);
  if (!session) {
    return { kind: "unauthorized" };
  }
  return { kind: "ok", sessionId: session.id };
}

// ─── anonymous upload grant ─────────────────────────────────────────────────

// jpeg ONLY — never the workspace media route's wider image list (svg, gif, …):
// these blobs are written by ANONYMOUS visitors, and script-bearing formats on
// a public URL are a stored-XSS surface.
export const ALLOWED_IMAGE_CONTENT_TYPE = "image/jpeg";
// webm (live desktop capture) + mp4/quicktime (phone OS recorders — the
// mobile upload path). All inert media types: none can carry script on a
// public URL the way svg/gif can, and Whisper accepts all three.
export const ALLOWED_VIDEO_CONTENT_TYPES = ["video/webm", "video/mp4", "video/quicktime"] as const;
/** @deprecated kept for any straggling import — prefer ALLOWED_VIDEO_CONTENT_TYPES. */
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
  if ((ALLOWED_VIDEO_CONTENT_TYPES as readonly string[]).includes(params.contentType)) {
    return { allowedContentTypes: [params.contentType], maximumSizeInBytes: VIDEO_MAX_BYTES };
  }
  return null;
}

// ─── compile-agent (post-claim) authz gate ─────────────────────────────────

/** The only session statuses `compile-agent` may act on: 'recapped' (the
 *  approve:true transition below moves it to 'approved') or already
 *  'approved' (a retry / the operator re-hits compile). Any other status
 *  (recording / compiled / abandoned) is a 409 conflict. */
const COMPILABLE_STATUSES = new Set(["recapped", "approved"]);

export type CompileAgentGateResult =
  | { kind: "not_found" }
  | { kind: "unauthorized" }
  | { kind: "conflict" }
  | { kind: "ok"; shouldApprove: boolean };

/**
 * Pure-shaped authorization for POST /api/v1/recordings/compile-agent. Auth
 * is BOTH the session bearer token AND an authenticated operator
 * (getOrgId()) — a caller needs to be signed in AND hold the exact
 * session's bearer (proving they're the one who recorded it), never
 * either alone. `session` and `orgId` are DI'd (never a raw db handle /
 * getOrgId() call) so the authz test exercises every rejection path with
 * plain fakes, mirroring authorizeRecordingSubmission / resolveSessionCreateGate.
 */
export function resolveCompileAgentGate(params: {
  env: { SF_RECORD_TO_AGENT?: string | undefined };
  orgId: string | null;
  rawToken: string | null;
  sessionIdFromBody: string;
  session: { id: string; status: string } | null;
  approve: boolean;
}): CompileAgentGateResult {
  if (!isRecordToAgentOn(params.env)) {
    return { kind: "not_found" };
  }
  if (!params.orgId) {
    return { kind: "unauthorized" };
  }
  if (
    !params.rawToken ||
    !params.session ||
    params.session.id !== params.sessionIdFromBody
  ) {
    return { kind: "unauthorized" };
  }
  if (!COMPILABLE_STATUSES.has(params.session.status)) {
    return { kind: "conflict" };
  }
  // 'recapped' MUST arrive with approve:true to proceed (that's the one
  // transition this route performs); a recapped session without approval
  // is not yet compilable. 'approved' proceeds regardless of `approve`
  // (a retry / re-hit of compile with approve omitted is still valid).
  if (params.session.status === "recapped" && !params.approve) {
    return { kind: "conflict" };
  }
  return { kind: "ok", shouldApprove: params.session.status === "recapped" };
}
