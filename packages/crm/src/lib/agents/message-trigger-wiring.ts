// Production wiring for the message-trigger dispatcher.
// SLICE 7 PR 1 C6 per audit §4.1.
//
// Builds a DispatchContext from the production Drizzle store with
// PR 1-stubbed startRun + loop-guard. PR 2 swaps the stubs for the
// real production runtime + per-trigger window + workspace counter.
//
// PR 1 wiring posture (intentional):
//   - store: production DrizzleMessageTriggerStore (real DB)
//   - loadSpec: throws (no message-typed archetype ships in PR 1)
//   - startRun: STUB — logs "would-have-fired" and returns a synthetic
//     run id. PR 1 message_triggers will be empty in production (no
//     installer flow yet), so this stub is never actually invoked.
//     PR 2 ships:
//       1. The first message-typed archetype (appointment-confirm-sms)
//       2. An installer that materializes a message_triggers row
//       3. Real runtime startRun wiring that creates a workflow_runs row
//   - loopGuardCheck: always-allow STUB (PR 2 wires per-trigger 5-fires
//     -in-60s + workspace 100/min counter per G-7-7)
//
// Why ship the wiring in PR 1 if message_triggers will be empty?
//   1. Validates the integration point in the Twilio webhook (the
//      insertion site is real and exercised on every inbound).
//   2. PR 2 swap is a 4-line change (replace 3 stub callbacks), not
//      a new integration sprint.
//   3. Smoke-testing in preview confirms the path doesn't regress
//      existing inbound SMS behavior (STOP / conversation routing /
//      sms.replied emission).
//
// Failures in dispatch never propagate to the webhook response (would
// cause Twilio retry storms). The wrapper catches + logs and returns
// an empty summary.

import { db, type DbClient } from "@/db";
import { logEvent } from "@/lib/observability/log";

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
    const ctx = buildProductionDispatchContext(db);
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

export function buildProductionDispatchContext(client: DbClient): DispatchContext {
  const store = new DrizzleMessageTriggerStore(client);
  return {
    store,
    loadSpec: async (archetypeId: string) => {
      throw new Error(
        `loadSpec("${archetypeId}") — PR 1 stub: no message-typed archetype shipped yet (PR 2 wires this)`,
      );
    },
    startRun: async (input) => {
      const stubRunId = `pr1-stub-${input.archetypeId}-${Date.now()}`;
      logEvent("message_trigger_startrun_stub", {
        org_id: input.orgId,
        archetype_id: input.archetypeId,
        trigger_event_id: input.triggerEventId,
        stub_run_id: stubRunId,
      });
      return stubRunId;
    },
    loopGuardCheck: async () => ({ blocked: false }),
  };
}
