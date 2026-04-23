// Subscription observability summary — the read-model that backs the
// lean C5 admin surface on /agents/runs.
//
// Shipped in SLICE 1 PR 2 Commit 5. Covers the minimum operator
// question: "is this subscription working? If not, what's the
// failure?" Filter/retry/dismiss/drawer functionality deferred to
// tasks/follow-up-subscription-observability-polish.md.
//
// Aggregation happens in JS after a bounded storage read. At v1
// scale (seldom more than a handful of subscriptions per workspace,
// with deliveries kept to retention windows), per-subscription
// listing + in-JS reduce is well within the <500ms server render
// budget.

import type { StoredBlockSubscription, StoredBlockSubscriptionDelivery } from "../../db/schema";
import type { SubscriptionStorage } from "./types";

export type WindowCounts = {
  delivered: number;
  failed: number;
  filtered: number;
  dead: number;
};

export type SubscriptionSummaryRow = {
  subscriptionId: string;
  subscription: StoredBlockSubscription;
  last24h: WindowCounts;
  last7d: WindowCounts;
  /** Most recent `delivered` timestamp (null if never delivered). */
  lastDeliveredAt: Date | null;
  /**
   * delivered / (delivered + failed + dead) over the 7d window.
   * Null when no attempts in that window (avoids div-by-zero +
   * avoids a misleading "0%" that actually means "no data").
   * `filtered` deliveries are excluded — they're a distinct G-6
   * terminal state and never ran the handler.
   */
  successRate7d: number | null;
  /** Latest 5 failed/dead deliveries (newest first) for quick triage. */
  recentFailures: StoredBlockSubscriptionDelivery[];
};

const H = 60 * 60 * 1000;
const RECENT_FAILURES_LIMIT = 5;

export async function computeSubscriptionSummary(
  orgId: string,
  now: Date,
  storage: SubscriptionStorage,
): Promise<SubscriptionSummaryRow[]> {
  const subscriptions = await storage.listSubscriptionsByOrg(orgId);
  if (subscriptions.length === 0) return [];

  const cutoff24h = new Date(now.getTime() - 24 * H);
  const cutoff7d = new Date(now.getTime() - 7 * 24 * H);

  const rows: SubscriptionSummaryRow[] = [];
  for (const sub of subscriptions) {
    const deliveries = await storage.listDeliveriesBySubscription(sub.id);

    const last24h = emptyWindow();
    const last7d = emptyWindow();
    let lastDeliveredAt: Date | null = null;
    const failuresNewestFirst: StoredBlockSubscriptionDelivery[] = [];

    for (const d of deliveries) {
      const ts = d.createdAt;
      if (ts >= cutoff24h) bump(last24h, d.status);
      if (ts >= cutoff7d) bump(last7d, d.status);
      if (d.status === "delivered" && d.deliveredAt) {
        if (!lastDeliveredAt || d.deliveredAt > lastDeliveredAt) {
          lastDeliveredAt = d.deliveredAt;
        }
      }
      if (
        (d.status === "failed" || d.status === "dead") &&
        failuresNewestFirst.length < RECENT_FAILURES_LIMIT
      ) {
        failuresNewestFirst.push(d);
      }
    }

    const attempts7d = last7d.delivered + last7d.failed + last7d.dead;
    const successRate7d = attempts7d === 0 ? null : last7d.delivered / attempts7d;

    rows.push({
      subscriptionId: sub.id,
      subscription: sub,
      last24h,
      last7d,
      lastDeliveredAt,
      successRate7d,
      recentFailures: failuresNewestFirst,
    });
  }

  return rows;
}

function emptyWindow(): WindowCounts {
  return { delivered: 0, failed: 0, filtered: 0, dead: 0 };
}

function bump(
  counts: WindowCounts,
  status: StoredBlockSubscriptionDelivery["status"],
): void {
  if (status === "delivered") counts.delivered += 1;
  else if (status === "failed") counts.failed += 1;
  else if (status === "filtered") counts.filtered += 1;
  else if (status === "dead") counts.dead += 1;
  // pending / in_flight don't contribute to windowed counts —
  // they're transient and surface in the full-history drawer
  // (follow-up ticket), not the summary.
}
