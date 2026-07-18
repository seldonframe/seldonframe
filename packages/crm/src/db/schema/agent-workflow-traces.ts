// agent_workflow_traces — deterministic replay, Reelier phase 2c slice 1
// (OBSERVE MODE ONLY). One row per email-triggered deployed-agent turn,
// recorded ONLY when SF_DETERMINISTIC_REPLAY=1 (lib/web-build/policy.ts's
// isDeterministicReplayOn). Dark by default; zero rows written when off.
//
// WHAT THIS IS: the raw material slice 2 (a future, separate change) will
// compile into Reelier replays. This slice only ever WRITES — nothing reads
// or replays `records` yet.
//
// `records` is a jsonb array shaped by lib/deployments/replay/trace-format.ts
// (the Reelier trace-record FORMAT — this repo has no npm dependency on
// Reelier's code, only matches its record contract).
//
// FAIL-SOFT BY CONTRACT: the writer (lib/deployments/replay/persist.ts)
// NEVER throws into the agent turn it observed — mirrors agent-run-receipts.ts's
// contract exactly. A recording failure must never fail or delay a turn.
//
// Org-scoped: every read/write is scoped by org_id (L-04, security invariant).
// deployment_id is nullable-on-delete (ON DELETE SET NULL) — mirrors
// agent-run-receipts.ts's reasoning: a deleted deployment's trace history
// stays queryable by org, never cascade-deleted with the deployment row.
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { organizations } from "./organizations";
import { deployments } from "./deployments";
import type { TraceRecord } from "@/lib/deployments/replay/trace-format";

export type AgentWorkflowTraceTriggerKind = "email";

export const agentWorkflowTraces = pgTable(
  "agent_workflow_traces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** The deployment this trace belongs to. Nullable + no FK cascade-delete
     *  of the trace row (a deleted deployment's traces stay queryable by
     *  org) — see the migration's `ON DELETE SET NULL`. */
    deploymentId: uuid("deployment_id").references(() => deployments.id, {
      onDelete: "set null",
    }),
    /** 'email' for this slice — the only trigger kind wired so far
     *  (composio-event-dispatch.ts's email path). Kept as free text (not an
     *  enum) so a later slice (sms/schedule) needs no migration to add a
     *  new kind, mirroring agent_run_receipts.trigger_kind's convention. */
    triggerKind: text("trigger_kind").$type<AgentWorkflowTraceTriggerKind>().notNull(),
    /** The Gmail messageId / dedup key that identified this run. Nullable —
     *  not every trigger carries one (mirrors composio-event-dispatch.ts's
     *  fail-open-on-missing-id contract). */
    triggerKey: text("trigger_key"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }).notNull(),
    ok: boolean("ok").notNull(),
    callCount: integer("call_count").notNull().default(0),
    /** The Reelier trace-record array (trace-format.ts's TraceRecord[]) —
     *  meta first (seq 0), then note/call/result records in seq order.
     *  Already redacted + per-record capped by the recorder before this row
     *  is ever written (see trace-format.ts's redact()/capTraceBody()). */
    records: jsonb("records").$type<TraceRecord[]>().notNull().default([]),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("agent_workflow_traces_org_deployment_created_idx").on(
      table.orgId,
      table.deploymentId,
      table.createdAt,
    ),
  ],
);

export type AgentWorkflowTraceRow = typeof agentWorkflowTraces.$inferSelect;
export type NewAgentWorkflowTraceRow = typeof agentWorkflowTraces.$inferInsert;
