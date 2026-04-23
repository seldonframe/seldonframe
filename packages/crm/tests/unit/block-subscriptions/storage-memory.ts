// In-memory SubscriptionStorage for tests. Mirrors the shape of the
// DrizzleSubscriptionStorage; unit tests inject this to exercise the
// bus extension + dispatcher logic without booting Postgres.

import { randomUUID } from "node:crypto";

import type {
  StoredBlockSubscription,
  StoredBlockSubscriptionDelivery,
} from "../../../src/db/schema";
import type {
  EventEnvelopeSnapshot,
  NewSubscriptionInput,
  NewDeliveryInput,
  SubscriptionStorage,
} from "../../../src/lib/subscriptions/types";

export class InMemorySubscriptionStorage implements SubscriptionStorage {
  subscriptions: StoredBlockSubscription[] = [];
  deliveries: StoredBlockSubscriptionDelivery[] = [];
  /**
   * Synthetic event-log map for tests — the real impl joins to
   * workflow_event_log. Test helpers populate this via _seedEventLog.
   */
  eventLog = new Map<string, EventEnvelopeSnapshot>();

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

  // -------------------------------------------------------------------
  // Dispatcher-side methods (C3).
  // -------------------------------------------------------------------

  async findPendingDeliveries(
    now: Date,
    limit: number,
  ): Promise<StoredBlockSubscriptionDelivery[]> {
    return this.deliveries
      .filter(
        (d) =>
          (d.status === "pending" || d.status === "failed") &&
          d.nextAttemptAt.getTime() <= now.getTime() &&
          d.claimedAt === null,
      )
      .sort((a, b) => a.nextAttemptAt.getTime() - b.nextAttemptAt.getTime())
      .slice(0, limit);
  }

  async claimDelivery(deliveryId: string, now: Date): Promise<boolean> {
    const d = this.deliveries.find((x) => x.id === deliveryId);
    if (!d) return false;
    if (d.claimedAt !== null) return false;
    d.claimedAt = now;
    d.status = "in_flight";
    return true;
  }

  async getSubscription(subscriptionId: string): Promise<StoredBlockSubscription | null> {
    return this.subscriptions.find((s) => s.id === subscriptionId) ?? null;
  }

  async getEventForDelivery(eventLogId: string): Promise<EventEnvelopeSnapshot | null> {
    return this.eventLog.get(eventLogId) ?? null;
  }

  async markDelivered(deliveryId: string, now: Date): Promise<void> {
    const d = this.deliveries.find((x) => x.id === deliveryId);
    if (!d) return;
    d.status = "delivered";
    d.deliveredAt = now;
  }

  async markFailed(
    deliveryId: string,
    error: string,
    nextAttemptAt: Date,
    attempt: number,
  ): Promise<void> {
    const d = this.deliveries.find((x) => x.id === deliveryId);
    if (!d) return;
    d.status = "failed";
    d.lastError = error;
    d.nextAttemptAt = nextAttemptAt;
    d.attempt = attempt;
    // Release the claim so the next tick can re-claim.
    d.claimedAt = null;
  }

  async markDead(deliveryId: string, error: string): Promise<void> {
    const d = this.deliveries.find((x) => x.id === deliveryId);
    if (!d) return;
    d.status = "dead";
    d.lastError = error;
  }

  async listSubscriptionsByOrg(orgId: string): Promise<StoredBlockSubscription[]> {
    return this.subscriptions.filter((s) => s.orgId === orgId);
  }

  async setSubscriptionActive(subscriptionId: string, active: boolean): Promise<void> {
    const s = this.subscriptions.find((x) => x.id === subscriptionId);
    if (s) {
      s.active = active;
      s.updatedAt = new Date();
    }
  }

  // -------------------------------------------------------------------
  // Test helpers (underscore-prefixed — NOT on the interface).
  // -------------------------------------------------------------------

  _seedEventLog(input: {
    orgId: string;
    eventType: string;
    payload: Record<string, unknown>;
    emittedAt?: Date;
  }): string {
    const id = randomUUID();
    this.eventLog.set(id, {
      eventLogId: id,
      orgId: input.orgId,
      type: input.eventType,
      emittedAt: input.emittedAt ?? new Date(),
      data: input.payload,
    });
    return id;
  }

  _setAttempt(deliveryId: string, attempt: number): void {
    const d = this.deliveries.find((x) => x.id === deliveryId);
    if (d) d.attempt = attempt;
  }

  _setStatus(
    deliveryId: string,
    status: StoredBlockSubscriptionDelivery["status"],
  ): void {
    const d = this.deliveries.find((x) => x.id === deliveryId);
    if (d) d.status = status;
  }
}
