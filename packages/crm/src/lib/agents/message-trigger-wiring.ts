// Production wiring for the message-trigger dispatcher.
// SLICE 7 PR 1 C6 + PR 2 C1 (loop-guard) + PR 2 C2 (startRun + spec resolver).
//
// All four DispatchContext slots now wired to production:
//   - store: DrizzleMessageTriggerStore
//   - loadSpec: archetype-registry resolver (placeholder-free archetypes)
//   - startRun: real workflow/runtime.startRun
//   - loopGuardCheck: makeProductionLoopGuardCheck
//
// Failures in dispatch never propagate to the webhook response (would
// cause Twilio retry storms). The wrapper catches + logs and returns
// an empty summary.

import { db, type DbClient } from "@/db";
import { logEvent } from "@/lib/observability/log";
import { startRun as runtimeStartRun } from "@/lib/workflow/runtime";
import { DrizzleRuntimeStorage } from "@/lib/workflow/storage-drizzle";
import { notImplementedToolInvoker, type RuntimeContext } from "@/lib/workflow/types";

import { makeProductionLoopGuardCheck } from "./loop-guard-wiring";
import {
  dispatchMessageTriggers,
  type DispatchContext,
  type DispatchSummary,
  type InboundMessage,
} from "./message-trigger-dispatcher";
import {
  buildMessageTriggerSpecResolver,
  buildMessageTriggerStartRun,
} from "./message-trigger-runtime-wiring";
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
  const runtimeContext: RuntimeContext = {
    storage,
    invokeTool: notImplementedToolInvoker,
    now: () => new Date(),
  };
  return {
    store,
    loadSpec: buildMessageTriggerSpecResolver(),
    startRun: buildMessageTriggerStartRun({
      runtimeContext,
      runtimeStartRun,
    }),
    loopGuardCheck: makeProductionLoopGuardCheck({
      db: client,
      storage,
      orgId,
    }),
  };
}
