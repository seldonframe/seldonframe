// Drizzle-backed production implementation of RuntimeStorage.
//
// Shipped in 2c PR 2 per audit §4.1 + §8.2. Wraps the three tables
// (workflow_runs / workflow_waits / workflow_event_log) committed in
// PR 1 M3. Test code uses the in-memory impl in
// tests/unit/workflow/storage-memory.ts instead — same interface,
// no DB needed.
//
// Compare-and-swap discipline (§4.7): `claimWait` is the sole path
// that transitions a wait from unresolved to resolved. The UPDATE's
// `WHERE ... AND resumed_at IS NULL` clause is the atomic gate.

import { and, eq, isNull, lte } from "drizzle-orm";

import type { DbClient } from "@/db";
import { workflowRuns, workflowWaits, workflowEventLog } from "@/db/schema";
import type { AgentSpec } from "../agents/validator";
import type {
  EventLogInput,
  NewRunInput,
  NewWaitInput,
  RuntimeStorage,
  StoredRun,
  StoredWait,
} from "./types";

export class DrizzleRuntimeStorage implements RuntimeStorage {
  constructor(private readonly db: DbClient) {}

  async createRun(input: NewRunInput): Promise<string> {
    const [row] = await this.db
      .insert(workflowRuns)
      .values({
        orgId: input.orgId,
        archetypeId: input.archetypeId,
        specSnapshot: input.specSnapshot as unknown as Record<string, unknown>,
        triggerEventId: input.triggerEventId,
        triggerPayload: input.triggerPayload,
        status: "running",
        currentStepId: input.currentStepId,
        captureScope: {},
        variableScope: input.variableScope,
        failureCount: {},
      })
      .returning({ id: workflowRuns.id });
    return row.id;
  }

  async getRun(runId: string): Promise<StoredRun | null> {
    const rows = await this.db.select().from(workflowRuns).where(eq(workflowRuns.id, runId)).limit(1);
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      id: row.id,
      orgId: row.orgId,
      archetypeId: row.archetypeId,
      specSnapshot: row.specSnapshot as unknown as AgentSpec,
      triggerEventId: row.triggerEventId,
      triggerPayload: row.triggerPayload,
      status: row.status as StoredRun["status"],
      currentStepId: row.currentStepId,
      captureScope: row.captureScope,
      variableScope: row.variableScope,
      failureCount: row.failureCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async updateRun(
    runId: string,
    patch: Partial<Pick<StoredRun, "status" | "currentStepId" | "captureScope" | "failureCount">>,
  ): Promise<void> {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.status !== undefined) set.status = patch.status;
    if (patch.currentStepId !== undefined) set.currentStepId = patch.currentStepId;
    if (patch.captureScope !== undefined) set.captureScope = patch.captureScope;
    if (patch.failureCount !== undefined) set.failureCount = patch.failureCount;
    await this.db.update(workflowRuns).set(set).where(eq(workflowRuns.id, runId));
  }

  async createWait(input: NewWaitInput): Promise<string> {
    const [row] = await this.db
      .insert(workflowWaits)
      .values({
        runId: input.runId,
        stepId: input.stepId,
        eventType: input.eventType,
        matchPredicate: input.matchPredicate,
        timeoutAt: input.timeoutAt,
      })
      .returning({ id: workflowWaits.id });
    return row.id;
  }

  async findUnresolvedWaitsForEvent(orgId: string, eventType: string): Promise<StoredWait[]> {
    // orgId filter happens via the run JOIN since workflow_waits
    // doesn't carry orgId directly (it's derivable through runId →
    // workflow_runs.orgId). For PR 2 the simplest shape is a 2-query
    // approach: find waits by eventType + unresolved, then filter by
    // run orgId. A single SQL join can replace this if the scan
    // becomes hot in practice; for now the partial index
    // (workflow_waits_event_unresolved_idx) keeps the first query
    // tight.
    const waitRows = await this.db
      .select()
      .from(workflowWaits)
      .where(and(eq(workflowWaits.eventType, eventType), isNull(workflowWaits.resumedAt)));

    if (waitRows.length === 0) return [];

    const runIds = Array.from(new Set(waitRows.map((w) => w.runId)));
    const runsInOrg = new Set<string>();
    for (const runId of runIds) {
      const run = await this.getRun(runId);
      if (run && run.orgId === orgId) runsInOrg.add(runId);
    }

    return waitRows
      .filter((w) => runsInOrg.has(w.runId))
      .map((row) => ({
        id: row.id,
        runId: row.runId,
        stepId: row.stepId,
        eventType: row.eventType,
        matchPredicate: row.matchPredicate,
        timeoutAt: row.timeoutAt,
        resumedAt: row.resumedAt,
        resumedBy: row.resumedBy,
        resumedReason: row.resumedReason,
        createdAt: row.createdAt,
      }));
  }

  async findDueWaits(now: Date, limit: number): Promise<StoredWait[]> {
    const rows = await this.db
      .select()
      .from(workflowWaits)
      .where(and(isNull(workflowWaits.resumedAt), lte(workflowWaits.timeoutAt, now)))
      .limit(limit);
    return rows.map((row) => ({
      id: row.id,
      runId: row.runId,
      stepId: row.stepId,
      eventType: row.eventType,
      matchPredicate: row.matchPredicate,
      timeoutAt: row.timeoutAt,
      resumedAt: row.resumedAt,
      resumedBy: row.resumedBy,
      resumedReason: row.resumedReason,
      createdAt: row.createdAt,
    }));
  }

  async claimWait(
    waitId: string,
    reason: "event_match" | "timeout" | "manual" | "cancelled",
    resumedBy: string | null,
  ): Promise<boolean> {
    // CAS via `WHERE ... AND resumed_at IS NULL`. If another tick or
    // emit-path has already claimed the wait, this UPDATE matches
    // zero rows and the caller learns the claim was lost.
    const result = await this.db
      .update(workflowWaits)
      .set({ resumedAt: new Date(), resumedReason: reason, resumedBy })
      .where(and(eq(workflowWaits.id, waitId), isNull(workflowWaits.resumedAt)))
      .returning({ id: workflowWaits.id });
    return result.length > 0;
  }

  async appendEventLog(input: EventLogInput): Promise<string> {
    const [row] = await this.db
      .insert(workflowEventLog)
      .values({
        orgId: input.orgId,
        eventType: input.eventType,
        payload: input.payload,
      })
      .returning({ id: workflowEventLog.id });
    return row.id;
  }
}
