// Tests for dispatchMessageTriggers — SLICE 7 PR 1 C5.
// Per audit §5.3 + gates G-7-1, G-7-3, G-7-4, G-7-6, G-7-8.
//
// Pipeline (per audit §5.3):
//   1. Query enabled triggers for (orgId, channel) via store.
//   2. For each candidate trigger:
//      a. channelBindingMatches → skip with no_match if false
//      b. matchesMessagePattern → skip with no_match if false
//      c. recordFire → skip with already_fired if UNIQUE conflict
//      d. startRun() → record fire with runId
//      e. dispatch error → record fire with dispatch_failed
//   3. Return summary { matched, runs, skipped[] }
//
// Loop guard (G-7-7) is PR 2 scope. PR 1 dispatcher accepts a
// loopGuardCheck callback (always-allow in tests) so PR 2 can wire
// the real check without re-architecting the dispatcher.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  dispatchMessageTriggers,
  type DispatchContext,
  type InboundMessage,
} from "../../src/lib/agents/message-trigger-dispatcher";
import {
  buildMessageTrigger,
  makeInMemoryMessageTriggerStore,
  type MessageTrigger,
} from "../../src/lib/agents/message-trigger-storage";
import type { AgentSpec } from "../../src/lib/agents/validator";

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function fakeSpec(archetypeId: string, triggerOverride: object): AgentSpec {
  // Cast through unknown — startRun only reads spec.steps[0] + spec.variables;
  // the trigger field is part of the type but not used by startRun().
  return {
    name: archetypeId,
    description: "test agent",
    trigger: triggerOverride,
    variables: {},
    steps: [{ id: "s1", type: "wait", seconds: 0, next: null }],
  } as unknown as AgentSpec;
}

function makeContext(overrides: Partial<DispatchContext> = {}): {
  ctx: DispatchContext;
  startedRuns: Array<{ archetypeId: string; payload: unknown; triggerEventId: string | null }>;
  loadedSpecs: string[];
} {
  const startedRuns: Array<{ archetypeId: string; payload: unknown; triggerEventId: string | null }> = [];
  const loadedSpecs: string[] = [];
  const ctx: DispatchContext = {
    store: makeInMemoryMessageTriggerStore(),
    loadSpec: async (archetypeId: string) => {
      loadedSpecs.push(archetypeId);
      return fakeSpec(archetypeId, {
        type: "message",
        channel: "sms",
        channelBinding: { kind: "any" },
        pattern: { kind: "any" },
      });
    },
    startRun: async (input) => {
      const runId = `run_${startedRuns.length + 1}`;
      startedRuns.push({
        archetypeId: input.archetypeId,
        payload: input.triggerPayload,
        triggerEventId: input.triggerEventId,
      });
      return runId;
    },
    loopGuardCheck: async () => ({ blocked: false }),
    now: () => new Date("2026-04-24T12:00:00Z"),
    ...overrides,
  };
  return { ctx, startedRuns, loadedSpecs };
}

function inbound(over: Partial<InboundMessage> = {}): InboundMessage {
  return {
    channel: "sms",
    from: "+15559876543",
    to: "+15551234567",
    body: "CONFIRM",
    externalMessageId: "twilio_msg_abc",
    receivedAt: new Date("2026-04-24T12:00:00Z"),
    contactId: "contact_123",
    conversationId: "conv_456",
    orgId: "org_acme",
    ...over,
  };
}

async function seedTrigger(ctx: DispatchContext, partial: Partial<Parameters<typeof buildMessageTrigger>[0]>): Promise<MessageTrigger> {
  const t = buildMessageTrigger({
    orgId: "org_acme",
    archetypeId: "test_agent",
    channel: "sms",
    channelBinding: { kind: "any" },
    pattern: { kind: "exact", value: "CONFIRM", caseSensitive: false },
    ...partial,
  });
  await ctx.store.insert(t);
  return t;
}

// ---------------------------------------------------------------------
// 1. Happy path — single matching trigger fires a run
// ---------------------------------------------------------------------

describe("dispatchMessageTriggers — single matching trigger", () => {
  test("matching trigger fires a run with payload", async () => {
    const { ctx, startedRuns } = makeContext();
    await seedTrigger(ctx, {});
    const summary = await dispatchMessageTriggers(ctx, inbound());
    assert.equal(summary.matched, 1);
    assert.equal(summary.runs.length, 1);
    assert.equal(startedRuns.length, 1);
    assert.equal(startedRuns[0].archetypeId, "test_agent");
  });

  test("triggerPayload contains G-7-4 fields (inbound + conversationId only)", async () => {
    const { ctx, startedRuns } = makeContext();
    await seedTrigger(ctx, {});
    await dispatchMessageTriggers(ctx, inbound());
    const payload = startedRuns[0].payload as Record<string, unknown>;
    // Inbound essentials
    assert.equal(payload.channel, "sms");
    assert.equal(payload.from, "+15559876543");
    assert.equal(payload.to, "+15551234567");
    assert.equal(payload.body, "CONFIRM");
    assert.equal(payload.externalMessageId, "twilio_msg_abc");
    assert.equal(payload.contactId, "contact_123");
    assert.equal(payload.conversationId, "conv_456");
    assert.ok(typeof payload.receivedAt === "string"); // ISO 8601
  });

  test("triggerEventId is set to the fire id (not null)", async () => {
    const { ctx, startedRuns } = makeContext();
    await seedTrigger(ctx, {});
    await dispatchMessageTriggers(ctx, inbound());
    assert.ok(startedRuns[0].triggerEventId);
    assert.notEqual(startedRuns[0].triggerEventId, "");
  });
});

// ---------------------------------------------------------------------
// 2. No matching trigger — no run, no fire record
// ---------------------------------------------------------------------

describe("dispatchMessageTriggers — no matching triggers", () => {
  test("zero triggers in store → matched=0, no startRun calls", async () => {
    const { ctx, startedRuns } = makeContext();
    const summary = await dispatchMessageTriggers(ctx, inbound());
    assert.equal(summary.matched, 0);
    assert.equal(startedRuns.length, 0);
  });

  test("trigger exists but pattern doesn't match → no_match skip recorded", async () => {
    const { ctx, startedRuns } = makeContext();
    await seedTrigger(ctx, { pattern: { kind: "exact", value: "OTHER", caseSensitive: false } });
    const summary = await dispatchMessageTriggers(ctx, inbound({ body: "CONFIRM" }));
    assert.equal(summary.matched, 0);
    assert.equal(startedRuns.length, 0);
    assert.equal(summary.skipped.length, 1);
    assert.equal(summary.skipped[0].reason, "no_match");
  });

  test("trigger exists but binding doesn't match → no_match skip recorded", async () => {
    const { ctx, startedRuns } = makeContext();
    await seedTrigger(ctx, {
      channelBinding: { kind: "phone", number: "+15559999999" },
      pattern: { kind: "any" },
    });
    const summary = await dispatchMessageTriggers(ctx, inbound({ to: "+15551234567" }));
    assert.equal(summary.matched, 0);
    assert.equal(startedRuns.length, 0);
    assert.equal(summary.skipped[0].reason, "no_match");
  });
});

// ---------------------------------------------------------------------
// 3. Multiple matching triggers — fan-out
// ---------------------------------------------------------------------

describe("dispatchMessageTriggers — multiple matching triggers", () => {
  test("two triggers both match → two runs created", async () => {
    const { ctx, startedRuns } = makeContext();
    await seedTrigger(ctx, {
      archetypeId: "agent_a",
      pattern: { kind: "exact", value: "CONFIRM", caseSensitive: false },
    });
    await seedTrigger(ctx, {
      archetypeId: "agent_b",
      pattern: { kind: "contains", value: "ON", caseSensitive: false },
    });
    const summary = await dispatchMessageTriggers(ctx, inbound({ body: "CONFIRM" }));
    assert.equal(summary.matched, 2);
    assert.equal(startedRuns.length, 2);
    const ids = startedRuns.map((r) => r.archetypeId).sort();
    assert.deepEqual(ids, ["agent_a", "agent_b"]);
  });

  test("one matches, one doesn't → only matching one runs", async () => {
    const { ctx, startedRuns } = makeContext();
    await seedTrigger(ctx, {
      archetypeId: "matches",
      pattern: { kind: "exact", value: "CONFIRM", caseSensitive: false },
    });
    await seedTrigger(ctx, {
      archetypeId: "skips",
      pattern: { kind: "exact", value: "OTHER", caseSensitive: false },
    });
    const summary = await dispatchMessageTriggers(ctx, inbound({ body: "CONFIRM" }));
    assert.equal(summary.matched, 1);
    assert.equal(summary.skipped.length, 1);
    assert.equal(startedRuns[0].archetypeId, "matches");
  });
});

// ---------------------------------------------------------------------
// 4. Idempotency (G-7-6) — same message redelivered, second is skipped
// ---------------------------------------------------------------------

describe("dispatchMessageTriggers — G-7-6 idempotency", () => {
  test("same messageId redelivered → second dispatch records already_fired", async () => {
    const { ctx, startedRuns } = makeContext();
    await seedTrigger(ctx, {});
    const first = await dispatchMessageTriggers(ctx, inbound());
    assert.equal(first.matched, 1);
    assert.equal(startedRuns.length, 1);

    const second = await dispatchMessageTriggers(ctx, inbound());
    assert.equal(second.matched, 0);
    assert.equal(startedRuns.length, 1, "no new run created on redelivery");
    assert.equal(second.skipped.length, 1);
    assert.equal(second.skipped[0].reason, "already_fired");
  });

  test("different messageId for same trigger fires another run", async () => {
    const { ctx, startedRuns } = makeContext();
    await seedTrigger(ctx, {});
    await dispatchMessageTriggers(ctx, inbound({ externalMessageId: "msg_1" }));
    await dispatchMessageTriggers(ctx, inbound({ externalMessageId: "msg_2" }));
    assert.equal(startedRuns.length, 2);
  });
});

// ---------------------------------------------------------------------
// 5. Cross-org isolation — trigger for org_b should not fire on org_a inbound
// ---------------------------------------------------------------------

describe("dispatchMessageTriggers — cross-org isolation", () => {
  test("trigger for org_b is invisible to org_a inbound", async () => {
    const { ctx, startedRuns } = makeContext();
    await seedTrigger(ctx, { orgId: "org_b", archetypeId: "should_not_fire" });
    const summary = await dispatchMessageTriggers(ctx, inbound({ orgId: "org_a" }));
    assert.equal(summary.matched, 0);
    assert.equal(startedRuns.length, 0);
  });
});

// ---------------------------------------------------------------------
// 6. Loop guard hook — when blocked, dispatcher records loop_guard skip
// ---------------------------------------------------------------------

describe("dispatchMessageTriggers — loop guard hook (PR 2 wires real check)", () => {
  test("loopGuardCheck blocks → loop_guard skip, no startRun", async () => {
    const { ctx, startedRuns } = makeContext({
      loopGuardCheck: async () => ({ blocked: true }),
    });
    await seedTrigger(ctx, {});
    const summary = await dispatchMessageTriggers(ctx, inbound());
    assert.equal(summary.matched, 0);
    assert.equal(startedRuns.length, 0);
    assert.equal(summary.skipped[0].reason, "loop_guard");
  });
});

// ---------------------------------------------------------------------
// 7. startRun failure — recorded as dispatch_failed; doesn't propagate
// ---------------------------------------------------------------------

describe("dispatchMessageTriggers — startRun failure isolation", () => {
  test("startRun throws → dispatch_failed skip, error swallowed (does not block other triggers)", async () => {
    const { ctx } = makeContext({
      startRun: async () => {
        throw new Error("storage down");
      },
    });
    await seedTrigger(ctx, {});
    const summary = await dispatchMessageTriggers(ctx, inbound());
    assert.equal(summary.matched, 0);
    assert.equal(summary.skipped.length, 1);
    assert.equal(summary.skipped[0].reason, "dispatch_failed");
  });

  test("one trigger fails, the other succeeds — failure does not block the other", async () => {
    let callCount = 0;
    const { ctx } = makeContext({
      startRun: async (input) => {
        callCount++;
        if (input.archetypeId === "broken") throw new Error("kaboom");
        return `run_${callCount}`;
      },
    });
    await seedTrigger(ctx, { archetypeId: "broken", pattern: { kind: "any" } });
    await seedTrigger(ctx, { archetypeId: "good", pattern: { kind: "any" } });
    const summary = await dispatchMessageTriggers(ctx, inbound());
    assert.equal(summary.matched, 1);
    assert.equal(summary.runs.length, 1);
    assert.equal(summary.skipped.length, 1);
    assert.equal(summary.skipped[0].reason, "dispatch_failed");
  });
});

// ---------------------------------------------------------------------
// 8. Disabled triggers — never fire
// ---------------------------------------------------------------------

describe("dispatchMessageTriggers — disabled triggers", () => {
  test("disabled trigger is excluded from candidate set", async () => {
    const { ctx, startedRuns } = makeContext();
    const t = await seedTrigger(ctx, {});
    await ctx.store.setEnabled(t.id, false);
    const summary = await dispatchMessageTriggers(ctx, inbound());
    assert.equal(summary.matched, 0);
    assert.equal(startedRuns.length, 0);
  });
});
