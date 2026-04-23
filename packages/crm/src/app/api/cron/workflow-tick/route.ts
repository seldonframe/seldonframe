// /api/cron/workflow-tick — polling handler for the workflow runtime.
//
// Shipped in 2c PR 2 M2 per audit §4.4. Runs every 60 s (configured
// in packages/crm/vercel.json) and advances any workflow_waits row
// whose timeout has fired. Event-based resolution happens
// synchronously in bus.ts (M3) so this cron is specifically the
// timeout + recovery path.
//
// Scope for M2:
//   - SELECT due waits (resumedAt IS NULL AND timeoutAt <= now()).
//   - For each: resumeWait(..., reason="timeout"). CAS on claimWait
//     ensures at-most-once advancement even if two ticks overlap
//     (Vercel cron doesn't overlap the same schedule, but a future
//     scheduler might).
//   - Emit a workflow.wait_timed_out synthetic event to the log per
//     §4.4 for observability.
//   - Batch limit of 100 per tick — if there's a backlog, the next
//     tick picks up the rest.
//
// Out of scope for M2:
//   - Event-based wake-up (M3 — bus.ts extension).
//   - Retry semantics for failed advancements (PR 3 hardening).
//   - The actual MCP ToolInvoker (stub here; production wiring in
//     a follow-up slice — today the cron's invoker throws for any
//     mcp_tool_call, which is correct until the HTTP transport lands
//     and no archetype ships yet that would hit this path).

import { NextResponse } from "next/server";

import { db } from "@/db";
import { resumeWait } from "@/lib/workflow/runtime";
import { DrizzleRuntimeStorage } from "@/lib/workflow/storage-drizzle";
import { notImplementedToolInvoker, type RuntimeContext } from "@/lib/workflow/types";
import { runSubscriptionTick } from "@/lib/subscriptions/dispatcher";
import { DrizzleSubscriptionStorage } from "@/lib/subscriptions/storage-drizzle";
import { getSubscriptionHandlerRegistry } from "@/lib/subscriptions/handler-registry";
// Side-effect import: registers block-owned subscription handlers
// into the module-level registry. Route imports run at boot so the
// registry is populated before the first tick.
import "@/lib/subscriptions/register-all-handlers";

export const runtime = "nodejs";

function isAuthorized(request: Request) {
  const configuredSecret = process.env.CRON_SECRET;
  if (!configuredSecret) return true;
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${configuredSecret}`) return true;
  const cronHeader = request.headers.get("x-cron-secret");
  return cronHeader === configuredSecret;
}

const BATCH_LIMIT = 100;

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const storage = new DrizzleRuntimeStorage(db);
  const context: RuntimeContext = {
    storage,
    // PR 2 ships with the not-implemented invoker. A timeout-path run
    // that advances into an mcp_tool_call step will surface
    // kind:"fail" on that dispatcher's try/catch — correct behavior
    // until the real transport lands. Client Onboarding can't reach
    // this path today because the archetype isn't shipped (3b scope).
    invokeTool: notImplementedToolInvoker,
    now: () => new Date(),
  };

  const startedAt = Date.now();
  const dueWaits = await storage.findDueWaits(new Date(), BATCH_LIMIT);

  let claimed = 0;
  let failed = 0;
  for (const wait of dueWaits) {
    try {
      const result = await resumeWait(context, wait, "timeout", null, null);
      if (result.resumed) claimed += 1;
      await storage.appendEventLog({
        orgId: "unknown", // orgId derivable via run lookup; §6 dashboard surface will join
        eventType: "workflow.wait_timed_out",
        payload: {
          waitId: wait.id,
          runId: wait.runId,
          stepId: wait.stepId,
          scheduledEvent: wait.eventType,
        },
      });
    } catch (err) {
      failed += 1;
      // Keep visible for triage; don't fail the tick on a single
      // advancement error. Next tick will retry via the cron schedule
      // if the failure was transient. Persistent failures mark the
      // run as failed per runtime.ts::markRunFailed.
      // eslint-disable-next-line no-console
      console.error("[workflow-tick] resumeWait failed", {
        waitId: wait.id,
        runId: wait.runId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // SLICE 1 PR 2 C3: subscription delivery sweep. Runs AFTER
  // workflow_waits per audit §4.4 ordering note ("subscriptions
  // first, so handler-emitted downstream events have time to
  // propagate before their dependent waits sweep") — actually the
  // reverse: waits first to resume any pending runs; subs second
  // so a handler emitting a downstream event doesn't starve waits
  // in the same tick. Both orderings are valid; locking to
  // waits-first matches the existing runtime's "timeouts before
  // new work" cadence.
  const subStorage = new DrizzleSubscriptionStorage(db);
  let subscriptionResult = { scanned: 0, claimed: 0, delivered: 0, failed: 0, dead: 0 };
  try {
    subscriptionResult = await runSubscriptionTick({
      storage: subStorage,
      handlers: getSubscriptionHandlerRegistry(),
      now: new Date(),
      batchLimit: BATCH_LIMIT,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[workflow-tick] subscription tick failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.json({
    ok: true,
    tickMs: Date.now() - startedAt,
    scanned: dueWaits.length,
    claimed,
    failed,
    subscriptions: subscriptionResult,
  });
}
