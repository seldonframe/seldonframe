// workflow_event_log — append-only log of every emitted SeldonEvent.
//
// Shipped in Scope 3 Step 2c PR 1 per tasks/step-2c-mid-flow-events-
// audit.md §4.1. The SUBSTRATE CHANGE that makes durable await_event
// possible: today's InMemorySeldonEventBus dispatches and forgets, so
// events fired while no listener is live disappear. The workflow
// runtime needs to query past events to resolve waits, so 2c persists
// every emission here alongside the in-memory dispatch.
//
// Design choices (from audit §4.1):
//   - Append-only. No UPDATE / DELETE in steady state. Retention is
//     handled by a separate daily cleanup cron that DELETEs rows
//     older than the retention window (G-3: 90 days; aligns with the
//     await_event timeout ceiling so no wait can outlive the log).
//   - consumedByWaits: uuid[] of waits this event resolved. Written
//     by the wake-up scan in the emit path (§4.3). Nullable — most
//     events don't match any wait. Populated for observability /
//     replay, not for correctness (the CAS on workflow_waits is the
//     authoritative resume cursor).
//   - No FK from consumedByWaits to workflow_waits — arrays of FKs
//     aren't first-class in Postgres; the runtime enforces referential
//     integrity and a periodic integrity check can catch drift.

import { sql, desc } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { organizations } from "./organizations";

export const workflowEventLog = pgTable(
  "workflow_event_log",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    emittedAt: timestamp("emitted_at", { withTimezone: true }).notNull().defaultNow(),
    // uuid[] of waits this event resolved. Postgres-native array.
    consumedByWaits: uuid("consumed_by_waits").array(),
  },
  (table) => [
    // Primary access pattern: "find recent events of type X in org Y"
    // — the wake-up scan. Descending on emittedAt so a short LIMIT
    // finds the newest first.
    index("workflow_event_log_org_type_idx").on(table.orgId, table.eventType, desc(table.emittedAt)),
    // Retention cleanup scans by emittedAt globally.
    index("workflow_event_log_emitted_idx").on(desc(table.emittedAt)),
  ]
);

export type WorkflowEventLogRow = typeof workflowEventLog.$inferSelect;
export type NewWorkflowEventLogRow = typeof workflowEventLog.$inferInsert;
