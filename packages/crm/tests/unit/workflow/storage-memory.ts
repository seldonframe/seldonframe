// In-memory RuntimeStorage for tests.
//
// Same interface as DrizzleRuntimeStorage; unit + integration tests
// run against this without touching Postgres. Keeps the test:unit
// pipeline DB-free while still exercising the full state-machine
// code paths.
//
// Not exported from the src tree on purpose — this is test-only.

import type {
  EventLogInput,
  NewRunInput,
  NewWaitInput,
  RuntimeStorage,
  StoredRun,
  StoredWait,
} from "../../../src/lib/workflow/types";

export type StoredEventLog = {
  id: string;
  orgId: string;
  eventType: string;
  payload: Record<string, unknown>;
  emittedAt: Date;
};

let uuidCounter = 0;
function nextId(prefix: string): string {
  uuidCounter += 1;
  return `${prefix}_${String(uuidCounter).padStart(8, "0")}`;
}

export class InMemoryRuntimeStorage implements RuntimeStorage {
  readonly runs = new Map<string, StoredRun>();
  readonly waits = new Map<string, StoredWait>();
  readonly eventLog: StoredEventLog[] = [];

  async createRun(input: NewRunInput): Promise<string> {
    const id = nextId("run");
    const now = new Date();
    this.runs.set(id, {
      id,
      orgId: input.orgId,
      archetypeId: input.archetypeId,
      specSnapshot: input.specSnapshot,
      triggerEventId: input.triggerEventId,
      triggerPayload: input.triggerPayload,
      status: "running",
      currentStepId: input.currentStepId,
      captureScope: {},
      variableScope: input.variableScope,
      failureCount: {},
      createdAt: now,
      updatedAt: now,
    });
    return id;
  }

  async getRun(runId: string): Promise<StoredRun | null> {
    const row = this.runs.get(runId);
    if (!row) return null;
    // Return a clone so callers mutating the returned row don't
    // corrupt the in-memory store.
    return JSON.parse(JSON.stringify({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }), (key, value) => {
      if (key === "createdAt" || key === "updatedAt") return new Date(value as string);
      return value;
    });
  }

  async updateRun(
    runId: string,
    patch: Partial<Pick<StoredRun, "status" | "currentStepId" | "captureScope" | "failureCount">>,
  ): Promise<void> {
    const row = this.runs.get(runId);
    if (!row) throw new Error(`updateRun: run ${runId} not found`);
    const next: StoredRun = { ...row, updatedAt: new Date() };
    if (patch.status !== undefined) next.status = patch.status;
    if (patch.currentStepId !== undefined) next.currentStepId = patch.currentStepId;
    if (patch.captureScope !== undefined) next.captureScope = patch.captureScope;
    if (patch.failureCount !== undefined) next.failureCount = patch.failureCount;
    this.runs.set(runId, next);
  }

  async createWait(input: NewWaitInput): Promise<string> {
    const id = nextId("wait");
    const now = new Date();
    this.waits.set(id, {
      id,
      runId: input.runId,
      stepId: input.stepId,
      eventType: input.eventType,
      matchPredicate: input.matchPredicate,
      timeoutAt: input.timeoutAt,
      resumedAt: null,
      resumedBy: null,
      resumedReason: null,
      createdAt: now,
    });
    return id;
  }

  async findUnresolvedWaitsForEvent(orgId: string, eventType: string): Promise<StoredWait[]> {
    const out: StoredWait[] = [];
    for (const w of this.waits.values()) {
      if (w.eventType !== eventType || w.resumedAt !== null) continue;
      const run = this.runs.get(w.runId);
      if (run?.orgId === orgId) out.push({ ...w });
    }
    return out;
  }

  async findDueWaits(now: Date, limit: number): Promise<StoredWait[]> {
    const out: StoredWait[] = [];
    for (const w of this.waits.values()) {
      if (w.resumedAt !== null) continue;
      if (w.timeoutAt.getTime() <= now.getTime()) out.push({ ...w });
      if (out.length >= limit) break;
    }
    return out;
  }

  async claimWait(
    waitId: string,
    reason: "event_match" | "timeout" | "manual" | "cancelled",
    resumedBy: string | null,
  ): Promise<boolean> {
    const row = this.waits.get(waitId);
    if (!row || row.resumedAt !== null) return false;
    this.waits.set(waitId, {
      ...row,
      resumedAt: new Date(),
      resumedReason: reason,
      resumedBy,
    });
    return true;
  }

  async appendEventLog(input: EventLogInput): Promise<string> {
    const id = nextId("evt");
    this.eventLog.push({
      id,
      orgId: input.orgId,
      eventType: input.eventType,
      payload: input.payload,
      emittedAt: new Date(),
    });
    return id;
  }
}
