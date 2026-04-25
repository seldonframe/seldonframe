// Loop guard for SLICE 7 message-trigger dispatcher.
// SLICE 7 PR 2 C1 per audit + gate G-7-7.
//
// Two-tier guard:
//   1. Per-trigger per-conversation: 5 fires in 60s sliding window
//      → halt, emit workflow.message_trigger.loop_guard_engaged
//   2. Workspace counter: 100 fires/min → log warning (no halt)
//
// Pure function. Production wiring queries the DB for recent fires
// (messageTriggerFires by triggerId + conversation join + window
// filter) and emits the workflow_event_log entry on halt. The
// dispatcher's loopGuardCheck callback (PR 1 stub) is replaced
// with a wrapper that does the queries + calls evaluateLoopGuard.
//
// Loop-guard config schema: 3 cross-ref edges, 1 gate decision
// (the loop semantics gate). Per L-17 hypothesis (C0):
//   base × gate_breadth = 2.5x × 1.0 = ~2.5x projected
// This serves as the control datapoint validating the gate-breadth
// confound from MessageTriggerSchema's 4.87x at 6 edges + 4 gates.

import { z } from "zod";

export type LoopGuardConfig = {
  perTriggerPerConversationLimit: number;
  perTriggerPerConversationWindowMs: number;
  workspaceWarnThresholdPerMin: number;
};

export const loopGuardConfigSchema = z.object({
  perTriggerPerConversationLimit: z.number().int().min(1),
  perTriggerPerConversationWindowMs: z.number().int().min(1000),
  workspaceWarnThresholdPerMin: z.number().int().min(1),
});

export const defaultLoopGuardConfig: LoopGuardConfig = {
  perTriggerPerConversationLimit: 5,
  perTriggerPerConversationWindowMs: 60_000,
  workspaceWarnThresholdPerMin: 100,
};

export type LoopGuardEngagedTier = "per_trigger_conversation";

export type LoopGuardCheckInput = {
  triggerId: string;
  conversationId: string | null;
  orgId: string;
  /** Recent fires for (triggerId, conversationId), most-recent-first or any order. */
  recentFiresForTriggerConversation: Date[];
  /** Count of recent fires for the org in the last minute. */
  recentFiresForOrg: number;
  now: Date;
  config: LoopGuardConfig;
};

export type LoopGuardCheckResult = {
  blocked: boolean;
  reason: "loop_guard" | null;
  engagedTier: LoopGuardEngagedTier | null;
  workspaceWarn: boolean;
};

export function evaluateLoopGuard(input: LoopGuardCheckInput): LoopGuardCheckResult {
  const result: LoopGuardCheckResult = {
    blocked: false,
    reason: null,
    engagedTier: null,
    workspaceWarn: false,
  };

  // Tier 2 — workspace counter (warn only, never halt)
  if (input.recentFiresForOrg >= input.config.workspaceWarnThresholdPerMin) {
    result.workspaceWarn = true;
  }

  // Tier 1 — per-trigger per-conversation halt
  // No conversationId → can't isolate; fall back to allow (avoids
  // halting unrelated agents when conversation tracking missing)
  if (input.conversationId === null) {
    return result;
  }

  const windowStart = input.now.getTime() - input.config.perTriggerPerConversationWindowMs;
  let inWindow = 0;
  for (const fired of input.recentFiresForTriggerConversation) {
    if (fired.getTime() >= windowStart) inWindow++;
  }

  if (inWindow >= input.config.perTriggerPerConversationLimit) {
    result.blocked = true;
    result.reason = "loop_guard";
    result.engagedTier = "per_trigger_conversation";
  }

  return result;
}
