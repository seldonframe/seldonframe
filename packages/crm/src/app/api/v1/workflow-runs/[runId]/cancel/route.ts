// POST /api/v1/workflow-runs/[runId]/cancel — cancel a run.
// Shipped in 2c PR 3 M2 per audit §6.2.
//
// Behavior:
//   - Auth-gated: caller must belong to the run's orgId.
//   - Sets run status to "cancelled" and clears currentStepId.
//   - Claims any pending wait with reason="cancelled" (CAS) so the
//     cron tick doesn't race with us on timeout resolution.
//   - Emits workflow.cancelled to the event log (log-only per G-6).
//   - Returns { ok, runId } or an error shape.
//
// Cancelling a terminal run (completed/failed/already cancelled)
// is a 409 no-op.

import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { workflowRuns, workflowWaits } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { DrizzleRuntimeStorage } from "@/lib/workflow/storage-drizzle";

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
  if (run.status !== "running" && run.status !== "waiting") {
    return NextResponse.json(
      { ok: false, reason: "run is not cancellable", status: run.status },
      { status: 409 },
    );
  }

  const storage = new DrizzleRuntimeStorage(db);

  // Clear pending waits first (CAS so cron tick can't race us).
  const pendingWaits = await db
    .select({ id: workflowWaits.id })
    .from(workflowWaits)
    .where(and(eq(workflowWaits.runId, runId), isNull(workflowWaits.resumedAt)));
  for (const w of pendingWaits) {
    await storage.claimWait(w.id, "cancelled", null);
  }

  // Mark run cancelled + clear step pointer.
  await storage.updateRun(runId, { status: "cancelled", currentStepId: null });

  // Log-only observability event (G-6).
  await storage.appendEventLog({
    orgId,
    eventType: "workflow.cancelled",
    payload: { runId, clearedWaits: pendingWaits.length },
  });

  return NextResponse.json({ ok: true, runId, clearedWaits: pendingWaits.length });
}
