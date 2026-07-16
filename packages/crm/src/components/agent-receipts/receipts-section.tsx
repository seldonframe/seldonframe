// <AgentRunReceiptsSection> — the "Agent runs" table on
// /studio/agents/activity. Design: docs/superpowers/specs/
// 2026-07-16-agent-receipts-design.md (Task 3).
//
// Pure presentation — the page loads rows via loadAgentRunReceipts
// (lib/agent-receipts/store.ts) and passes them in. Mirrors the existing
// outbound-activity table's markup/tokens on the SAME page (rounded-2xl
// card, border-border, bg-card, the same th/td spacing) so the two tables
// read as one system.

import type {
  AgentRunReceiptStatus,
} from "@/db/schema/agent-run-receipts";
import type { AgentRunReceiptViewRow } from "@/lib/agent-receipts/store";

const STATUS_STYLES: Record<AgentRunReceiptStatus, string> = {
  ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  error: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
  skipped: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

const STATUS_LABEL: Record<AgentRunReceiptStatus, string> = {
  ok: "OK",
  error: "Error",
  skipped: "Skipped",
};

/** A compact, locale-stable "when" — e.g. "Jul 16, 00:04". Falls back to the
 *  raw string if it isn't parseable. */
function formatWhen(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AgentRunReceiptsSection({
  rows,
}: {
  rows: AgentRunReceiptViewRow[];
}) {
  if (rows.length === 0) {
    return (
      <div
        data-agent-run-receipts-empty
        className="rounded-2xl border border-border bg-card p-8 text-center shadow-(--shadow-xs)"
      >
        <h2 className="text-base font-semibold text-foreground">No agent runs yet</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          When a push- or schedule-triggered agent fires, its run shows up
          here — whether or not it took any action.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-agent-run-receipts>
      <h2 className="text-card-title text-foreground">Agent runs</h2>
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-(--shadow-xs)">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-3 font-medium">When</th>
              <th className="px-5 py-3 font-medium">Agent</th>
              <th className="px-5 py-3 font-medium">Trigger</th>
              <th className="px-5 py-3 font-medium">Source</th>
              <th className="px-5 py-3 font-medium">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <AgentRunReceiptRow key={row.id} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AgentRunReceiptRow({ row }: { row: AgentRunReceiptViewRow }) {
  return (
    <tr
      data-agent-run-receipt-row
      className="border-b border-border align-top transition-colors last:border-0 hover:bg-muted/30"
    >
      <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-muted-foreground">
        {formatWhen(row.when)}
      </td>
      <td className="px-5 py-3 text-foreground">{row.agentLabel}</td>
      <td className="px-5 py-3 uppercase text-muted-foreground">{row.triggerKind}</td>
      <td className="px-5 py-3 text-muted-foreground">{row.sourceRef ?? "—"}</td>
      <td className="px-5 py-3">
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[row.status]}`}
        >
          {STATUS_LABEL[row.status]}
        </span>
        <span className="ml-2 text-xs text-muted-foreground">{row.summary}</span>
        {row.toolCalls.length > 0 ? (
          <details className="mt-1" data-agent-run-receipt-tool-calls>
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              {row.toolCalls.length} tool call{row.toolCalls.length === 1 ? "" : "s"}
            </summary>
            <ul className="mt-1 space-y-0.5 pl-4 text-xs text-muted-foreground">
              {row.toolCalls.map((call, idx) => (
                <li key={idx}>
                  {call.ok ? "✓" : "✗"} {call.tool}
                  {call.note ? ` — ${call.note}` : ""}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </td>
    </tr>
  );
}
