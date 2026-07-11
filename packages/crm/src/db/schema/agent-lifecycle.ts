import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { agentTemplates } from "./agent-templates";

// ─── supervised_runs ────────────────────────────────────────────────────────
//
// Agent lifecycle slice (migration 0068) — Stage 04 "Run": one supervised,
// real-tool run of an agent TEMPLATE, fired on demand from the lifecycle
// ladder ("Run it once — watch every action"). `actionLog` is a durable,
// append-only (per-run) list of SUMMARIZED tool events (tool name + a short
// human line + ok/error) — never raw tool payloads, never secrets. A
// `succeeded` row is the durable "supervised run passed" record the
// marketplace publish gate (lib/agents/lifecycle/gate.ts) and the Sell
// stage's checklist both read. Org-scoped; inert behind SF_AGENT_LIFECYCLE.

export type SupervisedRunStatus = "running" | "succeeded" | "failed";

export type SupervisedRunActionEvent = {
  at: string;
  tool: string;
  line: string;
  status: "running" | "ok" | "error";
};

export const supervisedRuns = pgTable(
  "supervised_runs",
  {
    id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    templateId: uuid("template_id")
      .notNull()
      .references(() => agentTemplates.id, { onDelete: "cascade" }),
    /** 'running' | 'succeeded' | 'failed'. */
    status: text("status").notNull().default("running"),
    actionLog: jsonb("action_log").$type<SupervisedRunActionEvent[]>().notNull().default(sql`'[]'::jsonb`),
    summary: text("summary"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    index("supervised_runs_org_template_started_idx").on(
      table.orgId,
      table.templateId,
      table.startedAt,
    ),
  ],
);

export type SupervisedRun = typeof supervisedRuns.$inferSelect;
export type NewSupervisedRun = typeof supervisedRuns.$inferInsert;
