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

import { and, eq } from "drizzle-orm";

import type { DbClient } from "@/db";
import {
  blockSubscriptionRegistry,
  blockSubscriptionDeliveries,
} from "@/db/schema";
import type {
  NewDeliveryInput,
  NewSubscriptionInput,
  StoredBlockSubscription,
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
}
