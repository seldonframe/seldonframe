// POST /api/v1/recordings/session
//
// PUBLIC, UNAUTHENTICATED — mints a new anonymous recording session. Mirrors
// the gate shape of api/v1/web/build/stream/route.ts: flag check FIRST
// (unconditional 404 when SF_RECORD_TO_AGENT is off), then a per-IP creation
// rate limit (RECORDING_SESSIONS_PER_DAY_PER_IP / 24h), enforced via a real
// DB count (countSessionsForIp) rather than the Redis-backed checkRateLimit —
// sessions are already a persisted row, so counting them directly avoids a
// second source of truth.
//
// The raw bearer token is returned to the client exactly once in this
// response and never persisted (session-token.ts: only its hash is stored).
//
// GET /api/v1/recordings/session — rehydrates a session the client already
// holds {sessionId, token} for: bearer-authed (Authorization header, same
// token this session was minted with), flag-gated 404 like the POST above.
// This is what makes the post-claim /signup return (and an ordinary page
// refresh) able to restore flowModel/coverage/openQuestions/slot state that
// otherwise only ever lived in the React tree in memory (see B-1 in the
// final cross-wave review: without this endpoint the recap/compile UI was
// permanently unreachable after the claim redirect).

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { resolveRecordingSessionsPerDay } from "@/lib/recordings/policy";
import { extractBearerToken, resolveSessionCreateGate, resolveSessionFetchGate } from "@/lib/recordings/route-guards";
import { hashIp, hashSessionToken, mintSessionToken, resolveTokenSecret } from "@/lib/recordings/session-token";
import {
  countSessionsForIp,
  createSession,
  findSessionByToken,
  listRecordingsForSession,
} from "@/lib/recordings/session-store";
import type { FlowModel } from "@/lib/recordings/trace-schema";

// Route files may only export handlers + segment config (Next build-time
// route validation) — all pure helpers live in lib/recordings/route-guards.ts.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RATE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Same first-hop-of-x-forwarded-for idiom as the web-build stream route. */
function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (!forwarded) return "local";
  return forwarded.split(",")[0]?.trim() || "local";
}

export async function POST(request: Request): Promise<Response> {
  const tokenEnv = { AUTH_SECRET: process.env.AUTH_SECRET, NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET };
  // 2026-07-10 live-test fix: a signed-in caller (the founder testing their
  // own flow, or any authed operator) bypasses the anonymous per-IP cap
  // entirely — auth() never throws for a signed-out visitor, just yields a
  // null session, same null-safe idiom as record/page.tsx.
  const session = await auth();
  const isAuthed = Boolean(session?.user?.id);
  const gate = await resolveSessionCreateGate(
    { SF_RECORD_TO_AGENT: process.env.SF_RECORD_TO_AGENT },
    async () => {
      // Only ever evaluated when the flag is on AND the caller is anonymous —
      // secret resolution happens here, not before the flag check, so a
      // flag-off deployment never needs AUTH_SECRET set to 404 correctly.
      const secret = resolveTokenSecret(tokenEnv);
      const ipHash = hashIp(getClientIp(request), secret);
      return countSessionsForIp(db, ipHash, Date.now() - RATE_WINDOW_MS);
    },
    resolveRecordingSessionsPerDay({ SF_RECORD_SESSIONS_PER_DAY: process.env.SF_RECORD_SESSIONS_PER_DAY }),
    { isAuthed },
  );

  if (gate.kind === "not_found") {
    return new Response(null, { status: 404 });
  }
  if (gate.kind === "rate_limited") {
    return NextResponse.json(
      { error: "rate_limited", message: "You've started a few recording sessions today — try again tomorrow." },
      { status: 429 },
    );
  }

  const secret = resolveTokenSecret(tokenEnv);
  const ipHash = hashIp(getClientIp(request), secret);
  const { raw } = mintSessionToken();
  const tokenHash = hashSessionToken(raw, secret);
  const { id } = await createSession(db, { ipHash, tokenHash });

  return NextResponse.json({ session_id: id, token: raw });
}

export async function GET(request: Request): Promise<Response> {
  const env = { SF_RECORD_TO_AGENT: process.env.SF_RECORD_TO_AGENT };
  const tokenEnv = { AUTH_SECRET: process.env.AUTH_SECRET, NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET };
  const rawToken = extractBearerToken(request.headers.get("authorization"));

  const gate = await resolveSessionFetchGate({
    env,
    rawToken,
    lookupSession: async (token) => {
      const session = await findSessionByToken(db, token, tokenEnv);
      return session ? { id: session.id } : null;
    },
  });

  if (gate.kind === "not_found") {
    return new Response(null, { status: 404 });
  }
  if (gate.kind === "unauthorized") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // gate.kind === "ok" — re-fetch the row itself (resolveSessionFetchGate's
  // DI callback only proves ownership; the response body needs the full row).
  const session = await findSessionByToken(db, rawToken!, tokenEnv);
  if (!session) {
    // Vanishingly unlikely (deleted between the gate's lookup and here), but
    // never assume — treat exactly like any other lookup miss.
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const recordings = await listRecordingsForSession(db, session.id);

  return NextResponse.json({
    session_id: session.id,
    status: session.status,
    flow_model: (session.flowModel as FlowModel | null) ?? null,
    open_questions: (session.openQuestions as string[] | null) ?? [],
    slots: recordings.map((r) => ({
      slot_index: r.slotIndex,
      label: r.label,
      status: r.status,
    })),
  });
}
