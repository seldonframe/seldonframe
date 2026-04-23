// Runtime types for the durable workflow engine.
//
// Shipped in Scope 3 Step 2c PR 2 per tasks/step-2c-mid-flow-events-
// audit.md §4.2 + §8.2. Runtime state storage lives in Postgres
// (workflow_runs + workflow_waits + workflow_event_log, shipped in
// PR 1 M3); this file defines the in-memory shapes the engine passes
// around while advancing a run.
//
// Design:
//   - Every dispatcher returns a `NextAction` value describing what
//     the engine should do next. No dispatcher mutates DB state
//     directly; the engine applies the NextAction transactionally.
//   - `RuntimeContext` bundles the storage, tool invoker, and event
//     registry so dispatchers stay pure functions of (run, step,
//     context) → NextAction.
//   - ToolInvoker + RuntimeStorage are interfaces so tests can inject
//     in-memory fakes without a real Postgres + HTTP stack.
//
// Containment (per the 2b.2 precedent + audit §5):
//   - Zero imports from lib/agents/types.ts — the runtime is downstream
//     of those types, not a peer.
//   - Zero changes to SeldonEvent or any shared primitive (G-6 keeps
//     synthetic workflow events log-only for v1).

import type { AgentSpec, Step } from "../agents/validator";

// ---------------------------------------------------------------------
// NextAction — what a dispatcher asks the engine to do next
// ---------------------------------------------------------------------

export type NextAction =
  /** Move to the step with this id. null = run completes. */
  | { kind: "advance"; next: string | null; capture?: { name: string; value: unknown } }
  /** Pause until an event matches, or the timeout fires. */
  | { kind: "pause_event"; eventType: string; matchPredicate: unknown | null; timeoutAt: Date; onResumeNext: string | null; onResumeCapture: string | null; onTimeoutNext: string | null }
  /** Pause for a duration (no event matching). */
  | { kind: "pause_timer"; timeoutAt: Date; nextAfter: string | null }
  /** Terminal failure — mark run failed with this reason. */
  | { kind: "fail"; reason: string };

// ---------------------------------------------------------------------
// RuntimeStorage — abstraction over the 3 workflow tables.
//
// Production impl wraps Drizzle + the `db` singleton (see
// storage-drizzle.ts). Test impl uses in-memory maps
// (tests/unit/workflow/storage-memory.ts).
// ---------------------------------------------------------------------

export type RunStatus = "running" | "waiting" | "completed" | "failed" | "cancelled";

export type StoredRun = {
  id: string;
  orgId: string;
  archetypeId: string;
  specSnapshot: AgentSpec;
  triggerEventId: string | null;
  triggerPayload: Record<string, unknown>;
  status: RunStatus;
  currentStepId: string | null;
  captureScope: Record<string, unknown>;
  variableScope: Record<string, unknown>;
  failureCount: Record<string, number>;
  createdAt: Date;
  updatedAt: Date;
};

export type StoredWait = {
  id: string;
  runId: string;
  stepId: string;
  eventType: string;
  matchPredicate: Record<string, unknown> | null;
  timeoutAt: Date;
  resumedAt: Date | null;
  resumedBy: string | null;
  resumedReason: string | null;
  createdAt: Date;
};

export type NewRunInput = {
  orgId: string;
  archetypeId: string;
  specSnapshot: AgentSpec;
  triggerEventId: string | null;
  triggerPayload: Record<string, unknown>;
  currentStepId: string;
  variableScope: Record<string, unknown>;
};

export type NewWaitInput = {
  runId: string;
  stepId: string;
  eventType: string;
  matchPredicate: Record<string, unknown> | null;
  timeoutAt: Date;
};

export type EventLogInput = {
  orgId: string;
  eventType: string;
  payload: Record<string, unknown>;
};

// 2c PR 3: step trace row. One per dispatcher call. Surfaces in
// the admin drawer at /agents/runs/[runId].
export type StepResultInput = {
  runId: string;
  stepId: string;
  stepType: string;
  outcome: "advanced" | "paused" | "failed";
  captureValue: Record<string, unknown> | null;
  errorMessage: string | null;
  durationMs: number;
};

export type StoredStepResult = {
  id: string;
  runId: string;
  stepId: string;
  stepType: string;
  outcome: string;
  captureValue: Record<string, unknown> | null;
  errorMessage: string | null;
  durationMs: number;
  createdAt: Date;
};

export interface RuntimeStorage {
  /** Insert a run and return its id. */
  createRun(input: NewRunInput): Promise<string>;

  /** Fetch by id. Null if not found. */
  getRun(runId: string): Promise<StoredRun | null>;

  /** Patch the run. Updates `updatedAt` implicitly. */
  updateRun(
    runId: string,
    patch: Partial<Pick<StoredRun, "status" | "currentStepId" | "captureScope" | "failureCount">>,
  ): Promise<void>;

  /** Insert a wait, return its id. */
  createWait(input: NewWaitInput): Promise<string>;

  /** Fetch unresolved waits for an org + event type. */
  findUnresolvedWaitsForEvent(orgId: string, eventType: string): Promise<StoredWait[]>;

  /** Fetch unresolved waits whose timeoutAt <= now(). Bounded by `limit`. */
  findDueWaits(now: Date, limit: number): Promise<StoredWait[]>;

  /**
   * Compare-and-swap: mark the wait resumed. Returns `true` if this
   * call claimed it, `false` if someone already claimed it. Drives
   * the at-most-once advancement in §4.7.
   */
  claimWait(
    waitId: string,
    reason: "event_match" | "timeout" | "manual" | "cancelled",
    resumedBy: string | null,
  ): Promise<boolean>;

  /** Append to the event log. Returns the inserted id. */
  appendEventLog(input: EventLogInput): Promise<string>;

  /** 2c PR 3: append a step-result row for admin observability. */
  appendStepResult(input: StepResultInput): Promise<string>;

  /** 2c PR 3: list step results for a run, newest first. */
  listStepResults(runId: string): Promise<StoredStepResult[]>;
}

// ---------------------------------------------------------------------
// ToolInvoker — how the engine actually calls an MCP tool
//
// PR 2 ships with a "not-implemented" default invoker. The real
// invoker (HTTP to /api/v1/*) is PR 3 or a follow-up slice scope.
// Keeping the runtime transport-agnostic means tests (which pass a
// mock invoker) drive the same code path as production.
// ---------------------------------------------------------------------

import type { SoulStore } from "./state-access/soul-store";

export type ToolInvoker = (toolName: string, args: Record<string, unknown>) => Promise<unknown>;

export const notImplementedToolInvoker: ToolInvoker = async (toolName) => {
  throw new Error(`ToolInvoker not configured — tool "${toolName}" cannot be invoked. PR 2 ships the runtime; HTTP/local tool transport is a follow-up slice.`);
};

// ---------------------------------------------------------------------
// RuntimeContext — bundle passed into every dispatcher
// ---------------------------------------------------------------------

export type RuntimeContext = {
  storage: RuntimeStorage;
  invokeTool: ToolInvoker;
  /** Current time — overridable in tests for deterministic timeouts. */
  now: () => Date;
  /**
   * SoulStore — workspace-scoped state read/write. Consumed by the
   * SLICE 3 state-access dispatchers (read_state, write_state).
   * Existing dispatchers ignore it. Optional for backward-compat
   * with runtime contexts constructed before SLICE 3.
   */
  soulStore?: SoulStore;
};

// ---------------------------------------------------------------------
// Sentinel eventType values
// ---------------------------------------------------------------------

/** workflow_waits rows for pure-timer `wait` steps use this eventType. */
export const TIMER_EVENT_TYPE = "__timer__" as const;

// ---------------------------------------------------------------------
// Runtime errors
// ---------------------------------------------------------------------

export class RuntimeError extends Error {
  constructor(message: string, public readonly runId: string | null = null) {
    super(message);
    this.name = "RuntimeError";
  }
}

// Helper — locate a step by id within a spec.
export function findStep(spec: AgentSpec, stepId: string): Step | null {
  return spec.steps.find((s) => s.id === stepId) ?? null;
}
