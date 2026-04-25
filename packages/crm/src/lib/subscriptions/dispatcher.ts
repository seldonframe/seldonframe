// Subscription dispatcher — runs from the cron tick (once per minute)
// and drives each pending/failed delivery through the handler.
//
// Shipped in SLICE 1 PR 2 Commit 3 per audit §4.4 + §4.5 + §4.6 +
// §4.7. The dispatcher is a pure function of (storage, handlers,
// now, batchLimit) + a side-effect on the storage layer — no
// external IO of its own. That makes it testable with
// InMemorySubscriptionStorage + an in-memory handler map.
//
// Sequencing for each candidate row:
//   1. CAS claim (claimDelivery). If someone else claimed, skip.
//   2. Load the subscription (getSubscription). If cascade-deleted,
//      mark failed with "subscription missing" + return.
//   3. Load the event envelope (getEventForDelivery). If the event
//      log row was retention-culled, mark failed with "event log
//      row missing" + return.
//   4. Look up the handler by name in the registry. Unknown handler
//      → mark failed with clear error + return.
//   5. Invoke handler inside try/catch (failure isolation §4.6).
//   6. On success → markDelivered.
//      On failure:
//        - If (attempt + 1 > policy.max) → markDead.
//        - Else → markFailed(attempt+1, computeNextAttemptAt).
//
// Why CAS before subscription/event/handler lookup: the claim is the
// single at-most-once gate. A tick that finds a candidate but fails
// to claim simply moves on — no partial state. Lookups can cost
// DB reads we don't want to duplicate under concurrent tick
// collisions.

import type {
  EventEnvelopeSnapshot,
  StoredBlockSubscription,
  StoredBlockSubscriptionDelivery,
  SubscriptionStorage,
} from "./types";
import { computeNextAttemptAt } from "./retry";

// ---------------------------------------------------------------------
// Handler contract
// ---------------------------------------------------------------------

/**
 * Handlers are invoked with:
 *   - event: the SeldonEvent envelope (type + data + envelope
 *     metadata). Envelope-level fields mirror those used in the
 *     idempotency template resolver.
 *   - ctx: minimal context — orgId + a logger function. Future
 *     slices may extend (DB writers, secrets lookup) but PR 2 keeps
 *     it minimal to avoid locking in accidental coupling.
 */
export type SubscriptionEvent = EventEnvelopeSnapshot;

export type SubscriptionHandlerContext = {
  orgId: string;
  /** Best-effort log; production wiring in a follow-up slice. */
  log: (message: string, fields?: Record<string, unknown>) => void;
};

export type SubscriptionHandler = (
  event: SubscriptionEvent,
  ctx: SubscriptionHandlerContext,
) => Promise<void> | void;

// ---------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------

export type SubscriptionTickInput = {
  storage: SubscriptionStorage;
  handlers: Map<string, SubscriptionHandler>;
  now: Date;
  batchLimit: number;
};

export type SubscriptionTickResult = {
  /** Candidate rows the sweep selected. */
  scanned: number;
  /** Rows this tick actually claimed (CAS succeeded). */
  claimed: number;
  /** Handler invocations that succeeded. */
  delivered: number;
  /** Handler invocations that failed — retry scheduled. */
  failed: number;
  /** Rows that exhausted the retry policy — marked dead. */
  dead: number;
};

export async function runSubscriptionTick(
  input: SubscriptionTickInput,
): Promise<SubscriptionTickResult> {
  const { storage, handlers, now, batchLimit } = input;
  const result: SubscriptionTickResult = {
    scanned: 0,
    claimed: 0,
    delivered: 0,
    failed: 0,
    dead: 0,
  };

  const candidates = await storage.findPendingDeliveries(now, batchLimit);
  result.scanned = candidates.length;

  for (const delivery of candidates) {
    const claimed = await storage.claimDelivery(delivery.id, now);
    if (!claimed) continue;
    result.claimed += 1;

    await dispatchOneDelivery(storage, delivery, handlers, now, result);
  }

  return result;
}

async function dispatchOneDelivery(
  storage: SubscriptionStorage,
  delivery: StoredBlockSubscriptionDelivery,
  handlers: Map<string, SubscriptionHandler>,
  now: Date,
  result: SubscriptionTickResult,
): Promise<void> {
  const subscription = await storage.getSubscription(delivery.subscriptionId);
  if (!subscription) {
    await recordFailure(
      storage,
      delivery,
      null,
      `subscription ${delivery.subscriptionId} missing (cascade-deleted?)`,
      now,
      result,
    );
    return;
  }

  const event = await storage.getEventForDelivery(delivery.eventLogId);
  if (!event) {
    await recordFailure(
      storage,
      delivery,
      subscription,
      `event log row ${delivery.eventLogId} missing (retention-culled?)`,
      now,
      result,
    );
    return;
  }

  const handler = handlers.get(subscription.handlerName);
  if (!handler) {
    await recordFailure(
      storage,
      delivery,
      subscription,
      `handler "${subscription.handlerName}" is not registered in the dispatcher handler map`,
      now,
      result,
    );
    return;
  }

  const ctx: SubscriptionHandlerContext = {
    orgId: event.orgId,
    log: (msg, fields) => {
      // eslint-disable-next-line no-console
      console.log(`[subscription:${subscription.handlerName}]`, msg, fields ?? {});
    },
  };

  try {
    await handler(event, ctx);
    await storage.markDelivered(delivery.id, now);
    result.delivered += 1;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordFailure(storage, delivery, subscription, message, now, result);
  }
}

async function recordFailure(
  storage: SubscriptionStorage,
  delivery: StoredBlockSubscriptionDelivery,
  subscription: StoredBlockSubscription | null,
  error: string,
  now: Date,
  result: SubscriptionTickResult,
): Promise<void> {
  const policy =
    subscription?.retryPolicy ?? {
      max: 3,
      backoff: "exponential" as const,
      initial_delay_ms: 1000,
    };
  const nextAttempt = delivery.attempt + 1;

  if (nextAttempt > policy.max) {
    await storage.markDead(delivery.id, error);
    result.dead += 1;
    return;
  }

  const nextAttemptAt = computeNextAttemptAt(policy, nextAttempt, now);
  await storage.markFailed(delivery.id, error, nextAttemptAt, nextAttempt);
  result.failed += 1;
}
