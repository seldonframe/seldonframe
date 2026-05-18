// /api/cron/outbound-scheduled-sends — polling worker for the
// outbound messaging scheduled queue.
//
// 2026-05-18 (messaging plan v2, slice 6). Vercel cron hits this
// route every minute (configured in packages/crm/vercel.json). Each
// invocation:
//   1. CAS-claims up to TICK_BATCH due pending rows (fireAt <= now()).
//   2. For each row, runs the same compose+send path the immediate
//      dispatcher uses (lib/messaging/schedule.ts::processScheduledSend).
//   3. Updates the row to fired/failed/cancelled.
//
// Authorized via CRON_SECRET (Bearer token or X-Cron-Secret header),
// same pattern as /api/cron/workflow-tick.

import { NextResponse } from "next/server";
import { tickScheduledSends } from "@/lib/messaging/schedule";

export const runtime = "nodejs";

function isAuthorized(request: Request) {
  const configuredSecret = process.env.CRON_SECRET;
  // No secret configured → allow (dev / preview environments). Same
  // posture as workflow-tick.
  if (!configuredSecret) return true;
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${configuredSecret}`) return true;
  const cronHeader = request.headers.get("x-cron-secret");
  return cronHeader === configuredSecret;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const stats = await tickScheduledSends();
    return NextResponse.json({ ok: true, ...stats });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
