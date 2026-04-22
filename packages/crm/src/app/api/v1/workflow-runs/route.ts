// GET /api/v1/workflow-runs — JSON snapshot of the workspace's
// workflow runs + waits + step results. Consumed by the /agents/runs
// admin page for polling refresh.
//
// Shipped in 2c PR 3 M3. Matches the server-page shape exactly so
// the client can drop the response straight into state.

import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  workflowRuns,
  workflowWaits,
  workflowStepResults,
} from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";

export const runtime = "nodejs";

export async function GET() {
  const orgId = await getOrgId();
  if (!orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const runs = await db
    .select()
    .from(workflowRuns)
    .where(eq(workflowRuns.orgId, orgId))
    .orderBy(desc(workflowRuns.createdAt))
    .limit(50);

  const runIds = runs.map((r) => r.id);

  const waits = runIds.length
    ? (
        await Promise.all(
          runIds.map((id) =>
            db.select().from(workflowWaits).where(eq(workflowWaits.runId, id)),
          ),
        )
      ).flat()
    : [];

  const stepResults = runIds.length
    ? (
        await Promise.all(
          runIds.map((id) =>
            db
              .select()
              .from(workflowStepResults)
              .where(eq(workflowStepResults.runId, id))
              .orderBy(desc(workflowStepResults.createdAt)),
          ),
        )
      ).flat()
    : [];

  return NextResponse.json({
    runs: runs.map((row) => ({
      id: row.id,
      archetypeId: row.archetypeId,
      status: row.status,
      currentStepId: row.currentStepId,
      triggerEventId: row.triggerEventId,
      triggerPayload: row.triggerPayload,
      captureScope: row.captureScope,
      variableScope: row.variableScope,
      specSnapshot: row.specSnapshot,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
    waits: waits.map((row) => ({
      id: row.id,
      runId: row.runId,
      stepId: row.stepId,
      eventType: row.eventType,
      matchPredicate: row.matchPredicate,
      timeoutAt: row.timeoutAt.toISOString(),
      resumedAt: row.resumedAt ? row.resumedAt.toISOString() : null,
      resumedReason: row.resumedReason,
    })),
    stepResults: stepResults.map((row) => ({
      id: row.id,
      runId: row.runId,
      stepId: row.stepId,
      stepType: row.stepType,
      outcome: row.outcome,
      captureValue: row.captureValue,
      errorMessage: row.errorMessage,
      durationMs: row.durationMs,
      createdAt: row.createdAt.toISOString(),
    })),
  });
}
