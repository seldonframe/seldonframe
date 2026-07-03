// packages/crm/src/lib/marketplace/taste/taste-session-store.ts
//
// Taste mode — the anonymous session rows. Anonymous-write safety is enforced
// HERE (size cap) and in the handler (creation rate caps). Pure helpers are
// exported separately from the DB-thin wrappers so node:test covers the logic
// without Postgres (repo DI convention — see agent-mcp-handler.ts header).

import { and, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { agentTasteSessions, type TasteGrounding } from "@/db/schema/agent-taste-sessions";
import { TASTE_GROUNDING_MAX_BYTES, TASTE_SESSION_TTL_MS } from "./taste-policy";

// ── pure ─────────────────────────────────────────────────────────────────────

export function groundingByteSize(g: TasteGrounding): number {
  return Buffer.byteLength(JSON.stringify(g), "utf8");
}

const FIELD_CAPS = {
  businessName: 200,
  industry: 120,
  tagline: 300,
  description: 1500,
  voiceTone: 300,
  idealClient: 400,
  service: 200,
  maxServices: 8,
} as const;

/** Field-wise truncation that guarantees the serialized blob fits the 8KB cap.
 *  Deterministic and lossy-by-design: taste grounding is a demo context, not a
 *  soul of record. Optional fields are OMITTED (not set to undefined) when
 *  absent on input — keeps the shape identical to a hand-built literal so
 *  small groundings pass through byte-for-byte unchanged. */
export function truncateGroundingToCap(g: TasteGrounding): TasteGrounding {
  const cut = (s: string | undefined, n: number) => (typeof s === "string" ? s.slice(0, n) : undefined);
  const out: TasteGrounding = {
    businessName: (g.businessName ?? "").slice(0, FIELD_CAPS.businessName),
    sourceDomain: (g.sourceDomain ?? "").slice(0, 253),
  };
  const industry = cut(g.industry, FIELD_CAPS.industry);
  if (industry !== undefined) out.industry = industry;
  const tagline = cut(g.tagline, FIELD_CAPS.tagline);
  if (tagline !== undefined) out.tagline = tagline;
  const description = cut(g.description, FIELD_CAPS.description);
  if (description !== undefined) out.description = description;
  const voiceTone = cut(g.voiceTone, FIELD_CAPS.voiceTone);
  if (voiceTone !== undefined) out.voiceTone = voiceTone;
  const idealClient = cut(g.idealClient, FIELD_CAPS.idealClient);
  if (idealClient !== undefined) out.idealClient = idealClient;
  if (g.services !== undefined) {
    out.services = g.services
      .slice(0, FIELD_CAPS.maxServices)
      .map((s) => String(s).slice(0, FIELD_CAPS.service));
  }

  // Belt-and-braces: if still over (impossible with the caps above, but never
  // trust arithmetic where money/storage is involved), drop optional fields.
  if (groundingByteSize(out) > TASTE_GROUNDING_MAX_BYTES) {
    const fallback: TasteGrounding = { businessName: out.businessName, sourceDomain: out.sourceDomain };
    const shortDescription = cut(out.description, 500);
    if (shortDescription !== undefined) fallback.description = shortDescription;
    return fallback;
  }
  return out;
}

/** Closed-open: now >= expiresAt is expired (mirrors rental-token expiry). */
export function isSessionExpired(expiresAt: Date, now: Date): boolean {
  return now.getTime() >= expiresAt.getTime();
}

// ── DB-thin ──────────────────────────────────────────────────────────────────

type Dbi = typeof db;

export async function createTasteSession(
  input: {
    listingId: string;
    slug: string;
    sourceUrl: string;
    grounding: TasteGrounding;
    ipHash: string;
    now: Date;
  },
  dbi: Dbi = db,
): Promise<{ sessionId: string }> {
  const grounding = truncateGroundingToCap(input.grounding);
  const [row] = await dbi
    .insert(agentTasteSessions)
    .values({
      listingId: input.listingId,
      slug: input.slug,
      sourceUrl: input.sourceUrl.slice(0, 2000),
      grounding,
      ipHash: input.ipHash,
      expiresAt: new Date(input.now.getTime() + TASTE_SESSION_TTL_MS),
    })
    .returning({ id: agentTasteSessions.id });
  return { sessionId: row.id };
}

export async function getTasteSession(
  input: { sessionId: string; slug: string; now: Date },
  dbi: Dbi = db,
): Promise<TasteGrounding | null> {
  const [row] = await dbi
    .select({
      grounding: agentTasteSessions.grounding,
      expiresAt: agentTasteSessions.expiresAt,
      slug: agentTasteSessions.slug,
    })
    .from(agentTasteSessions)
    .where(and(eq(agentTasteSessions.id, input.sessionId), eq(agentTasteSessions.slug, input.slug)))
    .limit(1);
  if (!row) return null;
  if (isSessionExpired(row.expiresAt, input.now)) return null;
  return row.grounding;
}

/** Hygiene sweep — piggybacked on /api/cron/orphan-workspace-ttl (design D9).
 *  Correctness never depends on it (reads TTL-check independently). */
export async function deleteExpiredTasteSessions(now: Date, dbi: Dbi = db): Promise<void> {
  await dbi.delete(agentTasteSessions).where(lt(agentTasteSessions.expiresAt, now));
}
