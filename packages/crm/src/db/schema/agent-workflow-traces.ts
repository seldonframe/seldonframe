// agent_workflow_traces — deterministic replay, Reelier phase 2c. One row per
// email-triggered deployed-agent turn (kind='trace', slice 1) OR one row per
// L0 replay attempt (kind='replay-run', slice 2) — recorded ONLY when
// SF_DETERMINISTIC_REPLAY=1 (lib/web-build/policy.ts's
// isDeterministicReplayOn). Dark by default; zero rows written when off.
//
// Slice 1 wrote 'trace' rows only (raw material for the compiler). Slice 2
// adds the compiler (lib/deployments/replay/compile.ts, reading a 'trace'
// row into a replay_skills.skill_md) and the L0 replayer
// (lib/deployments/replay/replay-before-llm.ts, writing a 'replay-run' row
// per attempt) — see AgentWorkflowTraceKind below for the two shapes.
//
// `records` is a jsonb value shaped per `kind` — see AgentWorkflowTraceRecords
// below (this repo has no npm dependency on Reelier's trace FORMAT itself,
// only matches its record contract; it DOES depend on @seldonframe/reelier
// for the runner/compiler, which is where ReelierRunRecord comes from).
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
import type { ReelierRunRecord } from "@seldonframe/reelier";

export type AgentWorkflowTraceTriggerKind = "email";

/** Reelier phase 2c slice 2 — a row is either an OBSERVE-MODE trace (`kind:
 *  'trace'`, `records` a TraceRecord[] in seq order, unchanged from slice 1)
 *  or an L0 REPLAY run (`kind: 'replay-run'`, `records` the reelier
 *  RunRecord the replay attempt produced — see
 *  lib/deployments/replay/replay-before-llm.ts). Default 'trace' so every
 *  slice-1 row (and every insert that doesn't pass `kind`) keeps its
 *  existing meaning unchanged.
 *
 *  Replay gate v2 (2026-07-18) adds `'replay-run-failed-post-send'` — the
 *  DISTINCT marker the spec calls for on a divergence AT/AFTER a v2 skill's
 *  destructive step (no agent fallback attempted; see replay-or-turn.ts).
 *  Deliberately reuses this existing `kind` column rather than adding a new
 *  one (no CHECK constraint ties it to a fixed enum — see migration 0075's
 *  plain `text` column) — this IS already the field that distinguishes
 *  trace shapes, and a new value here needs no migration. */
export type AgentWorkflowTraceKind = "trace" | "replay-run" | "replay-run-failed-post-send";
export type AgentWorkflowTraceRecords = TraceRecord[] | ReelierRunRecord;

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
    /** Reelier phase 2c slice 2 (migration 0075) — 'trace' (default, slice 1
     *  behavior unchanged) or 'replay-run' (an L0 replay attempt's
     *  RunRecord). See AgentWorkflowTraceKind above. */
    kind: text("kind").$type<AgentWorkflowTraceKind>().notNull().default("trace"),
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
    records: jsonb("records").$type<AgentWorkflowTraceRecords>().notNull().default([]),
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
