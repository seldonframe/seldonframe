// SubscriptionStorage interface + input shapes. Parallel to
// RuntimeStorage in lib/workflow/types.ts: tests inject an
// InMemorySubscriptionStorage; production uses
// DrizzleSubscriptionStorage. Kept separate so subscription code
// doesn't have to import the workflow runtime's storage surface.
//
// Shipped in SLICE 1 PR 2 Commit 2 (bus extension) per
// tasks/step-subscription-audit.md §4.1 + §4.2. PR 2 C3 extends with
// the CAS + retry methods the dispatcher needs.

import type {
  StoredBlockSubscription,
  StoredBlockSubscriptionDelivery,
  BlockSubscriptionDeliveryStatus,
} from "../../db/schema";

// ---------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------

export type NewSubscriptionInput = {
  orgId: string;
  blockSlug: string;
  eventType: string;
  handlerName: string;
  idempotencyKeyTemplate?: string;
  filterPredicate?: Record<string, unknown> | null;
  retryPolicy?: {
    max: number;
    backoff: "exponential" | "linear" | "fixed";
    initial_delay_ms: number;
  };
  active?: boolean;
};

export type NewDeliveryInput = {
  subscriptionId: string;
  eventLogId: string;
  idempotencyKey: string;
  /**
   * Optional — defaults to "pending". Enqueue writes
   * status="filtered" directly when the subscription's filter
   * predicate rejects the event (G-6 distinct terminal state,
   * observable without re-evaluating at dispatch time).
   */
  status?: BlockSubscriptionDeliveryStatus;
};

// ---------------------------------------------------------------------
// Storage interface
// ---------------------------------------------------------------------

/**
 * Minimal view of the event that triggered a delivery. Shape mirrors
 * the SeldonEvent union convention from packages/core/src/events:
 *   { type, data } — so handlers destructure the same way they
 *   would when consuming SeldonEvent directly.
 * Plus envelope metadata (eventLogId / orgId / emittedAt) for
 * handlers that need workspace scoping or event-log cross-reference.
 */
export type EventEnvelopeSnapshot = {
  type: string;
  data: Record<string, unknown>;
  eventLogId: string;
  orgId: string;
  emittedAt: Date;
};

export interface SubscriptionStorage {
  /**
   * Install-time registration. Returns the new subscription id.
   * PR 2 C4 wires this into the workspace install path.
   */
  registerSubscription(input: NewSubscriptionInput): Promise<string>;

  /** Emit-time scan: "which subs match this (orgId, eventType)?" */
  findActiveSubscriptions(
    orgId: string,
    eventType: string,
  ): Promise<StoredBlockSubscription[]>;

  /**
   * Enqueue a delivery row. Returns the new delivery id, or `null`
   * when the UNIQUE (subscriptionId, idempotencyKey) index absorbs
   * the insert (duplicate emission). Mirrors ON CONFLICT DO NOTHING
   * semantics at the storage level.
   */
  insertDelivery(input: NewDeliveryInput): Promise<string | null>;

  // -------------------------------------------------------------------
  // Dispatcher-side methods (C3).
  // -------------------------------------------------------------------

  /**
   * Cron sweep: pending or failed deliveries whose nextAttemptAt <=
   * now, bounded by `limit`. Filtered / delivered / dead rows are
   * skipped — they're never candidates for dispatch.
   */
  findPendingDeliveries(
    now: Date,
    limit: number,
  ): Promise<StoredBlockSubscriptionDelivery[]>;

  /**
   * Compare-and-swap claim: UPDATE SET claimedAt=now, status='in_flight'
   * WHERE id=? AND claimedAt IS NULL. Returns true if THIS call
   * claimed the row; false if someone else already did. Drives
   * at-most-once dispatch (§4.4).
   */
  claimDelivery(deliveryId: string, now: Date): Promise<boolean>;

  /** Fetch a subscription by id; null if not found (cascade deleted). */
  getSubscription(subscriptionId: string): Promise<StoredBlockSubscription | null>;

  /**
   * Load the event envelope the delivery references. Null if the
   * event log row was cleaned up (retention window). Handlers must
   * not be invoked when this returns null — the event is gone.
   */
  getEventForDelivery(eventLogId: string): Promise<EventEnvelopeSnapshot | null>;

  markDelivered(deliveryId: string, now: Date): Promise<void>;
  markFailed(
    deliveryId: string,
    error: string,
    nextAttemptAt: Date,
    attempt: number,
  ): Promise<void>;
  markDead(deliveryId: string, error: string): Promise<void>;

  // -------------------------------------------------------------------
  // Install-time methods (C4).
  // -------------------------------------------------------------------

  /** All subscriptions for an org (active + dormant). Admin + reconcile. */
  listSubscriptionsByOrg(orgId: string): Promise<StoredBlockSubscription[]>;

  /** G-4 auto-flip: atomic activate/deactivate for a subscription. */
  setSubscriptionActive(subscriptionId: string, active: boolean): Promise<void>;

  /**
   * Deliveries for one subscription, newest-createdAt first. Used by
   * the C5 observability summary (and by the polish follow-up's
   * full-history view).
   */
  listDeliveriesBySubscription(
    subscriptionId: string,
  ): Promise<StoredBlockSubscriptionDelivery[]>;
}

// Re-exports so callers needing both the types + the store symbols
// can import from one place.
export type {
  StoredBlockSubscription,
  StoredBlockSubscriptionDelivery,
  BlockSubscriptionDeliveryStatus,
};
