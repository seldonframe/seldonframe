// Agent Loop — L3 Guardrails/Stop — the pure guardrail engine.
//
// This module is the pure core of the Guardrails/Stop primitive: the per-agent
// brakes that stop an agent from "billing you in silence". It owns the
// `Guardrails` shape and `evaluateGuardrails(guardrails, ctx) → {allow, reason?}`
// — a deterministic gate the caller runs BEFORE verify/send.
//
// The brakes, in the order they are checked (first failure wins):
//   1. kill switch       — enabled:false hard-stops the agent.
//   2. quiet hours       — no late-night sends (A2P / TCPA hygiene); the window
//                          is evaluated in the agent's configured tz and may
//                          wrap past midnight (start > end).
//   3. frequency cap     — a per-contact minimum gap between sends.
//   4. daily cap         — the budget brake: a max number of sends/day/agent
//                          (the caller supplies today's count).
//
// It is intentionally PURE:
//   • no I/O — it inspects config + a small ctx, nothing else;
//   • no "use server", no env;
//   • NEVER throws — a bad timezone makes ONLY the quiet-hours check fail open
//     (skipped) rather than crashing the gate, and an unparseable last-sent
//     timestamp skips ONLY the frequency check.
// Safe from a Server Component, action, route handler, runtime, or test.

/**
 * A quiet-hours window expressed as local clock hours in a timezone.
 * `[startHour, endHour)` is the BLOCKED range. When `startHour > endHour` the
 * window wraps past midnight — e.g. `{startHour:21, endHour:8}` blocks
 * 21,22,23,0,1,…,7 local (9pm through 7:59am), allowing 8…20.
 */
export type QuietHours = { startHour: number; endHour: number; tz: string };

/**
 * Per-agent brakes. All fields are optional; an absent field means that brake
 * is not applied. An absent/empty `Guardrails` (or `enabled` left undefined)
 * therefore allows everything.
 */
export type Guardrails = {
  /** default true; `false` is a hard kill switch for the agent. */
  enabled?: boolean;
  /** budget brake — max total sends/day for this agent in this org. */
  maxPerDayPerAgent?: number;
  /** frequency cap — minimum minutes between sends to the SAME contact. */
  minMinutesBetweenPerContact?: number;
  /** quiet-hours window (no late-night sends). */
  quietHours?: QuietHours;
};

/** The verdict: whether to proceed, and (when blocked) a short machine reason. */
export type GuardrailDecision = { allow: boolean; reason?: string };

/**
 * Compute the local clock hour (0–23) in `tz` for the instant `now`, or `null`
 * if `tz` is invalid (Intl throws on an unknown zone). Never throws.
 *
 * Some runtimes format midnight as the hour "24" rather than "00" — we
 * normalize 24 → 0 so the window math always sees 0–23.
 */
function localHourInTz(now: Date, tz: string): number | null {
  try {
    const formatted = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      hour12: false,
    }).format(now);
    const hour = parseInt(formatted, 10);
    if (!Number.isFinite(hour)) return null;
    return hour === 24 ? 0 : hour;
  } catch {
    // Invalid timezone (or any Intl failure) → fail open on THIS check only.
    return null;
  }
}

/**
 * Is `hour` inside the half-open quiet window `[startHour, endHour)`?
 * Supports wrap-around: when `startHour > endHour` the window spans midnight,
 * so the blocked set is `hour >= startHour || hour < endHour`.
 */
function isWithinQuietWindow(hour: number, startHour: number, endHour: number): boolean {
  if (startHour === endHour) {
    // Degenerate empty window — block nothing.
    return false;
  }
  if (startHour < endHour) {
    // Normal same-day window, e.g. 8→21 blocks 8..20.
    return hour >= startHour && hour < endHour;
  }
  // Wrap-around window, e.g. 21→8 blocks 21,22,23,0,..,7.
  return hour >= startHour || hour < endHour;
}

/**
 * Evaluate the guardrails for one prospective send.
 *
 * Checks run in a fixed order and the FIRST failure wins; if no brake trips,
 * the send is allowed. Never throws.
 */
export function evaluateGuardrails(
  guardrails: Guardrails | null | undefined,
  ctx: { now: Date; lastSentToContactAt?: string | null; sentTodayByAgent?: number },
): GuardrailDecision {
  // 1. No config at all → nothing to brake.
  if (guardrails == null) return { allow: true };

  // 2. Kill switch — beats every other rule.
  if (guardrails.enabled === false) {
    return { allow: false, reason: "agent disabled" };
  }

  // 3. Quiet hours — fail OPEN on a bad tz (skip the check, never crash).
  if (guardrails.quietHours) {
    const { startHour, endHour, tz } = guardrails.quietHours;
    const hour = localHourInTz(ctx.now, tz);
    if (hour !== null && isWithinQuietWindow(hour, startHour, endHour)) {
      return { allow: false, reason: "quiet hours" };
    }
  }

  // 4. Per-contact frequency cap — skip on a missing/unparseable last-sent time.
  if (guardrails.minMinutesBetweenPerContact != null && ctx.lastSentToContactAt) {
    const lastMs = Date.parse(ctx.lastSentToContactAt);
    if (Number.isFinite(lastMs)) {
      const minutesSince = (ctx.now.getTime() - lastMs) / 60000;
      if (minutesSince < guardrails.minMinutesBetweenPerContact) {
        return { allow: false, reason: "frequency cap" };
      }
    }
  }

  // 5. Daily budget cap — the count is supplied by the caller (0 if absent).
  if (guardrails.maxPerDayPerAgent != null) {
    const sentToday = ctx.sentTodayByAgent ?? 0;
    if (sentToday >= guardrails.maxPerDayPerAgent) {
      return { allow: false, reason: "daily cap" };
    }
  }

  // 6. All brakes satisfied.
  return { allow: true };
}

/** 30 days expressed in minutes — the review-requester per-contact cooldown. */
const THIRTY_DAYS_MINUTES = 60 * 24 * 30; // 43200

/**
 * Sensible default guardrails per skill, used when a deployment hasn't set its
 * own `blueprint.guardrails`.
 *
 * - `review-requester`: capped + quiet-hours'd — a contact isn't re-asked for a
 *   review within 30 days, and never at night.
 * - `speed-to-lead`: time-critical — it MUST fire instantly, even at 3am, and a
 *   fresh lead may legitimately be contacted right after a prior one, so it has
 *   NO quiet hours and NO per-contact gap (only the high daily budget brake).
 * - anything else: `null` (no defaults — the caller decides).
 */
export function defaultGuardrailsForSkill(skill: string): Guardrails | null {
  switch (skill) {
    case "review-requester":
      return {
        enabled: true,
        maxPerDayPerAgent: 200,
        minMinutesBetweenPerContact: THIRTY_DAYS_MINUTES,
        quietHours: { startHour: 21, endHour: 8, tz: "UTC" },
      };
    case "speed-to-lead":
      return {
        enabled: true,
        maxPerDayPerAgent: 500,
      };
    default:
      return null;
  }
}
