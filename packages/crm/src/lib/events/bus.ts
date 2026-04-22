// Event bus — thin wrapper around the in-memory SeldonEventBus plus
// (as of 2c PR 1 M4 / PR 2 M3) persistent side-effects for durable
// workflow resolution.
//
// Design (per 2c audit §4.3 + G-2 approved 2026-04-22):
//   1. In-memory dispatch is unchanged. Existing listeners (Brain v2,
//      test fixtures) continue to receive events.
//   2. When `options.orgId` is provided, the emission ALSO appends a
//      row to `workflow_event_log` (PR 1 M4) and synchronously scans
//      `workflow_waits` for matching waits (PR 2 M3). Matching waits
//      are claimed (CAS) and their runs advance via resumeWait inside
//      the emit-caller's request.
//   3. Log-write + sync-resume are BEST-EFFORT. Failures log but do
//      not throw — the in-memory dispatch has already succeeded and
//      swallowing preserves the caller's control flow. Timeout path
//      (cron tick) retries dropped resumes.
//
// G-2 instrumentation note: the sync-resume path adds latency to the
// emit-caller's request proportional to the number of matching waits
// × the advancement work. For Client Onboarding (low-fan-out) this
// is single-digit ms. At scale, if emit-caller latency grows >50 ms
// average, G-2 needs revisiting (defer to cron tick). See
// instrumentation log line at the bottom of emitSeldonEvent.

import { db } from "@/db";
import { workflowEventLog } from "@/db/schema";
import { getSeldonEventBus, type EventPayload, type EventType } from "@seldonframe/core/events";

import { resumeWait } from "@/lib/workflow/runtime";
import { DrizzleRuntimeStorage } from "@/lib/workflow/storage-drizzle";
import { evaluatePredicate } from "@/lib/workflow/predicate-eval";
import { notImplementedToolInvoker, type RuntimeContext } from "@/lib/workflow/types";

export type EmitOptions = {
  /**
   * Workspace (organization) id this event belongs to. When provided,
   * the emission is persisted to `workflow_event_log` AND synchronously
   * resolves any matching pending waits. When omitted, only the
   * in-memory dispatch runs (pre-2c behavior).
   */
  orgId?: string;
};

export async function emitSeldonEvent<T extends EventType>(
  type: T,
  data: EventPayload<T>,
  options?: EmitOptions,
): Promise<void> {
  const startedAt = Date.now();

  // 1. In-memory dispatch (unchanged). Existing listeners fire here.
  const bus = getSeldonEventBus();
  await bus.emit(type, data);

  if (!options?.orgId) return;

  // 2. Durable persistence to workflow_event_log.
  let eventLogId: string | null = null;
  try {
    const storage = new DrizzleRuntimeStorage(db);
    eventLogId = await storage.appendEventLog({
      orgId: options.orgId,
      eventType: type,
      payload: data as Record<string, unknown>,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[emitSeldonEvent] workflow_event_log insert failed", {
      type,
      orgId: options.orgId,
      error: err instanceof Error ? err.message : String(err),
    });
    // Don't return — the sync-resume scan depends on the event log
    // but is also best-effort. Even without a log row, cron-tick
    // timeout handling still works (waits will time out instead of
    // resolving on this event). Log the failure and move on.
  }

  // 3. Synchronous wake-up scan (G-2 default).
  try {
    const storage = new DrizzleRuntimeStorage(db);
    const context: RuntimeContext = {
      storage,
      invokeTool: notImplementedToolInvoker,
      now: () => new Date(),
    };
    await resumePendingWaitsForEventInContext(
      context,
      options.orgId,
      type,
      data as Record<string, unknown>,
      eventLogId,
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[emitSeldonEvent] sync resume scan failed", {
      type,
      orgId: options.orgId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const elapsed = Date.now() - startedAt;
  // Instrumentation (G-2): if emit-caller latency grows, this is the
  // signal. At >50 ms average, G-2 needs revisiting (defer resume to
  // cron tick). Current Client Onboarding fan-out is single-digit ms;
  // scaling is the concern, not single-run latency.
  if (elapsed > 50) {
    // eslint-disable-next-line no-console
    console.warn("[emitSeldonEvent] elapsed > 50ms", { type, elapsed, orgId: options.orgId });
  }
}

/**
 * Testable core of the sync-resume scan. Takes an explicit
 * RuntimeContext so tests can inject in-memory storage without
 * booting Postgres.
 */
export async function resumePendingWaitsForEventInContext(
  context: RuntimeContext,
  orgId: string,
  eventType: string,
  payload: Record<string, unknown>,
  eventLogId: string | null,
): Promise<{ candidates: number; resumed: number }> {
  const candidates = await context.storage.findUnresolvedWaitsForEvent(orgId, eventType);
  let resumed = 0;
  for (const wait of candidates) {
    const matches = evaluatePredicate(
      wait.matchPredicate as Parameters<typeof evaluatePredicate>[0],
      payload,
    );
    if (!matches) continue;
    const result = await resumeWait(context, wait, "event_match", eventLogId, payload);
    if (result.resumed) resumed += 1;
  }
  return { candidates: candidates.length, resumed };
}
