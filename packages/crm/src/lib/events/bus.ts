// Event bus — thin wrapper around the in-memory SeldonEventBus plus
// (as of 2c PR 1 M4) a persistent side-effect that writes each
// emission to `workflow_event_log` for durable await_event resolution.
//
// Design (per 2c audit §4.3):
//   - The in-memory dispatch is unchanged. Existing listeners
//     (Brain v2, test fixtures) continue to receive events via the
//     InMemorySeldonEventBus.on() path.
//   - When `options.orgId` is provided, the emission ALSO appends a
//     row to `workflow_event_log`. This is the substrate change that
//     makes durable wait resolution possible — today's in-memory bus
//     dispatches-and-forgets, so events fired while no listener is
//     live disappear.
//   - Call sites that don't yet pass `orgId` still work. No throw,
//     no error log. The log-write is SKIPPED silently. Full
//     call-site migration to pass orgId ships incrementally with
//     PR 2 (when the runtime needs every emission persisted for wake-
//     up scans to work). For PR 1 M4, new code passes orgId; legacy
//     code remains on the in-memory-only path.
//   - The write is non-transactional w.r.t. the emit-caller's DB work:
//     if the caller started a transaction, this write uses the
//     default `db` connection, not the caller's transaction. G-2
//     (synchronous resume) is a separate concern that will couple
//     emit-time to wait-resolution IN PR 2; the log-write itself is
//     an independent durable artifact.

import { db } from "@/db";
import { workflowEventLog } from "@/db/schema";
import { getSeldonEventBus, type EventPayload, type EventType } from "@seldonframe/core/events";

export type EmitOptions = {
  /**
   * Workspace (organization) id this event belongs to. When provided,
   * the emission is persisted to `workflow_event_log` for durable
   * wait resolution. When omitted, only the in-memory dispatch runs
   * (pre-2c behavior).
   */
  orgId?: string;
};

export async function emitSeldonEvent<T extends EventType>(
  type: T,
  data: EventPayload<T>,
  options?: EmitOptions,
): Promise<void> {
  // 1. In-memory dispatch (unchanged). Existing listeners fire here.
  const bus = getSeldonEventBus();
  await bus.emit(type, data);

  // 2. Durable persistence to workflow_event_log. Only when orgId is
  // provided — call-site migration to pass orgId happens in PR 2 as
  // the runtime needs durability. The log-write is best-effort: a
  // failure here logs but does not re-throw, because the in-memory
  // dispatch has already succeeded and swallowing the error preserves
  // the caller's control flow.
  if (options?.orgId) {
    try {
      await db.insert(workflowEventLog).values({
        orgId: options.orgId,
        eventType: type,
        payload: data as Record<string, unknown>,
      });
    } catch (err) {
      // Keep the error visible in logs without tying runtime behavior
      // to log-write success. PR 2 will tighten this to surface via
      // structured observability.
      // eslint-disable-next-line no-console
      console.error("[emitSeldonEvent] workflow_event_log insert failed", {
        type,
        orgId: options.orgId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
