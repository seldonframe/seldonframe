// Replay Ledger v1 — org-scoped READ queries backing the /replay dashboard
// page (packages/crm/src/app/(dashboard)/replay/page.tsx).
//
// HONEST-DATA CONTRACT: every number this module returns is a direct
// count/sum over stored rows (agent_workflow_traces / replay_skills /
// agent_run_receipts) — never an estimate, never a dollar figure. In
// particular "LLM turns avoided" = count(kind='replay-run' AND ok=true).
// That is not an estimate: attemptL0Replay's own contract
// (replay-before-llm.ts — "Replay PASSES ... skip the agentic turn
// entirely") means every ok=true replay-run row structurally replaced
// exactly one agentic turn that would otherwise have run. Trace token
// fields (input_tokens/output_tokens) are currently 0-populated
// (agent-workflow-traces.ts) — this module never derives a savings/cost
// figure from them.
//
// Every exported read function takes `orgId` as an explicit argument,
// resolved by the CALLER from the server-side session (getOrgId()) —
// never from a route param or request body (L-04 security invariant). This
// file only READS; it never touches gate-v2's execution path
// (replay-before-llm.ts / replay-or-turn.ts / the claims module).
//
// DI pattern mirrors persist.ts / compile.ts in this same directory: each
// public function accepts an optional `deps` with an injectable fetch fn
// (default: a lazy `@/db` read, kept out of the top-level import graph so
// this module stays test-friendly). The actual math/shaping is split into
// separate PURE functions (computeLedgerSummary, toLedgerRecentRun) so unit
// tests can feed fixture rows directly without a DB.

import type {
  AgentWorkflowTraceKind,
  AgentWorkflowTraceRecords,
} from "@/db/schema/agent-workflow-traces";
import type { ReplaySkillStatus } from "@/db/schema/replay-skills";
import type { TriggerFilter } from "./trigger-filter";
import type { ReelierRunRecord } from "@seldonframe/reelier";

/** Narrow AgentWorkflowTraceRecords (TraceRecord[] | ReelierRunRecord) to the
 *  replay-run shape. Pure; never throws. */
function isReelierRunRecord(records: AgentWorkflowTraceRecords): records is ReelierRunRecord {
  return !!records && typeof records === "object" && !Array.isArray(records) && "totals" in records;
}

// ---------------------------------------------------------------------------
// Summary — the honest headline cards
// ---------------------------------------------------------------------------

export type LedgerTraceRow = {
  id: string;
  kind: AgentWorkflowTraceKind;
  ok: boolean;
  callCount: number;
  records: AgentWorkflowTraceRecords;
  createdAt: Date;
};

export type LedgerSummary = {
  /** Count of kind='trace' rows — the raw observe-mode material. */
  tracesRecorded: number;
  /** Count of kind='replay-run' rows — every L0 replay attempt. */
  replayRunsTotal: number;
  replayRunsOk: number;
  replayRunsFailed: number;
  /** = replayRunsOk. See header — each ok=true replay-run row structurally
   *  replaced one agentic turn; never an estimate. */
  llmTurnsAvoided: number;
  /** Summed across replay-run rows' `records.totals` — kept SEPARATE from
   *  stepsUnchecked (never merged into one "verified" figure; unchecked ≠
   *  passed). */
  stepsPassed: number;
  stepsUnchecked: number;
  stepsSkipped: number;
  stepsFailed: number;
  /** Summed `records.totals.ms` across replay-run rows. */
  totalReplayMs: number;
  /** Count of agent_run_receipts rows for the org — the agentic-turn
   *  denominator replay runs are measured against. */
  agentTurnCount: number;
  lastActivityAt: Date | null;
};

/** Pure: fold already-loaded trace rows (+ the separately-counted org
 *  agent-turn total) into the honest summary shape. No I/O, no estimation. */
export function computeLedgerSummary(rows: LedgerTraceRow[], agentTurnCount: number): LedgerSummary {
  const summary: LedgerSummary = {
    tracesRecorded: 0,
    replayRunsTotal: 0,
    replayRunsOk: 0,
    replayRunsFailed: 0,
    llmTurnsAvoided: 0,
    stepsPassed: 0,
    stepsUnchecked: 0,
    stepsSkipped: 0,
    stepsFailed: 0,
    totalReplayMs: 0,
    agentTurnCount,
    lastActivityAt: null,
  };

  for (const row of rows) {
    if (row.kind === "trace") {
      summary.tracesRecorded += 1;
    } else if (row.kind === "replay-run") {
      summary.replayRunsTotal += 1;
      if (row.ok) {
        summary.replayRunsOk += 1;
      } else {
        summary.replayRunsFailed += 1;
      }
      if (isReelierRunRecord(row.records)) {
        const totals = row.records.totals;
        summary.stepsPassed += totals.passed ?? 0;
        summary.stepsUnchecked += totals.unchecked ?? 0;
        summary.stepsSkipped += totals.skipped ?? 0;
        summary.stepsFailed += totals.failed ?? 0;
        summary.totalReplayMs += totals.ms ?? 0;
      }
    }
    if (!summary.lastActivityAt || row.createdAt > summary.lastActivityAt) {
      summary.lastActivityAt = row.createdAt;
    }
  }

  summary.llmTurnsAvoided = summary.replayRunsOk;
  return summary;
}

export type LedgerSummaryDeps = {
  fetchTraceRows?: (orgId: string) => Promise<LedgerTraceRow[]>;
  fetchAgentTurnCount?: (orgId: string) => Promise<number>;
};

async function defaultFetchTraceRows(orgId: string): Promise<LedgerTraceRow[]> {
  const { db } = await import("@/db");
  const { agentWorkflowTraces } = await import("@/db/schema/agent-workflow-traces");
  const { eq } = await import("drizzle-orm");
  return db
    .select({
      id: agentWorkflowTraces.id,
      kind: agentWorkflowTraces.kind,
      ok: agentWorkflowTraces.ok,
      callCount: agentWorkflowTraces.callCount,
      records: agentWorkflowTraces.records,
      createdAt: agentWorkflowTraces.createdAt,
    })
    .from(agentWorkflowTraces)
    .where(eq(agentWorkflowTraces.orgId, orgId));
}

async function defaultFetchAgentTurnCount(orgId: string): Promise<number> {
  const { db } = await import("@/db");
  const { agentRunReceipts } = await import("@/db/schema/agent-run-receipts");
  const { eq, sql } = await import("drizzle-orm");
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agentRunReceipts)
    .where(eq(agentRunReceipts.orgId, orgId));
  return row?.count ?? 0;
}

/** Org-scoped summary read. `orgId` must come from the server-side session
 *  (getOrgId()), never a request param — see header. */
export async function getLedgerSummary(orgId: string, deps?: LedgerSummaryDeps): Promise<LedgerSummary> {
  const fetchTraceRows = deps?.fetchTraceRows ?? defaultFetchTraceRows;
  const fetchAgentTurnCount = deps?.fetchAgentTurnCount ?? defaultFetchAgentTurnCount;
  const [rows, agentTurnCount] = await Promise.all([
    fetchTraceRows(orgId),
    fetchAgentTurnCount(orgId),
  ]);
  return computeLedgerSummary(rows, agentTurnCount);
}

// ---------------------------------------------------------------------------
// Per-skill rows
// ---------------------------------------------------------------------------

export type LedgerSkillRow = {
  id: string;
  deploymentId: string;
  deploymentName: string | null;
  name: string | null;
  status: ReplaySkillStatus;
  triggerFilter: TriggerFilter | null;
  healCount: number;
  lastReplayAt: Date | null;
  /** The trace this skill was compiled from — provenance only, `null` when
   *  the source trace has since been deleted (ON DELETE SET NULL). */
  sourceTraceId: string | null;
  createdAt: Date;
};

export type LedgerSkillRowsDeps = {
  fetchSkillRows?: (orgId: string) => Promise<LedgerSkillRow[]>;
};

async function defaultFetchSkillRows(orgId: string): Promise<LedgerSkillRow[]> {
  const { db } = await import("@/db");
  const { replaySkills } = await import("@/db/schema/replay-skills");
  const { deployments } = await import("@/db/schema/deployments");
  const { eq, desc } = await import("drizzle-orm");
  return db
    .select({
      id: replaySkills.id,
      deploymentId: replaySkills.deploymentId,
      deploymentName: deployments.clientName,
      name: replaySkills.name,
      status: replaySkills.status,
      triggerFilter: replaySkills.triggerFilter,
      healCount: replaySkills.healCount,
      lastReplayAt: replaySkills.lastReplayAt,
      sourceTraceId: replaySkills.sourceTraceId,
      createdAt: replaySkills.createdAt,
    })
    .from(replaySkills)
    .leftJoin(deployments, eq(replaySkills.deploymentId, deployments.id))
    .where(eq(replaySkills.orgId, orgId))
    .orderBy(desc(replaySkills.updatedAt));
}

/** Org-scoped skill-row read. `orgId` must come from the server-side session
 *  — see header. */
export async function getLedgerSkillRows(orgId: string, deps?: LedgerSkillRowsDeps): Promise<LedgerSkillRow[]> {
  const fetchSkillRows = deps?.fetchSkillRows ?? defaultFetchSkillRows;
  return fetchSkillRows(orgId);
}

// ---------------------------------------------------------------------------
// Recent runs — last N mixed-kind rows
// ---------------------------------------------------------------------------

export const LEDGER_RECENT_RUNS_LIMIT = 20;

export type LedgerRecentRunStepTotals = {
  steps: number;
  passed: number;
  unchecked: number;
  skipped: number;
  failed: number;
  ms: number;
};

export type LedgerRecentRun = {
  id: string;
  kind: AgentWorkflowTraceKind;
  deploymentId: string | null;
  deploymentName: string | null;
  ok: boolean;
  createdAt: Date;
  /** kind='trace' rows: the raw tool-call count for that turn. */
  callCount: number;
  /** kind='replay-run' rows only: the reelier RunRecord's step totals.
   *  `null` for kind='trace' rows (they carry callCount instead) and for a
   *  replay-run row whose records blob doesn't parse as a RunRecord. */
  stepTotals: LedgerRecentRunStepTotals | null;
};

export type LedgerRecentRunSourceRow = {
  id: string;
  kind: AgentWorkflowTraceKind;
  deploymentId: string | null;
  deploymentName: string | null;
  ok: boolean;
  callCount: number;
  records: AgentWorkflowTraceRecords;
  createdAt: Date;
};

/** Pure: shape one raw trace row into the recent-run summary view used by
 *  the page. No I/O. */
export function toLedgerRecentRun(row: LedgerRecentRunSourceRow): LedgerRecentRun {
  const stepTotals =
    row.kind === "replay-run" && isReelierRunRecord(row.records)
      ? {
          steps: row.records.totals.steps ?? 0,
          passed: row.records.totals.passed ?? 0,
          unchecked: row.records.totals.unchecked ?? 0,
          skipped: row.records.totals.skipped ?? 0,
          failed: row.records.totals.failed ?? 0,
          ms: row.records.totals.ms ?? 0,
        }
      : null;
  return {
    id: row.id,
    kind: row.kind,
    deploymentId: row.deploymentId,
    deploymentName: row.deploymentName,
    ok: row.ok,
    createdAt: row.createdAt,
    callCount: row.callCount,
    stepTotals,
  };
}

export type LedgerRecentRunsDeps = {
  fetchRecentRunRows?: (orgId: string, limit: number) => Promise<LedgerRecentRunSourceRow[]>;
};

async function defaultFetchRecentRunRows(orgId: string, limit: number): Promise<LedgerRecentRunSourceRow[]> {
  const { db } = await import("@/db");
  const { agentWorkflowTraces } = await import("@/db/schema/agent-workflow-traces");
  const { deployments } = await import("@/db/schema/deployments");
  const { eq, desc } = await import("drizzle-orm");
  return db
    .select({
      id: agentWorkflowTraces.id,
      kind: agentWorkflowTraces.kind,
      deploymentId: agentWorkflowTraces.deploymentId,
      deploymentName: deployments.clientName,
      ok: agentWorkflowTraces.ok,
      callCount: agentWorkflowTraces.callCount,
      records: agentWorkflowTraces.records,
      createdAt: agentWorkflowTraces.createdAt,
    })
    .from(agentWorkflowTraces)
    .leftJoin(deployments, eq(agentWorkflowTraces.deploymentId, deployments.id))
    .where(eq(agentWorkflowTraces.orgId, orgId))
    .orderBy(desc(agentWorkflowTraces.createdAt))
    .limit(limit);
}

/** Org-scoped recent-runs read (default cap: LEDGER_RECENT_RUNS_LIMIT).
 *  `orgId` must come from the server-side session — see header. */
export async function getLedgerRecentRuns(
  orgId: string,
  deps?: LedgerRecentRunsDeps,
  limit: number = LEDGER_RECENT_RUNS_LIMIT,
): Promise<LedgerRecentRun[]> {
  const fetchRecentRunRows = deps?.fetchRecentRunRows ?? defaultFetchRecentRunRows;
  const rows = await fetchRecentRunRows(orgId, limit);
  return rows.map(toLedgerRecentRun);
}
