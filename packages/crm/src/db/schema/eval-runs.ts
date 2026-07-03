import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { agents } from "./agents";

// ─── eval_runs ──────────────────────────────────────────────────────────────
//
// Improve verb + trust rail (2026-07-02). A durable record of one eval-suite
// run against an agent OR a marketplace template, independent of the
// transient run response. `kind` distinguishes a manual "run evals" click
// from the two runs the improve verb produces (baseline on the live
// blueprint, candidate on the shadow-patched blueprint) and the publish-gate
// run a listing's trust badge is computed from.
//
// `resultsSummary` carries DERIVED text only (scenario titles, pass/fail,
// failed check names) — never raw customer transcripts. See the plan's
// Global Constraints.

export type EvalRunSubjectKind = "agent" | "template";
export type EvalRunKind =
  | "manual"
  | "improve_baseline"
  | "improve_candidate"
  | "publish_gate";

/** One scenario's outcome inside a run's resultsSummary — derived text only
 *  (no transcripts). `failedChecks` are short criteria labels, not raw turns. */
export type EvalRunScenarioResult = {
  id: string;
  title: string;
  passed: boolean;
  failedChecks?: string[];
};

export const evalRuns = pgTable(
  "eval_runs",
  {
    id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** 'agent' | 'template' — what subjectId points at. */
    subjectKind: text("subject_kind").notNull(),
    subjectId: uuid("subject_id").notNull(),
    /** 'manual' | 'improve_baseline' | 'improve_candidate' | 'publish_gate'. */
    kind: text("kind").notNull(),
    /** 0-100, rounded percentage. */
    passRate: integer("pass_rate").notNull(),
    scenarioCount: integer("scenario_count").notNull(),
    passedCount: integer("passed_count").notNull(),
    graderModel: text("grader_model"),
    blueprintVersion: integer("blueprint_version"),
    /** Per-scenario {id,title,passed,failedChecks[]} — derived text only, NO
     *  raw customer transcripts. */
    resultsSummary: jsonb("results_summary").$type<EvalRunScenarioResult[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_eval_runs_subject_created").on(
      table.subjectKind,
      table.subjectId,
      table.createdAt,
    ),
  ],
);

export type EvalRun = typeof evalRuns.$inferSelect;
export type NewEvalRun = typeof evalRuns.$inferInsert;

// ─── agent_improve_proposals ────────────────────────────────────────────────
//
// The `improve` verb is propose-only: a proposal captures a candidate
// blueprint PATCH (never the full blueprint) plus the failure-cluster
// rationale that produced it, and links to the baseline/candidate eval runs
// that scored it. Nothing but `applyImproveProposal` may turn a proposal
// into a live blueprint change (see Global Constraints) — this table only
// records the proposal and its lifecycle (proposed → applied | dismissed).

export type ImproveProposalStatus = "proposed" | "applied" | "dismissed";

/** One failure cluster inside a proposal's rationale — derived evidence only
 *  (short sentences, not raw transcripts). Taxonomy seed per the plan:
 *  booking_flow | hallucinated_state | pricing | missing_knowledge | tone |
 *  tool_misuse | other. */
export type FailureCluster = {
  taxonomy: string;
  count: number;
  /** Short derived evidence sentences (<=200 chars each) — no transcripts. */
  evidence: string[];
};

export type ImproveProposalRationale = {
  clusters: FailureCluster[];
};

export const agentImproveProposals = pgTable(
  "agent_improve_proposals",
  {
    id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    basedOnVersion: integer("based_on_version").notNull(),
    /** Partial<AgentBlueprint> — a PATCH, never the full blueprint. */
    patch: jsonb("patch").notNull(),
    /** { clusters: FailureCluster[] } — derived evidence only. */
    rationale: jsonb("rationale").notNull().$type<ImproveProposalRationale>(),
    baselineRunId: uuid("baseline_run_id").references(() => evalRuns.id),
    candidateRunId: uuid("candidate_run_id").references(() => evalRuns.id),
    /** 'proposed' | 'applied' | 'dismissed'. */
    status: text("status").notNull().default("proposed"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_improve_proposals_agent_status").on(table.agentId, table.status),
  ],
);

export type ImproveProposal = typeof agentImproveProposals.$inferSelect;
export type NewImproveProposal = typeof agentImproveProposals.$inferInsert;
