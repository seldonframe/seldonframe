// Drizzle-backed production implementation of SubscriptionStorage.
//
// Shipped in SLICE 1 PR 2 Commit 2. Wraps the two tables from Commit 1:
//   - block_subscription_registry
//   - block_subscription_deliveries
//
// Test code uses the in-memory impl in
// tests/unit/block-subscriptions/storage-memory.ts — same interface,
// no DB needed.
//
// Dedup strategy on insertDelivery: Postgres ON CONFLICT DO NOTHING
// absorbs duplicate emissions via the UNIQUE (subscriptionId,
// idempotencyKey) index. drizzle-orm's `.onConflictDoNothing()` emits
// the right SQL; we return null when the returning-clause is empty
// (= conflict swallowed the insert).
//
// PR 2 Commit 3 extends this class with the dispatcher-side CAS +
// retry methods.

import { and, asc, eq, inArray, isNull, lte, sql } from "drizzle-orm";

import type { DbClient } from "@/db";
import {
  blockSubscriptionRegistry,
  blockSubscriptionDeliveries,
  workflowEventLog,
} from "@/db/schema";
import type {
  EventEnvelopeSnapshot,
  NewDeliveryInput,
  NewSubscriptionInput,
  StoredBlockSubscription,
  StoredBlockSubscriptionDelivery,
  SubscriptionStorage,
} from "./types";

export class DrizzleSubscriptionStorage implements SubscriptionStorage {
  constructor(private readonly db: DbClient) {}

  async registerSubscription(input: NewSubscriptionInput): Promise<string> {
    const [row] = await this.db
      .insert(blockSubscriptionRegistry)
      .values({
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
      })
      .returning({ id: blockSubscriptionRegistry.id });
    return row.id;
  }

  async findActiveSubscriptions(
    orgId: string,
    eventType: string,
  ): Promise<StoredBlockSubscription[]> {
    const rows = await this.db
      .select()
      .from(blockSubscriptionRegistry)
      .where(
        and(
          eq(blockSubscriptionRegistry.orgId, orgId),
          eq(blockSubscriptionRegistry.eventType, eventType),
          eq(blockSubscriptionRegistry.active, true),
        ),
      );
    return rows;
  }

  async insertDelivery(input: NewDeliveryInput): Promise<string | null> {
    const rows = await this.db
      .insert(blockSubscriptionDeliveries)
      .values({
        subscriptionId: input.subscriptionId,
        eventLogId: input.eventLogId,
        idempotencyKey: input.idempotencyKey,
        status: input.status ?? "pending",
      })
      .onConflictDoNothing({
        target: [
          blockSubscriptionDeliveries.subscriptionId,
          blockSubscriptionDeliveries.idempotencyKey,
        ],
      })
      .returning({ id: blockSubscriptionDeliveries.id });
    return rows.length > 0 ? rows[0].id : null;
  }

  // -------------------------------------------------------------------
  // Dispatcher-side methods (C3).
  // -------------------------------------------------------------------

  async findPendingDeliveries(
    now: Date,
    limit: number,
  ): Promise<StoredBlockSubscriptionDelivery[]> {
    return this.db
      .select()
      .from(blockSubscriptionDeliveries)
      .where(
        and(
          inArray(blockSubscriptionDeliveries.status, ["pending", "failed"]),
          lte(blockSubscriptionDeliveries.nextAttemptAt, now),
          isNull(blockSubscriptionDeliveries.claimedAt),
        ),
      )
      .orderBy(asc(blockSubscriptionDeliveries.nextAttemptAt))
      .limit(limit);
  }

  async claimDelivery(deliveryId: string, now: Date): Promise<boolean> {
    const rows = await this.db
      .update(blockSubscriptionDeliveries)
      .set({ claimedAt: now, status: "in_flight" })
      .where(
        and(
          eq(blockSubscriptionDeliveries.id, deliveryId),
          isNull(blockSubscriptionDeliveries.claimedAt),
        ),
      )
      .returning({ id: blockSubscriptionDeliveries.id });
    return rows.length > 0;
  }

  async getSubscription(subscriptionId: string): Promise<StoredBlockSubscription | null> {
    const rows = await this.db
      .select()
      .from(blockSubscriptionRegistry)
      .where(eq(blockSubscriptionRegistry.id, subscriptionId))
      .limit(1);
    return rows[0] ?? null;
  }

  async getEventForDelivery(eventLogId: string): Promise<EventEnvelopeSnapshot | null> {
    const rows = await this.db
      .select()
      .from(workflowEventLog)
      .where(eq(workflowEventLog.id, eventLogId))
      .limit(1);
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      eventLogId: row.id,
      orgId: row.orgId,
      type: row.eventType,
      data: (row.payload ?? {}) as Record<string, unknown>,
      emittedAt: row.emittedAt,
    };
  }

  async markDelivered(deliveryId: string, now: Date): Promise<void> {
    await this.db
      .update(blockSubscriptionDeliveries)
      .set({ status: "delivered", deliveredAt: now })
      .where(eq(blockSubscriptionDeliveries.id, deliveryId));
  }

  async markFailed(
    deliveryId: string,
    error: string,
    nextAttemptAt: Date,
    attempt: number,
  ): Promise<void> {
    await this.db
      .update(blockSubscriptionDeliveries)
      .set({
        status: "failed",
        lastError: error,
        nextAttemptAt,
        attempt,
        // Release the claim so the next tick can re-claim for retry.
        claimedAt: null,
      })
      .where(eq(blockSubscriptionDeliveries.id, deliveryId));
  }

  async markDead(deliveryId: string, error: string): Promise<void> {
    await this.db
      .update(blockSubscriptionDeliveries)
      .set({ status: "dead", lastError: error })
      .where(eq(blockSubscriptionDeliveries.id, deliveryId));
  }

  // -------------------------------------------------------------------
  // Install-time methods (C4).
  // -------------------------------------------------------------------

  async listSubscriptionsByOrg(orgId: string): Promise<StoredBlockSubscription[]> {
    return this.db
      .select()
      .from(blockSubscriptionRegistry)
      .where(eq(blockSubscriptionRegistry.orgId, orgId));
  }

  async setSubscriptionActive(subscriptionId: string, active: boolean): Promise<void> {
    await this.db
      .update(blockSubscriptionRegistry)
      .set({ active, updatedAt: sql`now()` })
      .where(eq(blockSubscriptionRegistry.id, subscriptionId));
  }
}
