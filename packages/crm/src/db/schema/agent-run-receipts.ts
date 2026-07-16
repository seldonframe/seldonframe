// agent_run_receipts — one row per agent RUN attempt (push / schedule /
// event), keep-forever. Spec: docs/superpowers/specs/
// 2026-07-16-agent-receipts-design.md.
//
// WHY: a deployed agent can run 3 times with zero queryable record of what it
// did (2026-07-15 live incident — see the design doc's "Why"). A never-lies
// product must show receipts for every run, not just outbound sends (the
// existing activity page only covers those). This table is that record.
//
// FAIL-SOFT BY CONTRACT: the writer (lib/agent-receipts/write.ts) NEVER
// throws into a run's execution path — a receipt-write failure must never
// fail or retry the underlying agent run. See that file's header.
//
// Org-scoped: every read/write is scoped by org_id (L-04). deployment_id is
// nullable-on-delete (cascade-null via ON DELETE SET NULL is NOT used here —
// see the migration: a deleted deployment's receipts stay queryable by org,
// so the FK is ON DELETE SET NULL semantics achieved via a plain nullable
// column reference with no cascade-delete of the receipt row itself).
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { organizations } from "./organizations";
import { deployments } from "./deployments";

export type AgentRunReceiptTriggerKind = "push" | "schedule" | "event";
export type AgentRunReceiptStatus = "ok" | "error" | "skipped";

/** One tool call's outcome, summarized (never a raw payload/secret) — mirrors
 *  the secret-safe `line` contract in stateless-turn.ts's StatelessToolEvent. */
export type AgentRunReceiptToolCall = {
  tool: string;
  ok: boolean;
  note?: string;
};

export const agentRunReceipts = pgTable(
  "agent_run_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** The deployment this run belongs to. Nullable + no FK cascade-delete of
     *  the receipt (a deleted deployment's history stays queryable by org) —
     *  see the migration's `ON DELETE SET NULL`. */
    deploymentId: uuid("deployment_id").references(() => deployments.id, {
      onDelete: "set null",
    }),
    triggerKind: text("trigger_kind").$type<AgentRunReceiptTriggerKind>().notNull(),
    /** Gmail message id / cron fire tag / event id — whatever identifies the
     *  triggering source. Nullable (not every trigger has one). */
    sourceRef: text("source_ref"),
    status: text("status").$type<AgentRunReceiptStatus>().notNull(),
    /** One human line: "Forwarded 'New SeldonFrame signup…' to
     *  dresslikeag@gmail.com". Never a raw payload. */
    summary: text("summary").notNull(),
    toolCalls: jsonb("tool_calls").$type<AgentRunReceiptToolCall[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("agent_run_receipts_org_created_idx").on(table.orgId, table.createdAt),
    index("agent_run_receipts_deployment_created_idx").on(
      table.deploymentId,
      table.createdAt,
    ),
  ],
);

export type AgentRunReceiptRow = typeof agentRunReceipts.$inferSelect;
export type NewAgentRunReceiptRow = typeof agentRunReceipts.$inferInsert;
