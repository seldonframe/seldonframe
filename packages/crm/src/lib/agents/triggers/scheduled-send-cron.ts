// 2026-06-26 — Outbound-UX Bundle F2 (send delay): the cron TICK that drains the
// event-agent scheduled-send queue.
//
// PURE + DI'd (mirrors lib/workflow/approvals/cron-sweep.ts): every side effect
// — the store (list due / mark), the replay runner, and the per-row deps builder
// — is injected, so the loop is unit-tested with in-memory fakes and zero
// Postgres / Twilio / Resend. The route handler
// (/api/cron/event-agent-scheduled-sends) wires the real
// `scheduledEventAgentSendStore`, `runDueScheduledEventAgent`, and
// `buildRunEventAgentDeps`.
//
// Per due 'pending' row:
//   1. Build per-org deps (buildRunEventAgentDeps(row.orgId)).
//   2. Replay: runDueScheduledEventAgent(send, deps). The replay reconstructs the
//      FiredEvent from the frozen row and re-runs runEventAgent so the gates
//      (throttle / guardrails / verify / memory) run NOW, at the real send time —
//      and it STRIPS the enqueue seam so a still-delayed agent can never re-defer.
//   3. On success → mark 'sent'. On throw → mark 'failed' (the store bumps
//      attempts + records last_error). A throw never strands the loop — the next
//      row still runs (error isolation).
//
// Double-fire prevention: `listDue` returns only status='pending' rows and the
// store's `mark` CAS-transitions on status='pending', so a row leaves 'pending'
// at most once even if two ticks race — it can fire at most once.
//
// No "use server", no top-level I/O imports — safe from the route, a test, or the
// runtime.

import type { RunEventAgentDeps } from "./run-event-agent";
import type { ScheduledEventAgentSend } from "./scheduled-event-agent";
import type {
  EventAgentScheduledSend,
} from "@/db/schema/event-agent-scheduled-sends";
import type { ScheduledEventAgentSendStore } from "./scheduled-send-store";

/** What the tick reports back (returned by the route as JSON). */
export type ScheduledSendTickResult = {
  /** Due pending rows loaded this tick. */
  claimed: number;
  /** Rows whose replay completed and were marked 'sent'. */
  sent: number;
  /** Rows whose replay threw and were marked 'failed'. */
  failed: number;
};

/** The dependencies the tick needs — all injected so the loop is pure + tested. */
export type ScheduledSendTickDeps = {
  /** The durable queue store (list due / mark). */
  store: ScheduledEventAgentSendStore;
  /** Replay one due send. Production = runDueScheduledEventAgent. Returns the
   *  run summary (unused here — success is "did not throw"); the runner already
   *  swallows everything internally, but we still guard for safety. */
  runDue: (
    send: ScheduledEventAgentSend,
    deps: RunEventAgentDeps,
  ) => Promise<unknown>;
  /** Build the per-org run deps. Production = buildRunEventAgentDeps. We pass
   *  these to the replay; runDueScheduledEventAgent strips the enqueue seam off
   *  them so the replay can only SEND, never re-defer. */
  buildDeps: (orgId: string) => RunEventAgentDeps;
  /** The instant the tick runs (DI'd for deterministic tests). */
  now?: () => Date;
  /** Max rows to drain per tick. */
  limit?: number;
};

/** Default rows per tick — matches the outbound messaging queue's TICK_BATCH. */
const DEFAULT_LIMIT = 50;

/** Reconstruct the frozen ScheduledEventAgentSend the replay needs from a DB row. */
function toScheduledSend(row: EventAgentScheduledSend): ScheduledEventAgentSend {
  return {
    eventType: row.eventType,
    orgId: row.orgId,
    contactId: row.contactId,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    dueAt: row.dueAt,
    agentSkill: row.agentSkill,
    channel: row.channel === "email" ? "email" : "sms",
  };
}

/**
 * Drain the due event-agent scheduled-send queue. NEVER throws — a per-row
 * failure is isolated (marked 'failed', logged) and the loop continues; the
 * route surfaces the counts.
 */
export async function tickEventAgentScheduledSends(
  deps: ScheduledSendTickDeps,
): Promise<ScheduledSendTickResult> {
  const now = deps.now?.() ?? new Date();
  const limit = deps.limit ?? DEFAULT_LIMIT;

  const due = await deps.store.listDue(now, limit);

  const result: ScheduledSendTickResult = { claimed: due.length, sent: 0, failed: 0 };

  for (const row of due) {
    const send = toScheduledSend(row);
    try {
      const rowDeps = deps.buildDeps(row.orgId);
      // Replay at the real send time. runDueScheduledEventAgent strips the enqueue
      // seam, so a still-delayed agent can't re-defer (no infinite loop).
      await deps.runDue(send, rowDeps);
      // Marked AFTER a successful replay — CAS on status='pending' so the row
      // can't double-fire.
      await deps.store.mark(row.id, { status: "sent" });
      result.sent += 1;
    } catch (err) {
      // Isolate the failure: mark this row 'failed' (store bumps attempts +
      // records the reason) and keep draining the rest.
      result.failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[event-agent-scheduled-sends] replay failed for row ${row.id} (${row.agentSkill}/${row.eventType}):`,
        message,
      );
      try {
        await deps.store.mark(row.id, { status: "failed", error: message });
      } catch (markErr) {
        // A failed mark must not strand the loop. The row stays 'pending' and a
        // later tick retries it — the safe direction (re-fire beats lost send,
        // and the replay's own gates de-dupe a re-sent review via loop-memory).
        console.warn(
          `[event-agent-scheduled-sends] mark(failed) errored for row ${row.id}:`,
          markErr instanceof Error ? markErr.message : String(markErr),
        );
      }
    }
  }

  return result;
}
