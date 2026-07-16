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
// MONEY-SAFE / IDEMPOTENT (verify-gate fix wave, 2026-07-12):
//   - The Gmail `messageId` (when present in the webhook payload) is the
//     event identity. `claimRun` (deps.claimRun) does an ATOMIC
//     claim-before-run — dedupe check + append + a per-deployment DAILY RUN
//     CAP check + increment, all in ONE database statement (see
//     lib/deployments/store.ts::claimComposioPushRun). This closes a
//     TOCTOU window a separate read-then-write pair would leave open: two
//     overlapping webhook redeliveries can no longer both pass a "not yet
//     processed" check and both run.
//   - The run cap is a circuit breaker against unbounded LLM spend from a
//     mail flood — it is enforced even when `messageId` is absent (a
//     defensive fallback path still runs, but is still capped).
//   - A FAILED run (throw, or `{ok:false}`) RELEASES its claim
//     (deps.releaseClaim) so a webhook redelivery can retry a transient
//     failure (no LLM key, timeout) instead of being silently swallowed
//     forever. A SUCCESSFUL run keeps its claim (never re-runs the same
//     message).
//
// FAIL-SOFT per deployment: one deployment's error is swallowed + surfaced
// via console.warn / the optional `log`, and still counted in `started`
// (it fired; the run itself failed — see FIX 3 above for what that means
// for its claim). This NEVER throws — a bad deployment must never break a
// sibling deployment or the composio bridge.
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

/** The outcome of an atomic claim-before-run attempt (deps.claimRun). Mirrors
 *  store.ts::claimComposioPushRun's return shape 1:1. */
export type ClaimRunResult = { claimed: true } | { claimed: false; reason: string };

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
   *  orchestrator — guarded below. `toolCalls`/`replyText` (agent receipts
   *  slice, Task 2a) are OPTIONAL, additive fields the prod deps populate
   *  from the turn's onToolEvent stream — every existing fake returning just
   *  `{ok}` stays valid. */
  runAgenticTurn: (args: {
    orgId: string;
    deploymentId: string;
    channel: "sms" | "email";
    blueprint: AgentBlueprint;
    payload: Record<string, unknown>;
  }) => Promise<{
    ok: boolean;
    toolCalls?: Array<{ tool: string; ok: boolean; note?: string }>;
    replyText?: string;
    /** Agent truth slice (Task 1) — WHY the turn didn't succeed (e.g. "no LLM
     *  key configured", or the turn's own `message` like "[runtime error]
     *  anthropic 401: invalid x-api-key"). Only meaningful when `ok` is
     *  false; optional so every existing fake returning just `{ok}` stays
     *  valid. Never assumed secret-safe by the orchestrator — the writer
     *  (lib/agent-receipts/write.ts) scrubs it before it becomes a summary. */
    errorMessage?: string;
  }>;
  /** Verify-gate FIX 1 + FIX 2 — ONE atomic statement that both dedupes
   *  (deploymentId, messageId) AND gates/increments the per-deployment daily
   *  run cap (prod = store.ts::claimComposioPushRun). `messageId` is null
   *  when the payload didn't carry one — the claim is then cap-only (no
   *  dedupe, per the fail-open-on-missing-id contract), never assumed to
   *  throw-free by the orchestrator (guarded below — a throw is treated as
   *  "not claimed", the safe direction for a money-spend gate). */
  claimRun: (
    deploymentId: string,
    orgId: string,
    messageId: string | null,
  ) => Promise<ClaimRunResult>;
  /** Verify-gate FIX 3 — release a previously-granted claim after a FAILED
   *  run (throw or `{ok:false}`) so a webhook redelivery can retry. Only
   *  called when `messageId` was present (nothing was claimed to release
   *  otherwise). Guarded — a throw here is logged and swallowed. */
  releaseClaim: (deploymentId: string, messageId: string) => Promise<void>;
  log?: (event: string, data: Record<string, unknown>) => void;
  /** Agent receipts slice (Task 2a) — optional DI hook, called once per
   *  STARTED run (never for a skip) with the run's outcome. Default no-op:
   *  every existing caller/test constructing a DispatchComposioEventDeps
   *  literal is byte-for-byte unaffected. In prod this is writeRunReceipt
   *  (lib/agent-receipts/write.ts), itself fail-soft — but this hook is
   *  ALSO guarded in the orchestrator (a throw is swallowed) so an injected
   *  writer can never affect the dispatch loop or a claim's release. */
  writeReceipt?: (args: {
    orgId: string;
    deploymentId: string;
    status: "ok" | "error";
    sourceRef: string | null;
    toolCalls: Array<{ tool: string; ok: boolean; note?: string }>;
    replyText?: string;
    /** Agent truth slice (Task 1) — the failure reason (turn's own message,
     *  or the caught throw's message), present ONLY on an errored run.
     *  Unscrubbed at this layer — the writer scrubs before persisting. */
    errorMessage?: string;
  }) => Promise<void>;
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
  if (!messageId) {
    // The real GMAIL_NEW_GMAIL_MESSAGE payload shape is unverified until
    // live smoke — this is how a shape mismatch gets caught. Payload KEYS
    // only, never values (no content/secret leakage into logs).
    log("push_run_no_message_id", {
      eventType: args.eventType,
      orgId: args.orgId,
      payloadKeys: Object.keys(args.payload ?? {}),
    });
  }

  for (const m of matches) {
    try {
      let claim: ClaimRunResult;
      try {
        claim = await deps.claimRun(m.deploymentId, m.orgId, messageId);
      } catch (err) {
        // A claim error fails CLOSED (treated as not-claimed) — the safe
        // direction for a money-spend gate. Never throws the dispatcher.
        console.warn(
          `[composio-event-dispatch] claimRun failed for deployment ${m.deploymentId}:`,
          err instanceof Error ? err.message : String(err),
        );
        claim = { claimed: false, reason: "claim_error" };
      }

      if (!claim.claimed) {
        result.skipped.push(m.deploymentId);
        if (claim.reason === "capped") {
          log("push_run_capped", {
            deploymentId: m.deploymentId,
            orgId: m.orgId,
            eventType: args.eventType,
          });
        }
        continue;
      }

      result.started.push(m.deploymentId);

      let ok = false;
      let toolCalls: Array<{ tool: string; ok: boolean; note?: string }> = [];
      let replyText: string | undefined;
      // Agent truth slice (Task 1) — WHY the run didn't succeed, threaded
      // from either the turn's own errorMessage (ok:false) or the caught
      // throw's message, so the receipt can say more than "error".
      let errorMessage: string | undefined;
      try {
        const turnResult = await deps.runAgenticTurn({
          orgId: m.orgId,
          deploymentId: m.deploymentId,
          channel: m.channel,
          blueprint: m.blueprint,
          payload: args.payload,
        });
        ok = turnResult?.ok === true;
        toolCalls = turnResult?.toolCalls ?? [];
        replyText = turnResult?.replyText;
        if (!ok) errorMessage = turnResult?.errorMessage;
      } catch (err) {
        console.warn(
          `[composio-event-dispatch] runAgenticTurn failed for deployment ${m.deploymentId}:`,
          err instanceof Error ? err.message : String(err),
        );
        ok = false;
        errorMessage = err instanceof Error ? err.message : String(err);
      }

      // Agent receipts slice (Task 2a) — record this STARTED run's outcome
      // (ok/error), summarizing from the turn result available in this
      // scope. Guarded: a throw from an injected writer never affects the
      // dispatch loop or the claim-release decision below.
      if (deps.writeReceipt) {
        try {
          await deps.writeReceipt({
            orgId: m.orgId,
            deploymentId: m.deploymentId,
            status: ok ? "ok" : "error",
            sourceRef: messageId,
            toolCalls,
            replyText,
            ...(errorMessage ? { errorMessage } : {}),
          });
        } catch (err) {
          console.warn(
            `[composio-event-dispatch] writeReceipt failed for deployment ${m.deploymentId}:`,
            err instanceof Error ? err.message : String(err),
          );
        }
      }

      // FIX 3 — a FAILED run releases its claim so a webhook redelivery can
      // retry a transient failure. A SUCCESSFUL run keeps the claim (never
      // re-runs the same message). Only meaningful when a messageId was
      // claimed in the first place.
      if (!ok && messageId) {
        try {
          await deps.releaseClaim(m.deploymentId, messageId);
        } catch (err) {
          console.warn(
            `[composio-event-dispatch] releaseClaim failed for deployment ${m.deploymentId}:`,
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
