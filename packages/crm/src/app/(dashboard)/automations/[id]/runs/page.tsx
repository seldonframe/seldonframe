import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { workflowApprovals, workflowRuns } from "@/db/schema";
import { getCurrentUser, getOrgId } from "@/lib/auth/helpers";
import { getArchetype } from "@/lib/agents/archetypes";
import { RunsTable, type RunRow } from "@/components/automations/runs-table";

/**
 * /automations/[id]/runs — run history with approval actions.
 *
 * Reads `workflow_runs` filtered by org + archetype, joins to
 * `workflow_approvals` for any rows in `pending` status so the UI
 * can render Approve / Reject buttons inline. The approve/reject
 * server action wrappers post to the existing
 * `/api/v1/approvals/[approvalId]/resolve` endpoint, which already
 * implements the optimistic-lock CAS, the bound-approver check,
 * and the runtime resume on success.
 *
 * Status filtering is URL-driven (`?status=pending|approved|...`)
 * so deep links into "show me everything that needs approval"
 * survive refresh + sharing.
 *
 * Pagination is hard-capped at 100 most recent runs for v1. Older
 * runs are reachable via search-by-status; full pagination is a
 * follow-up.
 */

const STATUS_FILTER_VALUES = [
  "all",
  "pending",
  "executed",
  "rejected",
  "failed",
  "cancelled",
] as const;
type StatusFilter = (typeof STATUS_FILTER_VALUES)[number];

const RUN_LIMIT = 100;

export default async function RunsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const archetype = getArchetype(id);
  if (!archetype) notFound();

  const orgId = await getOrgId();
  const user = await getCurrentUser();
  if (!orgId || !user?.id) {
    return (
      <section className="animate-page-enter space-y-3">
        <h1 className="text-lg font-semibold">Runs</h1>
        <p className="text-sm text-muted-foreground">No active workspace.</p>
      </section>
    );
  }

  const requestedStatus = (sp.status ?? "all").trim() as StatusFilter;
  const statusFilter = (STATUS_FILTER_VALUES as readonly string[]).includes(requestedStatus)
    ? requestedStatus
    : "all";

  const runs = await db
    .select({
      id: workflowRuns.id,
      archetypeId: workflowRuns.archetypeId,
      status: workflowRuns.status,
      currentStepId: workflowRuns.currentStepId,
      triggerPayload: workflowRuns.triggerPayload,
      captureScope: workflowRuns.captureScope,
      createdAt: workflowRuns.createdAt,
      updatedAt: workflowRuns.updatedAt,
      totalTokensInput: workflowRuns.totalTokensInput,
      totalTokensOutput: workflowRuns.totalTokensOutput,
      totalCostUsdEstimate: workflowRuns.totalCostUsdEstimate,
    })
    .from(workflowRuns)
    .where(and(eq(workflowRuns.orgId, orgId), eq(workflowRuns.archetypeId, id)))
    .orderBy(desc(workflowRuns.createdAt))
    .limit(RUN_LIMIT);

  // Pull pending approvals for the runs we're showing in one indexed
  // query — the workflow_approvals_run_idx covers (run_id) so this
  // is fast even when most runs have no approvals.
  const runIds = runs.map((r) => r.id);
  const approvals =
    runIds.length > 0
      ? await db
          .select({
            id: workflowApprovals.id,
            runId: workflowApprovals.runId,
            stepId: workflowApprovals.stepId,
            status: workflowApprovals.status,
            contextTitle: workflowApprovals.contextTitle,
            contextSummary: workflowApprovals.contextSummary,
            contextPreview: workflowApprovals.contextPreview,
            timeoutAt: workflowApprovals.timeoutAt,
            approverUserId: workflowApprovals.approverUserId,
            createdAt: workflowApprovals.createdAt,
          })
          .from(workflowApprovals)
          .where(
            and(
              eq(workflowApprovals.orgId, orgId),
              inArray(workflowApprovals.runId, runIds)
            )
          )
          .orderBy(desc(workflowApprovals.createdAt))
      : [];

  const pendingApprovalsByRun = new Map<
    string,
    Array<{
      id: string;
      stepId: string;
      contextTitle: string;
      contextSummary: string;
      contextPreview: string | null;
      timeoutAt: string | null;
      isCallerBound: boolean;
    }>
  >();
  for (const a of approvals) {
    if (a.status !== "pending") continue;
    const list = pendingApprovalsByRun.get(a.runId) ?? [];
    list.push({
      id: a.id,
      stepId: a.stepId,
      contextTitle: a.contextTitle,
      contextSummary: a.contextSummary,
      contextPreview: a.contextPreview,
      timeoutAt: a.timeoutAt instanceof Date ? a.timeoutAt.toISOString() : a.timeoutAt,
      // Note in the row whether the current user is the bound approver
      // — the API will let the org owner override either way, but the
      // UI hint is useful for ops users with multiple approvers.
      isCallerBound: a.approverUserId === user.id,
    });
    pendingApprovalsByRun.set(a.runId, list);
  }

  // Map a run's persisted status → the operator-facing status the
  // table renders. "running" is collapsed under "pending approval"
  // when there's a pending approval on the run; otherwise it shows
  // as "in progress".
  function uiStatus(
    runStatus: string,
    hasPendingApproval: boolean
  ): RunRow["uiStatus"] {
    if (hasPendingApproval) return "pending";
    switch (runStatus) {
      case "completed":
        return "executed";
      case "failed":
        return "failed";
      case "cancelled":
        return "cancelled";
      case "waiting":
      case "running":
        return "in_progress";
      default:
        return "in_progress";
    }
  }

  const allRows: RunRow[] = runs.map((r) => {
    const pending = pendingApprovalsByRun.get(r.id) ?? [];
    const hasPending = pending.length > 0;
    return {
      id: r.id,
      runStatus: r.status,
      uiStatus: uiStatus(r.status, hasPending),
      currentStepId: r.currentStepId,
      triggerPayload: r.triggerPayload as Record<string, unknown>,
      captureScope: r.captureScope as Record<string, unknown>,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt),
      totalTokensInput: r.totalTokensInput ?? 0,
      totalTokensOutput: r.totalTokensOutput ?? 0,
      totalCostUsdEstimate: String(r.totalCostUsdEstimate ?? "0"),
      pendingApprovals: pending,
    };
  });

  // Apply UI status filter client-side (so toggling between
  // /runs?status=pending and ?status=executed re-renders without
  // a SQL hit per filter).
  const rows =
    statusFilter === "all"
      ? allRows
      : allRows.filter((r) => r.uiStatus === statusFilter);

  const counts: Record<RunRow["uiStatus"], number> = {
    pending: 0,
    in_progress: 0,
    executed: 0,
    rejected: 0,
    failed: 0,
    cancelled: 0,
  };
  for (const row of allRows) counts[row.uiStatus] += 1;

  return (
    <section className="animate-page-enter space-y-5 sm:space-y-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-muted-foreground">
        <Link href="/automations" className="inline-flex items-center gap-1 hover:text-foreground">
          <ChevronLeft className="size-3" />
          Automations
        </Link>
        <span>/</span>
        <Link
          href={`/automations/${id}/configure`}
          className="hover:text-foreground"
        >
          {archetype.name}
        </Link>
        <span>/</span>
        <span className="text-foreground">Runs</span>
      </nav>

      <header className="space-y-2">
        <h1 className="text-lg sm:text-[22px] font-semibold tracking-tight leading-relaxed text-foreground">
          {archetype.name} — runs
        </h1>
        <p className="text-sm text-muted-foreground">
          Every time the agent fires, the run lands here. Pending rows wait for your sign-off
          before any messages go out.
        </p>
      </header>

      <RunsTable
        archetypeId={id}
        rows={rows}
        counts={counts}
        statusFilter={statusFilter}
      />
    </section>
  );
}
