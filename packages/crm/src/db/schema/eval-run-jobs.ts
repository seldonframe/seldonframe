import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { agentTemplates } from "./agent-templates";

// ─── eval_run_jobs ──────────────────────────────────────────────────────────
//
// H2 hotfix (2026-07-11 prod incident) — the "Run evals" POST hit Vercel's
// function ceiling (a live multi-scenario eval run can legitimately take
// minutes) and 504'd; Next.js queues server actions PER TAB, so the stuck
// request froze every other click (Run/Deploy) behind it on that tab.
//
// This table is a thin, EPHEMERAL poll target — NOT the durable eval
// history (that stays `eval_runs`, unchanged). `runAgentEvalsAction` inserts
// a `running` row here immediately, returns its id, then does the real work
// in `after()` (out-of-request) and updates THIS row with the final result
// (the exact shape the UI already renders) or an error. The durable
// `eval_runs` row is still written by persistTemplateEvalRun exactly as
// before — this table only exists so the client has something to poll.
// Org-scoped; mirrors supervised_runs' shape/lifecycle.

export type EvalRunJobStatus = "running" | "succeeded" | "failed";

export const evalRunJobs = pgTable(
  "eval_run_jobs",
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
    /** On success: the SAME shape RunAgentEvalsActionResult's ok:true branch
     *  always returned synchronously — the UI renders it unchanged. */
    result: jsonb("result"),
    /** On failure: a short, non-secret message. */
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    index("eval_run_jobs_org_template_started_idx").on(table.orgId, table.templateId, table.startedAt),
  ],
);

export type EvalRunJob = typeof evalRunJobs.$inferSelect;
export type NewEvalRunJob = typeof evalRunJobs.$inferInsert;
