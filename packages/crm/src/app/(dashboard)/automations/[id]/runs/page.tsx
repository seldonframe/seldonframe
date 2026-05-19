import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  outboundMessageSends,
  smsMessages,
  workflowApprovals,
  workflowRuns,
  workflowStepResults,
} from "@/db/schema";
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
      context: workflowRuns.context,
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

  // 2026-05-18 — pull step trace + outbound messages for the visible
  // runs so the expanded drawer shows what actually happened end-to-
  // end. Operator feedback: "since we use twilio api and resend api
  // along with vercel.... cant we automatically see what happens?
  // and maybe make it available in /automations/speed-to-lead/runs
  // so user can clearly see whats happening."
  //
  // Two joined sources:
  //   - workflow_step_results: every step dispatch (advanced/paused/failed)
  //     with the captured value + duration_ms. Tells the operator the
  //     EXECUTION trace of the pipeline.
  //   - outbound_message_sends: every email/SMS the dispatcher fired
  //     for this contact, including provider status (sent/failed/
  //     suppressed) + external_message_id (Twilio SID / Resend id).
  //     Tells the operator what the CUSTOMER actually received.
  //
  // Both queries use the runIds we already fetched so we don't pay
  // for an extra round trip per run.
  const stepResults =
    runIds.length > 0
      ? await db
          .select({
            id: workflowStepResults.id,
            runId: workflowStepResults.runId,
            stepId: workflowStepResults.stepId,
            stepType: workflowStepResults.stepType,
            outcome: workflowStepResults.outcome,
            captureValue: workflowStepResults.captureValue,
            errorMessage: workflowStepResults.errorMessage,
            durationMs: workflowStepResults.durationMs,
            createdAt: workflowStepResults.createdAt,
          })
          .from(workflowStepResults)
          .where(inArray(workflowStepResults.runId, runIds))
          .orderBy(asc(workflowStepResults.createdAt))
      : [];

  // Index step results by runId so the table can render the trace
  // inline. Newest-first works for the UI (last action is most
  // relevant to "what is the agent doing right now").
  const stepResultsByRun = new Map<string, typeof stepResults>();
  for (const sr of stepResults) {
    const list = stepResultsByRun.get(sr.runId) ?? [];
    list.push(sr);
    stepResultsByRun.set(sr.runId, list);
  }

  // Pull contact ids from each run's triggerPayload so we can fetch
  // matching outbound sends. Most archetypes have contactId at the
  // payload top level (form.submitted, booking.created, sms.replied);
  // some nest it under data.contactId. Resolve both.
  const contactIdsByRun = new Map<string, string>();
  for (const r of runs) {
    const payload = (r.triggerPayload ?? {}) as Record<string, unknown>;
    const data = (payload.data && typeof payload.data === "object"
      ? (payload.data as Record<string, unknown>)
      : null);
    const cid =
      (typeof payload.contactId === "string" ? payload.contactId : null) ??
      (typeof data?.contactId === "string" ? (data.contactId as string) : null);
    if (cid) contactIdsByRun.set(r.id, cid);
  }
  const contactIds = Array.from(new Set(contactIdsByRun.values()));

  // outbound_message_sends — joined by contactId + within run window.
  // We use the run's createdAt as the lower bound so we don't surface
  // sends from BEFORE the agent fired. Runs without a contactId in
  // the payload (rare) skip this query.
  const outboundSends =
    contactIds.length > 0
      ? await db
          .select({
            id: outboundMessageSends.id,
            channel: outboundMessageSends.channel,
            eventType: outboundMessageSends.eventType,
            contactId: outboundMessageSends.contactId,
            toAddress: outboundMessageSends.toAddress,
            subject: outboundMessageSends.subject,
            body: outboundMessageSends.body,
            status: outboundMessageSends.status,
            error: outboundMessageSends.error,
            externalMessageId: outboundMessageSends.externalMessageId,
            sentAt: outboundMessageSends.sentAt,
            createdAt: outboundMessageSends.createdAt,
            metadata: outboundMessageSends.metadata,
          })
          .from(outboundMessageSends)
          .where(
            and(
              eq(outboundMessageSends.orgId, orgId),
              inArray(outboundMessageSends.contactId, contactIds),
            ),
          )
          .orderBy(desc(outboundMessageSends.createdAt))
      : [];

  // Conversation-step SMS go through sms_messages directly (not
  // outbound_message_sends — those are trigger-attributed only). We
  // include them too so the operator sees the full conversation
  // thread, not just the trigger-fired sends.
  const conversationSms =
    contactIds.length > 0
      ? await db
          .select({
            id: smsMessages.id,
            contactId: smsMessages.contactId,
            direction: smsMessages.direction,
            body: smsMessages.body,
            toNumber: smsMessages.toNumber,
            fromNumber: smsMessages.fromNumber,
            status: smsMessages.status,
            externalMessageId: smsMessages.externalMessageId,
            createdAt: smsMessages.createdAt,
          })
          .from(smsMessages)
          .where(
            and(
              eq(smsMessages.orgId, orgId),
              inArray(smsMessages.contactId, contactIds),
            ),
          )
          .orderBy(asc(smsMessages.createdAt))
      : [];

  // Bucket the messages by run. A message belongs to a run if the
  // contactId matches AND the message was created after the run
  // started (so a 6-month-old conversation history doesn't pollute
  // a fresh run). Use a small grace window (60s) on the lower bound
  // in case clock skew between writers + reads.
  type Msg = {
    kind: "outbound_trigger" | "sms";
    id: string;
    channel: "email" | "sms" | "voice";
    direction: "outbound" | "inbound";
    toAddress: string;
    fromAddress: string | null;
    subject: string | null;
    body: string;
    status: string;
    error: string | null;
    externalMessageId: string | null;
    createdAt: string;
  };
  const messagesByRun = new Map<string, Msg[]>();
  for (const r of runs) {
    const cid = contactIdsByRun.get(r.id);
    if (!cid) continue;
    const runStart = r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt);
    const lowerBound = runStart.getTime() - 60_000;
    const list: Msg[] = [];
    // 2026-05-19 — outbound triggers like booking-confirmation-sms write
    // BOTH an outbound_message_sends audit row AND a sms_messages canonical
    // row, both stamped with the same Twilio SID. We dedup by
    // external_message_id and prefer the outbound_message_sends row because
    // it carries the skill name + trigger metadata which is more informative
    // to the operator. Without this, the /runs UI shows the SMS twice.
    const seenExternalIds = new Set<string>();
    for (const s of outboundSends) {
      if (s.contactId !== cid) continue;
      const ts = s.createdAt instanceof Date ? s.createdAt.getTime() : new Date(s.createdAt).getTime();
      if (ts < lowerBound) continue;
      list.push({
        kind: "outbound_trigger",
        id: s.id,
        channel: s.channel as "email" | "sms" | "voice",
        direction: "outbound",
        toAddress: s.toAddress,
        fromAddress: null,
        subject: s.subject,
        body: s.body,
        status: s.status,
        error: s.error,
        externalMessageId: s.externalMessageId,
        createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : String(s.createdAt),
      });
      if (s.externalMessageId) seenExternalIds.add(s.externalMessageId);
    }
    for (const m of conversationSms) {
      if (m.contactId !== cid) continue;
      const ts = m.createdAt instanceof Date ? m.createdAt.getTime() : new Date(m.createdAt).getTime();
      if (ts < lowerBound) continue;
      // Skip if this SMS was already represented by an outbound_message_sends
      // entry above (same Twilio SID).
      if (m.externalMessageId && seenExternalIds.has(m.externalMessageId)) continue;
      list.push({
        kind: "sms",
        id: m.id,
        channel: "sms",
        direction: m.direction as "outbound" | "inbound",
        toAddress: m.toNumber,
        fromAddress: m.fromNumber,
        subject: null,
        body: m.body,
        status: m.status,
        error: null,
        externalMessageId: m.externalMessageId,
        createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : String(m.createdAt),
      });
    }
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    messagesByRun.set(r.id, list);
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
    const stepTrace = (stepResultsByRun.get(r.id) ?? []).map((sr) => ({
      stepId: sr.stepId,
      stepType: sr.stepType,
      outcome: sr.outcome,
      captureValue: sr.captureValue,
      errorMessage: sr.errorMessage,
      durationMs: sr.durationMs,
      createdAt: sr.createdAt instanceof Date ? sr.createdAt.toISOString() : String(sr.createdAt),
    }));
    return {
      id: r.id,
      runStatus: r.status,
      uiStatus: uiStatus(r.status, hasPending),
      currentStepId: r.currentStepId,
      triggerPayload: r.triggerPayload as Record<string, unknown>,
      captureScope: r.captureScope as Record<string, unknown>,
      context: (r.context as RunRow["context"]) ?? null,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt),
      totalTokensInput: r.totalTokensInput ?? 0,
      totalTokensOutput: r.totalTokensOutput ?? 0,
      totalCostUsdEstimate: String(r.totalCostUsdEstimate ?? "0"),
      pendingApprovals: pending,
      stepTrace,
      messages: messagesByRun.get(r.id) ?? [],
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
