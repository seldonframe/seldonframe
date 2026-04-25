// Production wiring for the message-trigger dispatcher.
// SLICE 7 PR 1 C6 + PR 2 C1 (loop-guard wiring) + PR 2 C2 (startRun wiring).
//
// PR 2 C1 (this commit): loopGuardCheck stub replaced with real
// makeProductionLoopGuardCheck — queries DB for recent fires, emits
// workflow.message_trigger.loop_guard_engaged on halt, logs warn at
// workspace threshold.
//
// loadSpec + startRun remain stubbed (PR 2 C2 ships those).
//
// Failures in dispatch never propagate to the webhook response (would
// cause Twilio retry storms). The wrapper catches + logs and returns
// an empty summary.

import { db, type DbClient } from "@/db";
import { logEvent } from "@/lib/observability/log";
import { DrizzleRuntimeStorage } from "@/lib/workflow/storage-drizzle";

import { makeProductionLoopGuardCheck } from "./loop-guard-wiring";
import {
  dispatchMessageTriggers,
  type DispatchContext,
  type DispatchSummary,
  type InboundMessage,
} from "./message-trigger-dispatcher";
import { DrizzleMessageTriggerStore } from "./message-trigger-storage-drizzle";

export type DispatchTwilioInboundInput = Omit<InboundMessage, "channel">;

export async function dispatchTwilioInboundForMessageTriggers(
  inbound: DispatchTwilioInboundInput,
): Promise<DispatchSummary> {
  try {
    const ctx = buildProductionDispatchContext(db, inbound.orgId);
    return await dispatchMessageTriggers(ctx, { ...inbound, channel: "sms" });
  } catch (error) {
    logEvent("message_trigger_dispatch_failed", {
      org_id: inbound.orgId,
      message_id: inbound.externalMessageId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { matched: 0, runs: [], skipped: [] };
  }
}

export function buildProductionDispatchContext(
  client: DbClient,
  orgId: string,
): DispatchContext {
  const store = new DrizzleMessageTriggerStore(client);
  const storage = new DrizzleRuntimeStorage(client);
  return {
    store,
    loadSpec: async (archetypeId: string) => {
      throw new Error(
        `loadSpec("${archetypeId}") — PR 2 C2 wires real archetype resolver`,
      );
    },
    startRun: async (input) => {
      const stubRunId = `pr2c1-stub-${input.archetypeId}-${Date.now()}`;
      logEvent("message_trigger_startrun_stub", {
        org_id: input.orgId,
        archetype_id: input.archetypeId,
        trigger_event_id: input.triggerEventId,
        stub_run_id: stubRunId,
      });
      return stubRunId;
    },
    loopGuardCheck: makeProductionLoopGuardCheck({
      db: client,
      storage,
      orgId,
    }),
  };
}
