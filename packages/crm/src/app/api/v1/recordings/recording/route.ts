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
import { db } from "@/db";
import { isRecordToAgentOn } from "@/lib/recordings/policy";
import { authorizeRecordingSubmission } from "@/lib/recordings/route-guards";
import { findSessionByToken, insertRecording } from "@/lib/recordings/session-store";

// Route files may only export handlers + segment config (Next build-time
// route validation) — all pure helpers live in lib/recordings/route-guards.ts.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
