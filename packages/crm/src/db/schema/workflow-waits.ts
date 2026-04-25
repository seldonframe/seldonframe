// workflow_waits — one row per active `await_event` wait.
//
// Shipped in Scope 3 Step 2c PR 1 per tasks/step-2c-mid-flow-events-
// audit.md §4.1. The runtime registers a row here when a workflow
// reaches an await_event step; the row persists until the wait is
// resumed (by a matching event) or timed out (by the cron tick).
//
// Design choices (from audit §4.1 + G-4):
//   - matchPredicate is the RESOLVED Predicate (no raw {{interpolation}}
//     strings). G-4 freezes interpolations at wait-registration time:
//     if the predicate references `{{contactId}}`, we resolve it
//     against the workflow's scope at registration and store the
//     literal value here. Events arriving later compare against the
//     frozen value — consistent, debuggable, matches author intent.
//   - timeoutAt is an ABSOLUTE timestamp, not a relative counter.
//     The cron tick polls for timeoutAt <= now() — retry/restart
//     safety follows from timestamp comparison rather than counter
//     state.
//   - resumedAt is the compare-and-swap cursor: `UPDATE SET
//     resumedAt = now() WHERE id = ? AND resumedAt IS NULL` ensures
//     at-most-once advancement (§4.7).
//   - resumedBy: when a real event resolves the wait, FK to the event
//     log row. Null for timeouts and manual resumes.
//   - resumedReason: narrow set of causes — event_match | timeout |
//     manual | cancelled. Stored as text; runtime asserts the
//     allowlist.

import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { workflowRuns } from "./workflow-runs";

export const workflowWaits = pgTable(
  "workflow_waits",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => workflowRuns.id, { onDelete: "cascade" }),
    // The step id within the spec (e.g., "await_form"). Used to look
    // up on_resume / on_timeout in the run's specSnapshot when the
    // wait resolves.
    stepId: text("step_id").notNull(),
    // Event type the wait is listening for. Indexed for the wake-up
    // scan in the event-emit path.
    eventType: text("event_type").notNull(),
    // Resolved predicate (interpolations frozen per G-4). Null if the
    // await_event step has no `match` — all events of `eventType`
    // count as matches.
    matchPredicate: jsonb("match_predicate").$type<Record<string, unknown>>(),
    // Absolute timeout. Cron tick selects WHERE timeoutAt <= now().
    timeoutAt: timestamp("timeout_at", { withTimezone: true }).notNull(),
    // CAS cursor for at-most-once resume. Null until resolved.
    resumedAt: timestamp("resumed_at", { withTimezone: true }),
    // FK to workflow_event_log when resolved by an event arrival.
    // Plain uuid (no FK declaration) to avoid circular import — the
    // runtime enforces referential integrity.
    resumedBy: uuid("resumed_by"),
    // Cause of resolution: event_match | timeout | manual | cancelled.
    resumedReason: text("resumed_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Primary access patterns (audit §4.1):
    //  - event-arrival scan: by eventType, filtered to unresolved
    //    (resumedAt IS NULL). Partial index on the WHERE keeps the
    //    index tight under high volume.
    index("workflow_waits_event_unresolved_idx")
      .on(table.eventType)
      .where(sql`resumed_at IS NULL`),
    //  - cron timeout sweep: by timeoutAt, filtered to unresolved.
    index("workflow_waits_timeout_unresolved_idx")
      .on(table.timeoutAt)
      .where(sql`resumed_at IS NULL`),
    //  - per-run query: admin surface + cleanup on run cancellation.
    index("workflow_waits_run_idx").on(table.runId),
  ]
);

export type WorkflowWait = typeof workflowWaits.$inferSelect;
export type NewWorkflowWait = typeof workflowWaits.$inferInsert;
