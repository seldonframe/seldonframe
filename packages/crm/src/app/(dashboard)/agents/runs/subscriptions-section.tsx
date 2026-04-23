// SLICE 1 PR 2 C5 — lean read-only subscriptions observability section
// for /agents/runs.
//
// Server component. Renders per-subscription: name (blockSlug +
// handlerName), active/dormant state, 24h + 7d delivery counts,
// success rate, last delivered timestamp, and the top 5 recent
// failures with error previews.
//
// Deferred to tasks/follow-up-subscription-observability-polish.md:
//   - Filter controls (status + date range)
//   - Per-subscription drawer with full history + chart
//   - Retry/dismiss buttons on dead-lettered deliveries
//
// The queries run via computeSubscriptionSummary (lib/subscriptions/
// summary.ts) which is pure + storage-agnostic + unit-tested. This
// component just renders. No client-side fetching (L-18: server-side
// only in the query layer).

import { db } from "@/db";
import { DrizzleSubscriptionStorage } from "@/lib/subscriptions/storage-drizzle";
import {
  computeSubscriptionSummary,
  type SubscriptionSummaryRow,
} from "@/lib/subscriptions/summary";

export async function SubscriptionsSection({ orgId }: { orgId: string }) {
  const storage = new DrizzleSubscriptionStorage(db);
  const summary = await computeSubscriptionSummary(orgId, new Date(), storage);

  if (summary.length === 0) return null;

  return (
    <section className="space-y-3">
      <header>
        <h2 className="text-base font-semibold">Subscriptions</h2>
        <p className="text-sm text-muted-foreground">
          Block-level reactive handlers. Dormant rows are registered but waiting
          for their producer block to install.
        </p>
      </header>
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="px-3 py-2 font-medium">Handler</th>
              <th className="px-3 py-2 font-medium">State</th>
              <th className="px-3 py-2 font-medium text-right">24h</th>
              <th className="px-3 py-2 font-medium text-right">7d</th>
              <th className="px-3 py-2 font-medium text-right">Success</th>
              <th className="px-3 py-2 font-medium">Last delivered</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((row) => (
              <SubscriptionRow key={row.subscriptionId} row={row} />
            ))}
          </tbody>
        </table>
      </div>
      {summary.some((r) => r.recentFailures.length > 0) && (
        <RecentFailures summary={summary} />
      )}
    </section>
  );
}

function SubscriptionRow({ row }: { row: SubscriptionSummaryRow }) {
  const { subscription, last24h, last7d, successRate7d, lastDeliveredAt } = row;
  return (
    <tr className="border-t">
      <td className="px-3 py-2">
        <div className="font-mono text-xs">{subscription.handlerName}</div>
        <div className="text-xs text-muted-foreground">
          {subscription.blockSlug} · {subscription.eventType}
        </div>
      </td>
      <td className="px-3 py-2">
        {subscription.active ? (
          <span className="text-green-600 text-xs font-medium">active</span>
        ) : (
          <span className="text-amber-600 text-xs font-medium">dormant</span>
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {last24h.delivered}
        {last24h.failed > 0 && (
          <span className="text-red-600 ml-1">/{last24h.failed}</span>
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {last7d.delivered}
        {last7d.failed > 0 && (
          <span className="text-red-600 ml-1">/{last7d.failed}</span>
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {successRate7d === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          `${Math.round(successRate7d * 100)}%`
        )}
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground">
        {lastDeliveredAt ? lastDeliveredAt.toISOString().replace("T", " ").slice(0, 16) : "—"}
      </td>
    </tr>
  );
}

function RecentFailures({ summary }: { summary: SubscriptionSummaryRow[] }) {
  const withFailures = summary.filter((r) => r.recentFailures.length > 0);
  return (
    <details className="rounded-md border bg-muted/20">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
        Recent failures ({withFailures.reduce((n, r) => n + r.recentFailures.length, 0)})
      </summary>
      <div className="space-y-3 border-t p-3">
        {withFailures.map((row) => (
          <div key={row.subscriptionId} className="space-y-1">
            <div className="text-xs font-mono">{row.subscription.handlerName}</div>
            <ul className="space-y-1 text-xs">
              {row.recentFailures.map((d) => (
                <li key={d.id} className="flex gap-2">
                  <span className="text-muted-foreground tabular-nums">
                    {d.createdAt.toISOString().replace("T", " ").slice(0, 16)}
                  </span>
                  <span className={d.status === "dead" ? "text-red-600" : "text-amber-600"}>
                    {d.status}
                  </span>
                  <span className="truncate">{d.lastError ?? "(no error message)"}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}
