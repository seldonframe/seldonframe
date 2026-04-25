// Tests for the message-trigger loop guard.
// SLICE 7 PR 2 C1 per audit + gate G-7-7.
//
// Two-tier guard:
//   1. Per-trigger per-conversation: 5 fires in 60s sliding window
//      → halt that (trigger × conversation), emit
//      workflow.message_trigger.loop_guard_engaged
//   2. Workspace counter: 100 fires/min → log warning (no halt)
//
// Pure logic — accepts a "recent fires" query result + injectable
// `now`. Production wiring (DB query for recent fires +
// workspace_event_log emit) lives in dispatcher integration (C1.b)
// and is exercised by the integration harness (C4).
//
// Loop-guard config schema (3 cross-ref edges, 1 gate decision):
// validates the constants — perTriggerPerConversationLimit,
// perTriggerPerConversationWindowMs, workspaceWarnThresholdPerMin.
// This serves as the L-17 cross-ref control datapoint per the
// gate-breadth hypothesis (C0).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  evaluateLoopGuard,
  loopGuardConfigSchema,
  defaultLoopGuardConfig,
  type LoopGuardConfig,
  type LoopGuardCheckInput,
  type LoopGuardCheckResult,
} from "../../src/lib/agents/loop-guard";

const NOW = new Date("2026-04-25T12:00:00Z");

function fireAt(secondsAgo: number): Date {
  return new Date(NOW.getTime() - secondsAgo * 1000);
}

function input(over: Partial<LoopGuardCheckInput> = {}): LoopGuardCheckInput {
  return {
    triggerId: "trig_a",
    conversationId: "conv_1",
    orgId: "org_acme",
    recentFiresForTriggerConversation: [],
    recentFiresForOrg: 0,
    now: NOW,
    config: defaultLoopGuardConfig,
    ...over,
  };
}

// ---------------------------------------------------------------------
// 1. Default config — sensible defaults per G-7-7
// ---------------------------------------------------------------------

describe("defaultLoopGuardConfig", () => {
  test("perTriggerPerConversationLimit = 5", () => {
    assert.equal(defaultLoopGuardConfig.perTriggerPerConversationLimit, 5);
  });
  test("perTriggerPerConversationWindowMs = 60_000 (60 seconds)", () => {
    assert.equal(defaultLoopGuardConfig.perTriggerPerConversationWindowMs, 60_000);
  });
  test("workspaceWarnThresholdPerMin = 100", () => {
    assert.equal(defaultLoopGuardConfig.workspaceWarnThresholdPerMin, 100);
  });
});

// ---------------------------------------------------------------------
// 2. Config schema — single-gate (control for L-17 gate-breadth)
// ---------------------------------------------------------------------

describe("loopGuardConfigSchema — validation", () => {
  test("accepts default config", () => {
    const result = loopGuardConfigSchema.safeParse(defaultLoopGuardConfig);
    assert.equal(result.success, true);
  });

  test("rejects perTriggerPerConversationLimit < 1", () => {
    const result = loopGuardConfigSchema.safeParse({
      ...defaultLoopGuardConfig,
      perTriggerPerConversationLimit: 0,
    });
    assert.equal(result.success, false);
  });

  test("rejects perTriggerPerConversationWindowMs < 1000 (1s minimum)", () => {
    const result = loopGuardConfigSchema.safeParse({
      ...defaultLoopGuardConfig,
      perTriggerPerConversationWindowMs: 999,
    });
    assert.equal(result.success, false);
  });

  test("rejects workspaceWarnThresholdPerMin < 1", () => {
    const result = loopGuardConfigSchema.safeParse({
      ...defaultLoopGuardConfig,
      workspaceWarnThresholdPerMin: 0,
    });
    assert.equal(result.success, false);
  });

  test("accepts custom valid config", () => {
    const result = loopGuardConfigSchema.safeParse({
      perTriggerPerConversationLimit: 10,
      perTriggerPerConversationWindowMs: 120_000,
      workspaceWarnThresholdPerMin: 200,
    });
    assert.equal(result.success, true);
  });
});

// ---------------------------------------------------------------------
// 3. Per-trigger per-conversation halt (G-7-7 rule 1)
// ---------------------------------------------------------------------

describe("evaluateLoopGuard — per-trigger per-conversation halt", () => {
  test("0 recent fires → not blocked", () => {
    const r = evaluateLoopGuard(input());
    assert.equal(r.blocked, false);
    assert.equal(r.reason, null);
  });

  test("4 fires in window → not blocked (under limit)", () => {
    const r = evaluateLoopGuard(input({
      recentFiresForTriggerConversation: [fireAt(50), fireAt(40), fireAt(30), fireAt(20)],
    }));
    assert.equal(r.blocked, false);
  });

  test("5 fires in window → blocked (at limit)", () => {
    const r = evaluateLoopGuard(input({
      recentFiresForTriggerConversation: [
        fireAt(55), fireAt(45), fireAt(35), fireAt(25), fireAt(15),
      ],
    }));
    assert.equal(r.blocked, true);
    assert.equal(r.reason, "loop_guard");
    assert.equal(r.engagedTier, "per_trigger_conversation");
  });

  test("6 fires in window → blocked", () => {
    const r = evaluateLoopGuard(input({
      recentFiresForTriggerConversation: Array.from({ length: 6 }, (_, i) =>
        fireAt(55 - i * 10),
      ),
    }));
    assert.equal(r.blocked, true);
  });

  test("5 fires but oldest outside 60s window → not blocked (sliding window)", () => {
    const r = evaluateLoopGuard(input({
      recentFiresForTriggerConversation: [
        fireAt(75), // outside window (60s)
        fireAt(50), fireAt(40), fireAt(30), fireAt(20),
      ],
    }));
    assert.equal(r.blocked, false, "oldest fire is 75s ago, outside the 60s window");
  });

  test("custom limit (3 fires in 30s) — at limit blocks", () => {
    const customConfig: LoopGuardConfig = {
      perTriggerPerConversationLimit: 3,
      perTriggerPerConversationWindowMs: 30_000,
      workspaceWarnThresholdPerMin: 100,
    };
    const r = evaluateLoopGuard(input({
      config: customConfig,
      recentFiresForTriggerConversation: [fireAt(25), fireAt(15), fireAt(5)],
    }));
    assert.equal(r.blocked, true);
  });
});

// ---------------------------------------------------------------------
// 4. Conversation isolation — different conversations don't interfere
// ---------------------------------------------------------------------

describe("evaluateLoopGuard — conversation isolation", () => {
  test("only conversation A's fires count for conversation A's check", () => {
    // Caller queries by (triggerId, conversationId) — so the input
    // already only contains conv_1's fires. Verifying the input
    // contract: 5 fires for conv_1 → blocked, regardless of other
    // conversations' activity.
    const r = evaluateLoopGuard(input({
      conversationId: "conv_1",
      recentFiresForTriggerConversation: [
        fireAt(50), fireAt(40), fireAt(30), fireAt(20), fireAt(10),
      ],
    }));
    assert.equal(r.blocked, true);
  });

  test("5 fires for trigger but conversation B sees only its own → not blocked", () => {
    // Same trigger, different conversation, only 1 fire visible.
    const r = evaluateLoopGuard(input({
      conversationId: "conv_2",
      recentFiresForTriggerConversation: [fireAt(20)],
    }));
    assert.equal(r.blocked, false);
  });

  test("inbound with no conversationId — never blocks (untrackable)", () => {
    const r = evaluateLoopGuard(input({
      conversationId: null,
      recentFiresForTriggerConversation: [
        fireAt(50), fireAt(40), fireAt(30), fireAt(20), fireAt(10),
      ],
    }));
    assert.equal(r.blocked, false, "no conversationId → can't isolate, fall back to allow");
  });
});

// ---------------------------------------------------------------------
// 5. Workspace counter (G-7-7 rule 2) — warn but never halt
// ---------------------------------------------------------------------

describe("evaluateLoopGuard — workspace counter (warn-only)", () => {
  test("recentFiresForOrg below threshold → no warning", () => {
    const r = evaluateLoopGuard(input({ recentFiresForOrg: 50 }));
    assert.equal(r.workspaceWarn, false);
  });

  test("recentFiresForOrg at threshold (100) → warning emitted, NOT blocked", () => {
    const r = evaluateLoopGuard(input({ recentFiresForOrg: 100 }));
    assert.equal(r.workspaceWarn, true);
    assert.equal(r.blocked, false, "workspace counter must NEVER halt");
  });

  test("recentFiresForOrg far above threshold (500) → warning, NOT blocked", () => {
    const r = evaluateLoopGuard(input({ recentFiresForOrg: 500 }));
    assert.equal(r.workspaceWarn, true);
    assert.equal(r.blocked, false);
  });

  test("workspace warn fires alongside per-trigger halt", () => {
    const r = evaluateLoopGuard(input({
      recentFiresForOrg: 150,
      recentFiresForTriggerConversation: [
        fireAt(50), fireAt(40), fireAt(30), fireAt(20), fireAt(10),
      ],
    }));
    assert.equal(r.blocked, true);
    assert.equal(r.workspaceWarn, true);
  });
});

// ---------------------------------------------------------------------
// 6. engagedTier observability — distinguishes which guard fired
// ---------------------------------------------------------------------

describe("evaluateLoopGuard — engagedTier in result", () => {
  test("not blocked → engagedTier = null", () => {
    const r = evaluateLoopGuard(input());
    assert.equal(r.engagedTier, null);
  });

  test("per-trigger limit hit → engagedTier = 'per_trigger_conversation'", () => {
    const r = evaluateLoopGuard(input({
      recentFiresForTriggerConversation: [
        fireAt(50), fireAt(40), fireAt(30), fireAt(20), fireAt(10),
      ],
    }));
    assert.equal(r.engagedTier, "per_trigger_conversation");
  });
});
