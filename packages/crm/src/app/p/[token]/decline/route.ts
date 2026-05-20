// packages/crm/src/app/p/[token]/decline/route.ts
// 2026-05-19 — Proposal Builder. Public decline endpoint. Prospect can
// click "Not interested" + optionally leave a reason. Spec: §"Public
// proposal page" + open-question 3 (decline reasons).

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { proposalEvents, proposals } from "@/db/schema";
import { loadProposalByToken } from "@/lib/proposals/load-by-token";
import { assertTransition } from "@/lib/proposals/status";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const proposal = await loadProposalByToken(token);
  if (!proposal) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    assertTransition(proposal.status, "declined");
  } catch {
    return NextResponse.json({ error: "invalid_transition" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as { reason?: string };
  const reason = typeof body.reason === "string" ? body.reason.slice(0, 1000) : null;

  await db
    .update(proposals)
    .set({
      status: "declined",
      declinedAt: new Date(),
      declinedReason: reason,
      updatedAt: new Date(),
    })
    .where(eq(proposals.id, proposal.id));

  await db.insert(proposalEvents).values({
    proposalId: proposal.id,
    eventType: "declined",
    metadata: reason ? { reason } : null,
  });

  return NextResponse.json({ ok: true });
}
