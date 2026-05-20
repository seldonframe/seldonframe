// packages/crm/src/lib/proposals/expire-stale.ts
// 2026-05-19 — Proposal Builder. Daily cleanup: any proposal in
// sent/viewed status past expires_at gets flipped to 'expired', and
// an 'expired' event is logged. Spec open-question #2 (30-day TTL).

import { and, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { proposalEvents, proposals } from "@/db/schema";

export function selectExpirationCutoff(input: { now: Date; days?: number }): Date {
  const days = input.days ?? 30;
  return new Date(input.now.getTime() - days * 24 * 60 * 60 * 1000);
}

export async function expireStaleProposals(now: Date = new Date()): Promise<{
  expired: number;
}> {
  const stale = await db
    .select({ id: proposals.id })
    .from(proposals)
    .where(
      and(
        inArray(proposals.status, ["sent", "viewed"]),
        lt(proposals.expiresAt, now),
      ),
    );

  if (stale.length === 0) return { expired: 0 };

  const ids = stale.map((r) => r.id);
  await db
    .update(proposals)
    .set({ status: "expired", updatedAt: now })
    .where(inArray(proposals.id, ids));

  await db.insert(proposalEvents).values(
    ids.map((id) => ({
      proposalId: id,
      eventType: "expired" as const,
      metadata: { reason: "ttl_30d" },
    })),
  );

  return { expired: stale.length };
}
