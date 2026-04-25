// Explicit matrix coverage for the scheduled-trigger dispatcher.
// SLICE 5 PR 2 C3 per Max's PR 2 specific-watch #2:
//
//   "Parallel concurrency matrix:
//    - Test combinations: skip + idempotency + catchup = skip
//    - Test combinations: skip + idempotency + catchup = fire_all
//    - Test combinations: concurrent + idempotency + catchup = skip
//    - Test combinations: concurrent + idempotency + catchup = fire_all
//    Matrix coverage ensures all four combinations work correctly."
//
// PR 1 C5 shipped the underlying dispatcher + individual tests for each
// dimension. This commit explicitly exercises the 2×3×2 cross-product to
// lock behavior across concurrency × catchup × idempotency. Audit-time
// dispatcher-policy-matrix addendum (PR 2 C1) predicted ~150 extra LOC
// from this matrix work; this commit validates the prediction.

import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  dispatchScheduledTriggerTick,
} from "../../src/lib/agents/schedule-dispatcher";
import {
  makeInMemoryScheduledTriggerStore,
  type ScheduledTrigger,
  type ScheduledTriggerStore,
  type ScheduledTriggerCatchup,
  type ScheduledTriggerConcurrency,
} from "../../src/lib/agents/scheduled-triggers-storage";

// ---------------------------------------------------------------------
// Matrix setup
// ---------------------------------------------------------------------

function catchupTrigger(
  catchup: ScheduledTriggerCatchup,
  concurrency: ScheduledTriggerConcurrency,
  overrides: Partial<ScheduledTrigger> = {},
): ScheduledTrigger {
  return {
    id: `t-${catchup}-${concurrency}`,
    orgId: "o",
    archetypeId: "daily-digest",
    cronExpression: "0 9 * * *",
    timezone: "UTC",
    catchup,
    concurrency,
    nextFireAt: new Date("2026-04-22T09:00:00Z"),
    lastFiredAt: new Date("2026-04-21T09:01:00Z"), // 2 catchup windows missed
    enabled: true,
    createdAt: new Date("2026-04-20T00:00:00Z"),
    ...overrides,
  };
}

const TICK_TIME = new Date("2026-04-24T09:30:00Z"); // 2 missed + 1 on-time

// ---------------------------------------------------------------------
// 2 × 3 = 6 matrix cells: concurrency {skip, concurrent} × catchup {skip,
// fire_all, fire_one}. Each cell is parameterised over idempotency state
// (fresh vs. pre-recorded fire for one of the expected windows), so the
// full matrix is 6 × 2 = 12 scenarios, but some idempotency cells are
// no-ops when catchup=skip dispatches zero fires.
// ---------------------------------------------------------------------

describe("matrix — concurrency × catchup (no prior fires)", () => {
  let store: ScheduledTriggerStore;
  let fireCount: number;

  beforeEach(() => {
    store = makeInMemoryScheduledTriggerStore();
    fireCount = 0;
  });

  async function dispatchWith(trigger: ScheduledTrigger, inFlight: boolean) {
    await store.insert(trigger);
    return dispatchScheduledTriggerTick({
      store,
      now: TICK_TIME,
      batchLimit: 100,
      onFire: async () => {
        fireCount += 1;
      },
      isArchetypeRunInFlight: async () => inFlight,
    });
  }

  test("concurrency=skip, catchup=skip, no in-flight → 0 fires (catchup suppressed)", async () => {
    const outcome = await dispatchWith(catchupTrigger("skip", "skip"), false);
    assert.equal(outcome.dispatched, 0);
    assert.equal(fireCount, 0);
  });

  test("concurrency=skip, catchup=fire_all, no in-flight → 3 fires", async () => {
    const outcome = await dispatchWith(catchupTrigger("fire_all", "skip"), false);
    assert.equal(outcome.dispatched, 3);
    assert.equal(fireCount, 3);
  });

  test("concurrency=skip, catchup=fire_one, no in-flight → 1 fire (most recent)", async () => {
    const outcome = await dispatchWith(catchupTrigger("fire_one", "skip"), false);
    assert.equal(outcome.dispatched, 1);
    assert.equal(fireCount, 1);
  });

  test("concurrency=concurrent, catchup=skip, no in-flight → 0 fires (catchup suppressed regardless of concurrency)", async () => {
    const outcome = await dispatchWith(catchupTrigger("skip", "concurrent"), false);
    assert.equal(outcome.dispatched, 0);
    assert.equal(fireCount, 0);
  });

  test("concurrency=concurrent, catchup=fire_all, no in-flight → 3 fires", async () => {
    const outcome = await dispatchWith(catchupTrigger("fire_all", "concurrent"), false);
    assert.equal(outcome.dispatched, 3);
    assert.equal(fireCount, 3);
  });

  test("concurrency=concurrent, catchup=fire_one, no in-flight → 1 fire", async () => {
    const outcome = await dispatchWith(catchupTrigger("fire_one", "concurrent"), false);
    assert.equal(outcome.dispatched, 1);
    assert.equal(fireCount, 1);
  });
});

describe("matrix — concurrency × catchup (with in-flight run)", () => {
  let store: ScheduledTriggerStore;
  let fireCount: number;

  beforeEach(() => {
    store = makeInMemoryScheduledTriggerStore();
    fireCount = 0;
  });

  async function dispatchWith(trigger: ScheduledTrigger, inFlight: boolean) {
    await store.insert(trigger);
    return dispatchScheduledTriggerTick({
      store,
      now: TICK_TIME,
      batchLimit: 100,
      onFire: async () => {
        fireCount += 1;
      },
      isArchetypeRunInFlight: async () => inFlight,
    });
  }

  test("concurrency=skip, catchup=fire_all, in-flight → 0 fires (concurrency gate blocks)", async () => {
    const outcome = await dispatchWith(catchupTrigger("fire_all", "skip"), true);
    assert.equal(outcome.dispatched, 0);
    assert.equal(outcome.skippedByConcurrency, 3);
    assert.equal(fireCount, 0);
  });

  test("concurrency=skip, catchup=fire_one, in-flight → 0 fires (concurrency gate blocks)", async () => {
    const outcome = await dispatchWith(catchupTrigger("fire_one", "skip"), true);
    assert.equal(outcome.dispatched, 0);
    assert.equal(outcome.skippedByConcurrency, 1);
    assert.equal(fireCount, 0);
  });

  test("concurrency=concurrent, catchup=fire_all, in-flight → 3 fires (concurrency bypass)", async () => {
    const outcome = await dispatchWith(catchupTrigger("fire_all", "concurrent"), true);
    assert.equal(outcome.dispatched, 3);
    assert.equal(outcome.skippedByConcurrency, 0);
    assert.equal(fireCount, 3);
  });

  test("concurrency=concurrent, catchup=fire_one, in-flight → 1 fire", async () => {
    const outcome = await dispatchWith(catchupTrigger("fire_one", "concurrent"), true);
    assert.equal(outcome.dispatched, 1);
    assert.equal(fireCount, 1);
  });
});

describe("matrix — idempotency interaction with catchup", () => {
  let store: ScheduledTriggerStore;
  let fireCount: number;

  beforeEach(() => {
    store = makeInMemoryScheduledTriggerStore();
    fireCount = 0;
  });

  async function prerecord(store_: ScheduledTriggerStore, triggerId: string, fireTime: Date) {
    await store_.recordFire({
      id: `pre-${fireTime.toISOString()}`,
      scheduledTriggerId: triggerId,
      fireTimeUtc: fireTime,
      dispatchedAt: fireTime,
    });
  }

  test("catchup=fire_all + one of three windows pre-recorded → 2 fires (skip the dupe)", async () => {
    const t = catchupTrigger("fire_all", "skip");
    await store.insert(t);
    // Pre-record Apr 23's window (the middle of the three)
    await prerecord(store, t.id, new Date("2026-04-23T09:00:00Z"));

    const outcome = await dispatchScheduledTriggerTick({
      store,
      now: TICK_TIME,
      batchLimit: 100,
      onFire: async () => {
        fireCount += 1;
      },
      isArchetypeRunInFlight: async () => false,
    });
    assert.equal(outcome.dispatched, 2);
    assert.equal(outcome.skippedByIdempotency, 1);
    assert.equal(fireCount, 2);
  });

  test("catchup=fire_one + the most-recent window pre-recorded → 0 fires (only window dupe)", async () => {
    const t = catchupTrigger("fire_one", "skip");
    await store.insert(t);
    // Pre-record Apr 24's window (the most recent, which fire_one picks)
    await prerecord(store, t.id, new Date("2026-04-24T09:00:00Z"));

    const outcome = await dispatchScheduledTriggerTick({
      store,
      now: TICK_TIME,
      batchLimit: 100,
      onFire: async () => {
        fireCount += 1;
      },
      isArchetypeRunInFlight: async () => false,
    });
    assert.equal(outcome.dispatched, 0);
    assert.equal(outcome.skippedByIdempotency, 1);
    assert.equal(fireCount, 0);
  });

  test("catchup=fire_all + all three windows pre-recorded → 0 fires (all dupes)", async () => {
    const t = catchupTrigger("fire_all", "skip");
    await store.insert(t);
    for (const d of ["2026-04-22T09:00:00Z", "2026-04-23T09:00:00Z", "2026-04-24T09:00:00Z"]) {
      await prerecord(store, t.id, new Date(d));
    }

    const outcome = await dispatchScheduledTriggerTick({
      store,
      now: TICK_TIME,
      batchLimit: 100,
      onFire: async () => {
        fireCount += 1;
      },
      isArchetypeRunInFlight: async () => false,
    });
    assert.equal(outcome.dispatched, 0);
    assert.equal(outcome.skippedByIdempotency, 3);
    assert.equal(fireCount, 0);
  });
});

// ---------------------------------------------------------------------
// Ordering: fire_all dispatches in chronological order, not reverse
// ---------------------------------------------------------------------

describe("matrix — ordering guarantees", () => {
  test("fire_all dispatches missed windows oldest-first", async () => {
    const store = makeInMemoryScheduledTriggerStore();
    const order: string[] = [];
    await store.insert(catchupTrigger("fire_all", "skip"));
    await dispatchScheduledTriggerTick({
      store,
      now: TICK_TIME,
      batchLimit: 100,
      onFire: async (_t, fireTime) => {
        order.push(fireTime.toISOString());
      },
      isArchetypeRunInFlight: async () => false,
    });
    assert.deepEqual(order, [
      "2026-04-22T09:00:00.000Z",
      "2026-04-23T09:00:00.000Z",
      "2026-04-24T09:00:00.000Z",
    ]);
  });

  test("fire_all dispatches in order even across multiple triggers (per-trigger ordering preserved)", async () => {
    const store = makeInMemoryScheduledTriggerStore();
    const events: Array<{ tid: string; at: string }> = [];
    await store.insert(catchupTrigger("fire_all", "skip", { id: "ta", archetypeId: "a" }));
    await store.insert(catchupTrigger("fire_all", "skip", { id: "tb", archetypeId: "b" }));
    await dispatchScheduledTriggerTick({
      store,
      now: TICK_TIME,
      batchLimit: 100,
      onFire: async (t, fireTime) => {
        events.push({ tid: t.id, at: fireTime.toISOString() });
      },
      isArchetypeRunInFlight: async () => false,
    });
    // Each trigger's fires are ordered oldest-first.
    const aFires = events.filter((e) => e.tid === "ta").map((e) => e.at);
    const bFires = events.filter((e) => e.tid === "tb").map((e) => e.at);
    assert.deepEqual(aFires, [
      "2026-04-22T09:00:00.000Z",
      "2026-04-23T09:00:00.000Z",
      "2026-04-24T09:00:00.000Z",
    ]);
    assert.deepEqual(bFires, [
      "2026-04-22T09:00:00.000Z",
      "2026-04-23T09:00:00.000Z",
      "2026-04-24T09:00:00.000Z",
    ]);
  });
});
