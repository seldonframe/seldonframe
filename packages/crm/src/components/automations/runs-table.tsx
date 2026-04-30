"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  ShieldCheck,
  XCircle,
} from "lucide-react";

/**
 * WS3 part 2 — runs table for an archetype.
 *
 * Columns: Timestamp · Trigger · Status · Input snippet · Output snippet
 *
 * Each row expands to show full input (triggerPayload), the running
 * captureScope (what the agent has decided / extracted so far), and
 * any pending approvals. Pending approvals get inline Approve & Reject
 * buttons that POST to /api/v1/approvals/[approvalId]/resolve and
 * refresh the page on success.
 *
 * Status filter is rendered as a horizontal tab strip with counts;
 * clicking a tab updates the URL via router.replace so the filter
 * persists across refresh + sharing.
 */

export type PendingApproval = {
  id: string;
  stepId: string;
  contextTitle: string;
  contextSummary: string;
  contextPreview: string | null;
  timeoutAt: string | null;
  isCallerBound: boolean;
};

export type RunRow = {
  id: string;
  runStatus: string; // raw workflow_runs.status
  uiStatus: "pending" | "in_progress" | "executed" | "rejected" | "failed" | "cancelled";
  currentStepId: string | null;
  triggerPayload: Record<string, unknown>;
  captureScope: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  totalTokensInput: number;
  totalTokensOutput: number;
  totalCostUsdEstimate: string;
  pendingApprovals: PendingApproval[];
};

type FilterValue = "all" | RunRow["uiStatus"];

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending approval" },
  { value: "in_progress", label: "In progress" },
  { value: "executed", label: "Executed" },
  { value: "rejected", label: "Rejected" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
];

const STATUS_STYLE: Record<
  RunRow["uiStatus"],
  { bg: string; text: string; ring: string; dot: string; label: string }
> = {
  pending: {
    bg: "bg-amber-500/10",
    text: "text-amber-700 dark:text-amber-400",
    ring: "ring-amber-500/20",
    dot: "bg-amber-500",
    label: "Pending approval",
  },
  in_progress: {
    bg: "bg-sky-500/10",
    text: "text-sky-700 dark:text-sky-400",
    ring: "ring-sky-500/20",
    dot: "bg-sky-500",
    label: "In progress",
  },
  executed: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-700 dark:text-emerald-400",
    ring: "ring-emerald-500/20",
    dot: "bg-emerald-500",
    label: "Executed",
  },
  rejected: {
    bg: "bg-rose-500/10",
    text: "text-rose-700 dark:text-rose-400",
    ring: "ring-rose-500/20",
    dot: "bg-rose-500",
    label: "Rejected",
  },
  failed: {
    bg: "bg-rose-500/10",
    text: "text-rose-700 dark:text-rose-400",
    ring: "ring-rose-500/20",
    dot: "bg-rose-500",
    label: "Failed",
  },
  cancelled: {
    bg: "bg-zinc-500/10",
    text: "text-zinc-600 dark:text-zinc-400",
    ring: "ring-zinc-500/20",
    dot: "bg-zinc-500",
    label: "Cancelled",
  },
};

export function RunsTable({
  archetypeId,
  rows,
  counts,
  statusFilter,
}: {
  archetypeId: string;
  rows: RunRow[];
  counts: Record<RunRow["uiStatus"], number>;
  statusFilter: FilterValue;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [resolutionError, setResolutionError] = useState<string | null>(null);

  function toggle(runId: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(runId)) next.delete(runId);
      else next.add(runId);
      return next;
    });
  }

  function setFilter(value: FilterValue) {
    const url = new URL(window.location.href);
    if (value === "all") url.searchParams.delete("status");
    else url.searchParams.set("status", value);
    router.replace(`${url.pathname}${url.search}`);
  }

  async function resolveApproval(approvalId: string, decision: "approve" | "reject") {
    setResolutionError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/v1/approvals/${approvalId}/resolve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          details?: unknown;
        };
        if (!res.ok) {
          setResolutionError(
            data.error ? `${data.error}` : "Could not resolve approval — try again."
          );
          return;
        }
        router.refresh();
      } catch (err) {
        setResolutionError(err instanceof Error ? err.message : "Network error");
      }
    });
  }

  if (rows.length === 0 && counts.pending + counts.in_progress + counts.executed + counts.rejected + counts.failed + counts.cancelled === 0) {
    return (
      <div className="rounded-xl border bg-card text-card-foreground p-12 text-center">
        <div className="mx-auto flex max-w-md flex-col items-center gap-3">
          <div className="size-12 rounded-xl bg-muted flex items-center justify-center">
            <ShieldCheck className="size-5 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold tracking-tight text-foreground">
              No runs yet
            </h3>
            <p className="text-sm text-muted-foreground">
              Once you deploy this agent, every triggered run lands here. Pending rows wait
              for your approval before any messages go out.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter strip */}
      <div className="flex flex-wrap items-center gap-1 rounded-lg border bg-card p-1 text-xs">
        {FILTERS.map((f) => {
          const active = statusFilter === f.value;
          const c = f.value === "all" ? rows.length : counts[f.value as RunRow["uiStatus"]];
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={
                "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium transition-colors " +
                (active
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground")
              }
            >
              {f.label}
              {c > 0 ? (
                <span className="rounded-full bg-background/60 px-1.5 py-0.5 text-[10px] tabular-nums">
                  {c}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {resolutionError ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          <AlertCircle className="size-4 mt-0.5 shrink-0" />
          <span>{resolutionError}</span>
        </div>
      ) : null}

      <div className="rounded-xl border bg-card text-card-foreground overflow-hidden">
        {rows.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">
            No runs in this filter.
          </div>
        ) : (
          <ul className="divide-y">
            {rows.map((row) => (
              <RunRowItem
                key={row.id}
                row={row}
                archetypeId={archetypeId}
                expanded={expanded.has(row.id)}
                onToggle={() => toggle(row.id)}
                onResolve={resolveApproval}
                actionPending={pending}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ─── single run row ─── */

function RunRowItem({
  row,
  archetypeId: _archetypeId,
  expanded,
  onToggle,
  onResolve,
  actionPending,
}: {
  row: RunRow;
  archetypeId: string;
  expanded: boolean;
  onToggle: () => void;
  onResolve: (approvalId: string, decision: "approve" | "reject") => void | Promise<void>;
  actionPending: boolean;
}) {
  const style = STATUS_STYLE[row.uiStatus];
  const triggerSnippet = stringifyForSnippet(row.triggerPayload);
  const captureSnippet =
    Object.keys(row.captureScope).length > 0
      ? stringifyForSnippet(row.captureScope)
      : "—";

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        className="grid w-full grid-cols-[auto_140px_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30"
      >
        <span
          aria-hidden
          className="text-muted-foreground transition-transform"
          style={{ transform: expanded ? "rotate(90deg)" : undefined }}
        >
          <ChevronRight className="size-4" />
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatTimestamp(row.createdAt)}
        </span>
        <span
          className={
            "inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset " +
            `${style.bg} ${style.text} ${style.ring}`
          }
        >
          <span className={`size-1.5 rounded-full ${style.dot}`} />
          {style.label}
        </span>
        <span className="truncate text-xs text-muted-foreground">{triggerSnippet}</span>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {row.totalTokensInput + row.totalTokensOutput > 0
            ? `${(row.totalTokensInput + row.totalTokensOutput).toLocaleString()} tok`
            : ""}
        </span>
      </button>

      {expanded ? (
        <div className="border-t bg-muted/10 px-4 py-4 space-y-4">
          {/* Pending approvals first — they're the actionable bit */}
          {row.pendingApprovals.length > 0 ? (
            <div className="space-y-3">
              {row.pendingApprovals.map((a) => (
                <PendingApprovalCard
                  key={a.id}
                  approval={a}
                  onResolve={onResolve}
                  actionPending={actionPending}
                />
              ))}
            </div>
          ) : null}

          {/* Trigger payload */}
          <Section title="Trigger payload">
            <pre className="overflow-x-auto rounded-md border bg-background p-3 font-mono text-[11px] leading-relaxed">
              {JSON.stringify(row.triggerPayload, null, 2)}
            </pre>
          </Section>

          {/* What the agent has captured so far */}
          <Section title="Agent state">
            {Object.keys(row.captureScope).length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No state captured yet — agent hasn&apos;t reached a capture step.
              </p>
            ) : (
              <pre className="overflow-x-auto rounded-md border bg-background p-3 font-mono text-[11px] leading-relaxed">
                {JSON.stringify(row.captureScope, null, 2)}
              </pre>
            )}
          </Section>

          {/* Run metadata */}
          <Section title="Run metadata">
            <dl className="grid gap-2 text-xs sm:grid-cols-2">
              <Field label="Run ID" value={<code className="font-mono">{row.id}</code>} />
              <Field
                label="Current step"
                value={row.currentStepId ?? "—"}
              />
              <Field label="Started" value={formatTimestamp(row.createdAt)} />
              <Field label="Last update" value={formatTimestamp(row.updatedAt)} />
              <Field
                label="Tokens"
                value={`${row.totalTokensInput.toLocaleString()} in · ${row.totalTokensOutput.toLocaleString()} out`}
              />
              <Field
                label="Est. cost"
                value={`$${Number(row.totalCostUsdEstimate || 0).toFixed(4)}`}
              />
            </dl>
          </Section>
        </div>
      ) : null}
    </li>
  );
}

function PendingApprovalCard({
  approval,
  onResolve,
  actionPending,
}: {
  approval: PendingApproval;
  onResolve: (approvalId: string, decision: "approve" | "reject") => void | Promise<void>;
  actionPending: boolean;
}) {
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  async function handle(decision: "approve" | "reject") {
    setBusy(decision);
    try {
      await onResolve(approval.id, decision);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{approval.contextTitle}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{approval.contextSummary}</p>
          {approval.contextPreview ? (
            <p className="mt-2 whitespace-pre-line rounded-md border border-border/60 bg-background/70 p-3 text-xs text-foreground">
              {approval.contextPreview}
            </p>
          ) : null}
          {approval.timeoutAt ? (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Times out {formatTimestamp(approval.timeoutAt)}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={actionPending || busy !== null}
          onClick={() => handle("approve")}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white shadow-(--shadow-xs) transition-colors hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy === "approve" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="size-3.5" />
          )}
          Approve &amp; execute
        </button>
        <button
          type="button"
          disabled={actionPending || busy !== null}
          onClick={() => handle("reject")}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 text-xs font-semibold text-rose-700 dark:text-rose-400 transition-colors hover:bg-rose-500/15 disabled:opacity-50"
        >
          {busy === "reject" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <XCircle className="size-3.5" />
          )}
          Reject
        </button>
        {!approval.isCallerBound ? (
          <span className="text-[11px] text-muted-foreground">
            Bound to a different approver — your action uses the org-owner override.
          </span>
        ) : null}
      </div>
    </div>
  );
}

/* ─── small helpers ─── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details open className="space-y-2">
      <summary className="cursor-pointer list-none">
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <ChevronDown className="size-3" />
          {title}
        </span>
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}

function stringifyForSnippet(payload: Record<string, unknown>): string {
  if (!payload || Object.keys(payload).length === 0) return "—";
  // Prefer a "name + email" if present (most form/booking triggers
  // have those — most readable summary). Fall back to the first
  // key/value pair.
  const data = (payload.data as Record<string, unknown> | undefined) ?? payload;
  const name =
    typeof data.fullName === "string"
      ? data.fullName
      : typeof data.name === "string"
        ? data.name
        : null;
  const email = typeof data.email === "string" ? data.email : null;
  if (name && email) return `${name} · ${email}`;
  if (name) return name;
  if (email) return email;
  // Last resort: a compact JSON-y preview.
  const entries = Object.entries(data).slice(0, 2);
  return entries.map(([k, v]) => `${k}: ${truncate(String(v), 30)}`).join(" · ");
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const diff = Date.now() - date.getTime();
  if (diff >= 0 && diff < 24 * 60 * 60 * 1000) {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
