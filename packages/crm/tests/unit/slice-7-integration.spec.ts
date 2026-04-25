// SLICE 7 shallow-plus integration harness.
// PR 2 C4 per audit §11 + spec scope item #6.
//
// Scope (per spec):
//   1. Webhook → dispatcher → archetype dispatch (happy path)
//   2. Webhook → dispatcher → loop guard engaged (5+ fires same convo)
//   3. Webhook → dispatcher → workspace counter warning
//   4. Webhook → dispatcher → idempotency skip (duplicate messageId)
//   5. Pattern modes (exact, contains, starts_with, regex, any)
//   6. Channel binding (any, phone)
//   7. Cross-org isolation
//   8. Per-trigger error isolation (one trigger fails, others proceed)
//
// "Shallow-plus": exercises the dispatcher + storage + loop-guard +
// pattern-eval + channel-binding integration via the in-memory store
// (production Drizzle adapter is verified via preview deploys + the
// fully-wired E2E test in C5).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { evaluateLoopGuard, defaultLoopGuardConfig } from "../../src/lib/agents/loop-guard";
import {
  dispatchMessageTriggers,
  type DispatchContext,
  type InboundMessage,
} from "../../src/lib/agents/message-trigger-dispatcher";
import {
  buildMessageTrigger,
  makeInMemoryMessageTriggerStore,
  type MessageTriggerStore,
} from "../../src/lib/agents/message-trigger-storage";
import type { AgentSpec } from "../../src/lib/agents/validator";

// ---------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------

type FireRecord = { archetypeId: string; runId: string; payload: unknown };

function makeHarness(opts: {
  loopGuardCheck?: DispatchContext["loopGuardCheck"];
  loadSpec?: DispatchContext["loadSpec"];
  startRun?: DispatchContext["startRun"];
} = {}): {
  ctx: DispatchContext;
  store: MessageTriggerStore;
  fires: FireRecord[];
  loadFailures: string[];
} {
  const store = makeInMemoryMessageTriggerStore();
  const fires: FireRecord[] = [];
  const loadFailures: string[] = [];
  const ctx: DispatchContext = {
    store,
    loadSpec: opts.loadSpec ?? (async (id) => {
      // Default: succeed for any archetype id with a minimal spec.
      return {
        name: id,
        description: "test",
        trigger: { type: "message", channel: "sms", channelBinding: { kind: "any" }, pattern: { kind: "any" } },
        variables: {},
        steps: [{ id: "s1", type: "wait", seconds: 0, next: null }],
      } as unknown as AgentSpec;
    }),
    startRun: opts.startRun ?? (async (input) => {
      const runId = `run_${fires.length + 1}`;
      fires.push({ archetypeId: input.archetypeId, runId, payload: input.triggerPayload });
      return runId;
    }),
    loopGuardCheck: opts.loopGuardCheck ?? (async () => ({ blocked: false })),
    now: () => new Date("2026-04-25T12:00:00Z"),
  };
  return { ctx, store, fires, loadFailures };
}

function inbound(over: Partial<InboundMessage> = {}): InboundMessage {
  return {
    channel: "sms",
    from: "+15559876543",
    to: "+15551234567",
    body: "CONFIRM",
    externalMessageId: `msg_${Math.random().toString(36).slice(2)}`,
    receivedAt: new Date("2026-04-25T12:00:00Z"),
    contactId: "contact_1",
    conversationId: "conv_1",
    orgId: "org_acme",
    ...over,
  };
}

// ---------------------------------------------------------------------
// 1. Happy path — webhook → dispatcher → archetype dispatch
// ---------------------------------------------------------------------

describe("SLICE 7 integration — happy path", () => {
  test("webhook inbound matches CONFIRM trigger → run created", async () => {
    const h = makeHarness();
    await h.store.insert(buildMessageTrigger({
      orgId: "org_acme", archetypeId: "appointment-confirm-sms",
      channel: "sms",
      channelBinding: { kind: "any" },
      pattern: { kind: "exact", value: "CONFIRM", caseSensitive: false },
    }));

    const summary = await dispatchMessageTriggers(h.ctx, inbound({ body: "confirm" }));
    assert.equal(summary.matched, 1);
    assert.equal(h.fires.length, 1);
    assert.equal(h.fires[0].archetypeId, "appointment-confirm-sms");
  });

  test("inbound payload threaded through trigger context (G-7-4)", async () => {
    const h = makeHarness();
    await h.store.insert(buildMessageTrigger({
      orgId: "org_acme", archetypeId: "x",
      channel: "sms",
      channelBinding: { kind: "any" },
      pattern: { kind: "any" },
    }));

    await dispatchMessageTriggers(h.ctx, inbound({
      from: "+15559876543",
      body: "any text",
      contactId: "c123",
      conversationId: "conv_xyz",
      externalMessageId: "twilio_msg_999",
    }));
    const payload = h.fires[0].payload as Record<string, unknown>;
    assert.equal(payload.from, "+15559876543");
    assert.equal(payload.body, "any text");
    assert.equal(payload.contactId, "c123");
    assert.equal(payload.conversationId, "conv_xyz");
    assert.equal(payload.externalMessageId, "twilio_msg_999");
  });
});

// ---------------------------------------------------------------------
// 2. Loop guard engaged (real evaluator wired in)
// ---------------------------------------------------------------------

describe("SLICE 7 integration — loop guard engaged", () => {
  test("5+ fires within 60s for same conversation → loop_guard skip", async () => {
    const NOW = new Date("2026-04-25T12:00:00Z");
    const recentFires = [
      new Date(NOW.getTime() - 50_000),
      new Date(NOW.getTime() - 40_000),
      new Date(NOW.getTime() - 30_000),
      new Date(NOW.getTime() - 20_000),
      new Date(NOW.getTime() - 10_000),
    ];
    const h = makeHarness({
      loopGuardCheck: async (input) => {
        const result = evaluateLoopGuard({
          triggerId: input.trigger.id,
          conversationId: input.inbound.conversationId,
          orgId: input.trigger.orgId,
          recentFiresForTriggerConversation: recentFires,
          recentFiresForOrg: 0,
          now: NOW,
          config: defaultLoopGuardConfig,
        });
        return { blocked: result.blocked };
      },
    });
    await h.store.insert(buildMessageTrigger({
      orgId: "org_acme", archetypeId: "x",
      channel: "sms", channelBinding: { kind: "any" }, pattern: { kind: "any" },
    }));

    const summary = await dispatchMessageTriggers(h.ctx, inbound());
    assert.equal(summary.matched, 0);
    assert.equal(h.fires.length, 0);
    assert.equal(summary.skipped[0].reason, "loop_guard");
  });

  test("4 fires within 60s → not blocked", async () => {
    const NOW = new Date("2026-04-25T12:00:00Z");
    const recentFires = [
      new Date(NOW.getTime() - 40_000),
      new Date(NOW.getTime() - 30_000),
      new Date(NOW.getTime() - 20_000),
      new Date(NOW.getTime() - 10_000),
    ];
    const h = makeHarness({
      loopGuardCheck: async () => {
        const result = evaluateLoopGuard({
          triggerId: "t",
          conversationId: "c",
          orgId: "o",
          recentFiresForTriggerConversation: recentFires,
          recentFiresForOrg: 0,
          now: NOW,
          config: defaultLoopGuardConfig,
        });
        return { blocked: result.blocked };
      },
    });
    await h.store.insert(buildMessageTrigger({
      orgId: "org_acme", archetypeId: "x",
      channel: "sms", channelBinding: { kind: "any" }, pattern: { kind: "any" },
    }));

    const summary = await dispatchMessageTriggers(h.ctx, inbound());
    assert.equal(summary.matched, 1);
  });
});

// ---------------------------------------------------------------------
// 3. Workspace counter — warn but don't halt
// ---------------------------------------------------------------------

describe("SLICE 7 integration — workspace counter warn-only", () => {
  test("recent org fires above threshold → warn, NOT blocked", async () => {
    const result = evaluateLoopGuard({
      triggerId: "t", conversationId: "c", orgId: "o",
      recentFiresForTriggerConversation: [],
      recentFiresForOrg: 150,
      now: new Date(),
      config: defaultLoopGuardConfig,
    });
    assert.equal(result.workspaceWarn, true);
    assert.equal(result.blocked, false);
  });
});

// ---------------------------------------------------------------------
// 4. Idempotency — duplicate messageId skipped
// ---------------------------------------------------------------------

describe("SLICE 7 integration — idempotency (G-7-6)", () => {
  test("same messageId redelivered → second skipped with already_fired", async () => {
    const h = makeHarness();
    await h.store.insert(buildMessageTrigger({
      orgId: "org_acme", archetypeId: "x",
      channel: "sms", channelBinding: { kind: "any" }, pattern: { kind: "any" },
    }));

    const first = await dispatchMessageTriggers(h.ctx, inbound({ externalMessageId: "msg_abc" }));
    assert.equal(first.matched, 1);

    const second = await dispatchMessageTriggers(h.ctx, inbound({ externalMessageId: "msg_abc" }));
    assert.equal(second.matched, 0);
    assert.equal(second.skipped[0].reason, "already_fired");
    assert.equal(h.fires.length, 1, "no duplicate run created");
  });
});

// ---------------------------------------------------------------------
// 5. Pattern modes — exhaustive coverage
// ---------------------------------------------------------------------

describe("SLICE 7 integration — pattern modes", () => {
  for (const [mode, value, body, shouldMatch] of [
    ["exact", "CONFIRM", "confirm", true],
    ["exact", "CONFIRM", "confirm please", false],
    ["contains", "refund", "I want a refund", true],
    ["contains", "refund", "thanks!", false],
    ["starts_with", "STOP", "stop messaging me", true],
    ["starts_with", "STOP", "please stop", false],
    ["regex", "^(YES|OK)$", "YES", true],
    ["regex", "^(YES|OK)$", "no", false],
    ["any", null, "anything goes", true],
  ] as Array<[string, string | null, string, boolean]>) {
    test(`pattern.${mode}${value ? `="${value}"` : ""} body="${body}" → ${shouldMatch ? "match" : "no_match"}`, async () => {
      const h = makeHarness();
      const pattern = value === null
        ? { kind: "any" as const }
        : (mode === "regex"
            ? { kind: "regex" as const, value, flags: "i" }
            : { kind: mode as "exact" | "contains" | "starts_with", value, caseSensitive: false });
      await h.store.insert(buildMessageTrigger({
        orgId: "org_acme", archetypeId: "x",
        channel: "sms",
        channelBinding: { kind: "any" },
        pattern,
      }));

      const summary = await dispatchMessageTriggers(h.ctx, inbound({ body }));
      assert.equal(summary.matched, shouldMatch ? 1 : 0);
    });
  }
});

// ---------------------------------------------------------------------
// 6. Channel binding — any vs phone
// ---------------------------------------------------------------------

describe("SLICE 7 integration — channel binding", () => {
  test("binding.any matches any inbound to-number", async () => {
    const h = makeHarness();
    await h.store.insert(buildMessageTrigger({
      orgId: "org_acme", archetypeId: "x",
      channel: "sms",
      channelBinding: { kind: "any" },
      pattern: { kind: "any" },
    }));

    const summary = await dispatchMessageTriggers(h.ctx, inbound({ to: "+15551234567" }));
    assert.equal(summary.matched, 1);
  });

  test("binding.phone matches when E.164 numbers equal", async () => {
    const h = makeHarness();
    await h.store.insert(buildMessageTrigger({
      orgId: "org_acme", archetypeId: "x",
      channel: "sms",
      channelBinding: { kind: "phone", number: "+15551234567" },
      pattern: { kind: "any" },
    }));

    const summary = await dispatchMessageTriggers(h.ctx, inbound({ to: "+15551234567" }));
    assert.equal(summary.matched, 1);
  });

  test("binding.phone does NOT match different number", async () => {
    const h = makeHarness();
    await h.store.insert(buildMessageTrigger({
      orgId: "org_acme", archetypeId: "x",
      channel: "sms",
      channelBinding: { kind: "phone", number: "+15559999999" },
      pattern: { kind: "any" },
    }));

    const summary = await dispatchMessageTriggers(h.ctx, inbound({ to: "+15551234567" }));
    assert.equal(summary.matched, 0);
  });
});

// ---------------------------------------------------------------------
// 7. Cross-org isolation
// ---------------------------------------------------------------------

describe("SLICE 7 integration — cross-org isolation", () => {
  test("trigger for org_b is invisible to org_a inbound", async () => {
    const h = makeHarness();
    await h.store.insert(buildMessageTrigger({
      orgId: "org_b", archetypeId: "should_not_fire",
      channel: "sms", channelBinding: { kind: "any" }, pattern: { kind: "any" },
    }));

    const summary = await dispatchMessageTriggers(h.ctx, inbound({ orgId: "org_a" }));
    assert.equal(summary.matched, 0);
    assert.equal(h.fires.length, 0);
  });

  test("two orgs with identical triggers fire independently", async () => {
    const h = makeHarness();
    await h.store.insert(buildMessageTrigger({
      orgId: "org_a", archetypeId: "agent_a",
      channel: "sms", channelBinding: { kind: "any" }, pattern: { kind: "any" },
    }));
    await h.store.insert(buildMessageTrigger({
      orgId: "org_b", archetypeId: "agent_b",
      channel: "sms", channelBinding: { kind: "any" }, pattern: { kind: "any" },
    }));

    await dispatchMessageTriggers(h.ctx, inbound({ orgId: "org_a", externalMessageId: "msg_a" }));
    await dispatchMessageTriggers(h.ctx, inbound({ orgId: "org_b", externalMessageId: "msg_b" }));

    assert.equal(h.fires.length, 2);
    const ids = h.fires.map((f) => f.archetypeId).sort();
    assert.deepEqual(ids, ["agent_a", "agent_b"]);
  });
});

// ---------------------------------------------------------------------
// 8. Per-trigger error isolation
// ---------------------------------------------------------------------

describe("SLICE 7 integration — per-trigger error isolation", () => {
  test("one trigger's startRun throws → other trigger still fires", async () => {
    const h = makeHarness({
      startRun: async (input) => {
        if (input.archetypeId === "broken") throw new Error("kaboom");
        return `run_${input.archetypeId}`;
      },
    });
    await h.store.insert(buildMessageTrigger({
      orgId: "org_acme", archetypeId: "broken",
      channel: "sms", channelBinding: { kind: "any" }, pattern: { kind: "any" },
    }));
    await h.store.insert(buildMessageTrigger({
      orgId: "org_acme", archetypeId: "good",
      channel: "sms", channelBinding: { kind: "any" }, pattern: { kind: "any" },
    }));

    const summary = await dispatchMessageTriggers(h.ctx, inbound());
    assert.equal(summary.matched, 1);
    assert.equal(summary.runs.length, 1);
    assert.equal(summary.skipped.length, 1);
    assert.equal(summary.skipped[0].reason, "dispatch_failed");
  });
});
