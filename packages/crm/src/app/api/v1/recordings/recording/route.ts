// POST /api/v1/recordings/recording
//
// Bearer-token authed — registers one uploaded recording (a "slot") against
// an existing anonymous session. The blobs themselves are uploaded directly
// to Vercel Blob by the browser (see ../upload/route.ts); this route only
// records the resulting URLs after validating them.
//
// Security invariant: every blob URL's host MUST end in
// `.public.blob.vercel-storage.com` AND its pathname MUST start with
// `recordings/<sessionId>/` — a session can only ever reference blobs it was
// itself granted a token to write into. Both checks are pure and exported
// (isValidRecordingBlobUrl) so the authz test pins them without a live blob
// host or a real DB.

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { isRecordToAgentOn, MAX_FRAMES_PER_RECORDING, MAX_RECORDINGS_PER_SESSION } from "@/lib/recordings/policy";
import { TranscriptSegmentSchema } from "@/lib/recordings/trace-schema";
import { findSessionByToken, insertRecording } from "@/lib/recordings/session-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

export async function POST(request: Request): Promise<Response> {
  if (!isRecordToAgentOn({ SF_RECORD_TO_AGENT: process.env.SF_RECORD_TO_AGENT })) {
    return new Response(null, { status: 404 });
  }

  const rawToken = extractBearerToken(request);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const tokenEnv = { AUTH_SECRET: process.env.AUTH_SECRET, NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET };
  const authz = await authorizeRecordingSubmission({
    rawToken,
    body,
    lookupSession: async (token) => {
      const session = await findSessionByToken(db, token, tokenEnv);
      return session ? { id: session.id } : null;
    },
  });

  if (authz.kind === "unauthorized") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (authz.kind === "bad_request") {
    return NextResponse.json({ error: authz.message }, { status: 400 });
  }

  const { id } = await insertRecording(db, {
    sessionId: authz.sessionId,
    slotIndex: authz.body.slotIndex,
    label: authz.body.label ?? null,
    transcript: authz.body.transcript,
    frameBlobUrls: authz.body.frameBlobUrls,
    videoBlobUrl: authz.body.videoBlobUrl ?? null,
  });

  return NextResponse.json({ recording_id: id });
}
