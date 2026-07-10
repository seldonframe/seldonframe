// POST /api/v1/recordings/compile-trace
//
// Bearer-token authed. Given a recording_id (already uploaded via
// ../recording), fetches its keyframes, compiles them into a WorkflowTrace,
// merges the trace into the session's running FlowModel, computes per-step
// tool coverage, and persists all three (recording.trace/status,
// session.flowModel/openQuestions/status).
//
// Anonymous LLM spend guard: this repo has no dedicated dollar-spend-cap
// helper for anonymous LLM calls today (the web-build path's only guardrail
// is resolveWebBuildGate's per-IP RATE limit, not a spend counter — verified
// against lib/web-onboarding/run-create-from-url.ts, which has no such call).
// This route mirrors that same shape: a per-IP rate limit via the shared
// checkRateLimit helper, layered on top of the structural caps that already
// bound total LLM calls per session (MAX_RECORDINGS_PER_SESSION recordings
// × one compile-trace call each).

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { recordingSessions, workflowRecordings } from "@/db/schema/recordings";
import { isRecordToAgentOn } from "@/lib/recordings/policy";
import { findSessionByToken } from "@/lib/recordings/session-store";
import { fetchFramesAsBase64 } from "@/lib/recordings/fetch-frames";
import { compileTrace } from "@/lib/recordings/trace-compiler";
import { mergeIntoFlowModel } from "@/lib/recordings/merge-traces";
import { coverFlowModel } from "@/lib/recordings/coverage";
import { makeAnthropicTraceLlm } from "@/lib/recordings/trace-llm";
import type { FlowModel, TranscriptSegment } from "@/lib/recordings/trace-schema";
import { checkRateLimit } from "@/lib/utils/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const COMPILE_TRACE_RATE_LIMIT = 12;
const COMPILE_TRACE_RATE_WINDOW_MS = 24 * 60 * 60 * 1000;

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (!forwarded) return "local";
  return forwarded.split(",")[0]?.trim() || "local";
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
  if (!rawToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const tokenEnv = { AUTH_SECRET: process.env.AUTH_SECRET, NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET };
  const session = await findSessionByToken(db, rawToken, tokenEnv);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const allowed = await checkRateLimit(
    `recordings-compile-trace:${getClientIp(request)}`,
    COMPILE_TRACE_RATE_LIMIT,
    COMPILE_TRACE_RATE_WINDOW_MS,
  );
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const recordingId =
    typeof body === "object" && body !== null && typeof (body as { recording_id?: unknown }).recording_id === "string"
      ? (body as { recording_id: string }).recording_id
      : null;
  if (!recordingId) {
    return NextResponse.json({ error: "recording_id required" }, { status: 400 });
  }

  const [recording] = await db
    .select()
    .from(workflowRecordings)
    .where(eq(workflowRecordings.id, recordingId))
    .limit(1);
  if (!recording || recording.sessionId !== session.id || recording.status !== "uploaded") {
    return NextResponse.json({ error: "recording not found" }, { status: 404 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "extraction_unavailable" }, { status: 503 });
  }
  const llm = makeAnthropicTraceLlm({ apiKey });

  const frameUrls = Array.isArray(recording.frameBlobUrls) ? (recording.frameBlobUrls as string[]) : [];
  let frames: Array<{ base64: string }>;
  try {
    frames = await fetchFramesAsBase64(frameUrls);
  } catch (err) {
    await db.update(workflowRecordings).set({ status: "failed" }).where(eq(workflowRecordings.id, recordingId));
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "frame fetch failed" },
      { status: 422 },
    );
  }

  const transcript = Array.isArray(recording.transcript) ? (recording.transcript as TranscriptSegment[]) : [];
  const traceResult = await compileTrace({ frames, transcript, label: recording.label, llm });
  if (!traceResult.ok) {
    await db.update(workflowRecordings).set({ status: "failed" }).where(eq(workflowRecordings.id, recordingId));
    return NextResponse.json({ error: traceResult.error }, { status: 422 });
  }

  const priorModel = (session.flowModel as FlowModel | null) ?? null;
  const mergeResult = await mergeIntoFlowModel({ model: priorModel, trace: traceResult.trace, llm });
  if (!mergeResult.ok) {
    await db.update(workflowRecordings).set({ status: "failed" }).where(eq(workflowRecordings.id, recordingId));
    return NextResponse.json({ error: mergeResult.error }, { status: 422 });
  }

  const coverage = coverFlowModel(mergeResult.model);
  const modelWithCoverage: FlowModel = { ...mergeResult.model, coverage };

  await db
    .update(workflowRecordings)
    .set({ trace: traceResult.trace, status: "traced" })
    .where(eq(workflowRecordings.id, recordingId));
  await db
    .update(recordingSessions)
    .set({
      flowModel: modelWithCoverage,
      openQuestions: mergeResult.openQuestions,
      status: "recapped",
      updatedAt: new Date(),
    })
    .where(eq(recordingSessions.id, session.id));

  return NextResponse.json({
    trace: traceResult.trace,
    whatChanged: mergeResult.whatChanged,
    openQuestions: mergeResult.openQuestions,
    coverage,
  });
}
