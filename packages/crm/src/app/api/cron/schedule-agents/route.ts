// /api/cron/schedule-agents — polling worker that FIRES authored *scheduled*
// agents on their cron (P2.1-T1).
//
// 2026-06-27. Vercel cron hits this route every 15 minutes (configured in
// packages/crm/vercel.json). Each invocation:
//   1. Enumerates the ACTIVE deployments whose template's blueprint trigger is a
//      schedule (listScheduledAgentDeployments).
//   2. For each one whose cron is DUE in the 15-min window AND that hasn't already
//      fired this window (the per-deployment lastFiredAt guard) → REPLAYS
//      runEventAgent with the agent's per-org deps, then stamps lastFiredAt.
//   3. Fail-soft per deployment (one error doesn't stop the rest).
//
// MONEY-SAFE: this cron only DECIDES which scheduled agents to FIRE. runEventAgent's
// own gates (guardrails / verify / the per-agent connection check for a live post)
// decide whether anything actually goes out — the cron never sends/posts directly.
//
// Authorized via CRON_SECRET (Bearer token or X-Cron-Secret header), the same
// pattern as /api/cron/event-agent-scheduled-sends + /api/cron/workflow-tick.

import { NextResponse } from "next/server";
import { runDueScheduledAgents } from "@/lib/agents/triggers/schedule-agents";
import { buildRunDueScheduledAgentsDeps } from "@/lib/agents/triggers/schedule-agents-deps";

export const runtime = "nodejs";

function isAuthorized(request: Request) {
  const configuredSecret = process.env.CRON_SECRET;
  // No secret configured → allow (dev / preview environments). Same posture as
  // event-agent-scheduled-sends / outbound-scheduled-sends / workflow-tick.
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
    const stats = await runDueScheduledAgents(
      Date.now(),
      buildRunDueScheduledAgentsDeps(),
    );
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
