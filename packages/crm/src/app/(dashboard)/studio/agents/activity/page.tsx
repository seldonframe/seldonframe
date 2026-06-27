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
//
// Reskin (Claude Design, direction A / calm): KPI tiles (Sent / Posted / Blocked)
// over a clean card-wrapped table, on the LIVE SeldonFrame tokens (--primary,
// --foreground, --muted-foreground, --border, bg-card). Behavior is untouched —
// the activity query, the 1d/7d/30d window toggle, the outcome styling, the test
// badge, and the per-row detail all stay exactly as they were; the KPI counts are
// a pure fold over the already-loaded rows.

import Link from "next/link";
import { Activity, Check, Send, ShieldAlert } from "lucide-react";
import { getOrgId } from "@/lib/auth/helpers";
import { loadEventAgentActivity } from "@/lib/agents/triggers/activity-store";
import {
  parseActivityWindowDays,
  type ActivityWindowDays,
  type EventAgentActivityOutcome,
  type EventAgentActivityRow,
} from "@/lib/agents/triggers/activity";
import { StudioTabs } from "../../studio-tabs";

export const dynamic = "force-dynamic";

/** The three windows the segmented control offers. */
const WINDOW_OPTIONS: { days: ActivityWindowDays; label: string }[] = [
  { days: 1, label: "1d" },
  { days: 7, label: "7d" },
  { days: 30, label: "30d" },
];

export default async function EventAgentActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>;
}) {
  const { window } = await searchParams;
  const windowDays = parseActivityWindowDays(window);

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

  const rows = await loadEventAgentActivity(orgId, 50, windowDays);

  // KPI tiles — a pure fold over the rows already loaded (no extra query). "Posted"
  // mirrors the mockup's social outcome; the event-agent path tags those as sends
  // on a social channel, so we count sent-on-social separately for the tile.
  const kpis = summarizeActivityKpis(rows);

  return (
    <section className="animate-page-enter space-y-6">
      <StudioTabs />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-page-title">Activity</h1>
          <p className="text-label text-muted-foreground">
            Did your agents do their job? Recent fires from your event-triggered
            (outbound) agents — review requests, lead replies, scheduled and
            blocked sends.
          </p>
        </div>
        <WindowToggle active={windowDays} />
      </div>

      {/* ── KPI tiles: Sent / Posted / Blocked + total fires. Calm cards. ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile
          label="Sent"
          value={kpis.sent}
          icon={<Check className="size-[18px]" />}
          tone="positive"
        />
        <KpiTile
          label="Posted"
          value={kpis.posted}
          icon={<Send className="size-[18px]" />}
          tone="info"
        />
        <KpiTile
          label="Blocked"
          value={kpis.blocked}
          icon={<ShieldAlert className="size-[18px]" />}
          tone="caution"
        />
        <KpiTile
          label={`Fires · last ${windowDays}${windowDays === 1 ? "d" : "d"}`}
          value={kpis.total}
          icon={<Activity className="size-[18px]" />}
          tone="neutral"
        />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-(--shadow-xs)">
          <span
            className="mx-auto inline-flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"
            aria-hidden
          >
            <Activity className="size-5" />
          </span>
          <h2 className="mt-3 text-base font-semibold text-foreground">
            No activity in the last {windowDays}{" "}
            {windowDays === 1 ? "day" : "days"}
          </h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            When an event agent fires — after a booking completes or a lead
            arrives — its sends show up here. Widen the window above, or use{" "}
            <span className="font-medium text-foreground">Send test</span> on an
            outbound agent to fire one now.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Recent activity header + the outcome legend (matches the mockup's
              Sent / Posted / Blocked chips — a visual key for the status pills
              below, not a filter control). */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-card-title text-foreground">Recent activity</h2>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground">
                All
              </span>
              <LegendChip label="Sent" dot="bg-emerald-500" />
              <LegendChip label="Posted" dot="bg-primary" />
              <LegendChip label="Blocked" dot="bg-amber-500" />
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-(--shadow-xs)">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3 font-medium">When</th>
                  <th className="px-5 py-3 font-medium">Agent</th>
                  <th className="px-5 py-3 font-medium">Client</th>
                  <th className="px-5 py-3 font-medium">Channel</th>
                  <th className="px-5 py-3 font-medium">Contact</th>
                  <th className="px-5 py-3 font-medium">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <ActivityRow key={idx} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

/** The 1d / 7d / 30d segmented control. Server-rendered: each segment is a Link
 *  to `?window=N`, so selecting one re-runs this server component with the new
 *  window (the page is force-dynamic). The active segment reads as a filled pill;
 *  `scroll={false}` keeps the viewport put on switch. */
function WindowToggle({ active }: { active: ActivityWindowDays }) {
  return (
    <div
      className="inline-flex items-center rounded-lg border border-border bg-muted/40 p-0.5"
      role="group"
      aria-label="Activity window"
    >
      {WINDOW_OPTIONS.map((opt) => {
        const isActive = opt.days === active;
        return (
          <Link
            key={opt.days}
            href={`/studio/agents/activity?window=${opt.days}`}
            scroll={false}
            aria-current={isActive ? "true" : undefined}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors duration-150 ${
              isActive
                ? "bg-background text-foreground shadow-(--shadow-xs)"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {opt.label}
          </Link>
        );
      })}
    </div>
  );
}

/** A calm KPI tile: a soft-tinted icon chip, a big number, and a label. Pure
 *  presentation — mirrors the editor reskin's card vocabulary. */
function KpiTile({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
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
    </div>
  );
}

/** A small outcome-legend chip: a colored dot + label. Visual key only. */
function LegendChip({ label, dot }: { label: string; dot: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-muted-foreground">
      <span className={`size-[7px] rounded-full ${dot}`} aria-hidden />
      {label}
    </span>
  );
}

/** Fold the loaded rows into the KPI counts. Pure — no query. "Posted" = sends on
 *  a social channel (instagram/facebook/social); "Sent" = every other send; the
 *  scheduled/skipped outcomes don't get a tile (they're visible inline). */
function summarizeActivityKpis(rows: EventAgentActivityRow[]): {
  sent: number;
  posted: number;
  blocked: number;
  total: number;
} {
  let sent = 0;
  let posted = 0;
  let blocked = 0;
  for (const r of rows) {
    if (r.outcome === "blocked") {
      blocked += 1;
    } else if (r.outcome === "sent") {
      if (isSocialChannel(r.channel)) posted += 1;
      else sent += 1;
    }
  }
  return { sent, posted, blocked, total: rows.length };
}

function isSocialChannel(channel: string): boolean {
  const c = channel.toLowerCase();
  return (
    c.includes("instagram") ||
    c.includes("facebook") ||
    c.includes("social") ||
    c.includes("post")
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
  blocked: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
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
    <tr className="border-b border-border align-top transition-colors last:border-0 hover:bg-muted/30">
      <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-muted-foreground">
        {formatWhen(row.when)}
      </td>
      <td className="px-5 py-3">
        <span className="font-medium text-foreground">
          {prettifySkill(row.skill)}
        </span>
        {row.isTest && (
          <span className="ml-2 inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
            test
          </span>
        )}
      </td>
      <td className="px-5 py-3 text-muted-foreground">{row.clientLabel}</td>
      <td className="px-5 py-3 uppercase text-muted-foreground">
        {row.channel}
      </td>
      <td className="px-5 py-3 text-foreground">{row.contactLabel}</td>
      <td className="px-5 py-3">
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
