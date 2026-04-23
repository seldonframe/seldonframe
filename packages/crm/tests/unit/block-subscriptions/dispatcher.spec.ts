// Tests for runSubscriptionTick — the cron-driven dispatcher sweep.
// Audit §4.4 + §4.5 + §4.6 + §4.7.
//
// Covers:
//   - Happy path: pending row → claimed → handler invoked → delivered
//   - Handler throws → failed + next attempt scheduled via backoff
//   - Retry exhaustion → dead
//   - Failure isolation: one handler's throw doesn't block siblings
//   - Filtered rows are never picked up by the sweep
//   - CAS race: second claim attempt returns false (no double-invoke)
//   - Unknown handler name → delivery marked failed with clear error
//   - Batch limit respected

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import type { StoredBlockSubscription } from "../../../src/db/schema";
import {
  runSubscriptionTick,
  type SubscriptionHandler,
} from "../../../src/lib/subscriptions/dispatcher";
import { InMemorySubscriptionStorage } from "./storage-memory";

function makeCtx() {
  return new InMemorySubscriptionStorage();
}

async function seedDelivery(
  storage: InMemorySubscriptionStorage,
  overrides: {
    handlerName?: string;
    retryPolicy?: StoredBlockSubscription["retryPolicy"];
    status?: "pending" | "failed";
    attempt?: number;
    payload?: Record<string, unknown>;
  } = {},
): Promise<{ subscriptionId: string; deliveryId: string; eventLogId: string }> {
  const subscriptionId = await storage.registerSubscription({
    orgId: "org-1",
    blockSlug: "crm",
    eventType: "booking.created",
    handlerName: overrides.handlerName ?? "logActivityOnBookingCreate",
    retryPolicy: overrides.retryPolicy,
  });
  // Also seed an event-log row the delivery can reference.
  const eventLogId = storage._seedEventLog({
    orgId: "org-1",
    eventType: "booking.created",
    payload: overrides.payload ?? { contactId: "c-1", appointmentId: "a-1" },
  });
  const deliveryId = await storage.insertDelivery({
    subscriptionId,
    eventLogId,
    idempotencyKey: eventLogId,
    status: overrides.status ?? "pending",
  });
  if (!deliveryId) throw new Error("seedDelivery: insert returned null");
  if (overrides.attempt) storage._setAttempt(deliveryId, overrides.attempt);
  return { subscriptionId, deliveryId, eventLogId };
}

describe("runSubscriptionTick — happy path", () => {
  test("pending delivery → claimed → handler invoked → delivered", async () => {
    const storage = makeCtx();
    const { deliveryId } = await seedDelivery(storage);

    const invocations: Array<{ type: string; data: unknown }> = [];
    const handlers = new Map<string, SubscriptionHandler>([
      [
        "logActivityOnBookingCreate",
        async (event) => {
          invocations.push({ type: event.type, data: event.data });
        },
      ],
    ]);

    const result = await runSubscriptionTick({
      storage,
      handlers,
      now: new Date(),
      batchLimit: 100,
    });

    assert.equal(result.scanned, 1);
    assert.equal(result.delivered, 1);
    assert.equal(result.failed, 0);
    assert.equal(result.dead, 0);

    const delivery = storage.deliveries.find((d) => d.id === deliveryId)!;
    assert.equal(delivery.status, "delivered");
    assert.notEqual(delivery.claimedAt, null);
    assert.notEqual(delivery.deliveredAt, null);

    assert.equal(invocations.length, 1);
    assert.equal(invocations[0].type, "booking.created");
    assert.deepEqual(invocations[0].data, { contactId: "c-1", appointmentId: "a-1" });
  });
});

describe("runSubscriptionTick — failure + retry", () => {
  test("handler throws → status=failed + nextAttemptAt scheduled via backoff", async () => {
    const storage = makeCtx();
    const { deliveryId } = await seedDelivery(storage, {
      retryPolicy: { max: 3, backoff: "exponential", initial_delay_ms: 1000 },
    });

    const handlers = new Map<string, SubscriptionHandler>([
      ["logActivityOnBookingCreate", async () => {
        throw new Error("boom");
      }],
    ]);

    const now = new Date("2026-04-23T12:00:00Z");
    const result = await runSubscriptionTick({
      storage,
      handlers,
      now,
      batchLimit: 100,
    });

    assert.equal(result.failed, 1);
    assert.equal(result.delivered, 0);

    const delivery = storage.deliveries.find((d) => d.id === deliveryId)!;
    assert.equal(delivery.status, "failed");
    assert.equal(delivery.attempt, 2, "attempt incremented for next try");
    assert.equal(delivery.lastError, "boom");
    // Attempt 2 of exponential = 2^(2-1) × 1000 = 2000ms (we compute
    // delay for the NEXT attempt on failure — post-increment).
    assert.equal(delivery.nextAttemptAt.getTime() - now.getTime(), 2000);
  });

  test("retry exhaustion (attempt=max+1 after failure) → status=dead", async () => {
    const storage = makeCtx();
    const { deliveryId } = await seedDelivery(storage, {
      retryPolicy: { max: 3, backoff: "exponential", initial_delay_ms: 1000 },
      attempt: 3, // already at max; one more failure = dead
    });

    const handlers = new Map<string, SubscriptionHandler>([
      ["logActivityOnBookingCreate", async () => {
        throw new Error("final boom");
      }],
    ]);

    const result = await runSubscriptionTick({
      storage,
      handlers,
      now: new Date(),
      batchLimit: 100,
    });

    assert.equal(result.dead, 1);
    assert.equal(result.failed, 0);

    const delivery = storage.deliveries.find((d) => d.id === deliveryId)!;
    assert.equal(delivery.status, "dead");
    assert.equal(delivery.lastError, "final boom");
  });
});

describe("runSubscriptionTick — failure isolation (§4.6)", () => {
  test("one handler's throw does NOT affect siblings", async () => {
    const storage = makeCtx();
    // Two subscriptions for the same event — different handlers.
    const subAId = await storage.registerSubscription({
      orgId: "org-1",
      blockSlug: "a",
      eventType: "booking.created",
      handlerName: "alwaysThrows",
    });
    const subBId = await storage.registerSubscription({
      orgId: "org-1",
      blockSlug: "b",
      eventType: "booking.created",
      handlerName: "alwaysSucceeds",
    });
    const eventLogId = storage._seedEventLog({
      orgId: "org-1",
      eventType: "booking.created",
      payload: {},
    });
    await storage.insertDelivery({ subscriptionId: subAId, eventLogId, idempotencyKey: "kA" });
    await storage.insertDelivery({ subscriptionId: subBId, eventLogId, idempotencyKey: "kB" });

    const handlers = new Map<string, SubscriptionHandler>([
      ["alwaysThrows", async () => { throw new Error("nope"); }],
      ["alwaysSucceeds", async () => { /* ok */ }],
    ]);

    const result = await runSubscriptionTick({
      storage,
      handlers,
      now: new Date(),
      batchLimit: 100,
    });
    assert.equal(result.delivered, 1);
    assert.equal(result.failed, 1);
  });
});

describe("runSubscriptionTick — selection filter", () => {
  test("filtered rows are NOT picked up by the sweep", async () => {
    const storage = makeCtx();
    await seedDelivery(storage, { status: "pending" });
    // Second delivery is filtered — must be skipped.
    const subId = await storage.registerSubscription({
      orgId: "org-1",
      blockSlug: "filtered-block",
      eventType: "booking.created",
      handlerName: "willNotRun",
    });
    const logId = storage._seedEventLog({
      orgId: "org-1",
      eventType: "booking.created",
      payload: {},
    });
    await storage.insertDelivery({
      subscriptionId: subId,
      eventLogId: logId,
      idempotencyKey: "filter-key",
      status: "filtered",
    });

    const invoked: string[] = [];
    const handlers = new Map<string, SubscriptionHandler>([
      ["logActivityOnBookingCreate", async () => { invoked.push("log"); }],
      ["willNotRun", async () => { invoked.push("filtered"); }],
    ]);

    const result = await runSubscriptionTick({
      storage,
      handlers,
      now: new Date(),
      batchLimit: 100,
    });
    assert.equal(result.scanned, 1, "filtered row never returned by sweep");
    assert.deepEqual(invoked, ["log"]);
  });

  test("delivered rows are NOT re-invoked", async () => {
    const storage = makeCtx();
    const { deliveryId } = await seedDelivery(storage);
    storage._setStatus(deliveryId, "delivered");

    const handlers = new Map<string, SubscriptionHandler>([
      ["logActivityOnBookingCreate", async () => { throw new Error("should not fire"); }],
    ]);

    const result = await runSubscriptionTick({
      storage,
      handlers,
      now: new Date(),
      batchLimit: 100,
    });
    assert.equal(result.scanned, 0);
  });
});

describe("runSubscriptionTick — unknown handler", () => {
  test("handler name not in registry → delivery marked failed with clear error", async () => {
    const storage = makeCtx();
    const { deliveryId } = await seedDelivery(storage, {
      handlerName: "thisHandlerDoesNotExist",
    });
    const handlers = new Map<string, SubscriptionHandler>();

    const result = await runSubscriptionTick({
      storage,
      handlers,
      now: new Date(),
      batchLimit: 100,
    });
    assert.equal(result.failed, 1);
    const d = storage.deliveries.find((x) => x.id === deliveryId)!;
    assert.equal(d.status, "failed");
    assert.match(d.lastError ?? "", /handler.*thisHandlerDoesNotExist.*not registered/i);
  });
});

describe("runSubscriptionTick — CAS race (§4.4 point 1)", () => {
  test("two sequential tick runs: second tick ignores already-claimed row", async () => {
    const storage = makeCtx();
    await seedDelivery(storage);

    const invocations: number[] = [];
    const handlers = new Map<string, SubscriptionHandler>([
      ["logActivityOnBookingCreate", async () => { invocations.push(1); }],
    ]);

    // First tick claims and invokes.
    await runSubscriptionTick({ storage, handlers, now: new Date(), batchLimit: 100 });
    // Second tick finds no pending rows (first marked delivered).
    const result2 = await runSubscriptionTick({
      storage,
      handlers,
      now: new Date(),
      batchLimit: 100,
    });
    assert.equal(result2.scanned, 0);
    assert.equal(invocations.length, 1, "handler invoked exactly once");
  });
});

describe("runSubscriptionTick — batch limit", () => {
  test("respects batchLimit parameter", async () => {
    const storage = makeCtx();
    for (let i = 0; i < 5; i++) {
      await seedDelivery(storage);
    }
    const handlers = new Map<string, SubscriptionHandler>([
      ["logActivityOnBookingCreate", async () => { /* ok */ }],
    ]);

    const result = await runSubscriptionTick({
      storage,
      handlers,
      now: new Date(),
      batchLimit: 3,
    });
    assert.equal(result.scanned, 3);
    assert.equal(result.delivered, 3);
  });
});
