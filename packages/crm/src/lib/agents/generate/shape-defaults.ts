// Primitive-Composition Agent Generator — P1, Task 3: shape-based safety defaults.
//
// The composer wires SF's safety by an authored agent's SHAPE — its trigger
// `kind` × `channel` — NOT a template id. So an agent of ANY type still gets
// guardrails + a verify rubric deterministically, and SF's never-invent-facts
// safety floor (`SF_GROUND_RULES`) is appended to every authored skill regardless
// of what the LLM wrote.
//
// This GENERALIZES the per-SKILL defaults:
//   • agent-guardrails.ts `defaultGuardrailsForSkill` (the review-requester /
//     speed-to-lead defaults + the `Guardrails` shape);
//   • default-rubrics.ts `defaultRubricForSkill` (the channel-aware length cap
//     sms 320 / email 5000 + the no-unfilled-"{" guard + the review-URL check)
// from skill-keyed → shape-keyed. It reuses the SAME `Guardrails` / `VerifyRubric`
// types + the SAME cap values + the SAME review-requester numbers, so a composed
// agent and a template agent gate identically.
//
// It is intentionally PURE: no I/O, no clock, no env, no "use server". It only
// assembles plain config objects. Safe from a Server Component, action, route
// handler, runtime, or test.

import type { Guardrails } from "@/lib/agents/guardrails/agent-guardrails";
import type { AgentTrigger } from "@/lib/agents/triggers/agent-trigger";
import type { VerifyCheck, VerifyRubric } from "@/lib/agents/verify/agent-verify";

// ─── the shape ────────────────────────────────────────────────────────────────

/**
 * The two axes the safety defaults key off: the trigger `kind` and the delivery
 * `channel`. `channel` is a plain `string` (not `EventChannel`) because the
 * composer also handles the action-only `"none"` channel and inbound channels
 * (voice/chat) that aren't event channels — keeping this loose decouples the
 * defaults from the trigger union and lets a single shape describe any agent.
 */
export type AgentShape = { kind: AgentTrigger["kind"]; channel: string };

// ─── canonical ground rules (always appended by the composer) ────────────────

/**
 * SF's canonical never-invent-facts safety block. The composer ALWAYS appends
 * this to the authored skill so safety never depends on the LLM authoring it —
 * the thin-harness floor under every generated agent, of every shape.
 *
 * Condensed from the starters' shared "## Ground rules" prose (starter-pack.ts
 * HOUSE_RULES_CHAT / HOUSE_RULES_VOICE) into a tool-agnostic version: it is
 * appended to agents that may NOT have booking tools (an action-only poster), so
 * it states the rule ("use the booking tools, never guess a slot") without naming
 * specific tool functions. Reads in the house voice.
 */
export const SF_GROUND_RULES = `## Ground rules (never break these)
- Never invent facts, hours, prices, or policies. If you don't know, say so — offer to capture details or hand off to a human rather than guess.
- Never quote a firm price. For any "how much" question, give an honest range from what you actually know and say a team member confirms the exact figure.
- Before you book, reschedule, or cancel anything, read back the full details (name, service, date, time, contact) and get an explicit "yes" first. Never finalize on assumption.
- Use the booking tools for anything calendar-related — never guess or make up an available slot.
- When you're unsure or a human is needed, escalate to a person. Do not over-promise.
- Be warm, concise, and natural — one thing at a time.`;

// ─── shared constants (mirror the per-skill defaults exactly) ────────────────

/** 30 days in minutes — the review-requester per-contact cooldown (reused). */
const THIRTY_DAYS_MINUTES = 60 * 24 * 30; // 43200

/** The review-requester daily budget brake (reused as the messaging cap). */
const MESSAGING_DAILY_CAP = 200;

/** The budget brake for a non-messaging shape (action-only / inbound). Still a
 *  brake against a runaway loop, but generous — these don't message a person on
 *  a schedule. Mirrors the speed-to-lead "high daily budget only" posture. */
const NON_MESSAGING_DAILY_CAP = 500;

/** Quiet-hours window for a customer-messaging shape: 21:00–08:00 (A2P/TCPA
 *  hygiene), evaluated in UTC by default — the review-requester window. */
const MESSAGING_QUIET_HOURS = { startHour: 21, endHour: 8, tz: "UTC" } as const;

/** Max characters for an SMS-channel body — one tight SMS-ish segment with
 *  headroom (the default cap, matching default-rubrics.ts). */
const MAX_SMS_LENGTH = 320;

/** Max characters for an EMAIL-channel body — a generous long-form ceiling
 *  (matching default-rubrics.ts) that catches a runaway body without flagging a
 *  normal multi-paragraph email. */
const MAX_EMAIL_LENGTH = 5000;

/** The always-on "no leftover template placeholder leaked" guard — a literal
 *  "{" means a `{firstName}`-style token never got filled (matches default-rubrics). */
const NO_PLACEHOLDER: VerifyCheck = {
  kind: "must_not_include",
  value: "{",
  label: "unfilled placeholder",
};

// ─── shape classification ─────────────────────────────────────────────────────

/** Normalize a channel string for comparison (trim + lower-case). */
function normChannel(channel: string): string {
  return typeof channel === "string" ? channel.trim().toLowerCase() : "";
}

/**
 * Does this shape send a message TO A PERSON on the agent's initiative? True for
 * an OUTBOUND text channel — `kind` event/schedule AND `channel` sms/email. These
 * earn the full messaging brakes (quiet hours + per-contact + daily cap).
 *
 * An INBOUND shape is excluded even on an sms/email channel: the human initiated
 * the contact, so quiet hours / a per-contact gap don't apply (you always answer
 * an incoming message). An action-only `"none"` channel is excluded: it posts/acts,
 * it doesn't message a person.
 */
function isCustomerMessaging(shape: AgentShape): boolean {
  const channel = normChannel(shape.channel);
  const outboundKind = shape.kind === "event" || shape.kind === "schedule";
  const textChannel = channel === "sms" || channel === "email";
  return outboundKind && textChannel;
}

/** Pick the length cap for a channel: "email" → the long-form cap; "sms" → the
 *  tight cap; anything else (incl. "none") → null (NO length cap). */
function maxLengthForChannel(channel: string): number | null {
  const c = normChannel(channel);
  if (c === "email") return MAX_EMAIL_LENGTH;
  if (c === "sms") return MAX_SMS_LENGTH;
  return null;
}

// ─── guardrails by shape ──────────────────────────────────────────────────────

/**
 * The default `Guardrails` for an agent SHAPE, used when a deployment hasn't set
 * its own `blueprint.guardrails`. The kill switch (`enabled`) is ALWAYS on/
 * available so an operator can hard-stop any agent.
 *
 * - A **customer-messaging** shape (outbound event/schedule on sms/email — it
 *   messages a person on its own initiative) → quiet hours 21–8 + a 30-day
 *   per-contact gap + a daily cap, mirroring the review-requester defaults.
 * - An **action-only** (`channel:"none"` — it posts/acts via tools) or **inbound**
 *   (the human initiated the contact) shape → a daily budget brake ONLY, with NO
 *   quiet hours / per-contact gap (there's no person being messaged on a schedule).
 *
 * (A "time-critical lead" shape — e.g. speed-to-lead, which must fire instantly,
 * even at 3am — is the documented exception to messaging quiet hours. We keep
 * Task 3 simple: an authored agent doesn't carry a "lead" sub-classification, so
 * by default a messaging shape gets the safe quiet-hours posture. A caller that
 * KNOWS the shape is lead-time-critical can drop `quietHours` from the returned
 * object before saving — but the conservative default never accidentally sends a
 * non-urgent message at 3am.)
 *
 * Reuses the real `Guardrails` field names + the review-requester numbers. Pure;
 * never throws.
 */
export function defaultGuardrailsForShape(shape: AgentShape): Guardrails {
  if (isCustomerMessaging(shape)) {
    return {
      enabled: true,
      maxPerDayPerAgent: MESSAGING_DAILY_CAP,
      minMinutesBetweenPerContact: THIRTY_DAYS_MINUTES,
      quietHours: { ...MESSAGING_QUIET_HOURS },
    };
  }

  // Action-only ("none") or inbound: a budget brake only — no quiet hours, no
  // per-contact gap (it doesn't message a person on a schedule).
  return {
    enabled: true,
    maxPerDayPerAgent: NON_MESSAGING_DAILY_CAP,
  };
}

// ─── verify rubric by shape ───────────────────────────────────────────────────

/**
 * The default `VerifyRubric` for an agent SHAPE. Always includes the no-unfilled-
 * "{" guard. A `max_length` cap is added ONLY for a text channel — sms (320) /
 * email (5000), the channel-aware cap from default-rubrics; `channel:"none"`
 * (an action-only post/log) gets NO length cap, since a post body has no SMS/
 * email ceiling. When `opts.reviewUrl` is set, a `must_include` for that URL is
 * added (mirrors defaultRubricForSkill's review-link check) — but only when the
 * value is KNOWN, so an unknown link never becomes an unsatisfiable check.
 *
 * Reuses the real `VerifyCheck` kinds + cap values. Pure; never throws.
 */
export function defaultRubricForShape(
  shape: AgentShape,
  opts?: { reviewUrl?: string | null },
): VerifyRubric {
  const checks: VerifyCheck[] = [];

  // Only enforce the review link when we actually have one — an unknown URL must
  // NOT become an unsatisfiable must_include (the "no URL → skip the ask" decision
  // belongs to the gate layer, not this check).
  if (opts?.reviewUrl) {
    checks.push({ kind: "must_include", value: opts.reviewUrl, label: "review link" });
  }

  // Channel-aware length cap — sms/email only; "none" (action-only) gets none.
  const maxLength = maxLengthForChannel(shape.channel);
  if (maxLength !== null) {
    checks.push({ kind: "max_length", max: maxLength });
  }

  // The always-on no-leftover-placeholder guard.
  checks.push(NO_PLACEHOLDER);

  return { checks };
}
