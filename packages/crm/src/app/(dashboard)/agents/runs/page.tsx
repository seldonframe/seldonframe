// Workflow runs admin page — /agents/runs
//
// Shipped in 2c PR 3 M3 per audit §6.1. Server component: loads the
// workspace's runs + associated waits + step traces, hands off to a
// client component for state (drawer open/close, polling refresh,
// resume/cancel actions).
//
// Scope guard: getOrgId() handles both builder and end-client mode.
// Non-builders see nothing (empty list). Rich role-gating lands
// when OpenClaw exposes a "builder admin" predicate; for now, any
// org-member seeing the page gets the full run list for their org.

import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/db";
import {
  workflowRuns,
  workflowWaits,
  workflowStepResults,
} from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { RunsClient } from "./runs-client";
import { SubscriptionsSection } from "./subscriptions-section";

export const dynamic = "force-dynamic";

export default async function WorkflowRunsPage() {
  const orgId = await getOrgId();
  if (!orgId) redirect("/login");

  // Newest runs first, cap at 50 per §6.4 — filters/pagination
  // deferred until usage demands it.
  const runs = await db
    .select()
    .from(workflowRuns)
    .where(eq(workflowRuns.orgId, orgId))
    .orderBy(desc(workflowRuns.createdAt))
    .limit(50);

  const runIds = runs.map((r) => r.id);

  const waits = runIds.length
    ? await db.select().from(workflowWaits).where(
        // drizzle doesn't have a natural `inArray` without pulling an import;
        // small list so iterate.
        eq(workflowWaits.runId, runIds[0]),
      )
    : [];
  // For lists >1, fan out per-run (small N; fine for v1).
  const allWaits = runIds.length > 1
    ? (
        await Promise.all(
          runIds.map((id) =>
            db.select().from(workflowWaits).where(eq(workflowWaits.runId, id)),
          ),
        )
      ).flat()
    : waits;

  const allResults = runIds.length
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

  return (
    <div className="p-6 space-y-4">
      <header>
        <h1 className="text-lg sm:text-[22px] font-semibold leading-relaxed">Agent runs</h1>
        <p className="text-sm text-muted-foreground">
          In-flight workflow executions. Click a row to see the step trace. Waiting runs show the event they&apos;re listening for and how long until timeout.
        </p>
      </header>
      <RunsClient
        initialRuns={runs.map(serializeRun)}
        initialWaits={allWaits.map(serializeWait)}
        initialStepResults={allResults.map(serializeStepResult)}
      />
      <SubscriptionsSection orgId={orgId} />
    </div>
  );
}

// Date columns round-trip as ISO strings across the server→client
// boundary so the client component doesn't receive Date objects
// (Next.js serializes but React's hydration is happier with primitives).

type RunRow = typeof workflowRuns.$inferSelect;
type WaitRow = typeof workflowWaits.$inferSelect;
type StepRow = typeof workflowStepResults.$inferSelect;

function serializeRun(row: RunRow) {
  return {
    id: row.id,
    archetypeId: row.archetypeId,
    status: row.status as "running" | "waiting" | "completed" | "failed" | "cancelled",
    currentStepId: row.currentStepId,
    triggerEventId: row.triggerEventId,
    triggerPayload: row.triggerPayload,
    captureScope: row.captureScope,
    variableScope: row.variableScope,
    specSnapshot: row.specSnapshot as { name: string; steps: Array<{ id: string; type: string }> },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeWait(row: WaitRow) {
  return {
    id: row.id,
    runId: row.runId,
    stepId: row.stepId,
    eventType: row.eventType,
    matchPredicate: row.matchPredicate,
    timeoutAt: row.timeoutAt.toISOString(),
    resumedAt: row.resumedAt ? row.resumedAt.toISOString() : null,
    resumedReason: row.resumedReason,
  };
}

function serializeStepResult(row: StepRow) {
  return {
    id: row.id,
    runId: row.runId,
    stepId: row.stepId,
    stepType: row.stepType,
    outcome: row.outcome,
    captureValue: row.captureValue,
    errorMessage: row.errorMessage,
    durationMs: row.durationMs,
    createdAt: row.createdAt.toISOString(),
  };
}

export type SerializedRun = ReturnType<typeof serializeRun>;
export type SerializedWait = ReturnType<typeof serializeWait>;
export type SerializedStepResult = ReturnType<typeof serializeStepResult>;
