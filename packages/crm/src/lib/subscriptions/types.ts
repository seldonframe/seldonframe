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
}

// Re-exports so callers needing both the types + the store symbols
// can import from one place.
export type {
  StoredBlockSubscription,
  StoredBlockSubscriptionDelivery,
  BlockSubscriptionDeliveryStatus,
};
