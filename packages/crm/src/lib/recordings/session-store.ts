// Record-to-agent session/recording persistence. Every function takes `db`
// as its first argument (default = the real drizzle client) so tests can
// pass a minimal structural fake instead of a real Postgres connection —
// same convention as lib/web-build/extraction-cache-store.ts.

import { and, eq, gte } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import {
  recordingSessions,
  workflowRecordings,
  type RecordingSession,
} from "@/db/schema/recordings";
import { hashSessionToken, resolveTokenSecret, type TokenSecretEnv } from "./session-token";
import type { TranscriptSegment } from "./trace-schema";

type Dbi = typeof defaultDb;

export async function createSession(
  db: Dbi,
  args: { ipHash: string; tokenHash: string },
): Promise<{ id: string }> {
  const [row] = await db
    .insert(recordingSessions)
    .values({ ipHash: args.ipHash, tokenHash: args.tokenHash })
    .returning({ id: recordingSessions.id });
  return { id: row.id };
}

/** Looks up a session by its RAW bearer token — hashes with the resolved
 *  secret and matches on tokenHash. Returns null on any miss (unknown token,
 *  wrong secret) — never distinguishes the two (no enumeration signal). */
export async function findSessionByToken(
  db: Dbi,
  rawToken: string,
  env: TokenSecretEnv,
): Promise<RecordingSession | null> {
  const secret = resolveTokenSecret(env);
  const tokenHash = hashSessionToken(rawToken, secret);
  const rows = await db
    .select()
    .from(recordingSessions)
    .where(eq(recordingSessions.tokenHash, tokenHash))
    .limit(1);
  return rows[0] ?? null;
}

/** Counts sessions created by this ipHash since `sinceMs` (epoch ms) — the
 *  per-IP daily creation cap (RECORDING_SESSIONS_PER_DAY_PER_IP). */
export async function countSessionsForIp(
  db: Dbi,
  ipHash: string,
  sinceMs: number,
): Promise<number> {
  const rows = await db
    .select({ id: recordingSessions.id })
    .from(recordingSessions)
    .where(and(eq(recordingSessions.ipHash, ipHash), gte(recordingSessions.createdAt, new Date(sinceMs))));
  return rows.length;
}

export async function insertRecording(
  db: Dbi,
  args: {
    sessionId: string;
    slotIndex: number;
    label?: string | null;
    transcript: TranscriptSegment[];
    frameBlobUrls: string[];
    videoBlobUrl?: string | null;
  },
): Promise<{ id: string }> {
  const [row] = await db
    .insert(workflowRecordings)
    .values({
      sessionId: args.sessionId,
      slotIndex: args.slotIndex,
      label: args.label ?? null,
      transcript: args.transcript,
      frameBlobUrls: args.frameBlobUrls,
      videoBlobUrl: args.videoBlobUrl ?? null,
    })
    .returning({ id: workflowRecordings.id });
  return { id: row.id };
}
