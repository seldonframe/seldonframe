// POST /api/v1/workflow-runs/[runId]/resume — manually resume a
// waiting run. Shipped in 2c PR 3 M2 per audit §6.2.
//
// Behavior:
//   - Auth-gated: caller must belong to the run's orgId (reuses
//     getOrgId from existing OpenClaw pattern). No new scope guard.
//   - Finds the pending wait for this run (there is always exactly
//     zero or one — the current step, if paused on await_event or
//     a wait timer).
//   - Claims it via CAS (runtime.resumeWait with reason="manual").
//   - resumeWait advances the run along on_resume.next with no
//     event payload captured (manual resume has no payload to
//     bind; on_resume.capture is effectively skipped).
//   - Emits workflow.manually_resumed to the event log (log-only
//     per G-6).
//   - Returns { ok, resumedWaitId, nextStepId } or an error shape.
//
// Endpoint is a no-op (returns ok:false, reason:"no_pending_wait")
// if the run has no pending wait — covers the race where the cron
// tick resolved it between dashboard-load and button-click.

import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { workflowRuns, workflowWaits } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { resumeWait } from "@/lib/workflow/runtime";
import { DrizzleRuntimeStorage } from "@/lib/workflow/storage-drizzle";
import { notImplementedToolInvoker, type RuntimeContext } from "@/lib/workflow/types";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;

  const orgId = await getOrgId();
  if (!orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. Load the run, confirm it belongs to the caller's org.
  const [run] = await db
    .select({ id: workflowRuns.id, orgId: workflowRuns.orgId, status: workflowRuns.status })
    .from(workflowRuns)
    .where(eq(workflowRuns.id, runId))
    .limit(1);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  if (run.orgId !== orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (run.status !== "waiting") {
    return NextResponse.json(
      { ok: false, reason: "run is not waiting", status: run.status },
      { status: 409 },
    );
  }

  // 2. Find the single pending wait for this run.
  const [waitRow] = await db
    .select()
    .from(workflowWaits)
    .where(and(eq(workflowWaits.runId, runId), isNull(workflowWaits.resumedAt)))
    .limit(1);
  if (!waitRow) {
    return NextResponse.json(
      { ok: false, reason: "no_pending_wait" },
      { status: 409 },
    );
  }

  // 3. Resume via runtime. Manual resume has no payload; on_resume.
  // capture is skipped inside resumeWait when payload is null.
  const storage = new DrizzleRuntimeStorage(db);
  const context: RuntimeContext = {
    storage,
    invokeTool: notImplementedToolInvoker,
    now: () => new Date(),
  };
  const result = await resumeWait(
    context,
    {
      id: waitRow.id,
      runId: waitRow.runId,
      stepId: waitRow.stepId,
      eventType: waitRow.eventType,
      matchPredicate: waitRow.matchPredicate,
      timeoutAt: waitRow.timeoutAt,
      resumedAt: waitRow.resumedAt,
      resumedBy: waitRow.resumedBy,
      resumedReason: waitRow.resumedReason,
      createdAt: waitRow.createdAt,
    },
    "manual",
    null,
    null,
  );

  if (!result.resumed) {
    return NextResponse.json(
      { ok: false, reason: "wait already claimed" },
      { status: 409 },
    );
  }

  // 4. Log-only event for observability (G-6: not added to SeldonEvent).
  await storage.appendEventLog({
    orgId,
    eventType: "workflow.manually_resumed",
    payload: { runId, waitId: waitRow.id, stepId: waitRow.stepId },
  });

  return NextResponse.json({ ok: true, runId, resumedWaitId: waitRow.id });
}
