// agent_action_drafts — one row per draft_for_approval filing. The
// never-fail-compile slice (spec: docs/superpowers/specs/
// 2026-07-15-never-fail-compile-design.md): a compiled-from-recording agent
// PREPARES work it may not execute; a human approves from /approvals.
//
// Deliberately NOT workflow_approvals (G-10-9 precedent in that file's
// header): drafts have no run/step identity and their own lifecycle.
//
// Idempotency (Max amendment 2026-07-15): the pending-only unique partial
// index makes filing atomic per (org, conversation, step) — a model retry
// can never create a second pending draft for the same step. Pending-only on
// purpose: after approve/dismiss the same step may legitimately recur.
import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organizations } from "./organizations";

export type AgentDraftStatus = "pending" | "approved" | "dismissed";
export type AgentDraftKind = "email" | "message" | "invoice" | "data_entry" | "other";
export type AgentDraftContent = { body: string; fields?: Record<string, string> };

export const agentActionDrafts = pgTable(
  "agent_action_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    agentId: text("agent_id").notNull(),
    conversationId: text("conversation_id").notNull(),
    stepAction: text("step_action").notNull(),
    kind: text("kind").$type<AgentDraftKind>().notNull(),
    title: text("title").notNull(),
    content: jsonb("content").$type<AgentDraftContent>().notNull(),
    tier: text("tier").$type<"yellow" | "red">().notNull(),
    status: text("status").$type<AgentDraftStatus>().notNull().default("pending"),
    resolvedByUserId: uuid("resolved_by_user_id"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("agent_action_drafts_org_status_created_idx").on(
      table.orgId,
      table.status,
      table.createdAt,
    ),
    index("agent_action_drafts_org_agent_idx").on(table.orgId, table.agentId),
    uniqueIndex("agent_action_drafts_pending_step_uniq")
      .on(table.orgId, table.conversationId, table.stepAction)
      .where(sql`status = 'pending'`),
  ],
);

export type AgentActionDraftRow = typeof agentActionDrafts.$inferSelect;
