// packages/crm/src/app/api/cron/expire-proposals/route.ts
// 2026-05-19 — Proposal Builder. Daily Vercel Cron: expire unaccepted
// proposals past their 30-day TTL. Spec open-question #2.

import { NextResponse } from "next/server";
import { expireStaleProposals } from "@/lib/proposals/expire-stale";

export const runtime = "nodejs";

export async function GET(request: Request) {
  // Vercel Cron sends Authorization: Bearer <CRON_SECRET> on every invocation.
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await expireStaleProposals();
  return NextResponse.json(result);
}
