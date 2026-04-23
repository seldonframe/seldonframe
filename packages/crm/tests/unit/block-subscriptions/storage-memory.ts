// In-memory SubscriptionStorage for tests. Mirrors the shape of the
// DrizzleSubscriptionStorage; unit tests inject this to exercise the
// bus extension + dispatcher logic without booting Postgres.

import { randomUUID } from "node:crypto";

import type {
  StoredBlockSubscription,
  StoredBlockSubscriptionDelivery,
} from "../../../src/db/schema";
import type {
  NewSubscriptionInput,
  NewDeliveryInput,
  SubscriptionStorage,
} from "../../../src/lib/subscriptions/types";

export class InMemorySubscriptionStorage implements SubscriptionStorage {
  subscriptions: StoredBlockSubscription[] = [];
  deliveries: StoredBlockSubscriptionDelivery[] = [];

  async registerSubscription(input: NewSubscriptionInput): Promise<string> {
    const id = randomUUID();
    const now = new Date();
    this.subscriptions.push({
      id,
      orgId: input.orgId,
      blockSlug: input.blockSlug,
      eventType: input.eventType,
      handlerName: input.handlerName,
      idempotencyKeyTemplate: input.idempotencyKeyTemplate ?? "{{id}}",
      filterPredicate: input.filterPredicate ?? null,
      retryPolicy: input.retryPolicy ?? {
        max: 3,
        backoff: "exponential",
        initial_delay_ms: 1000,
      },
      active: input.active ?? true,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  }

  async findActiveSubscriptions(
    orgId: string,
    eventType: string,
  ): Promise<StoredBlockSubscription[]> {
    return this.subscriptions.filter(
      (s) => s.orgId === orgId && s.eventType === eventType && s.active,
    );
  }

  /**
   * Insert returns `false` on ON CONFLICT (duplicate subscriptionId +
   * idempotencyKey). Enables the bus's dedup-aware enqueue path.
   */
  async insertDelivery(input: NewDeliveryInput): Promise<string | null> {
    const dup = this.deliveries.find(
      (d) => d.subscriptionId === input.subscriptionId && d.idempotencyKey === input.idempotencyKey,
    );
    if (dup) return null;
    const id = randomUUID();
    const now = new Date();
    this.deliveries.push({
      id,
      subscriptionId: input.subscriptionId,
      eventLogId: input.eventLogId,
      idempotencyKey: input.idempotencyKey,
      status: input.status ?? "pending",
      attempt: 1,
      nextAttemptAt: now,
      claimedAt: null,
      deliveredAt: null,
      lastError: null,
      createdAt: now,
    });
    return id;
  }
}
