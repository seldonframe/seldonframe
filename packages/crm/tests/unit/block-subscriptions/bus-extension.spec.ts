// Tests for enqueueSubscriptionDeliveriesForEventInContext — the
// emit-time scan that mirrors resumePendingWaitsForEventInContext's
// shape (lib/events/bus.ts). Verifies:
//   - Only active subscriptions for the (orgId, eventType) are matched
//   - Filter predicate evaluates at enqueue; rejecting produces a
//     delivery row with status="filtered" (G-6 distinct state)
//   - Filter passing produces status="pending"
//   - Idempotency key is resolved from the template + event envelope
//   - Duplicate emission (same resolved key) is absorbed by
//     insertDelivery returning null (unique-index ON CONFLICT)
//   - Cross-org isolation: org A's event doesn't match org B's sub.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { enqueueSubscriptionDeliveriesForEventInContext } from "../../../src/lib/subscriptions/bus-extension";
import { InMemorySubscriptionStorage } from "./storage-memory";

function makeCtx() {
  return { storage: new InMemorySubscriptionStorage() };
}

describe("enqueueSubscriptionDeliveriesForEventInContext — basics", () => {
  test("no subscriptions = no deliveries", async () => {
    const ctx = makeCtx();
    const result = await enqueueSubscriptionDeliveriesForEventInContext(
      ctx,
      "org-1",
      "booking.created",
      { appointmentId: "a-1", contactId: "c-1" },
      "evt-1",
    );
    assert.deepEqual(result, { matched: 0, enqueued: 0, filtered: 0 });
    assert.equal(ctx.storage.deliveries.length, 0);
  });

  test("single active subscription enqueues one delivery", async () => {
    const ctx = makeCtx();
    await ctx.storage.registerSubscription({
      orgId: "org-1",
      blockSlug: "crm",
      eventType: "booking.created",
      handlerName: "logActivityOnBookingCreate",
    });
    const result = await enqueueSubscriptionDeliveriesForEventInContext(
      ctx,
      "org-1",
      "booking.created",
      { appointmentId: "a-1", contactId: "c-1" },
      "evt-1",
    );
    assert.equal(result.matched, 1);
    assert.equal(result.enqueued, 1);
    assert.equal(result.filtered, 0);
    assert.equal(ctx.storage.deliveries.length, 1);
    assert.equal(ctx.storage.deliveries[0].status, "pending");
    assert.equal(ctx.storage.deliveries[0].eventLogId, "evt-1");
    // Default template {{id}} resolves to the eventLogId.
    assert.equal(ctx.storage.deliveries[0].idempotencyKey, "evt-1");
  });

  test("inactive subscription not enqueued", async () => {
    const ctx = makeCtx();
    await ctx.storage.registerSubscription({
      orgId: "org-1",
      blockSlug: "crm",
      eventType: "booking.created",
      handlerName: "x",
      active: false,
    });
    const result = await enqueueSubscriptionDeliveriesForEventInContext(
      ctx,
      "org-1",
      "booking.created",
      {},
      "evt-1",
    );
    assert.equal(result.matched, 0);
    assert.equal(ctx.storage.deliveries.length, 0);
  });

  test("cross-org isolation: org A event does not match org B subscription", async () => {
    const ctx = makeCtx();
    await ctx.storage.registerSubscription({
      orgId: "org-B",
      blockSlug: "crm",
      eventType: "booking.created",
      handlerName: "x",
    });
    const result = await enqueueSubscriptionDeliveriesForEventInContext(
      ctx,
      "org-A",
      "booking.created",
      {},
      "evt-1",
    );
    assert.equal(result.matched, 0);
    assert.equal(ctx.storage.deliveries.length, 0);
  });
});

describe("enqueueSubscriptionDeliveriesForEventInContext — filter (G-6)", () => {
  test("filter passes → status=pending", async () => {
    const ctx = makeCtx();
    await ctx.storage.registerSubscription({
      orgId: "org-1",
      blockSlug: "crm",
      eventType: "booking.created",
      handlerName: "x",
      filterPredicate: { kind: "field_exists", field: "data.contactId" },
    });
    const result = await enqueueSubscriptionDeliveriesForEventInContext(
      ctx,
      "org-1",
      "booking.created",
      { contactId: "c-1" },
      "evt-1",
    );
    assert.equal(result.enqueued, 1);
    assert.equal(result.filtered, 0);
    assert.equal(ctx.storage.deliveries[0].status, "pending");
  });

  test("filter rejects → status=filtered (G-6 distinct state, row still recorded)", async () => {
    const ctx = makeCtx();
    await ctx.storage.registerSubscription({
      orgId: "org-1",
      blockSlug: "crm",
      eventType: "booking.created",
      handlerName: "x",
      filterPredicate: { kind: "field_exists", field: "data.contactId" },
    });
    const result = await enqueueSubscriptionDeliveriesForEventInContext(
      ctx,
      "org-1",
      "booking.created",
      { appointmentId: "a-1" /* no contactId */ },
      "evt-1",
    );
    assert.equal(result.enqueued, 0);
    assert.equal(result.filtered, 1);
    assert.equal(ctx.storage.deliveries.length, 1);
    assert.equal(ctx.storage.deliveries[0].status, "filtered");
  });
});

describe("enqueueSubscriptionDeliveriesForEventInContext — idempotency", () => {
  test("custom idempotency template uses event payload fields", async () => {
    const ctx = makeCtx();
    await ctx.storage.registerSubscription({
      orgId: "org-1",
      blockSlug: "crm",
      eventType: "booking.created",
      handlerName: "x",
      idempotencyKeyTemplate: "{{data.contactId}}:{{data.appointmentId}}",
    });
    await enqueueSubscriptionDeliveriesForEventInContext(
      ctx,
      "org-1",
      "booking.created",
      { contactId: "c-1", appointmentId: "a-1" },
      "evt-1",
    );
    assert.equal(ctx.storage.deliveries[0].idempotencyKey, "c-1:a-1");
  });

  test("duplicate emission with same resolved key is a no-op (ON CONFLICT DO NOTHING)", async () => {
    const ctx = makeCtx();
    await ctx.storage.registerSubscription({
      orgId: "org-1",
      blockSlug: "crm",
      eventType: "booking.created",
      handlerName: "x",
      idempotencyKeyTemplate: "{{data.appointmentId}}",
    });
    // Emit 1.
    await enqueueSubscriptionDeliveriesForEventInContext(
      ctx,
      "org-1",
      "booking.created",
      { appointmentId: "a-1" },
      "evt-1",
    );
    // Emit 2 with SAME appointmentId (different eventLogId) — same
    // resolved key; unique index absorbs the second insert.
    const result2 = await enqueueSubscriptionDeliveriesForEventInContext(
      ctx,
      "org-1",
      "booking.created",
      { appointmentId: "a-1" },
      "evt-2",
    );
    assert.equal(result2.matched, 1, "subscription still matches");
    assert.equal(result2.enqueued, 0, "second insert absorbed by dedup");
    assert.equal(ctx.storage.deliveries.length, 1);
  });
});

describe("enqueueSubscriptionDeliveriesForEventInContext — safety", () => {
  test("eventLogId=null short-circuits (can't FK to a non-existent log row)", async () => {
    const ctx = makeCtx();
    await ctx.storage.registerSubscription({
      orgId: "org-1",
      blockSlug: "crm",
      eventType: "booking.created",
      handlerName: "x",
    });
    const result = await enqueueSubscriptionDeliveriesForEventInContext(
      ctx,
      "org-1",
      "booking.created",
      {},
      null,
    );
    // Matched but nothing enqueued — audit §4.1 FK requires a real log row.
    assert.equal(result.matched, 0);
    assert.equal(result.enqueued, 0);
    assert.equal(ctx.storage.deliveries.length, 0);
  });
});
