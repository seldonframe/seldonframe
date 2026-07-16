import Link from "next/link";
import { Radio } from "lucide-react";
import type { DeployedAgentStripRow } from "@/lib/agent-receipts/store";
import type { AgentRunReceiptTriggerKind } from "@/db/schema/agent-run-receipts";

/**
 * Agent truth slice (2026-07-16, Task 3, P4-lite) — the /automations "Your
 * agents" strip. Max's live-run finding: "i don't see the agents for zen in
 * /automations" — the agent CATALOG (archetype templates) lived here, but a
 * builder's already-DEPLOYED agents (built in Studio) had no presence on this
 * page at all. This answers "where are my agents" with a compact, org-scoped
 * list WITHOUT rebuilding /automations (the full /automations↔agents
 * fold-in stays the named roadmap item — see the design doc).
 *
 * Purely presentational — `rows` is pre-loaded server-side by
 * `loadDeployedAgentsForStrip` (org-scoped). Empty state reuses the same two
 * doors as `TwoDoorsCard` (Describe it / Record it) so there is exactly ONE
 * "build an agent" entry point taught across the page.
 */
export function YourAgentsStrip({ rows }: { rows: DeployedAgentStripRow[] }) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Your agents
      </h2>

      {rows.length === 0 ? (
        <div
          data-your-agents-empty
          className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border bg-muted/10 p-4 text-xs text-muted-foreground"
        >
          <span>No deployed agents yet — build one:</span>
          <Link href="/studio/agents" className="font-medium text-foreground hover:underline">
            Describe it &rarr;
          </Link>
          <Link href="/record" className="font-medium text-foreground hover:underline">
            Record it &rarr;
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          {rows.map((row) => (
            <YourAgentsRow key={row.deploymentId} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

const TRIGGER_LABEL: Record<AgentRunReceiptTriggerKind, string> = {
  push: "push",
  schedule: "schedule",
  event: "event",
};

function YourAgentsRow({ row }: { row: DeployedAgentStripRow }) {
  return (
    <Link
      href={`/studio/agents/${row.templateId}`}
      data-your-agents-row
      className="flex items-center gap-3 border-b border-border/70 px-4 py-2.5 text-sm last:border-b-0 hover:bg-muted/40"
    >
      {row.active ? (
        <span
          data-your-agents-live-dot
          className="size-1.5 shrink-0 animate-pulse rounded-full bg-emerald-500"
          aria-hidden
        />
      ) : (
        <Radio className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      )}
      <span className="min-w-0 flex-1 truncate font-medium text-foreground">{row.agentName}</span>
      {row.triggerKind ? (
        <span
          data-trigger-chip
          className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
        >
          {TRIGGER_LABEL[row.triggerKind]}
        </span>
      ) : null}
    </Link>
  );
}
