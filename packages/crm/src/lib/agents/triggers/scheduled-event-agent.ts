// Outbound-UX Bundle — F2: configurable send delay for EVENT agents.
//
// The unified-agent-model outbound path (runEventAgent) sends the instant its
// event fires. F2 lets an event agent DEFER that send: a review-requester can
// fire its "leave us a Google review" ask 24h AFTER the job, not the second the
// booking completes. The delay lives on `blueprint.trigger.delayMinutes`
// (agent-trigger.ts); when > 0, runEventAgent ENQUEUES a scheduled send instead
// of sending now, and the gates (throttle / guardrails / verify / loop-memory)
// run fresh at the ACTUAL send time — never at enqueue time.
//
// WHY a NEW row shape (not the existing outbound_scheduled_sends table):
//   `outbound_scheduled_sends` is MESSAGE-TRIGGER-shaped — its `trigger_id` is a
//   NOT-NULL FK to an `outbound_message_triggers` row, and the cron's
//   processScheduledSend re-loads THAT row and composes via composeOutboundMessage
//   (the lib/messaging compose path). Event agents have NO outbound_message_triggers
//   row, and their compose/verify/guardrail/memory pipeline is runEventAgent's
//   (composeReviewRequest / composeSpeedToLead + the L1/L2/L3 gates) — a different
//   system entirely. Re-firing runEventAgent is the ONLY way all four gates run at
//   send time, so F2 carries the EVENT CONTEXT forward (not a pre-composed message)
//   and replays runEventAgent at due time. This module owns that contract + replay;
//   the durable queue table + the cron consumer that ticks it are the integration
//   seam (see the TODO in run-event-agent-deps.ts).
//
// PURE + DI'd: no I/O, no "use server", no top-level imports of db/Twilio. Safe
// from a route handler, an action, the runtime, or a test. The replay reuses
// runEventAgent verbatim — there is no second send path.

import {
  runEventAgent,
  type FiredEvent,
  type RunEventAgentDeps,
  type RunEventAgentResult,
} from "./run-event-agent";

/**
 * A queued, time-deferred event-agent send. This is the EVENT CONTEXT frozen at
 * enqueue time — NOT a pre-composed message. At `dueAt` the cron consumer
 * reconstructs the FiredEvent from these fields and replays runEventAgent, so
 * compose + throttle + guardrails + verify + memory all run THEN (current
 * contact state, current workspace tz, current guardrails), never at enqueue.
 *
 * `agentSkill` is carried for observability/scoping only — the replayed
 * runEventAgent re-resolves the matching agent(s) for the event via its own
 * findEventAgents, exactly as the immediate path does.
 */
export type ScheduledEventAgentSend = {
  /** The SeldonEvent slug to replay (e.g. "booking.completed"). */
  eventType: string;
  orgId: string;
  /** The contact to reach (null → the replay no-ops, same as the live path). */
  contactId: string | null;
  /** The frozen event payload (passed back into the replayed FiredEvent). */
  payload: Record<string, unknown>;
  /** Absolute time the send becomes due. The cron selects rows with
   *  `dueAt <= now` and replays them. */
  dueAt: Date;
  /** The skill the matched agent ran (e.g. "review-requester") — for the audit
   *  row / observability; the replay re-resolves agents independently. */
  agentSkill: string;
  /** The channel the matched agent used (e.g. "sms") — observability only. */
  channel: "sms" | "email";
};

/** The injected enqueue seam. runEventAgent calls this (when wired + the matched
 *  agent's delay > 0) to durably persist a `ScheduledEventAgentSend` for the cron
 *  to pick up later. Absent → no scheduling is possible, so the agent sends
 *  immediately (back-compat). Production wires a row insert; tests inject a fake
 *  that records the call. */
export type EnqueueScheduledEventAgentSend = (
  send: ScheduledEventAgentSend,
) => Promise<void>;

/**
 * Replay one DUE scheduled event-agent send: rebuild the FiredEvent from the
 * frozen context and run runEventAgent with the SAME deps the live listener
 * uses — so the gates (throttle / guardrails / verify / memory) run NOW, at the
 * actual send time. NEVER throws (it inherits runEventAgent's swallow-everything
 * contract); the result summary is returned for the cron's audit/log.
 *
 * Pinned: the replay does NOT re-enqueue. The deps passed here MUST NOT wire
 * `enqueueScheduledSend` (or, if they do, the matched agent's delay is irrelevant
 * because this row is already the deferred send) — see runDueDepsGuard below,
 * which strips the enqueue seam so a misconfigured caller can never queue a send
 * from inside a replay (no infinite defer loop).
 */
export async function runDueScheduledEventAgent(
  send: ScheduledEventAgentSend,
  deps: RunEventAgentDeps,
): Promise<RunEventAgentResult> {
  const event: FiredEvent = {
    type: send.eventType,
    orgId: send.orgId,
    contactId: send.contactId,
    payload: send.payload ?? {},
  };
  // Strip the enqueue seam on replay so the deferred send can NEVER re-defer
  // itself into a second scheduled row (which would loop forever). With no
  // enqueueScheduledSend wired, runEventAgent ignores delayMinutes and sends now.
  return runEventAgent(event, runDueDepsGuard(deps));
}

/** Return a copy of `deps` with `enqueueScheduledSend` removed, so a replay can
 *  only SEND, never re-enqueue. */
function runDueDepsGuard(deps: RunEventAgentDeps): RunEventAgentDeps {
  if (!deps.enqueueScheduledSend) return deps;
  const { enqueueScheduledSend: _omit, ...rest } = deps;
  return rest;
}
