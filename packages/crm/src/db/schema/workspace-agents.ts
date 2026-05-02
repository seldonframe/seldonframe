// May 2, 2026 — Composable Primitives: operator-defined automation
// agents. trigger config + steps array interpreted by the dispatcher.
// status="active" rows are live; "paused"/"draft" are inert.
//
// Step types interpreted by the dispatcher (see lib/workflow/dispatcher
// when the composable-primitives task wires them in):
//   wait, send_email, send_sms, create_record, update_record,
//   create_contact, update_contact, create_deal, notify_operator,
//   llm_call, approval_gate, condition, webhook
//
// Trigger types:
//   record.created / record.updated / record.deleted
//   form.submitted / booking.created / deal.stage_changed
//   schedule (cron) / manual
//
// Migration: drizzle/0034_workspace_collections.sql

import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export type WorkspaceAgentStatus = "draft" | "active" | "paused";

export type WorkspaceAgentTriggerType =
  | "record.created"
  | "record.updated"
  | "record.deleted"
  | "form.submitted"
  | "booking.created"
  | "deal.stage_changed"
  | "schedule"
  | "manual";

export interface WorkspaceAgentTrigger {
  type: WorkspaceAgentTriggerType;
  /** For record.* triggers: the collection slug to watch. */
  collection?: string;
  /** For record.updated: which field's change fires the agent. */
  field?: string;
  /** For record.updated: the value the field must equal to fire. */
  value?: unknown;
  /** For form.submitted: the form id to watch. */
  form?: string;
  /** For deal.stage_changed: the stage that fires the agent. */
  stage?: string;
  /** For schedule: cron expression e.g. "0 9 * * 1" (Monday 9am). */
  cron?: string;
}

/** Step definition is intentionally permissive — the dispatcher
 *  narrows by step.type at execution time. Strict per-type schemas
 *  live in the dispatcher module. */
export interface WorkspaceAgentStep {
  type: string;
  [key: string]: unknown;
}

export interface WorkspaceAgentSettings {
  requires_approval?: boolean;
  max_runs_per_day?: number;
  llm_model?: string;
  enabled?: boolean;
}

export const workspaceAgents = pgTable(
  "workspace_agents",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    icon: varchar("icon", { length: 50 }).notNull().default("bot"),
    trigger: jsonb("trigger").$type<WorkspaceAgentTrigger>().notNull(),
    steps: jsonb("steps")
      .$type<WorkspaceAgentStep[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    status: varchar("status", { length: 20 })
      .$type<WorkspaceAgentStatus>()
      .notNull()
      .default("draft"),
    settings: jsonb("settings")
      .$type<WorkspaceAgentSettings>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_workspace_agents_org_status").on(
      table.organizationId,
      table.status
    ),
  ]
);

export type WorkspaceAgent = typeof workspaceAgents.$inferSelect;
export type NewWorkspaceAgent = typeof workspaceAgents.$inferInsert;
