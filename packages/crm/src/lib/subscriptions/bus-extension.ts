// Bus-side subscription discovery + enqueue.
//
// Shipped in SLICE 1 PR 2 Commit 2 per tasks/step-subscription-audit.md
// §4.2. Runs in the emit-caller's request AFTER the workflow_waits
// sync-resume scan (lib/events/bus.ts). For every active subscription
// matching (orgId, eventType):
//   1. Evaluate the filter predicate (if declared). Rejection inserts
//      a delivery row with status="filtered" (G-6 distinct terminal
//      state — admin sees the event was considered and rejected,
//      not silently dropped).
//   2. Resolve the idempotency key template against the event
//      envelope + payload.
//   3. Insert the delivery row. The unique (subscriptionId,
//      idempotencyKey) index absorbs duplicate emissions (insert
//      returns null; we count but don't fail).
//
// Runs synchronously in the emit path because:
//   - Predicate evaluation is a pure function (same shape the
//     await_event sync resume uses — predicate-eval.ts).
//   - Delivery row insertion is a single SQL write; no external IO.
//   - Handler invocation is explicitly deferred to the cron
//     dispatcher (G-2 async delivery, audit §4.3). The emit path
//     never invokes handler code.
//
// Isolated from `lib/events/bus.ts` so tests can inject an in-memory
// storage without booting Postgres — mirror of
// `resumePendingWaitsForEventInContext`'s shape.

import { evaluatePredicate } from "../workflow/predicate-eval";
import { resolveIdempotencyTemplate } from "./idempotency";
import type { SubscriptionStorage } from "./types";

export type EnqueueResult = {
  /** Subscriptions that matched the (orgId, eventType) scan. */
  matched: number;
  /**
   * Delivery rows inserted with status="pending" (handler will run).
   * Excludes filtered rows.
   */
  enqueued: number;
  /**
   * Delivery rows inserted with status="filtered" (G-6). The
   * subscription's filter predicate rejected the event; the row is
   * recorded for admin visibility but the cron will skip it.
   */
  filtered: number;
};

export async function enqueueSubscriptionDeliveriesForEventInContext(
  context: { storage: SubscriptionStorage },
  orgId: string,
  eventType: string,
  payload: Record<string, unknown>,
  eventLogId: string | null,
): Promise<EnqueueResult> {
  // eventLogId is the FK target for delivery.eventLogId. Without a
  // log row, we can't persist a delivery — short-circuit so the bus
  // doesn't blow past a best-effort log-write failure.
  if (!eventLogId) {
    return { matched: 0, enqueued: 0, filtered: 0 };
  }

  const subscriptions = await context.storage.findActiveSubscriptions(orgId, eventType);
  if (subscriptions.length === 0) {
    return { matched: 0, enqueued: 0, filtered: 0 };
  }

  const envelope = {
    id: eventLogId,
    eventType,
    emittedAt: new Date().toISOString(),
    orgId,
  };

  let enqueued = 0;
  let filtered = 0;

  for (const sub of subscriptions) {
    // Filter evaluation (G-6).
    let status: "pending" | "filtered" = "pending";
    if (sub.filterPredicate) {
      const passes = evaluatePredicate(
        sub.filterPredicate as Parameters<typeof evaluatePredicate>[0],
        payload,
      );
      if (!passes) status = "filtered";
    }

    const idempotencyKey = resolveIdempotencyTemplate(
      sub.idempotencyKeyTemplate,
      payload,
      envelope,
    );

    const inserted = await context.storage.insertDelivery({
      subscriptionId: sub.id,
      eventLogId,
      idempotencyKey,
      status,
    });

    if (inserted) {
      if (status === "filtered") filtered += 1;
      else enqueued += 1;
    }
    // insertDelivery returned null → duplicate key; ON CONFLICT DO
    // NOTHING absorbed the insert. Counted in `matched` but not in
    // `enqueued` / `filtered`.
  }

  return {
    matched: subscriptions.length,
    enqueued,
    filtered,
  };
}
