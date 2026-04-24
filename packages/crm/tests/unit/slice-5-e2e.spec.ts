// End-to-end integration test for the SLICE 5 scheduled-trigger path.
// PR 2 C5 per audit §11 flow continuity + Max's PR 2 scope item #5.
//
// Exercises the full builder-facing pipeline against in-memory
// storage:
//
//   archetype template (daily-digest)
//     → placeholder fill (simulated synthesis)
//     → AgentSpec validate (C1 discriminated union + C2 schedule schema)
//     → scheduled_triggers insert (C4 persistence)
//     → workflow-tick dispatch (C5 dispatcher + catchup + concurrency)
//     → onFire callback invoked (PR 2 C3 archetype-run wiring)
//     → observability helpers format for admin UI (C4 summary helpers)
//     → second tick re-fires on the next scheduled window (idempotency)
//
// This replaces the live-run integration test deferred from PR 1.
// Live-Drizzle + live-Claude integration stays out of harness scope
// (post-launch slice).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { getArchetype } from "../../src/lib/agents/archetypes";
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
import {
  formatNextFireRelative,
  summarizeCron,
} from "../../src/lib/agents/schedule-summary";

// ---------------------------------------------------------------------
// Registries — minimal for trigger-only validation
// ---------------------------------------------------------------------

const emptyBlockRegistry: BlockRegistry = {
  tools: new Map(),
  producesByBlock: new Map(),
};
const emptyEventRegistry: EventRegistry = { events: [] };

// ---------------------------------------------------------------------
// Simulated placeholder fill
// ---------------------------------------------------------------------

function fillDailyDigestTemplate(userInput: {
  dailyCron: string;
  scheduleTimezone: string;
  ownerEmail: string;
  digestSubject: string;
  digestBody: string;
}) {
  const archetype = getArchetype("daily-digest");
  if (!archetype) throw new Error("daily-digest archetype not registered");
  const json = JSON.stringify(archetype.specTemplate);
  const filled = json
    .replace(/\$dailyCron/g, userInput.dailyCron)
    .replace(/\$scheduleTimezone/g, userInput.scheduleTimezone)
    .replace(/\$ownerEmail/g, userInput.ownerEmail)
    .replace(/\$digestSubject/g, userInput.digestSubject)
    .replace(/\$digestBody/g, userInput.digestBody);
  return JSON.parse(filled);
}

// ---------------------------------------------------------------------
// The E2E test
// ---------------------------------------------------------------------

describe("SLICE 5 E2E — daily-digest archetype → dispatcher → observability", () => {
  test("builder fills template → validates → schedules → dispatches → re-fires next window", async () => {
    // STEP 1 — builder fills the archetype template.
    const filled = fillDailyDigestTemplate({
      dailyCron: "0 8 * * *",
      scheduleTimezone: "America/New_York",
      ownerEmail: "owner@example.com",
      digestSubject: "Your Tuesday at Acme",
      digestBody: "Morning Alice, here's yesterday's note…",
    });

    // STEP 2 — validate against the AgentSpec validator.
    const issues = validateAgentSpec(filled, emptyBlockRegistry, emptyEventRegistry);
    const triggerIssues = issues.filter((i) => i.path.startsWith("trigger"));
    assert.equal(triggerIssues.length, 0,
      `trigger should validate; got ${JSON.stringify(triggerIssues)}`);

    // STEP 3 — resolve effective timezone (trigger wins over workspace).
    const workspaceTimezone = "UTC";
    const effectiveTz = resolveScheduleTimezone({
      triggerTimezone: filled.trigger.timezone,
      workspaceTimezone,
    });
    assert.equal(effectiveTz, "America/New_York");

    // STEP 4 — insert into the scheduled_triggers store.
    const creationTime = new Date("2026-04-24T00:00:00Z");
    const draft = buildInitialScheduledTrigger({
      orgId: "org_acme",
      archetypeId: "daily-digest",
      cronExpression: filled.trigger.cron,
      timezone: effectiveTz,
      catchup: "skip",
      concurrency: "skip",
      now: creationTime,
    });
    const storedTrigger: ScheduledTrigger = { ...draft, id: "trig_e2e" };
    const store = makeInMemoryScheduledTriggerStore();
    await store.insert(storedTrigger);

    // 8am EDT = 12:00 UTC on Apr 24 (EDT = UTC-4 in April).
    const fetched = await store.findById("trig_e2e");
    assert.ok(fetched);
    assert.equal(fetched!.nextFireAt.toISOString(), "2026-04-24T12:00:00.000Z");

    // STEP 5 — dispatcher tick at the scheduled window.
    const fires: Array<{ archetypeId: string; fireTime: Date }> = [];
    const firstTick = new Date("2026-04-24T12:00:30Z");
    const outcome1 = await dispatchScheduledTriggerTick({
      store,
      now: firstTick,
      batchLimit: 100,
      onFire: async (t, fireTime) => {
        fires.push({ archetypeId: t.archetypeId, fireTime });
      },
      isArchetypeRunInFlight: async () => false,
    });
    assert.equal(outcome1.dispatched, 1);
    assert.equal(fires.length, 1);
    assert.equal(fires[0].archetypeId, "daily-digest");
    assert.equal(fires[0].fireTime.toISOString(), "2026-04-24T12:00:00.000Z");

    // STEP 6 — observability helpers format correctly for the admin page.
    const afterFirst = await store.findById("trig_e2e");
    assert.ok(afterFirst);
    const cronSummary = summarizeCron(afterFirst!.cronExpression);
    assert.equal(cronSummary, "daily at 8:00");
    const nextFireRelative = formatNextFireRelative(
      afterFirst!.nextFireAt,
      firstTick,
    );
    // Next fire is tomorrow 8am EDT = Apr 25 12:00 UTC; relative should
    // render as "in 23 hours" or "in 24 hours" depending on rounding.
    assert.match(nextFireRelative, /in (2[234]) hours/);

    // STEP 7 — second tick 24h later re-fires.
    const secondTick = new Date("2026-04-25T12:00:30Z");
    const outcome2 = await dispatchScheduledTriggerTick({
      store,
      now: secondTick,
      batchLimit: 100,
      onFire: async (t, fireTime) => {
        fires.push({ archetypeId: t.archetypeId, fireTime });
      },
      isArchetypeRunInFlight: async () => false,
    });
    assert.equal(outcome2.dispatched, 1);
    assert.equal(fires.length, 2);
    assert.equal(fires[1].fireTime.toISOString(), "2026-04-25T12:00:00.000Z");
  });

  test("archetype template's $placeholder tokens all resolve cleanly", () => {
    // Catches typos in template authoring: if a $placeholder remains in
    // the filled spec, it'd surface as a literal "$dailyCron" in the
    // cron field which the validator rejects.
    const filled = fillDailyDigestTemplate({
      dailyCron: "0 9 * * *",
      scheduleTimezone: "UTC",
      ownerEmail: "x@y.com",
      digestSubject: "Subj",
      digestBody: "Body.",
    });
    const json = JSON.stringify(filled);
    const remainingPlaceholders = json.match(/\$[a-zA-Z][a-zA-Z0-9_]*/g) ?? [];
    assert.deepEqual(
      remainingPlaceholders,
      [],
      `expected no placeholders; got ${JSON.stringify(remainingPlaceholders)}`,
    );
  });

  test("concurrency gate blocks second dispatch when archetype run already in flight", async () => {
    const filled = fillDailyDigestTemplate({
      dailyCron: "0 8 * * *",
      scheduleTimezone: "UTC",
      ownerEmail: "x@y.com",
      digestSubject: "Subj",
      digestBody: "Body.",
    });
    const draft = buildInitialScheduledTrigger({
      orgId: "org_acme",
      archetypeId: "daily-digest",
      cronExpression: filled.trigger.cron,
      timezone: "UTC",
      catchup: "skip",
      concurrency: "skip",
      now: new Date("2026-04-24T00:00:00Z"),
    });
    const trigger: ScheduledTrigger = { ...draft, id: "trig_conc" };
    const store = makeInMemoryScheduledTriggerStore();
    await store.insert(trigger);

    let fireCount = 0;
    const outcome = await dispatchScheduledTriggerTick({
      store,
      now: new Date("2026-04-24T08:00:30Z"),
      batchLimit: 100,
      onFire: async () => {
        fireCount += 1;
      },
      // Pretend there's an existing daily-digest run in-flight
      isArchetypeRunInFlight: async (orgId, archetypeId) =>
        orgId === "org_acme" && archetypeId === "daily-digest",
    });
    assert.equal(outcome.dispatched, 0);
    assert.equal(outcome.skippedByConcurrency, 1);
    assert.equal(fireCount, 0);
  });
});
