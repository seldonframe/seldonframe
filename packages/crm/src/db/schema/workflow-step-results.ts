// workflow_step_results — one row per step execution attempt.
//
// Shipped in Scope 3 Step 2c PR 3 M1 per audit §8.3. PR 3 decision
// (2026-04-22): step trace lives in a new table, NOT inlined on
// workflow_runs. Rationale:
//   - Keeps workflow_runs' row size bounded (no JSONB bloat for
//     long-running archetypes).
//   - Queryable for future analytics (per-step failure rates,
//     average duration, etc.) — matches the audit's "future
//     analytics over workflow runs" as a Brain v2 follow-up.
//   - Additive change — no backfill needed for existing runs
//     (there are none in production today).
//
// One row per dispatcher call. Captures:
//   - The step id + step type that ran.
//   - Outcome (advanced | paused | failed).
//   - Optional capture produced (mcp_tool_call or await_event
//     on_resume).
//   - Optional error message (for failed runs).
//   - Duration — useful for the admin surface to show trace timing.

import { sql, desc } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { workflowRuns } from "./workflow-runs";

export const workflowStepResults = pgTable(
  "workflow_step_results",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => workflowRuns.id, { onDelete: "cascade" }),
    stepId: text("step_id").notNull(),
    stepType: text("step_type").notNull(),
    // outcome: advanced | paused | failed
    outcome: text("outcome").notNull(),
    // Optional capture produced by this step. Stored as a small
    // jsonb so the admin drawer can show the captured value
    // without re-loading the run's capture scope.
    captureValue: jsonb("capture_value").$type<Record<string, unknown> | null>(),
    // Optional failure message (outcome="failed").
    errorMessage: text("error_message"),
    // Execution time in milliseconds — useful for ops timing.
    durationMs: integer("duration_ms").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Primary access pattern: admin drawer reads step results by
    // run, newest first.
    index("workflow_step_results_run_idx").on(table.runId, desc(table.createdAt)),
  ]
);

export type WorkflowStepResult = typeof workflowStepResults.$inferSelect;
export type NewWorkflowStepResult = typeof workflowStepResults.$inferInsert;
