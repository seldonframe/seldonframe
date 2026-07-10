// POST /record/share-target — fallback for the no-service-worker case.
//
// The primary path never reaches this route at all: record-sw.js
// intercepts the Share Target POST client-side (before it ever leaves the
// device) and stages the file in CacheStorage. This route only runs when
// the service worker hasn't registered yet (first share before /record was
// ever visited, or a browser that ignores the share_target manifest entry
// entirely and still lets the OS fire the share intent as a real POST).
//
// It must NEVER read the request body — a screen recording routinely
// exceeds Vercel's ~4.5MB function body cap, so touching req.formData()/
// req.blob() here would 413 instead of degrading gracefully. Just redirect
// to /record with a flag so the client shows its "couldn't find the shared
// recording" fallback message and the operator can upload manually.
//
// Flag-gated 404 like every other /record surface (page.tsx, the
// api/v1/recordings/* routes). Route files may only export handlers +
// segment config (see route-guards.ts's header) — the flag check is small
// enough to inline here rather than adding a one-line helper to that file.

import { NextResponse } from "next/server";
import { isRecordToAgentOn } from "@/lib/recordings/policy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  if (!isRecordToAgentOn({ SF_RECORD_TO_AGENT: process.env.SF_RECORD_TO_AGENT })) {
    return new Response(null, { status: 404 });
  }
  return NextResponse.redirect(new URL("/record?shared=miss", request.url), 303);
}
