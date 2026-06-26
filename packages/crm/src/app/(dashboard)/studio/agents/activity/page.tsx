// Event-agent activity — /studio/agents/activity (server, read-only).
//
// A lightweight observability surface for the OUTBOUND (event) agents: the org's
// recent fires across the durable sources — sends (smsMessages/emails tagged
// metadata.source 'agent:%'), scheduled (F2 deferred event_agent_scheduled_sends,
// pending), and blocked (those rows that failed a gate/send on replay). The
// event-agent path has no workflow_runs row, so this is the closest thing to
// "/runs for event agents" the operator asked for.
//
// Org-scoped + read-only: getOrgId() gates it; loadEventAgentActivity queries
// only this org's rows and folds them via the pure summarizeEventAgentActivity.

import { Activity } from "lucide-react";
import { getOrgId } from "@/lib/auth/helpers";
import { loadEventAgentActivity } from "@/lib/agents/triggers/activity-store";
import type {
  EventAgentActivityOutcome,
  EventAgentActivityRow,
} from "@/lib/agents/triggers/activity";
import { StudioTabs } from "../../studio-tabs";

export const dynamic = "force-dynamic";

export default async function EventAgentActivityPage() {
  const orgId = await getOrgId();
  if (!orgId) {
    return (
      <section className="animate-page-enter space-y-4">
        <StudioTabs />
        <h1 className="text-page-title">Activity</h1>
        <p className="text-sm text-muted-foreground">
          Sign in to see your agents&apos; activity.
        </p>
      </section>
    );
  }

  const rows = await loadEventAgentActivity(orgId, 50);

  return (
    <section className="animate-page-enter space-y-5">
      <StudioTabs />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-page-title">Activity</h1>
          <p className="text-label text-[hsl(var(--color-text-secondary))]">
            Recent fires from your event-triggered (outbound) agents — review
            requests, lead replies, scheduled and blocked sends.
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center">
          <span
            className="mx-auto inline-flex size-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500 dark:text-indigo-400"
            aria-hidden
          >
            <Activity className="size-5" />
          </span>
          <h2 className="mt-3 text-base font-semibold">No activity yet</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            When an event agent fires — after a booking completes or a lead
            arrives — its sends show up here. Use{" "}
            <span className="font-medium text-foreground">Send test</span> on an
            outbound agent to fire one now.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">When</th>
                <th className="px-4 py-2.5 font-medium">Agent</th>
                <th className="px-4 py-2.5 font-medium">Channel</th>
                <th className="px-4 py-2.5 font-medium">Contact</th>
                <th className="px-4 py-2.5 font-medium">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <ActivityRow key={idx} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Prettify a skill slug for the agent column: "review-requester" → "Review
 *  requester". A blank slug renders an em dash. */
function prettifySkill(skill: string): string {
  const s = skill.trim();
  if (!s) return "—";
  const words = s.split(/[-_.\s]+/).filter(Boolean);
  if (words.length === 0) return "—";
  return words
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** A compact, locale-stable "when" — e.g. "Jun 26, 14:32". Falls back to the raw
 *  string if it isn't parseable (defensive; the loader always sends ISO). */
function formatWhen(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  const d = new Date(ms);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const OUTCOME_STYLES: Record<EventAgentActivityOutcome, string> = {
  sent: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  scheduled: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  blocked: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400",
  skipped: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

const OUTCOME_LABEL: Record<EventAgentActivityOutcome, string> = {
  sent: "Sent",
  scheduled: "Scheduled",
  blocked: "Blocked",
  skipped: "Skipped",
};

function ActivityRow({ row }: { row: EventAgentActivityRow }) {
  return (
    <tr className="border-b last:border-0 align-top">
      <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">
        {formatWhen(row.when)}
      </td>
      <td className="px-4 py-2.5">
        <span className="font-medium text-foreground">
          {prettifySkill(row.skill)}
        </span>
        {row.isTest && (
          <span className="ml-2 inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
            test
          </span>
        )}
      </td>
      <td className="px-4 py-2.5 uppercase text-muted-foreground">
        {row.channel}
      </td>
      <td className="px-4 py-2.5 text-foreground">{row.contactLabel}</td>
      <td className="px-4 py-2.5">
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${OUTCOME_STYLES[row.outcome]}`}
        >
          {OUTCOME_LABEL[row.outcome]}
        </span>
        {row.detail && (
          <span className="ml-2 text-xs text-muted-foreground">{row.detail}</span>
        )}
      </td>
    </tr>
  );
}
