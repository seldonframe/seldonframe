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

import { NextResponse } from "next/server";
import { db } from "@/db";
import { isRecordToAgentOn, RECORDING_SESSIONS_PER_DAY_PER_IP } from "@/lib/recordings/policy";
import { hashIp, hashSessionToken, mintSessionToken, resolveTokenSecret } from "@/lib/recordings/session-token";
import { countSessionsForIp, createSession } from "@/lib/recordings/session-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RATE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type SessionCreateGateResult =
  | { kind: "not_found" }
  | { kind: "rate_limited" }
  | { kind: "ok" };

/**
 * Pure gate helper — flag check first (unconditional 404 regardless of
 * rate), then the count check. Exported so the unit test can pin all three
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

/** Same first-hop-of-x-forwarded-for idiom as the web-build stream route. */
function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (!forwarded) return "local";
  return forwarded.split(",")[0]?.trim() || "local";
}

export async function POST(request: Request): Promise<Response> {
  const tokenEnv = { AUTH_SECRET: process.env.AUTH_SECRET, NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET };
  const gate = await resolveSessionCreateGate(
    { SF_RECORD_TO_AGENT: process.env.SF_RECORD_TO_AGENT },
    async () => {
      // Only ever evaluated when the flag is on — secret resolution happens
      // here, not before the flag check, so a flag-off deployment never
      // needs AUTH_SECRET set to 404 correctly.
      const secret = resolveTokenSecret(tokenEnv);
      const ipHash = hashIp(getClientIp(request), secret);
      return countSessionsForIp(db, ipHash, Date.now() - RATE_WINDOW_MS);
    },
    RECORDING_SESSIONS_PER_DAY_PER_IP,
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
