// Self-Improving Generator — L5.3 — Task 7: the post-generate-edit diff (PURE).
//
// When an operator opens a freshly-generated agent and FIXES what we generated,
// that edit is the strongest possible training signal — a human telling us the
// generator got it wrong. recordGeneratorEditAction (actions.ts, "use server")
// captures it, but the DECISION of "did anything meaningful change, and how do I
// phrase it as a {pattern,mistake,correction} lesson?" is this pure module's job
// so it's unit-testable with NO server / Brain / Postgres in the loop.
//
// We deliberately diff a SMALL, high-signal slice of the blueprint — the same
// axes the generator actually decides and the judge is allowed to fix:
//   • trigger  — what FIRES the agent (kind/event/channel/cron/delay);
//   • skill    — proxied by whether a custom SKILL.md (`customSkillMd`) is present
//                (we never diff the prose itself — that's the operator's voice,
//                off-limits, exactly as the judge allow-list treats it);
//   • channel  — the trigger's channel axis, called out on its own because a
//                channel swap (sms→email) is a common, legible correction.
// Greeting/FAQ/quote-range/voice tweaks are NOT lessons — they're per-business
// content, not a generator mistake. Keeping the slice tight stops the loop from
// learning noise.
//
// PURE: no I/O, no "use server". Never throws.

import type { AgentBlueprint } from "@/db/schema/agents";
import type { GeneratorLesson } from "@/lib/agents/generate/generator-lessons";

/** A normalized, comparable view of the only blueprint axes an edit-lesson
 *  keys on. Strings so two snapshots compare with `===` and render cleanly into
 *  a lesson's mistake/correction text. */
type EditFeatures = {
  trigger: string;
  channel: string;
  /** "with a custom script" | "without a custom script" — skill-presence proxy. */
  skill: string;
};

/** Is `v` a non-empty (post-trim) string? */
function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/** Stable string form of a trigger for comparison + display. We read the loose
 *  fields generically (the blueprint trigger is a hint, not yet resolved) and
 *  join the ones that matter, so `{kind:"event",event:"booking.completed",
 *  channel:"sms"}` → "event booking.completed sms". A missing/garbage trigger →
 *  "unset". Pure; never throws. */
function triggerToString(trigger: AgentBlueprint["trigger"]): string {
  if (!trigger || typeof trigger !== "object") return "unset";
  const t = trigger as Record<string, unknown>;
  const parts: string[] = [];
  if (isNonEmptyString(t.kind)) parts.push(t.kind.trim());
  if (isNonEmptyString(t.event)) parts.push(t.event.trim());
  if (isNonEmptyString(t.cron)) parts.push(t.cron.trim());
  if (typeof t.delayMinutes === "number" && t.delayMinutes > 0) {
    parts.push(`+${t.delayMinutes}m`);
  }
  return parts.length > 0 ? parts.join(" ") : "unset";
}

/** The trigger's channel axis on its own (so a pure channel swap is legible). */
function channelOf(trigger: AgentBlueprint["trigger"]): string {
  if (!trigger || typeof trigger !== "object") return "unset";
  const ch = (trigger as Record<string, unknown>).channel;
  return isNonEmptyString(ch) ? ch.trim() : "unset";
}

/** Project a blueprint down to the comparable edit-features slice. Pure. */
function featuresOf(bp: AgentBlueprint | null | undefined): EditFeatures {
  const blueprint = bp && typeof bp === "object" ? bp : ({} as AgentBlueprint);
  return {
    trigger: triggerToString(blueprint.trigger),
    channel: channelOf(blueprint.trigger),
    skill: isNonEmptyString(blueprint.customSkillMd)
      ? "with a custom script"
      : "without a custom script",
  };
}

/**
 * Diff the as-generated blueprint (`before`) against what the operator saved
 * (`after`) and return ONE lesson per meaningful change on the
 * trigger / channel / skill-presence axes, or `[]` when nothing meaningful
 * changed.
 *
 * `pattern` is fixed to "post-generate edit" (the spec's key for the
 * operator-correction class of lesson). `mistake` is the BEFORE value, and
 * `correction` is the AFTER value — read straight into recordGeneratorLesson.
 *
 * NOTE: the channel axis is part of the trigger string, so a channel-only change
 * also changes `trigger`. We emit at most one lesson per DISTINCT axis label, and
 * skip the standalone channel lesson when the trigger lesson already captures the
 * same before→after channel pair, so we never double-record the same correction.
 *
 * Pure; never throws.
 */
export function diffEditToLessons(
  before: AgentBlueprint | null | undefined,
  after: AgentBlueprint | null | undefined,
): GeneratorLesson[] {
  const b = featuresOf(before);
  const a = featuresOf(after);
  const lessons: GeneratorLesson[] = [];

  if (b.trigger !== a.trigger) {
    lessons.push({
      pattern: "post-generate edit",
      mistake: `generated trigger ${b.trigger}`,
      correction: `operator set trigger ${a.trigger}`,
    });
  }

  // Standalone channel lesson — only when the channel actually changed AND the
  // trigger lesson above didn't already encode the same swap (it does whenever
  // the channel moved, since channel is part of the trigger string; this guard
  // is belt-and-suspenders for an unset/garbage trigger where it might not).
  if (b.channel !== a.channel && b.trigger === a.trigger) {
    lessons.push({
      pattern: "post-generate edit",
      mistake: `generated channel ${b.channel}`,
      correction: `operator set channel ${a.channel}`,
    });
  }

  if (b.skill !== a.skill) {
    lessons.push({
      pattern: "post-generate edit",
      mistake: `generated ${b.skill}`,
      correction: `operator saved ${a.skill}`,
    });
  }

  return lessons;
}
