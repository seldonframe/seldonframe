// Schema-shape tests for block_subscription_registry +
// block_subscription_deliveries.
//
// Shipped in SLICE 1 PR 2 Commit 1. These tests verify the Drizzle
// table definitions expose the columns the runtime + dispatcher
// require (audit §4.1). Real DB round-trip tests live in integration
// scope; here we assert the schema shape so type-drift shows up at
// build time rather than during first migration.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { getTableName } from "drizzle-orm";

import {
  blockSubscriptionRegistry,
  blockSubscriptionDeliveries,
  type StoredBlockSubscription,
  type StoredBlockSubscriptionDelivery,
  type BlockSubscriptionDeliveryStatus,
} from "../../../src/db/schema";

describe("block_subscription_registry schema shape", () => {
  test("exports the expected column names", () => {
    const cols = Object.keys(blockSubscriptionRegistry);
    for (const required of [
      "id",
      "orgId",
      "blockSlug",
      "eventType",
      "handlerName",
      "idempotencyKeyTemplate",
      "filterPredicate",
      "retryPolicy",
      "active",
      "createdAt",
      "updatedAt",
    ]) {
      assert.ok(cols.includes(required), `missing column: ${required}`);
    }
  });

  test("table name is block_subscription_registry (disambiguates from Stripe subscriptions)", () => {
    assert.equal(getTableName(blockSubscriptionRegistry), "block_subscription_registry");
  });

  test("StoredBlockSubscription inferred type carries the runtime-required fields", () => {
    // Compile-time: assigning an object to StoredBlockSubscription
    // asserts the inferred shape includes each field.
    const row: StoredBlockSubscription = {
      id: "sub-1",
      orgId: "org-1",
      blockSlug: "crm",
      eventType: "booking.created",
      handlerName: "logActivityOnBookingCreate",
      idempotencyKeyTemplate: "{{id}}",
      filterPredicate: null,
      retryPolicy: { max: 3, backoff: "exponential", initial_delay_ms: 1000 },
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    assert.equal(row.handlerName, "logActivityOnBookingCreate");
  });
});

describe("block_subscription_deliveries schema shape", () => {
  test("exports the expected column names", () => {
    const cols = Object.keys(blockSubscriptionDeliveries);
    for (const required of [
      "id",
      "subscriptionId",
      "eventLogId",
      "idempotencyKey",
      "status",
      "attempt",
      "nextAttemptAt",
      "claimedAt",
      "deliveredAt",
      "lastError",
      "createdAt",
    ]) {
      assert.ok(cols.includes(required), `missing column: ${required}`);
    }
  });

  test("table name is block_subscription_deliveries", () => {
    assert.equal(getTableName(blockSubscriptionDeliveries), "block_subscription_deliveries");
  });

  test("StoredBlockSubscriptionDelivery carries CAS + retry fields", () => {
    const row: StoredBlockSubscriptionDelivery = {
      id: "del-1",
      subscriptionId: "sub-1",
      eventLogId: "evt-1",
      idempotencyKey: "evt-1",
      status: "pending",
      attempt: 1,
      nextAttemptAt: new Date(),
      claimedAt: null,
      deliveredAt: null,
      lastError: null,
      createdAt: new Date(),
    };
    // `status` accepts every G-6 variant.
    const statuses: BlockSubscriptionDeliveryStatus[] = [
      "pending",
      "in_flight",
      "delivered",
      "failed",
      "filtered",
      "dead",
    ];
    for (const s of statuses) {
      row.status = s;
    }
    assert.equal(row.id, "del-1");
  });
});
