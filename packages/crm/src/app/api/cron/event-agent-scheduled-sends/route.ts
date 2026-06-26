// /api/cron/event-agent-scheduled-sends — polling worker for the EVENT-AGENT
// time-deferred send queue (Outbound-UX Bundle F2).
//
// 2026-06-26. Vercel cron hits this route every 5 minutes (configured in
// packages/crm/vercel.json). Each invocation:
//   1. Loads up to TICK_LIMIT due 'pending' rows (due_at <= now()).
//   2. For each row, REPLAYS runEventAgent via runDueScheduledEventAgent with the
//      per-org production deps (buildRunEventAgentDeps(row.orgId)) — so the gates
//      (throttle / guardrails / verify / memory) run at the actual send time, and
//      a still-delayed agent can't re-defer (the replay strips the enqueue seam).
//   3. Marks the row 'sent' on success / 'failed' on a throw (CAS on
//      status='pending' → a row fires at most once).
//
// Authorized via CRON_SECRET (Bearer token or X-Cron-Secret header), the same
// pattern as /api/cron/outbound-scheduled-sends + /api/cron/workflow-tick.

import { NextResponse } from "next/server";
import { buildRunEventAgentDeps } from "@/lib/agents/triggers/run-event-agent-deps";
import { runDueScheduledEventAgent } from "@/lib/agents/triggers/scheduled-event-agent";
import { tickEventAgentScheduledSends } from "@/lib/agents/triggers/scheduled-send-cron";
import { scheduledEventAgentSendStore } from "@/lib/agents/triggers/scheduled-send-store";

export const runtime = "nodejs";

/** Max rows drained per tick (mirrors the outbound queue's TICK_BATCH). */
const TICK_LIMIT = 50;

function isAuthorized(request: Request) {
  const configuredSecret = process.env.CRON_SECRET;
  // No secret configured → allow (dev / preview environments). Same posture as
  // outbound-scheduled-sends / workflow-tick.
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
    const stats = await tickEventAgentScheduledSends({
      store: scheduledEventAgentSendStore,
      runDue: runDueScheduledEventAgent,
      buildDeps: buildRunEventAgentDeps,
      limit: TICK_LIMIT,
    });
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
