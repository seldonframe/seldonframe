// dispatchMessageTriggers — SLICE 7 PR 1 C5 per audit §5.3.
//
// Pipeline:
//   1. Query enabled triggers for (orgId, channel) via store.
//   2. For each candidate trigger, evaluate:
//      a. channelBindingMatches → no_match if false
//      b. matchesMessagePattern → no_match if false
//      c. loopGuardCheck (PR 2 wires real check) → loop_guard if blocked
//      d. recordFire → already_fired if UNIQUE conflict
//      e. startRun() → record fire with runId
//      f. dispatch error → record fire with dispatch_failed
//   3. Return { matched, runs, skipped[] } summary for observability.
//
// Per audit §4.4 failure handling: per-trigger errors are caught and
// recorded as dispatch_failed; do not propagate (would cause webhook
// retry storms from upstream Twilio).
//
// G-7-4 payload contract: { channel, from, to, body, externalMessageId,
// receivedAt (ISO), contactId, conversationId }. Agents fetch thread
// context via existing tools if needed (G-7-4: payload stays small).
//
// G-7-6 idempotency: store.recordFire returns ok=false on UNIQUE
// (triggerId, messageId) conflict — the dispatcher treats this as
// idempotent skip. The dispatcher attempts recordFire BEFORE startRun
// so concurrent webhook deliveries can't both succeed.

import { randomUUID } from "node:crypto";

import { matchesMessagePattern, channelBindingMatches } from "./message-pattern-eval";
import type {
  MessageChannel,
  MessageTrigger,
  MessageTriggerFireSkipReason,
  MessageTriggerStore,
} from "./message-trigger-storage";
import type { AgentSpec } from "./validator";

export type InboundMessage = {
  channel: MessageChannel;
  /** Inbound sender (E.164 phone for SMS). */
  from: string;
  /** Workspace's inbound number (E.164 phone for SMS). */
  to: string;
  body: string;
  /** Provider-supplied message id (Twilio MessageSid). */
  externalMessageId: string;
  receivedAt: Date;
  contactId: string | null;
  conversationId: string | null;
  orgId: string;
};

export type StartRunInput = {
  orgId: string;
  archetypeId: string;
  spec: AgentSpec;
  triggerEventId: string | null;
  triggerPayload: Record<string, unknown>;
};

export type DispatchContext = {
  store: MessageTriggerStore;
  loadSpec: (archetypeId: string) => Promise<AgentSpec>;
  startRun: (input: StartRunInput) => Promise<string>;
  /**
   * PR 2 wires the real check. PR 1 default = always allow.
   * Receives { trigger, inbound }; returns { blocked, reason? }.
   */
  loopGuardCheck: (input: { trigger: MessageTrigger; inbound: InboundMessage }) => Promise<{ blocked: boolean }>;
  now?: () => Date;
};

export type DispatchSkip = {
  triggerId: string;
  reason: MessageTriggerFireSkipReason;
};

export type DispatchSummary = {
  matched: number;
  runs: string[];
  skipped: DispatchSkip[];
};

export async function dispatchMessageTriggers(
  ctx: DispatchContext,
  inbound: InboundMessage,
): Promise<DispatchSummary> {
  const candidates = await ctx.store.listEnabledForWorkspaceChannel(
    inbound.orgId,
    inbound.channel,
  );

  const summary: DispatchSummary = { matched: 0, runs: [], skipped: [] };

  for (const trigger of candidates) {
    if (!channelBindingMatches(trigger.channelBinding, inbound)) {
      await recordSkip(ctx, trigger, inbound, "no_match");
      summary.skipped.push({ triggerId: trigger.id, reason: "no_match" });
      continue;
    }
    if (!matchesMessagePattern(trigger.pattern, inbound.body)) {
      await recordSkip(ctx, trigger, inbound, "no_match");
      summary.skipped.push({ triggerId: trigger.id, reason: "no_match" });
      continue;
    }

    const guard = await ctx.loopGuardCheck({ trigger, inbound });
    if (guard.blocked) {
      await recordSkip(ctx, trigger, inbound, "loop_guard");
      summary.skipped.push({ triggerId: trigger.id, reason: "loop_guard" });
      continue;
    }

    // Reserve idempotency before startRun so concurrent webhook deliveries
    // can't both succeed. UNIQUE (triggerId, messageId) conflict → skip.
    const fireId = randomUUID();
    const reserve = await ctx.store.recordFire({
      id: fireId,
      triggerId: trigger.id,
      messageId: inbound.externalMessageId,
      runId: null, // updated post-startRun via a second insert path is not
                   // available; fire row stands as the idempotency reservation
                   // and the runId stays null. The created run links back via
                   // its triggerEventId field for cross-reference.
      skippedReason: null,
      firedAt: nowOf(ctx),
    });
    if (!reserve.ok) {
      summary.skipped.push({ triggerId: trigger.id, reason: "already_fired" });
      continue;
    }

    try {
      const spec = await ctx.loadSpec(trigger.archetypeId);
      const runId = await ctx.startRun({
        orgId: trigger.orgId,
        archetypeId: trigger.archetypeId,
        spec,
        triggerEventId: fireId,
        triggerPayload: buildPayload(inbound),
      });
      summary.matched++;
      summary.runs.push(runId);
    } catch {
      // Failure is per-trigger isolated. The reserve row already exists;
      // record a separate observability row for visibility.
      await recordSkip(ctx, trigger, inbound, "dispatch_failed", {
        // Use a different messageId suffix so we don't conflict with
        // the reserve row's UNIQUE constraint.
        suffix: ":dispatch_failed",
      });
      summary.skipped.push({ triggerId: trigger.id, reason: "dispatch_failed" });
    }
  }

  return summary;
}

function nowOf(ctx: DispatchContext): Date {
  return ctx.now ? ctx.now() : new Date();
}

function buildPayload(inbound: InboundMessage): Record<string, unknown> {
  return {
    channel: inbound.channel,
    from: inbound.from,
    to: inbound.to,
    body: inbound.body,
    externalMessageId: inbound.externalMessageId,
    receivedAt: inbound.receivedAt.toISOString(),
    contactId: inbound.contactId,
    conversationId: inbound.conversationId,
  };
}

async function recordSkip(
  ctx: DispatchContext,
  trigger: MessageTrigger,
  inbound: InboundMessage,
  reason: MessageTriggerFireSkipReason,
  opts: { suffix?: string } = {},
): Promise<void> {
  await ctx.store.recordFire({
    id: randomUUID(),
    triggerId: trigger.id,
    messageId: inbound.externalMessageId + (opts.suffix ?? `:${reason}`),
    runId: null,
    skippedReason: reason,
    firedAt: nowOf(ctx),
  });
}
