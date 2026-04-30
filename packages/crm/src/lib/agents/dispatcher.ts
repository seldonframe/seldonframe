import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { listArchetypes } from "@/lib/agents/archetypes";
import {
  type AgentConfig,
} from "@/lib/agents/configure-actions";
import {
  getConfigPlaceholderValue,
  getTriggerEventType,
  synthesizeAgentSpec,
} from "@/lib/agents/synthesis";
import { makeAgentToolInvoker } from "@/lib/agents/tool-invoker";
import { enforceAgentRunLimit } from "@/lib/billing/limits";
import { reportAgentRunUsage } from "@/lib/billing/meters";
import { startRun } from "@/lib/workflow/runtime";
import { DrizzleRuntimeStorage } from "@/lib/workflow/storage-drizzle";
import type { RuntimeContext } from "@/lib/workflow/types";

/**
 * WS3.1.4 — event → agent dispatcher.
 *
 * When a workspace event fires (form.submitted, booking.created,
 * etc.), this dispatcher:
 *
 *   1. Loads the org's `agentConfigs` map.
 *   2. For each archetype, reads its `specTemplate.trigger.event`
 *      type — the event type the archetype listens to.
 *   3. Filters to deployed agents (`deployedAt` set, no `pausedAt`)
 *      whose trigger matches the incoming event AND whose
 *      configured trigger-resource id matches the event payload
 *      (e.g. `$formId === event.data.formId`).
 *   4. Synthesizes the spec for each match and starts a workflow
 *      run via the existing `runtime.startRun()`.
 *
 * Each match runs in isolation — a synthesis or run-creation failure
 * for one agent is logged but doesn't block the others or the calling
 * event handler. The event handler stays fast because run advancement
 * happens inside `startRun → advanceRun` which the runtime owns.
 *
 * NOT covered yet (V1.1):
 *   - schedule (cron) triggers — needs a separate cron entry that
 *     calls a similar dispatcher with synthetic event data
 *   - sms.received — needs a Twilio inbound webhook adapter
 *   - approver/secret/magic-link wiring on the runtime context (V1
 *     uses approverless defaults — request_approval steps fail with
 *     a clear error if the spec uses them; tracked separately)
 */

export type AgentDispatchInput = {
  orgId: string;
  triggerEventType: string;
  triggerEventId: string | null;
  triggerPayload: Record<string, unknown>;
  /**
   * Optional resource matcher. The dispatcher filters configured
   * agents to those whose user-input placeholder for the matching
   * key equals the value supplied here. Examples:
   *   form.submitted → { matcherPlaceholder: "$formId", matcherValue: form.id }
   *   booking.created → { matcherPlaceholder: "$appointmentTypeId",
   *                       matcherValue: booking.appointmentTypeId }
   * When null, every deployed agent listening for the event type is
   * dispatched (used for catch-all events like daily digest).
   */
  matcherPlaceholder: string | null;
  matcherValue: string | null;
};

export type AgentDispatchResult = {
  attempted: number;
  started: { archetypeId: string; runId: string }[];
  failed: { archetypeId: string; reason: string }[];
  /** Agents that matched the trigger but were skipped because the
   *  org hit the free-tier monthly run cap. The /automations page
   *  surfaces this so the operator sees that runs are being blocked. */
  blockedByLimit: { archetypeId: string; reason: string }[];
};

export async function dispatchEventToDeployedAgents(
  input: AgentDispatchInput
): Promise<AgentDispatchResult> {
  const result: AgentDispatchResult = { attempted: 0, started: [], failed: [], blockedByLimit: [] };

  const [orgRow] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, input.orgId))
    .limit(1);

  const settings = (orgRow?.settings ?? {}) as Record<string, unknown>;
  const agentConfigs =
    settings.agentConfigs && typeof settings.agentConfigs === "object"
      ? (settings.agentConfigs as Record<string, AgentConfig>)
      : {};

  const archetypes = listArchetypes();
  const ctx = buildRuntimeContext(input.orgId);

  for (const archetype of archetypes) {
    const config = agentConfigs[archetype.id];
    if (!config) continue;
    if (!config.deployedAt || config.pausedAt) continue;

    const archetypeTriggerType = getTriggerEventType(archetype.specTemplate);
    if (!archetypeTriggerType || archetypeTriggerType !== input.triggerEventType) {
      continue;
    }

    if (input.matcherPlaceholder && input.matcherValue) {
      const configured = getConfigPlaceholderValue(config, input.matcherPlaceholder);
      if (!configured || configured !== input.matcherValue) continue;
    }

    result.attempted += 1;

    // Free-tier hard cap (100 runs/mo). Paid tiers always pass —
    // overage is metered. The check loads `workflow_runs` count for
    // the current calendar month, which is fast (indexed scan) and
    // happens once per matching archetype per event.
    const limit = await enforceAgentRunLimit(input.orgId);
    if (!limit.allowed) {
      result.blockedByLimit.push({
        archetypeId: archetype.id,
        reason: `${limit.reason}:${limit.used}/${limit.limit}`,
      });
      continue;
    }

    try {
      const synthesis = synthesizeAgentSpec(archetype, config);
      if (!synthesis.ok) {
        result.failed.push({
          archetypeId: archetype.id,
          reason: `synthesis_${synthesis.reason}:${synthesis.placeholderKey}`,
        });
        continue;
      }

      const runId = await startRun(ctx, {
        orgId: input.orgId,
        archetypeId: archetype.id,
        // The runtime expects a typed AgentSpec — synthesis returns
        // an unknown-typed object. The runtime validates the shape
        // via its internal validator on entry; cast is safe here.
        spec: synthesis.spec as Parameters<typeof startRun>[1]["spec"],
        triggerEventId: input.triggerEventId,
        triggerPayload: input.triggerPayload,
      });

      result.started.push({ archetypeId: archetype.id, runId });

      // April 30, 2026 — usage-based billing: emit one Stripe meter
      // event per workflow_runs row creation. Best-effort; failures
      // log but never block the run. See lib/billing/meters.ts.
      void reportAgentRunUsage(input.orgId);
    } catch (err) {
      result.failed.push({
        archetypeId: archetype.id,
        reason: err instanceof Error ? err.message : "unknown_dispatch_error",
      });
    }
  }

  if (result.attempted > 0 || result.failed.length > 0 || result.blockedByLimit.length > 0) {
    console.info(
      `[agent-dispatcher] org=${input.orgId} event=${input.triggerEventType} attempted=${result.attempted} started=${result.started.length} failed=${result.failed.length} blockedByLimit=${result.blockedByLimit.length}`
    );
    if (result.failed.length > 0) {
      for (const f of result.failed) {
        console.warn(
          `[agent-dispatcher] org=${input.orgId} archetype=${f.archetypeId} failed: ${f.reason}`
        );
      }
    }
    if (result.blockedByLimit.length > 0) {
      for (const b of result.blockedByLimit) {
        console.info(
          `[agent-dispatcher] org=${input.orgId} archetype=${b.archetypeId} blocked-by-limit: ${b.reason}`
        );
      }
    }
  }

  return result;
}

/**
 * Build the RuntimeContext for a given workspace. Storage + tool
 * invoker are workspace-scoped; the rest of the context (clock,
 * approval / soul / event hooks) inherits sensible defaults until
 * the per-feature wiring lands.
 */
function buildRuntimeContext(orgId: string): RuntimeContext {
  return {
    storage: new DrizzleRuntimeStorage(db),
    invokeTool: makeAgentToolInvoker(orgId),
    now: () => new Date(),
    // Approval / soul / event-bus / secret hooks not wired this turn.
    // Specs that need them surface a clear error from the runtime
    // dispatcher (the operator sees on the runs page).
  };
}
