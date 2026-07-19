// POST /api/v1/recordings/interview
//
// Bearer-token authed. One recap-panel chat turn: takes the operator's
// message, runs it against the session's current FlowModel + prior
// interview log, and appends both turns (user + Seldon) to
// recording_sessions.interview_log.
//
// interview_log is written with a bound `coalesce(...) || $1::jsonb`
// concatenation (same idiom as the web-build stream route's
// stampWebUngatedOrigin merge) rather than a read-modify-write of the whole
// array in application code — appending via `||` is a single atomic
// statement, so two concurrent turns can never clobber each other. Never
// `sql.raw` (L-03/L-04): the new-turns payload is passed as a bound
// parameter to the sql template, not string-interpolated into raw SQL.

import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { recordingSessions } from "@/db/schema/recordings";
import { isRecordToAgentOn, MAX_INTERVIEW_TURNS } from "@/lib/recordings/policy";
import { findSessionByToken } from "@/lib/recordings/session-store";
import { interviewTurn, type InterviewTurn } from "@/lib/recordings/interview";
import { makeAnthropicTraceLlm } from "@/lib/recordings/trace-llm";
import type { FlowModel } from "@/lib/recordings/trace-schema";

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
  if (!rawToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const tokenEnv = { AUTH_SECRET: process.env.AUTH_SECRET, NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET };
  const session = await findSessionByToken(db, rawToken, tokenEnv);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const flowModel = (session.flowModel as FlowModel | null) ?? null;
  if (!flowModel) {
    return NextResponse.json({ error: "no flow model yet — compile a recording first" }, { status: 409 });
  }

  const interviewLog = Array.isArray(session.interviewLog) ? (session.interviewLog as InterviewTurn[]) : [];
  // Each turn appends 2 entries (user + seldon) — cap on TURNS, not entries.
  if (interviewLog.length >= MAX_INTERVIEW_TURNS * 2) {
    return NextResponse.json({ error: "interview turn cap reached" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const message =
    typeof body === "object" && body !== null && typeof (body as { message?: unknown }).message === "string"
      ? (body as { message: string }).message.trim()
      : "";
  if (!message) {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "extraction_unavailable" }, { status: 503 });
  }
  const llm = makeAnthropicTraceLlm({ apiKey });

  const result = await interviewTurn({ model: flowModel, interviewLog, message, llm });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  const newTurns: InterviewTurn[] = [
    { role: "user", text: message },
    { role: "seldon", text: result.reply },
  ];

  // Q&A record (agent lifecycle slice, Stage 01 "Learned"): whenever a merge
  // applied, append the answered pair(s) to answered_questions so the record
  // survives claim — decomposed pairs get their real question text, a direct
  // merge gets `{question: null, answer: message}` (mirrors
  // continueInterviewCore's post-claim persistence exactly).
  const answeredAt = new Date().toISOString();
  const newAnswered =
    result.applied
      ? (result.appliedPairs && result.appliedPairs.length > 0
          ? result.appliedPairs.map((p) => ({ question: p.question, answer: p.answer, answeredAt }))
          : [{ question: null, answer: message, answeredAt }])
      : [];

  // Persist the updated FlowModel too (full-column update, same as
  // compile-trace's write to recordingSessions.flowModel) — otherwise
  // Seldon's "I'll update the flow" reply never actually reaches what
  // compile-agent reads, a never-lies violation. When the model-merge
  // couldn't be applied (result.applied === false), `result.model` is the
  // unchanged INPUT model, so this write is a harmless no-op for flowModel —
  // it still records the interview turn itself.
  await db
    .update(recordingSessions)
    .set({
      interviewLog: sql`COALESCE(${recordingSessions.interviewLog}, '[]'::jsonb) || ${JSON.stringify(newTurns)}::jsonb`,
      ...(result.applied ? { flowModel: result.model } : {}),
      ...(newAnswered.length > 0
        ? {
            answeredQuestions: sql`COALESCE(${recordingSessions.answeredQuestions}, '[]'::jsonb) || ${JSON.stringify(newAnswered)}::jsonb`,
          }
        : {}),
      openQuestions: result.openQuestions,
      updatedAt: new Date(),
    })
    .where(eq(recordingSessions.id, session.id));

  return NextResponse.json({
    reply: result.reply,
    open_questions: result.openQuestions,
    // The persisted, updated FlowModel — so the client can refresh its
    // recap without reconstructing it (same convention as compile-trace's
    // flow_model field).
    flow_model: result.model,
  });
}
