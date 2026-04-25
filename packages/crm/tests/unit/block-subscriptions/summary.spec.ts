// Tests for computeSubscriptionSummary — the per-subscription
// aggregator that backs the read-only /agents/runs section (C5).
// Deliberately narrow: counts + success rate + last-delivery + top
// 5 recent failures. Richer queries (per-hour charts, full history
// pagination) are deferred to the follow-up polish ticket.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { computeSubscriptionSummary } from "../../../src/lib/subscriptions/summary";
import { InMemorySubscriptionStorage } from "./storage-memory";

async function seedDelivery(
  storage: InMemorySubscriptionStorage,
  subId: string,
  status: "delivered" | "failed" | "dead" | "filtered",
  timestamp: Date,
  lastError?: string,
): Promise<void> {
  const logId = storage._seedEventLog({ orgId: "org-1", eventType: "x.y", payload: {} });
  const id = await storage.insertDelivery({
    subscriptionId: subId,
    eventLogId: logId,
    idempotencyKey: `${subId}-${timestamp.getTime()}`,
    status,
  });
  if (!id) return;
  const row = storage.deliveries.find((d) => d.id === id)!;
  row.createdAt = timestamp;
  if (status === "delivered") row.deliveredAt = timestamp;
  if (lastError) row.lastError = lastError;
}

const NOW = new Date("2026-04-23T12:00:00Z");
const H = 60 * 60 * 1000;

describe("computeSubscriptionSummary — counts + windows", () => {
  test("empty org returns empty array", async () => {
    const storage = new InMemorySubscriptionStorage();
    const summary = await computeSubscriptionSummary("org-1", NOW, storage);
    assert.deepEqual(summary, []);
  });

  test("one subscription with no deliveries → zeros", async () => {
    const storage = new InMemorySubscriptionStorage();
    const subId = await storage.registerSubscription({
      orgId: "org-1",
      blockSlug: "crm",
      eventType: "booking.created",
      handlerName: "onBookingCreate",
    });
    const [row] = await computeSubscriptionSummary("org-1", NOW, storage);
    assert.equal(row.subscriptionId, subId);
    assert.equal(row.last24h.delivered, 0);
    assert.equal(row.last24h.failed, 0);
    assert.equal(row.last7d.delivered, 0);
    assert.equal(row.lastDeliveredAt, null);
    assert.equal(row.successRate7d, null, "undefined when no attempts");
    assert.deepEqual(row.recentFailures, []);
  });

  test("bucketing: events at 2h / 48h / 8d ago split correctly", async () => {
    const storage = new InMemorySubscriptionStorage();
    const subId = await storage.registerSubscription({
      orgId: "org-1",
      blockSlug: "crm",
      eventType: "booking.created",
      handlerName: "h",
    });
    // 2h ago — in 24h and 7d windows.
    await seedDelivery(storage, subId, "delivered", new Date(NOW.getTime() - 2 * H));
    // 48h ago — outside 24h, inside 7d.
    await seedDelivery(storage, subId, "delivered", new Date(NOW.getTime() - 48 * H));
    // 8d ago — outside both.
    await seedDelivery(storage, subId, "delivered", new Date(NOW.getTime() - 8 * 24 * H));

    const [row] = await computeSubscriptionSummary("org-1", NOW, storage);
    assert.equal(row.last24h.delivered, 1);
    assert.equal(row.last7d.delivered, 2);
  });

  test("success rate over 7d window", async () => {
    const storage = new InMemorySubscriptionStorage();
    const subId = await storage.registerSubscription({
      orgId: "org-1",
      blockSlug: "crm",
      eventType: "booking.created",
      handlerName: "h",
    });
    for (let i = 0; i < 4; i++) {
      await seedDelivery(storage, subId, "delivered", new Date(NOW.getTime() - i * H));
    }
    await seedDelivery(storage, subId, "failed", new Date(NOW.getTime() - 5 * H), "boom");
    await seedDelivery(storage, subId, "dead", new Date(NOW.getTime() - 6 * H), "final boom");
    // filtered doesn't count against success rate — it's a separate bucket.
    await seedDelivery(storage, subId, "filtered", new Date(NOW.getTime() - 7 * H));

    const [row] = await computeSubscriptionSummary("org-1", NOW, storage);
    // Attempted = delivered + failed + dead = 6. Succeeded = 4.
    // 4/6 ≈ 0.6667.
    assert.ok(row.successRate7d !== null);
    assert.ok(Math.abs((row.successRate7d ?? 0) - 4 / 6) < 0.001);
  });

  test("lastDeliveredAt reflects the most recent 'delivered' row", async () => {
    const storage = new InMemorySubscriptionStorage();
    const subId = await storage.registerSubscription({
      orgId: "org-1",
      blockSlug: "crm",
      eventType: "booking.created",
      handlerName: "h",
    });
    const recent = new Date(NOW.getTime() - 30 * 60 * 1000); // 30 min ago
    const older = new Date(NOW.getTime() - 5 * H);
    await seedDelivery(storage, subId, "delivered", older);
    await seedDelivery(storage, subId, "delivered", recent);

    const [row] = await computeSubscriptionSummary("org-1", NOW, storage);
    assert.equal(row.lastDeliveredAt?.getTime(), recent.getTime());
  });

  test("recentFailures returns latest 5, newest first", async () => {
    const storage = new InMemorySubscriptionStorage();
    const subId = await storage.registerSubscription({
      orgId: "org-1",
      blockSlug: "crm",
      eventType: "booking.created",
      handlerName: "h",
    });
    for (let i = 0; i < 7; i++) {
      await seedDelivery(
        storage,
        subId,
        "failed",
        new Date(NOW.getTime() - i * H),
        `err ${i}`,
      );
    }
    const [row] = await computeSubscriptionSummary("org-1", NOW, storage);
    assert.equal(row.recentFailures.length, 5, "capped at 5");
    // Newest first: err 0 (now - 0) should be first.
    assert.equal(row.recentFailures[0].lastError, "err 0");
    assert.equal(row.recentFailures[4].lastError, "err 4");
  });

  test("active + dormant subscriptions both surface", async () => {
    const storage = new InMemorySubscriptionStorage();
    await storage.registerSubscription({
      orgId: "org-1",
      blockSlug: "crm",
      eventType: "booking.created",
      handlerName: "active-one",
      active: true,
    });
    await storage.registerSubscription({
      orgId: "org-1",
      blockSlug: "crm",
      eventType: "payment.succeeded",
      handlerName: "dormant-one",
      active: false,
    });
    const summary = await computeSubscriptionSummary("org-1", NOW, storage);
    assert.equal(summary.length, 2);
    assert.ok(summary.find((s) => s.subscription.handlerName === "active-one"));
    assert.ok(summary.find((s) => s.subscription.handlerName === "dormant-one"));
  });
});
