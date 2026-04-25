// End-to-end integration test for scheduled triggers.
// SLICE 5 PR 1 C6 per audit §11 end-to-end flow continuity.
//
// Exercises the full PR 1 path against in-memory storage:
//   1. User authors an AgentSpec with trigger.type="schedule" + cron.
//   2. Validator accepts (schema cross-refs green).
//   3. Resolver picks the effective timezone (trigger → workspace → UTC).
//   4. buildInitialScheduledTrigger computes nextFireAt from cron + tz.
//   5. Store inserts + polling finds the trigger due.
//   6. dispatchScheduledTriggerTick records the fire + invokes onFire +
//      advances nextFireAt.
//   7. Second tick at a later time re-fires.
//
// This is the v1 smoke that replaces the live-run integration test
// deferred until PR 2 archetype template (per audit §7.1 single-PR
// structure). Tests the DISPATCHER LAYER only; archetype-run dispatch
// (onFire=log stub) is a PR 2 concern.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  validateAgentSpec,
  type BlockRegistry,
  type EventRegistry,
} from "../../src/lib/agents/validator";
import { resolveScheduleTimezone } from "../../src/lib/agents/schedule-timezone";
import {
  buildInitialScheduledTrigger,
  makeInMemoryScheduledTriggerStore,
  type ScheduledTrigger,
} from "../../src/lib/agents/scheduled-triggers-storage";
import { dispatchScheduledTriggerTick } from "../../src/lib/agents/schedule-dispatcher";

const emptyRegistry: { blocks: BlockRegistry; events: EventRegistry } = {
  blocks: { tools: new Map(), producesByBlock: new Map() },
  events: { events: [] },
};

describe("SLICE 5 scheduled triggers — end-to-end integration", () => {
  test("full flow: spec validates → trigger inserted → tick fires + advances → second tick fires again", async () => {
    const spec = {
      id: "daily-digest-test",
      name: "Daily Digest Test",
      description: "test schedule",
      trigger: {
        type: "schedule",
        cron: "0 9 * * *",
        timezone: "America/New_York",
      },
      variables: {},
      steps: [{ id: "s1", type: "wait", seconds: 1, next: null }],
    };
    // Step 1-2: validator accepts.
    const issues = validateAgentSpec(spec, emptyRegistry.blocks, emptyRegistry.events);
    const triggerIssues = issues.filter((i) => i.path.startsWith("trigger"));
    assert.equal(triggerIssues.length, 0, `unexpected issues: ${JSON.stringify(triggerIssues)}`);

    // Step 3: timezone resolution (trigger specifies; workspace is "UTC").
    const effectiveTz = resolveScheduleTimezone({
      triggerTimezone: spec.trigger.timezone,
      workspaceTimezone: "UTC",
    });
    assert.equal(effectiveTz, "America/New_York");

    // Step 4-5: build + insert.
    const creationTime = new Date("2026-04-24T00:00:00Z");
    const draft = buildInitialScheduledTrigger({
      orgId: "org_acme",
      archetypeId: "daily-digest",
      cronExpression: spec.trigger.cron,
      timezone: effectiveTz,
      now: creationTime,
    });
    const trigger: ScheduledTrigger = { ...draft, id: "trig_1" };
    const store = makeInMemoryScheduledTriggerStore();
    await store.insert(trigger);

    // nextFireAt should be today 9am NY = 13:00 UTC (EDT).
    const stored = await store.findById("trig_1");
    assert.ok(stored);
    assert.equal(stored!.nextFireAt.toISOString(), "2026-04-24T13:00:00.000Z");

    // Step 6: first tick fires the trigger.
    const fires: Array<{ triggerId: string; fireTime: Date }> = [];
    const firstTickTime = new Date("2026-04-24T13:01:00Z"); // 1 min after fire window
    const outcome1 = await dispatchScheduledTriggerTick({
      store,
      now: firstTickTime,
      batchLimit: 100,
      onFire: async (t, fireTime) => {
        fires.push({ triggerId: t.id, fireTime });
      },
      isArchetypeRunInFlight: async () => false,
    });
    assert.equal(outcome1.dispatched, 1);
    assert.equal(fires.length, 1);
    assert.equal(fires[0].triggerId, "trig_1");
    assert.equal(fires[0].fireTime.toISOString(), "2026-04-24T13:00:00.000Z");

    // nextFireAt advanced to tomorrow 9am NY = 13:00 UTC.
    const afterFirst = await store.findById("trig_1");
    assert.equal(afterFirst!.nextFireAt.toISOString(), "2026-04-25T13:00:00.000Z");
    assert.ok(afterFirst!.lastFiredAt);

    // Step 7: second tick 24h later fires again.
    const secondTickTime = new Date("2026-04-25T13:01:00Z");
    const outcome2 = await dispatchScheduledTriggerTick({
      store,
      now: secondTickTime,
      batchLimit: 100,
      onFire: async (t, fireTime) => {
        fires.push({ triggerId: t.id, fireTime });
      },
      isArchetypeRunInFlight: async () => false,
    });
    assert.equal(outcome2.dispatched, 1);
    assert.equal(fires.length, 2);
    assert.equal(fires[1].fireTime.toISOString(), "2026-04-25T13:00:00.000Z");
  });

  test("idempotency: two overlapping ticks at the same time fire exactly once", async () => {
    const draft = buildInitialScheduledTrigger({
      orgId: "o",
      archetypeId: "a",
      cronExpression: "* * * * *", // every minute
      timezone: "UTC",
      now: new Date("2026-04-24T09:00:00Z"),
    });
    const trigger: ScheduledTrigger = { ...draft, id: "trig_overlap" };
    const store = makeInMemoryScheduledTriggerStore();
    await store.insert(trigger);

    const tickTime = new Date("2026-04-24T09:01:30Z");
    let fireCount = 0;
    const onFire = async () => {
      fireCount += 1;
    };

    // Run two ticks back-to-back at the SAME time — the second tick
    // would find the same due window; UNIQUE on scheduled_trigger_fires
    // prevents double-fire.
    const o1 = await dispatchScheduledTriggerTick({
      store,
      now: tickTime,
      batchLimit: 100,
      onFire,
      isArchetypeRunInFlight: async () => false,
    });
    const o2 = await dispatchScheduledTriggerTick({
      store,
      now: tickTime,
      batchLimit: 100,
      onFire,
      isArchetypeRunInFlight: async () => false,
    });

    // First tick dispatches once; second finds nextFireAt was advanced
    // past tickTime, so nothing is due.
    assert.equal(o1.dispatched, 1);
    assert.equal(o2.scanned, 0);
    assert.equal(fireCount, 1);
  });

  test("catchup=fire_all end-to-end: recovers all missed windows", async () => {
    // Daily 9am UTC trigger. lastFiredAt simulates a 48-hour outage.
    const draft = buildInitialScheduledTrigger({
      orgId: "o",
      archetypeId: "a",
      cronExpression: "0 9 * * *",
      timezone: "UTC",
      catchup: "fire_all",
      now: new Date("2026-04-21T00:00:00Z"),
    });
    const trigger: ScheduledTrigger = {
      ...draft,
      id: "trig_catchup",
      lastFiredAt: new Date("2026-04-21T09:01:00Z"),
      nextFireAt: new Date("2026-04-22T09:00:00Z"),
    };
    const store = makeInMemoryScheduledTriggerStore();
    await store.insert(trigger);

    // Tick runs at 2026-04-24T09:30 — 2 windows missed (Apr 22, 23) +
    // 1 on-time (Apr 24).
    const fires: Date[] = [];
    const outcome = await dispatchScheduledTriggerTick({
      store,
      now: new Date("2026-04-24T09:30:00Z"),
      batchLimit: 100,
      onFire: async (_t, fireTime) => {
        fires.push(fireTime);
      },
      isArchetypeRunInFlight: async () => false,
    });

    assert.equal(outcome.dispatched, 3);
    assert.equal(fires.length, 3);
    assert.equal(fires[0].toISOString(), "2026-04-22T09:00:00.000Z");
    assert.equal(fires[1].toISOString(), "2026-04-23T09:00:00.000Z");
    assert.equal(fires[2].toISOString(), "2026-04-24T09:00:00.000Z");
  });

  test("validator rejects spec before storage insert when cron is invalid", () => {
    const spec = {
      id: "bad",
      name: "x",
      description: "x",
      trigger: { type: "schedule", cron: "not a cron" },
      variables: {},
      steps: [{ id: "s1", type: "wait", seconds: 1, next: null }],
    };
    const issues = validateAgentSpec(spec, emptyRegistry.blocks, emptyRegistry.events);
    const triggerIssues = issues.filter((i) => i.path.startsWith("trigger"));
    assert.ok(triggerIssues.length > 0, "validator must reject invalid cron before insert");
  });
});
