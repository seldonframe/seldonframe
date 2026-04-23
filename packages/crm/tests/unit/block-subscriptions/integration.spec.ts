// Integration test — exercises the full subscription pipeline end-
// to-end using in-memory storage + stub handlers. Verifies the
// primitive's four critical behaviors wired together (bus
// enqueue + cron dispatcher + installer reconciler):
//
//   1. Happy path: reconcile → emit → enqueue → cron tick → handler
//      invoked → delivery recorded as success
//   2. Idempotency: second emit with same resolved key → delivery
//      skipped, handler NOT re-invoked
//   3. Retry: handler throws once → retry next tick → succeeds →
//      delivery recorded as success after 2 attempts
//   4. Dormancy auto-flip: reconcile with subscriber only → dormant;
//      reconcile again with producer added → auto-flip, log entry
//
// Shipped in SLICE 1 PR 2 C6+C7 (merged per approved scope cut).
// Integration here means "multiple modules wired together" —
// no real DB; in-memory storage keeps tests fast + deterministic.
//
// The production handler in blocks/crm/subscriptions/
// logActivityOnBookingCreate.ts is exercised separately (it's a
// thin Drizzle wrapper around a factory that the integration test
// substitutes with a stub).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import type { SubscriptionHandler } from "../../../src/lib/subscriptions/dispatcher";
import { enqueueSubscriptionDeliveriesForEventInContext } from "../../../src/lib/subscriptions/bus-extension";
import { runSubscriptionTick } from "../../../src/lib/subscriptions/dispatcher";
import { reconcileBlockSubscriptions } from "../../../src/lib/subscriptions/installer";
import { InMemorySubscriptionStorage } from "./storage-memory";

// Helpers --------------------------------------------------------

function crmBlockMd(): string {
  return (
    "# BLOCK: crm\n\n" +
    "## Composition Contract\n\n" +
    'produces: [{"event": "contact.created"}]\n' +
    "verbs: [crm]\n" +
    "compose_with: [caldiy-booking]\n\n" +
    "## Subscriptions\n\n" +
    "<!-- SUBSCRIPTIONS:START -->\n" +
    JSON.stringify([
      {
        event: "caldiy-booking:booking.created",
        handler: "logActivityOnBookingCreate",
        idempotency_key: "{{data.contactId}}:{{data.appointmentId}}",
      },
    ]) +
    "\n<!-- SUBSCRIPTIONS:END -->\n"
  );
}

function caldiyBookingBlockMd(): string {
  return (
    "# BLOCK: caldiy-booking\n\n" +
    "## Composition Contract\n\n" +
    'produces: [{"event": "booking.created"}]\n' +
    "verbs: [caldiy]\n" +
    "compose_with: [crm]\n"
  );
}

/**
 * Emit a booking.created event: manually do what emitSeldonEvent
 * does in production — seed an event log row then run the
 * enqueue scan. The integration test bypasses the DB-backed bus
 * and tests the pure logic.
 */
async function emitBookingCreated(
  storage: InMemorySubscriptionStorage,
  orgId: string,
  data: { contactId: string; appointmentId: string },
): Promise<{ eventLogId: string }> {
  const eventLogId = storage._seedEventLog({
    orgId,
    eventType: "booking.created",
    payload: data,
  });
  await enqueueSubscriptionDeliveriesForEventInContext(
    { storage },
    orgId,
    "booking.created",
    data,
    eventLogId,
  );
  return { eventLogId };
}

describe("SLICE 1 PR 2 — integration: happy path", () => {
  test("reconcile → emit → enqueue → cron tick → handler invoked → delivered", async () => {
    const storage = new InMemorySubscriptionStorage();

    // 1. Install both blocks — subscription lands as active=true.
    await reconcileBlockSubscriptions(
      "org-1",
      [
        { id: "crm", blockMd: crmBlockMd() },
        { id: "caldiy-booking", blockMd: caldiyBookingBlockMd() },
      ],
      storage,
    );
    assert.equal(storage.subscriptions[0].active, true);

    // 2. Emit booking.created — delivery enqueued as pending.
    await emitBookingCreated(storage, "org-1", {
      contactId: "c-1",
      appointmentId: "a-1",
    });
    assert.equal(storage.deliveries.length, 1);
    assert.equal(storage.deliveries[0].status, "pending");
    assert.equal(storage.deliveries[0].idempotencyKey, "c-1:a-1");

    // 3. Cron tick invokes the handler.
    const invocations: Array<{ contactId: string; appointmentId: string }> = [];
    const stubHandler: SubscriptionHandler = async (event) => {
      const d = event.data as { contactId: string; appointmentId: string };
      invocations.push({ contactId: d.contactId, appointmentId: d.appointmentId });
    };
    const handlers = new Map([["logActivityOnBookingCreate", stubHandler]]);

    const result = await runSubscriptionTick({
      storage,
      handlers,
      now: new Date(),
      batchLimit: 100,
    });

    assert.equal(result.delivered, 1);
    assert.equal(result.failed, 0);
    assert.equal(storage.deliveries[0].status, "delivered");
    assert.deepEqual(invocations, [{ contactId: "c-1", appointmentId: "a-1" }]);
  });
});

describe("SLICE 1 PR 2 — integration: idempotency", () => {
  test("second emit with same (contactId, appointmentId) is absorbed — handler not re-invoked", async () => {
    const storage = new InMemorySubscriptionStorage();
    await reconcileBlockSubscriptions("org-1", [
      { id: "crm", blockMd: crmBlockMd() },
      { id: "caldiy-booking", blockMd: caldiyBookingBlockMd() },
    ], storage);

    // Emit #1.
    await emitBookingCreated(storage, "org-1", { contactId: "c-1", appointmentId: "a-1" });
    // Emit #2 with SAME resolved key → second insert absorbed by
    // the unique (subscriptionId, idempotencyKey) index.
    await emitBookingCreated(storage, "org-1", { contactId: "c-1", appointmentId: "a-1" });

    assert.equal(storage.deliveries.length, 1, "idempotency prevented duplicate delivery row");

    // Cron tick — handler invoked exactly once.
    const invocations: number[] = [];
    const handlers = new Map<string, SubscriptionHandler>([
      ["logActivityOnBookingCreate", async () => { invocations.push(1); }],
    ]);
    await runSubscriptionTick({ storage, handlers, now: new Date(), batchLimit: 100 });
    assert.equal(invocations.length, 1, "handler invoked once, not twice");
  });
});

describe("SLICE 1 PR 2 — integration: retry", () => {
  test("handler throws once → retry on next tick → success after 2 attempts", async () => {
    const storage = new InMemorySubscriptionStorage();
    await reconcileBlockSubscriptions("org-1", [
      { id: "crm", blockMd: crmBlockMd() },
      { id: "caldiy-booking", blockMd: caldiyBookingBlockMd() },
    ], storage);

    await emitBookingCreated(storage, "org-1", { contactId: "c-1", appointmentId: "a-1" });

    // Stateful handler: throw on first invocation, succeed on second.
    let invocationCount = 0;
    const handlers = new Map<string, SubscriptionHandler>([
      [
        "logActivityOnBookingCreate",
        async () => {
          invocationCount += 1;
          if (invocationCount === 1) throw new Error("transient DB hiccup");
        },
      ],
    ]);

    // Tick 1: handler throws, status→failed, nextAttempt scheduled.
    // Pin tick time to >= seed time (seedDelivery uses new Date()).
    const t1 = new Date(Date.now() + 1000);
    const result1 = await runSubscriptionTick({ storage, handlers, now: t1, batchLimit: 100 });
    assert.equal(result1.failed, 1);
    assert.equal(result1.delivered, 0);
    const d = storage.deliveries[0];
    assert.equal(d.status, "failed");
    assert.equal(d.attempt, 2, "attempt incremented for next try");

    // Tick 2: scheduled past nextAttemptAt — handler succeeds.
    const t2 = new Date(d.nextAttemptAt.getTime() + 1);
    const result2 = await runSubscriptionTick({ storage, handlers, now: t2, batchLimit: 100 });
    assert.equal(result2.delivered, 1);
    assert.equal(storage.deliveries[0].status, "delivered");
    assert.equal(invocationCount, 2);
  });
});

describe("SLICE 1 PR 2 — integration: G-4 dormancy auto-flip", () => {
  test("subscriber-only install → dormant; later producer install → auto-flip to active=true", async () => {
    const storage = new InMemorySubscriptionStorage();

    // Install 1: CRM only (producer block absent).
    const r1 = await reconcileBlockSubscriptions(
      "org-1",
      [{ id: "crm", blockMd: crmBlockMd() }],
      storage,
    );
    assert.equal(r1.registered, 1);
    assert.equal(r1.activated, 0, "nothing to flip yet");
    assert.equal(storage.subscriptions[0].active, false, "dormant per G-4");

    // In the dormant state, an emit produces NO delivery — the
    // bus's findActiveSubscriptions filters inactive rows.
    await emitBookingCreated(storage, "org-1", { contactId: "c-1", appointmentId: "a-1" });
    assert.equal(storage.deliveries.length, 0, "dormant sub doesn't receive deliveries");

    // Install 2: caldiy-booking arrives. Dormant sub auto-flips.
    const r2 = await reconcileBlockSubscriptions(
      "org-1",
      [
        { id: "crm", blockMd: crmBlockMd() },
        { id: "caldiy-booking", blockMd: caldiyBookingBlockMd() },
      ],
      storage,
    );
    assert.equal(r2.activated, 1, "auto-flip happened");
    assert.equal(storage.subscriptions[0].active, true, "now active");

    // After auto-flip, new emits DO enqueue deliveries.
    await emitBookingCreated(storage, "org-1", { contactId: "c-1", appointmentId: "a-2" });
    assert.equal(storage.deliveries.length, 1);
    assert.equal(storage.deliveries[0].status, "pending");
  });
});
