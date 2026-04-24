// Tests for scheduled_triggers + scheduled_trigger_fires persistence.
// SLICE 5 PR 1 C4 per audit §3.2.
//
// Pattern mirrors workflow_waits (SLICE 2c): Drizzle schema + pure
// helper functions that encode the CAS + UNIQUE invariants. Storage
// is pluggable via an in-memory test harness that mirrors the
// Drizzle-backed production storage interface.

import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  buildInitialScheduledTrigger,
  computeNextFireAtForTrigger,
  makeInMemoryScheduledTriggerStore,
  type ScheduledTriggerStore,
  type ScheduledTrigger,
  type ScheduledTriggerFire,
} from "../../src/lib/agents/scheduled-triggers-storage";

// ---------------------------------------------------------------------
// Schema exports pin
// ---------------------------------------------------------------------

describe("scheduled_triggers schema — exports", () => {
  test("Drizzle schema module exports scheduled_triggers + scheduled_trigger_fires", async () => {
    const schema = await import("../../src/db/schema/scheduled-triggers");
    assert.ok(schema.scheduledTriggers, "scheduledTriggers table exported");
    assert.ok(schema.scheduledTriggerFires, "scheduledTriggerFires table exported");
  });
});

// ---------------------------------------------------------------------
// buildInitialScheduledTrigger — factory
// ---------------------------------------------------------------------

describe("buildInitialScheduledTrigger", () => {
  test("computes nextFireAt from cron + timezone + now()", () => {
    const now = new Date("2026-04-24T08:00:00Z");
    const row = buildInitialScheduledTrigger({
      orgId: "org_1",
      archetypeId: "daily-digest",
      cronExpression: "0 9 * * *",
      timezone: "UTC",
      catchup: "skip",
      concurrency: "skip",
      now,
    });
    assert.equal(row.orgId, "org_1");
    assert.equal(row.archetypeId, "daily-digest");
    assert.equal(row.cronExpression, "0 9 * * *");
    assert.equal(row.timezone, "UTC");
    assert.equal(row.catchup, "skip");
    assert.equal(row.concurrency, "skip");
    assert.equal(row.enabled, true);
    assert.ok(row.nextFireAt);
    assert.equal(row.nextFireAt.toISOString(), "2026-04-24T09:00:00.000Z");
    assert.equal(row.lastFiredAt, null);
  });

  test("applies defaults for catchup + concurrency", () => {
    const row = buildInitialScheduledTrigger({
      orgId: "org_1",
      archetypeId: "x",
      cronExpression: "* * * * *",
      timezone: "UTC",
      now: new Date("2026-04-24T08:00:00Z"),
    });
    assert.equal(row.catchup, "skip");
    assert.equal(row.concurrency, "skip");
  });

  test("throws on invalid cron", () => {
    assert.throws(
      () =>
        buildInitialScheduledTrigger({
          orgId: "org_1",
          archetypeId: "x",
          cronExpression: "not a cron",
          timezone: "UTC",
          now: new Date(),
        }),
      /invalid cron/i,
    );
  });

  test("throws on invalid timezone", () => {
    assert.throws(
      () =>
        buildInitialScheduledTrigger({
          orgId: "org_1",
          archetypeId: "x",
          cronExpression: "* * * * *",
          timezone: "Mars/Olympus",
          now: new Date(),
        }),
      /timezone/i,
    );
  });
});

// ---------------------------------------------------------------------
// computeNextFireAtForTrigger — post-fire advancement
// ---------------------------------------------------------------------

describe("computeNextFireAtForTrigger", () => {
  test("advances nextFireAt from a reference time", () => {
    // Using a trigger firing daily 9am UTC; after firing at
    // 09:00 today, next fire should be 09:00 tomorrow.
    const trigger = buildInitialScheduledTrigger({
      orgId: "o",
      archetypeId: "a",
      cronExpression: "0 9 * * *",
      timezone: "UTC",
      now: new Date("2026-04-24T00:00:00Z"),
    });
    const nextAfterFire = computeNextFireAtForTrigger(trigger, new Date("2026-04-24T09:00:00Z"));
    assert.equal(nextAfterFire.toISOString(), "2026-04-25T09:00:00.000Z");
  });
});

// ---------------------------------------------------------------------
// In-memory store — behavioral contract for dispatcher
// ---------------------------------------------------------------------

describe("ScheduledTriggerStore — findDue + recordFire + advance", () => {
  let store: ScheduledTriggerStore;

  beforeEach(() => {
    store = makeInMemoryScheduledTriggerStore();
  });

  test("empty store returns empty findDue", async () => {
    const due = await store.findDue(new Date(), 100);
    assert.deepEqual(due, []);
  });

  test("findDue returns only enabled + due triggers", async () => {
    const t1: ScheduledTrigger = {
      id: "t1",
      orgId: "o",
      archetypeId: "a",
      cronExpression: "* * * * *",
      timezone: "UTC",
      catchup: "skip",
      concurrency: "skip",
      nextFireAt: new Date("2026-04-24T08:00:00Z"),
      lastFiredAt: null,
      enabled: true,
      createdAt: new Date("2026-04-20T00:00:00Z"),
    };
    const t2Disabled: ScheduledTrigger = { ...t1, id: "t2", enabled: false };
    const t3Future: ScheduledTrigger = { ...t1, id: "t3", nextFireAt: new Date("2026-04-24T10:00:00Z") };

    await store.insert(t1);
    await store.insert(t2Disabled);
    await store.insert(t3Future);

    const due = await store.findDue(new Date("2026-04-24T09:00:00Z"), 100);
    assert.equal(due.length, 1);
    assert.equal(due[0].id, "t1");
  });

  test("recordFire refuses duplicates at the same minute (UNIQUE)", async () => {
    const fire: ScheduledTriggerFire = {
      id: "f1",
      scheduledTriggerId: "t1",
      fireTimeUtc: new Date("2026-04-24T09:00:00Z"),
      dispatchedAt: new Date("2026-04-24T09:00:01Z"),
    };
    const first = await store.recordFire(fire);
    assert.equal(first.ok, true);

    const duplicate: ScheduledTriggerFire = { ...fire, id: "f2", dispatchedAt: new Date() };
    const second = await store.recordFire(duplicate);
    assert.equal(second.ok, false, "second recordFire at same fireTime must fail");
  });

  test("recordFire allows second fire at a different minute", async () => {
    await store.recordFire({
      id: "f1",
      scheduledTriggerId: "t1",
      fireTimeUtc: new Date("2026-04-24T09:00:00Z"),
      dispatchedAt: new Date("2026-04-24T09:00:01Z"),
    });
    const secondMinute = await store.recordFire({
      id: "f2",
      scheduledTriggerId: "t1",
      fireTimeUtc: new Date("2026-04-24T09:01:00Z"),
      dispatchedAt: new Date("2026-04-24T09:01:01Z"),
    });
    assert.equal(secondMinute.ok, true);
  });

  test("advanceTrigger updates nextFireAt + lastFiredAt", async () => {
    const t: ScheduledTrigger = {
      id: "t1",
      orgId: "o",
      archetypeId: "a",
      cronExpression: "0 9 * * *",
      timezone: "UTC",
      catchup: "skip",
      concurrency: "skip",
      nextFireAt: new Date("2026-04-24T09:00:00Z"),
      lastFiredAt: null,
      enabled: true,
      createdAt: new Date("2026-04-20T00:00:00Z"),
    };
    await store.insert(t);
    await store.advanceTrigger("t1", {
      lastFiredAt: new Date("2026-04-24T09:00:01Z"),
      nextFireAt: new Date("2026-04-25T09:00:00Z"),
    });
    const found = await store.findById("t1");
    assert.ok(found);
    assert.equal(found!.lastFiredAt?.toISOString(), "2026-04-24T09:00:01.000Z");
    assert.equal(found!.nextFireAt.toISOString(), "2026-04-25T09:00:00.000Z");
  });

  test("findDue respects batch limit", async () => {
    for (let i = 0; i < 5; i += 1) {
      await store.insert({
        id: `t${i}`,
        orgId: "o",
        archetypeId: "a",
        cronExpression: "* * * * *",
        timezone: "UTC",
        catchup: "skip",
        concurrency: "skip",
        nextFireAt: new Date("2026-04-24T08:00:00Z"),
        lastFiredAt: null,
        enabled: true,
        createdAt: new Date("2026-04-20T00:00:00Z"),
      });
    }
    const due = await store.findDue(new Date("2026-04-24T09:00:00Z"), 3);
    assert.equal(due.length, 3);
  });
});
