// Tests for the scheduled-trigger dispatcher logic.
// SLICE 5 PR 1 C5 per audit §4.3 + §4.4.
//
// Three layers, all pure-logic testable:
//   1. computeMissedWindows(cron, tz, lastFire, now) — enumerates
//      cron hits in (lastFire, now].
//   2. applyCatchupPolicy(policy, windows) — filters per G-5-2.
//   3. dispatchScheduledTriggerTick({ store, now, batchLimit, onFire,
//      isArchetypeRunInFlight }) — orchestrates per-trigger dispatch
//      with concurrency + catchup.

import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  computeMissedWindows,
  applyCatchupPolicy,
  dispatchScheduledTriggerTick,
  type DispatchOutcome,
} from "../../src/lib/agents/schedule-dispatcher";
import {
  makeInMemoryScheduledTriggerStore,
  type ScheduledTrigger,
  type ScheduledTriggerStore,
} from "../../src/lib/agents/scheduled-triggers-storage";

// ---------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------

function baseTrigger(overrides: Partial<ScheduledTrigger> = {}): ScheduledTrigger {
  return {
    id: "t1",
    orgId: "o",
    archetypeId: "daily-digest",
    cronExpression: "0 9 * * *",
    timezone: "UTC",
    catchup: "skip",
    concurrency: "skip",
    nextFireAt: new Date("2026-04-24T09:00:00Z"),
    lastFiredAt: null,
    enabled: true,
    createdAt: new Date("2026-04-20T00:00:00Z"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------
// computeMissedWindows
// ---------------------------------------------------------------------

describe("computeMissedWindows — enumeration of cron hits in (lastFire, now]", () => {
  test("returns single hit when lastFire < scheduled < now", () => {
    const windows = computeMissedWindows(
      "0 9 * * *",
      "UTC",
      new Date("2026-04-23T10:00:00Z"), // lastFire = yesterday 10am
      new Date("2026-04-24T09:30:00Z"), // now = today 9:30am (after today's 9am)
    );
    assert.equal(windows.length, 1);
    assert.equal(windows[0].toISOString(), "2026-04-24T09:00:00.000Z");
  });

  test("returns multiple hits when several windows elapsed", () => {
    // Daily 9am: yesterday + today missed.
    const windows = computeMissedWindows(
      "0 9 * * *",
      "UTC",
      new Date("2026-04-22T09:01:00Z"), // lastFire = day before yesterday 9am
      new Date("2026-04-24T09:30:00Z"), // now = today 9:30am
    );
    assert.equal(windows.length, 2);
    assert.equal(windows[0].toISOString(), "2026-04-23T09:00:00.000Z");
    assert.equal(windows[1].toISOString(), "2026-04-24T09:00:00.000Z");
  });

  test("returns empty array when no windows in range", () => {
    const windows = computeMissedWindows(
      "0 9 * * *",
      "UTC",
      new Date("2026-04-24T08:00:00Z"),
      new Date("2026-04-24T08:30:00Z"), // before today's 9am
    );
    assert.equal(windows.length, 0);
  });

  test("returns empty array when now === lastFire (boundary)", () => {
    const windows = computeMissedWindows(
      "0 9 * * *",
      "UTC",
      new Date("2026-04-24T09:00:00Z"),
      new Date("2026-04-24T09:00:00Z"),
    );
    assert.equal(windows.length, 0);
  });

  test("caps at a safety limit for degenerate long spans", () => {
    // 10 years in the past — caps enumeration to avoid runaway.
    const windows = computeMissedWindows(
      "0 9 * * *",
      "UTC",
      new Date("2016-04-01T00:00:00Z"),
      new Date("2026-04-24T10:00:00Z"),
      { maxWindows: 50 },
    );
    assert.equal(windows.length, 50);
  });
});

// ---------------------------------------------------------------------
// applyCatchupPolicy
// ---------------------------------------------------------------------

describe("applyCatchupPolicy", () => {
  const oneWindow = [new Date("2026-04-24T09:00:00Z")];
  const multipleWindows = [
    new Date("2026-04-22T09:00:00Z"),
    new Date("2026-04-23T09:00:00Z"),
    new Date("2026-04-24T09:00:00Z"),
  ];

  test("skip: single on-time window still fires (not a catchup situation)", () => {
    assert.deepEqual(applyCatchupPolicy("skip", oneWindow), oneWindow);
  });

  test("skip: multiple windows → fires zero (catchup suppressed)", () => {
    assert.deepEqual(applyCatchupPolicy("skip", multipleWindows), []);
  });

  test("fire_all: all windows in order", () => {
    assert.deepEqual(applyCatchupPolicy("fire_all", multipleWindows), multipleWindows);
  });

  test("fire_one: most recent window only", () => {
    const out = applyCatchupPolicy("fire_one", multipleWindows);
    assert.equal(out.length, 1);
    assert.equal(out[0].toISOString(), "2026-04-24T09:00:00.000Z");
  });

  test("fire_one with single window: same as fire", () => {
    assert.deepEqual(applyCatchupPolicy("fire_one", oneWindow), oneWindow);
  });

  test("any policy with zero windows: zero fires", () => {
    assert.deepEqual(applyCatchupPolicy("skip", []), []);
    assert.deepEqual(applyCatchupPolicy("fire_all", []), []);
    assert.deepEqual(applyCatchupPolicy("fire_one", []), []);
  });
});

// ---------------------------------------------------------------------
// dispatchScheduledTriggerTick
// ---------------------------------------------------------------------

describe("dispatchScheduledTriggerTick — integration via in-memory store", () => {
  let store: ScheduledTriggerStore;
  let fires: Array<{ triggerId: string; fireTime: Date }>;
  let onFire: (trigger: ScheduledTrigger, fireTime: Date) => Promise<void>;

  beforeEach(() => {
    store = makeInMemoryScheduledTriggerStore();
    fires = [];
    onFire = async (trigger, fireTime) => {
      fires.push({ triggerId: trigger.id, fireTime });
    };
  });

  test("dispatches on-time trigger + advances nextFireAt", async () => {
    await store.insert(baseTrigger());
    const outcome = await dispatchScheduledTriggerTick({
      store,
      now: new Date("2026-04-24T09:00:30Z"), // just after 9am
      batchLimit: 100,
      onFire,
      isArchetypeRunInFlight: async () => false,
    });
    assert.equal(outcome.dispatched, 1);
    assert.equal(fires.length, 1);
    assert.equal(fires[0].triggerId, "t1");

    const updated = await store.findById("t1");
    assert.ok(updated!.lastFiredAt);
    assert.equal(updated!.nextFireAt.toISOString(), "2026-04-25T09:00:00.000Z");
  });

  test("skip catchup: 2+ missed windows → zero dispatches, still advance", async () => {
    await store.insert(
      baseTrigger({
        catchup: "skip",
        lastFiredAt: new Date("2026-04-22T09:01:00Z"),
        nextFireAt: new Date("2026-04-23T09:00:00Z"),
      }),
    );
    const outcome = await dispatchScheduledTriggerTick({
      store,
      now: new Date("2026-04-24T09:30:00Z"),
      batchLimit: 100,
      onFire,
      isArchetypeRunInFlight: async () => false,
    });
    assert.equal(outcome.dispatched, 0);
    assert.equal(fires.length, 0);
    const updated = await store.findById("t1");
    assert.equal(updated!.nextFireAt.toISOString(), "2026-04-25T09:00:00.000Z");
  });

  test("fire_all catchup: all missed windows dispatched", async () => {
    await store.insert(
      baseTrigger({
        catchup: "fire_all",
        lastFiredAt: new Date("2026-04-22T09:01:00Z"),
        nextFireAt: new Date("2026-04-23T09:00:00Z"),
      }),
    );
    const outcome = await dispatchScheduledTriggerTick({
      store,
      now: new Date("2026-04-24T09:30:00Z"),
      batchLimit: 100,
      onFire,
      isArchetypeRunInFlight: async () => false,
    });
    assert.equal(outcome.dispatched, 2);
    assert.equal(fires.length, 2);
    assert.equal(fires[0].fireTime.toISOString(), "2026-04-23T09:00:00.000Z");
    assert.equal(fires[1].fireTime.toISOString(), "2026-04-24T09:00:00.000Z");
  });

  test("fire_one catchup: single most-recent window dispatched", async () => {
    await store.insert(
      baseTrigger({
        catchup: "fire_one",
        lastFiredAt: new Date("2026-04-22T09:01:00Z"),
        nextFireAt: new Date("2026-04-23T09:00:00Z"),
      }),
    );
    const outcome = await dispatchScheduledTriggerTick({
      store,
      now: new Date("2026-04-24T09:30:00Z"),
      batchLimit: 100,
      onFire,
      isArchetypeRunInFlight: async () => false,
    });
    assert.equal(outcome.dispatched, 1);
    assert.equal(fires.length, 1);
    assert.equal(fires[0].fireTime.toISOString(), "2026-04-24T09:00:00.000Z");
  });

  test("concurrency=skip: in-flight run skips dispatch (but advances)", async () => {
    await store.insert(baseTrigger({ concurrency: "skip" }));
    const outcome = await dispatchScheduledTriggerTick({
      store,
      now: new Date("2026-04-24T09:00:30Z"),
      batchLimit: 100,
      onFire,
      isArchetypeRunInFlight: async () => true, // pretend a run is active
    });
    assert.equal(outcome.dispatched, 0);
    assert.equal(outcome.skippedByConcurrency, 1);
    assert.equal(fires.length, 0);
    // nextFireAt still advances — we don't retry on the next tick
    const updated = await store.findById("t1");
    assert.equal(updated!.nextFireAt.toISOString(), "2026-04-25T09:00:00.000Z");
  });

  test("concurrency=concurrent: in-flight run does NOT skip dispatch", async () => {
    await store.insert(baseTrigger({ concurrency: "concurrent" }));
    const outcome = await dispatchScheduledTriggerTick({
      store,
      now: new Date("2026-04-24T09:00:30Z"),
      batchLimit: 100,
      onFire,
      isArchetypeRunInFlight: async () => true,
    });
    assert.equal(outcome.dispatched, 1);
    assert.equal(fires.length, 1);
  });

  test("recordFire UNIQUE conflict → count as idempotent-skip, still advance", async () => {
    await store.insert(baseTrigger());
    // Pre-record the fire for this window (simulating another tick won the race)
    await store.recordFire({
      id: "prior",
      scheduledTriggerId: "t1",
      fireTimeUtc: new Date("2026-04-24T09:00:00Z"),
      dispatchedAt: new Date("2026-04-24T09:00:00Z"),
    });
    const outcome = await dispatchScheduledTriggerTick({
      store,
      now: new Date("2026-04-24T09:00:30Z"),
      batchLimit: 100,
      onFire,
      isArchetypeRunInFlight: async () => false,
    });
    assert.equal(outcome.dispatched, 0);
    assert.equal(outcome.skippedByIdempotency, 1);
    assert.equal(fires.length, 0);
    // Advance still happens — next tick shouldn't retry the same window
    const updated = await store.findById("t1");
    assert.equal(updated!.nextFireAt.toISOString(), "2026-04-25T09:00:00.000Z");
  });

  test("batch limit applied across triggers", async () => {
    for (let i = 0; i < 5; i += 1) {
      await store.insert(baseTrigger({ id: `t${i}`, archetypeId: `arch-${i}` }));
    }
    const outcome = await dispatchScheduledTriggerTick({
      store,
      now: new Date("2026-04-24T09:00:30Z"),
      batchLimit: 3,
      onFire,
      isArchetypeRunInFlight: async () => false,
    });
    assert.equal(outcome.scanned, 3);
    assert.equal(outcome.dispatched, 3);
  });

  test("onFire errors do not abort the tick (other triggers continue)", async () => {
    await store.insert(baseTrigger({ id: "t-good", archetypeId: "g" }));
    await store.insert(baseTrigger({ id: "t-bad", archetypeId: "b" }));
    const failingOnFire = async (trigger: ScheduledTrigger) => {
      if (trigger.id === "t-bad") throw new Error("simulated");
      fires.push({ triggerId: trigger.id, fireTime: trigger.nextFireAt });
    };
    const outcome: DispatchOutcome = await dispatchScheduledTriggerTick({
      store,
      now: new Date("2026-04-24T09:00:30Z"),
      batchLimit: 100,
      onFire: failingOnFire,
      isArchetypeRunInFlight: async () => false,
    });
    assert.equal(outcome.dispatched, 1);
    assert.equal(outcome.failed, 1);
    assert.equal(fires.length, 1);
    assert.equal(fires[0].triggerId, "t-good");
  });

  test("disabled triggers are not dispatched", async () => {
    await store.insert(baseTrigger({ enabled: false }));
    const outcome = await dispatchScheduledTriggerTick({
      store,
      now: new Date("2026-04-24T09:00:30Z"),
      batchLimit: 100,
      onFire,
      isArchetypeRunInFlight: async () => false,
    });
    assert.equal(outcome.scanned, 0);
    assert.equal(outcome.dispatched, 0);
  });
});
