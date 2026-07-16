// P2.1-T1 — PRODUCTION deps for runDueScheduledAgents (the schedule cron).
//
// runDueScheduledAgents (./schedule-agents.ts) is the pure DI'd orchestrator;
// THIS file supplies the real, DB-backed deps. Kept separate so the orchestration
// stays unit-testable with zero infrastructure (same split as
// run-event-agent.ts ↔ run-event-agent-deps.ts).
//
// The three seams:
//   • list      → listScheduledAgentDeployments() (store.ts) — the ACTIVE
//     schedule-trigger deployments, each with org/cron/tz/lastFiredAt;
//   • runEventAgent → runEventAgent(event, buildRunEventAgentDeps(event.orgId)) —
//     the SAME orchestrator the event-agent path uses, grounded in the agent's
//     org; it already handles action-only posters + the L1/L2/L3 gates, so the
//     cron never sends/posts directly (money-safe);
//   • markFired → markDeploymentScheduleFired() (store.ts) — stamp lastFiredAt
//     into the deployment's customization jsonb (no migration).
//
// Plain lib module (NOT "use server"); only imported by the cron route, which is
// server-only — so a top-level `db`-free design via the store's lazy imports is
// preserved (this file imports only pure builders + the store helpers).

import { runEventAgent, type FiredEvent } from "@/lib/agents/triggers/run-event-agent";
import { buildRunEventAgentDeps } from "@/lib/agents/triggers/run-event-agent-deps";
import {
  listScheduledAgentDeployments,
  markDeploymentScheduleFired,
} from "@/lib/deployments/store";
import { writeRunReceipt } from "@/lib/agent-receipts/write";
import type { RunDueScheduledAgentsDeps } from "@/lib/agents/triggers/schedule-agents";

/** Build the production deps for the schedule cron. The 15-min `windowMinutes`
 *  matches the cron cadence in vercel.json (so a fire is "due" once per quarter
 *  hour and the idempotency guard skips a re-fire inside the same window). */
export function buildRunDueScheduledAgentsDeps(): RunDueScheduledAgentsDeps {
  return {
    list: listScheduledAgentDeployments,
    runEventAgent: (event: FiredEvent) =>
      // Build the per-org event-agent deps fresh (loop-memory store keyed to the
      // agent's org), exactly like the listener + the scheduled-send cron do.
      runEventAgent(event, buildRunEventAgentDeps(event.orgId)),
    markFired: markDeploymentScheduleFired,
    windowMinutes: 15,
    // Agent receipts slice (Task 2b) — record every scheduled fire (ok/
    // error) so a scheduled agent's runs are queryable, not just its sends.
    // writeRunReceipt is itself fail-soft (never throws).
    writeReceipt: ({ orgId, deploymentId, status, sourceRef, summary }) =>
      writeRunReceipt({
        orgId,
        deploymentId,
        triggerKind: "schedule",
        sourceRef,
        status,
        summary,
      }),
  };
}
