// Replay Ledger v1 — /replay (server, read-only).
//
// The org-scoped receipts dashboard for deterministic replay (Reelier phase
// 2c): what has been recorded (agent_workflow_traces) and what has been
// compiled + replayed (replay_skills / replay-run rows). Renders regardless
// of SF_DETERMINISTIC_REPLAY — the flag only gates WRITING new rows; this
// page always reads whatever history already exists.
//
// HONESTY RULE (hard): every number on this page is a direct measured
// count/sum from ledger-queries.ts — no dollar figures, no estimated
// savings. "LLM turns avoided" = count of ok=true replay-run rows, which is
// structurally true (see ledger-queries.ts header), not an estimate.
// "Steps verified" shows PASSED only; unchecked is a separate figure, never
// merged into it.
//
// Auth: same org-session guard as sibling dashboard pages (approvals/page.tsx,
// agents/runs/page.tsx) — getOrgId() + redirect to /login when absent.
//
// Styling mirrors the reskinned studio/agents/activity page: animate-page-enter
// shell, text-page-title header, KPI-tile grid on --card/--border tokens,
// rounded-2xl cards, emerald/amber/red outcome chips.

import { redirect } from "next/navigation";
import { BookOpen, CheckCircle2, ListChecks, Zap } from "lucide-react";

import { getOrgId } from "@/lib/auth/helpers";
import {
  getLedgerSummary,
  getLedgerSkillRows,
  getLedgerRecentRuns,
  type LedgerSummary,
  type LedgerSkillRow,
  type LedgerRecentRun,
} from "@/lib/deployments/replay/ledger-queries";
import type { ReplaySkillStatus } from "@/db/schema/replay-skills";

export const dynamic = "force-dynamic";

export default async function ReplayLedgerPage() {
  const orgId = await getOrgId();
  if (!orgId) redirect("/login");

  const [summary, skillRows, recentRuns] = await Promise.all([
    getLedgerSummary(orgId),
    getLedgerSkillRows(orgId),
    getLedgerRecentRuns(orgId),
  ]);

  const hasAnyActivity = summary.tracesRecorded > 0 || summary.replayRunsTotal > 0;

  return (
    <section className="animate-page-enter space-y-6">
      <div>
        <h1 className="text-page-title">Replay Ledger</h1>
        <p className="text-label text-muted-foreground">
          The receipts for deterministic replay — every recorded turn and every
          L0 replay attempt, measured directly from stored rows. No estimates,
          no dollar figures.
        </p>
      </div>

      {!hasAnyActivity ? (
        <EmptyState />
      ) : (
        <>
          <SummaryCards summary={summary} />
          <SkillsTable rows={skillRows} />
          <RecentRunsList runs={recentRuns} />
        </>
      )}
    </section>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-(--shadow-xs)">
      <span
        className="mx-auto inline-flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"
        aria-hidden
      >
        <BookOpen className="size-5" />
      </span>
      <h2 className="mt-3 text-base font-semibold text-foreground">
        No replay activity yet
      </h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Traces appear when SF_DETERMINISTIC_REPLAY is on and agents run.
      </p>
    </div>
  );
}

function SummaryCards({ summary }: { summary: LedgerSummary }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <KpiTile
        label="Replays"
        value={summary.replayRunsTotal}
        sublabel={`${summary.replayRunsOk} ok · ${summary.replayRunsFailed} failed`}
        icon={<Zap className="size-[18px]" />}
        tone="info"
      />
      <KpiTile
        label="LLM turns avoided"
        value={summary.llmTurnsAvoided}
        sublabel="ok replay runs"
        icon={<CheckCircle2 className="size-[18px]" />}
        tone="positive"
      />
      <KpiTile
        label="Steps verified"
        value={summary.stepsPassed}
        sublabel={`${summary.stepsUnchecked} unchecked · ${summary.stepsFailed} failed`}
        icon={<ListChecks className="size-[18px]" />}
        tone="neutral"
      />
      <KpiTile
        label="Traces recorded"
        value={summary.tracesRecorded}
        sublabel={summary.lastActivityAt ? `last activity ${formatWhen(summary.lastActivityAt)}` : undefined}
        icon={<BookOpen className="size-[18px]" />}
        tone="neutral"
      />
    </div>
  );
}

function KpiTile({
  label,
  value,
  sublabel,
  icon,
  tone,
}: {
  label: string;
  value: number;
  sublabel?: string;
  icon: React.ReactNode;
  tone: "positive" | "info" | "caution" | "neutral";
}) {
  const toneChip =
    tone === "positive"
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : tone === "info"
        ? "bg-primary/10 text-primary"
        : tone === "caution"
          ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
          : "bg-muted text-muted-foreground";
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-(--shadow-xs)">
      <span
        className={`inline-flex size-9 items-center justify-center rounded-xl ${toneChip}`}
        aria-hidden
      >
        {icon}
      </span>
      <div className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
        {value.toLocaleString("en-US")}
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
      {sublabel ? (
        <div className="mt-0.5 text-[11px] text-muted-foreground/80">{sublabel}</div>
      ) : null}
    </div>
  );
}

const SKILL_STATUS_STYLES: Record<ReplaySkillStatus, string> = {
  enabled: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  draft: "border-muted-foreground/30 bg-muted text-muted-foreground",
  disabled: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
};

function SkillsTable({ rows }: { rows: LedgerSkillRow[] }) {
  if (rows.length === 0) {
    return (
      <div>
        <h2 className="text-card-title text-foreground">Compiled skills</h2>
        <div className="mt-2 rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground shadow-(--shadow-xs)">
          No skills compiled yet.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-card-title text-foreground">Compiled skills</h2>
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-(--shadow-xs)">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-3 font-medium">Skill</th>
              <th className="px-5 py-3 font-medium">Deployment</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Trigger filter</th>
              <th className="px-5 py-3 font-medium">Heals</th>
              <th className="px-5 py-3 font-medium">Last replayed</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border align-top last:border-0 hover:bg-muted/30">
                <td className="px-5 py-3 font-medium text-foreground">{row.name ?? "—"}</td>
                <td className="px-5 py-3 text-muted-foreground">{row.deploymentName ?? row.deploymentId}</td>
                <td className="px-5 py-3">
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${SKILL_STATUS_STYLES[row.status]}`}
                  >
                    {row.status}
                  </span>
                </td>
                <td className="px-5 py-3 text-xs text-muted-foreground">
                  {formatTriggerFilter(row.triggerFilter)}
                </td>
                <td className="px-5 py-3 text-muted-foreground">{row.healCount}</td>
                <td className="px-5 py-3 text-muted-foreground">
                  {row.lastReplayAt ? formatWhen(row.lastReplayAt) : "never"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RecentRunsList({ runs }: { runs: LedgerRecentRun[] }) {
  if (runs.length === 0) {
    return (
      <div>
        <h2 className="text-card-title text-foreground">Recent runs</h2>
        <div className="mt-2 rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground shadow-(--shadow-xs)">
          No runs yet.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-card-title text-foreground">Recent runs</h2>
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-(--shadow-xs)">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-3 font-medium">When</th>
              <th className="px-5 py-3 font-medium">Kind</th>
              <th className="px-5 py-3 font-medium">Deployment</th>
              <th className="px-5 py-3 font-medium">Outcome</th>
              <th className="px-5 py-3 font-medium">Steps</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id} className="border-b border-border align-top last:border-0 hover:bg-muted/30">
                <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-muted-foreground">
                  {formatWhen(run.createdAt)}
                </td>
                <td className="px-5 py-3 uppercase text-muted-foreground">
                  {run.kind === "replay-run" ? "replay" : "trace"}
                </td>
                <td className="px-5 py-3 text-muted-foreground">{run.deploymentName ?? run.deploymentId ?? "—"}</td>
                <td className="px-5 py-3">
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                      run.ok
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400"
                    }`}
                  >
                    {run.ok ? "ok" : "failed"}
                  </span>
                </td>
                <td className="px-5 py-3">
                  {run.stepTotals ? (
                    <StepOutcomeChips totals={run.stepTotals} />
                  ) : (
                    <span className="text-xs text-muted-foreground">{run.callCount} call(s)</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Per-run step outcome chips — passed / unchecked / failed kept as SEPARATE
 *  visual counters, never merged into a single "verified" figure. Skipped
 *  only renders when > 0 (a zero-skipped run stays uncluttered). */
function StepOutcomeChips({
  totals,
}: {
  totals: { passed: number; unchecked: number; skipped: number; failed: number };
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <OutcomeChip label="passed" value={totals.passed} tone="positive" />
      <OutcomeChip label="unchecked" value={totals.unchecked} tone="caution" />
      {totals.skipped > 0 ? <OutcomeChip label="skipped" value={totals.skipped} tone="neutral" /> : null}
      <OutcomeChip label="failed" value={totals.failed} tone="negative" />
    </div>
  );
}

function OutcomeChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "positive" | "caution" | "negative" | "neutral";
}) {
  const toneClass =
    tone === "positive"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : tone === "caution"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
        : tone === "negative"
          ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400"
          : "border-muted-foreground/30 bg-muted text-muted-foreground";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${toneClass}`}>
      {value} {label}
    </span>
  );
}

function formatTriggerFilter(filter: LedgerSkillRow["triggerFilter"]): string {
  if (!filter) return "every event";
  const parts: string[] = [];
  if (filter.senderEndsWith) parts.push(`sender ends with "${filter.senderEndsWith}"`);
  if (filter.senderContains) parts.push(`sender contains "${filter.senderContains}"`);
  if (filter.subjectContains) parts.push(`subject contains "${filter.subjectContains}"`);
  return parts.length > 0 ? parts.join(", ") : "every event";
}

/** A compact, locale-stable "when" — e.g. "Jun 26, 14:32". */
function formatWhen(date: Date): string {
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
