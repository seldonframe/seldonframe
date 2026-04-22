// workflow_runs — one row per in-flight archetype execution.
//
// Shipped in Scope 3 Step 2c PR 1 per tasks/step-2c-mid-flow-events-
// audit.md §4.1. State storage for the durable workflow runtime
// approved under G-1 (Pure Postgres + Vercel cron polling). The
// runtime itself ships in PR 2; PR 1 only defines the table so the
// event-log persistence in M4 can write without foreign-key drift.
//
// Design choices (from audit §4.1 + approved gates):
//   - specSnapshot (jsonb) captures the AgentSpec at run start. G-5:
//     in-flight runs complete on the original spec even if the
//     archetype gets edited mid-flight.
//   - triggerEventId + triggerPayload record what kicked the run off.
//     triggerEventId is nullable because non-event triggers (future
//     2d scheduled triggers) won't have a backing event-log row.
//   - status enum: running (between steps), waiting (paused on
//     await_event), completed / failed / cancelled (terminal).
//   - captureScope + variableScope are the interpolation-resolution
//     inputs. captureScope accumulates during run; variableScope is
//     set once at start from spec.variables.

import { sql, desc } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { organizations } from "./organizations";

export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    archetypeId: text("archetype_id").notNull(),
    // Full AgentSpec JSON at run start. Source of truth for resume
    // per G-5 — spec edits only apply to new runs.
    specSnapshot: jsonb("spec_snapshot").$type<Record<string, unknown>>().notNull(),
    // Optional FK to the event that triggered the run (when
    // trigger.type === "event"). Self-referential FKs aren't worth
    // the circular-dependency cost in Drizzle; we store the id as a
    // plain uuid and enforce referential integrity via the runtime.
    triggerEventId: uuid("trigger_event_id"),
    triggerPayload: jsonb("trigger_payload").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    // status is stored as text (not an enum) to avoid schema migration
    // churn when new states arrive (e.g., 2e branching might add
    // "blocked_on_external"). The runtime asserts the allowlist:
    // running | waiting | completed | failed | cancelled.
    status: text("status").notNull().default("running"),
    // Null when status ∈ {completed, failed, cancelled}. Set to the
    // step id the engine is currently executing or paused on.
    currentStepId: text("current_step_id"),
    // Accumulating map of {captureName: captured value}. Updated
    // transactionally on each step that has `capture`. Shape per
    // capture follows the archetype convention (data-unwrap for
    // tool returns; full event data for await_event).
    captureScope: jsonb("capture_scope").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    // Resolved spec.variables at run start. Read-only after set.
    variableScope: jsonb("variable_scope").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    // Per-step retry budget. Incremented on step failures; when it
    // exceeds the configured ceiling (runtime constant, PR 2), the
    // run is marked failed.
    failureCount: jsonb("failure_count").$type<Record<string, number>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Primary access patterns:
    //  - admin list page: by org, newest first
    //  - cron tick: select status=waiting rows (via JOIN from workflow_waits)
    index("workflow_runs_org_created_idx").on(table.orgId, desc(table.createdAt)),
    index("workflow_runs_org_status_idx").on(table.orgId, table.status),
    index("workflow_runs_archetype_idx").on(table.orgId, table.archetypeId),
  ]
);

export type WorkflowRun = typeof workflowRuns.$inferSelect;
export type NewWorkflowRun = typeof workflowRuns.$inferInsert;
