// Email-agent slice (Part B1) — dispatch a fired composio.* event (e.g.
// composio.gmail.new_message) to the record-compiled DEPLOYMENTS whose
// blueprint trigger matches. This extends the SAME composio bridge that
// already fans events to ARCHETYPE agents (dispatchEventToDeployedAgents,
// lib/agents/dispatcher.ts) — deployments/agent_templates are a DIFFERENT
// population (see the spec's grounded-state notes), so this is a sibling
// dispatcher, called right after the archetype one from the SAME bus.onAny
// handler (lib/events/listeners.ts), never replacing it.
//
// WHY NOT runEventAgent: that orchestrator's findEventAgents contract
// (run-event-agent-deps.ts) is shaped around the review-requester /
// speed-to-lead SKILLS resolved off `agentTemplates.builderOrgId` — it has no
// notion of a per-client DEPLOYMENT running a full agentic tool-use turn
// (Gmail triage). Forcing that shape onto push-triggered deployments would be
// the wrong abstraction (CLAUDE.md 3.1). Instead this dispatcher runs each
// matched deployment through the SAME agentic-turn seam the action-only
// event-agent path already uses (prod = runStatelessAgentTurn, testMode:
// false) — no hand-rolled tool loop, no new execution primitive.
//
// MONEY-SAFE / IDEMPOTENT: the Gmail `messageId` (when present in the
// webhook payload) is the event identity — a redelivery for the same
// (deploymentId, messageId) is skipped. A missing messageId is a defensive
// fallback: still runs (never silently drops a real trigger), just isn't
// deduped.
//
// FAIL-SOFT per deployment: one deployment's error is swallowed + counted in
// `skipped`... no — surfaced via console.warn and still counted in `started`
// (it fired; the run itself failed). This NEVER throws — a bad deployment
// must never break a sibling deployment or the composio bridge.
//
// Org-scoped: `listMatchingDeployments` is called with `orgId` (the org the
// webhook resolved via data._composio.orgId) and must only return
// deployments belonging to that org.

import type { AgentBlueprint } from "@/db/schema/agents";

/** One deployment whose resolved trigger matches the fired event. */
export type ComposioEventDeploymentMatch = {
  deploymentId: string;
  /** The org the deployment runs FOR (clientOrgId ?? builderOrgId) — same as
   *  listScheduledAgentDeployments' shape. */
  orgId: string;
  /** A stable key for observability (the agent template id). */
  agentKey: string;
  /** The resolved trigger's channel ("sms" | "email") — lets the production
   *  deps decide whether to splice the operator's voice profile (Part A2)
   *  without re-deriving the trigger from the blueprint. */
  channel: "sms" | "email";
  blueprint: AgentBlueprint;
};

export type DispatchComposioEventDeps = {
  /** Enumerate ACTIVE deployments for this org whose resolved trigger is
   *  `{kind:"event", event: eventType}`. Org-scoped by the caller. */
  listMatchingDeployments: (
    orgId: string,
    eventType: string,
  ) => Promise<ComposioEventDeploymentMatch[]>;
  /** Run the matched deployment's agent ONE turn with its bound tools,
   *  NON-testMode (prod = runStatelessAgentTurn via a synthetic "you have a
   *  new email" trigger message). Never assumed to throw-free by the
   *  orchestrator — guarded below. */
  runAgenticTurn: (args: {
    orgId: string;
    deploymentId: string;
    channel: "sms" | "email";
    blueprint: AgentBlueprint;
    payload: Record<string, unknown>;
  }) => Promise<{ ok: boolean }>;
  /** Has this (deploymentId, messageId) pair already been processed? Only
   *  consulted when the payload carries a messageId. */
  isAlreadyProcessed: (deploymentId: string, messageId: string) => Promise<boolean>;
  /** Record (deploymentId, messageId) as processed, after a run attempt.
   *  Only called when the payload carried a messageId. */
  markProcessed: (deploymentId: string, messageId: string) => Promise<void>;
  log?: (event: string, data: Record<string, unknown>) => void;
};

export type DispatchComposioEventResult = {
  /** How many matched deployments were enumerated (before the dedupe skip). */
  attempted: number;
  /** deploymentIds that actually ran this tick (whether the run itself
   *  succeeded or errored — "started" means "not skipped by dedupe"). */
  started: string[];
  /** deploymentIds skipped by the idempotency guard (already processed this
   *  messageId). */
  skipped: string[];
};

/** Best-effort extraction of the Gmail messageId from a composio webhook
 *  payload. Tolerates a few plausible field names/shapes; returns null when
 *  absent (the caller then runs WITHOUT dedupe — a missing id must never
 *  silently drop a real trigger). Never throws. */
function extractMessageId(payload: Record<string, unknown>): string | null {
  const direct = payload.messageId ?? payload.message_id;
  if (typeof direct === "string" && direct.trim().length > 0) return direct.trim();
  const nested = (payload.data as Record<string, unknown> | undefined)?.messageId;
  if (typeof nested === "string" && nested.trim().length > 0) return nested.trim();
  return null;
}

/**
 * Fan a fired composio event out to the matching deployments. NEVER throws —
 * every failure (enumeration, a single deployment's run) is swallowed and
 * surfaced only via the result / console.warn.
 */
export async function dispatchComposioEventToDeployments(
  deps: DispatchComposioEventDeps,
  args: { orgId: string; eventType: string; payload: Record<string, unknown> },
): Promise<DispatchComposioEventResult> {
  const log = deps.log ?? (() => {});
  const result: DispatchComposioEventResult = { attempted: 0, started: [], skipped: [] };

  let matches: ComposioEventDeploymentMatch[];
  try {
    matches = await deps.listMatchingDeployments(args.orgId, args.eventType);
  } catch (err) {
    console.warn(
      `[composio-event-dispatch] listMatchingDeployments failed for ${args.eventType}:`,
      err instanceof Error ? err.message : String(err),
    );
    return result;
  }

  result.attempted = matches.length;
  if (matches.length === 0) return result;

  const messageId = extractMessageId(args.payload);

  for (const m of matches) {
    try {
      if (messageId) {
        const already = await deps.isAlreadyProcessed(m.deploymentId, messageId);
        if (already) {
          result.skipped.push(m.deploymentId);
          continue;
        }
      }

      result.started.push(m.deploymentId);

      try {
        await deps.runAgenticTurn({
          orgId: m.orgId,
          deploymentId: m.deploymentId,
          channel: m.channel,
          blueprint: m.blueprint,
          payload: args.payload,
        });
      } catch (err) {
        console.warn(
          `[composio-event-dispatch] runAgenticTurn failed for deployment ${m.deploymentId}:`,
          err instanceof Error ? err.message : String(err),
        );
      }

      if (messageId) {
        try {
          await deps.markProcessed(m.deploymentId, messageId);
        } catch (err) {
          console.warn(
            `[composio-event-dispatch] markProcessed failed for deployment ${m.deploymentId}:`,
            err instanceof Error ? err.message : String(err),
          );
        }
      }
    } catch (err) {
      // Belt-and-suspenders — one deployment's unexpected failure never
      // starves the rest.
      log("composio_event_dispatch.deployment_failed", {
        deploymentId: m.deploymentId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
