// ICP-3 / Outbound-UX F5 — pure helpers for the editor's "Guardrails & quality"
// card. Lives OUTSIDE editor-client.tsx (NOT "use client") so it can be imported
// by the editor AND by a node:test spec without pulling React / Next directives /
// the "use server" action chain — exactly the split schema.ts uses for the patch
// allow-list. All functions here are pure (no React, no DOM, no I/O), so they're
// unit-testable in isolation (guardrails-fields.spec.ts).
//
// The card lets a builder OVERRIDE the per-skill smart defaults for the L3
// guardrails (the brakes) and the L2 verify rubric (the quality gate). The
// contract with the runtime: an UNSET blueprint.guardrails/verify means "use the
// smart default" (defaultGuardrailsForSkill / defaultRubricForSkill apply, and
// stay fresh). So when the builder keeps "Use smart defaults" ON we must OMIT the
// key (or send `null` to CLEAR a prior override) — never write an empty/partial
// object that would shadow the default. buildGuardrailsVerifyPatch encodes exactly
// that fields→patch mapping.

import {
  defaultGuardrailsForSkill,
  type Guardrails,
} from "@/lib/agents/guardrails/agent-guardrails";
import { defaultRubricForSkill } from "@/lib/agents/verify/default-rubrics";
import type { VerifyRubric } from "@/lib/agents/verify/agent-verify";

/** Map a template's trigger event to the outbound SKILL whose smart defaults the
 *  hints describe — mirrors run-event-agent-deps.ts `skillForEvent`. Returns null
 *  for non-outbound/unknown events (no per-skill default exists), so the card
 *  honestly shows "no smart default for this agent". */
export function skillForTriggerEvent(event: string): string | null {
  switch (event) {
    case "booking.completed":
      return "review-requester";
    case "lead.created":
      return "speed-to-lead";
    default:
      return null;
  }
}

/** The editable guardrail field buffer (strings for the number inputs, coerced on
 *  build — mirrors the FAQ/quote-range string-input UX, avoids NaN churn). */
export type GuardrailFields = {
  enabled: boolean;
  maxPerDay: string;
  /** Hours between messages to the same contact (stored ×60 as minutes). */
  minHoursBetween: string;
  quietStartHour: string;
  quietEndHour: string;
  quietTz: string;
};

/** The editable verify field buffer: a list of "must include" texts + one max
 *  length. The two highest-value check kinds (we don't expose every kind). */
export type VerifyFields = {
  mustInclude: string[];
  maxLength: string;
};

/** Parse an optional positive-int field; "" / invalid → undefined (omit it). */
function parsePositiveInt(raw: string): number | undefined {
  const n = Number(raw.trim());
  return Number.isFinite(n) && n > 0 && Number.isInteger(n) ? n : undefined;
}

/** Parse an hour field (0–23); out-of-range/invalid → undefined. */
function parseHour(raw: string): number | undefined {
  const n = Number(raw.trim());
  return Number.isFinite(n) && Number.isInteger(n) && n >= 0 && n <= 23
    ? n
    : undefined;
}

/**
 * Build the {guardrails?, verify?} blueprint patch from the two toggles + field
 * buffers. The omit/clear contract:
 *  - defaults ON  → the field is set to `null` (clear any stored override so the
 *    runtime per-skill default applies) — UNLESS it was already unset on the
 *    blueprint, in which case the key is OMITTED entirely (no needless write).
 *  - defaults OFF → the field carries the constructed override object.
 *
 * `hadGuardrails` / `hadVerify` tell the builder whether the loaded blueprint
 * already carried an override, so a defaults-ON save only emits the `null` clear
 * when there is actually something to clear (keeps blank/defaults-on from writing
 * an empty object, per the F5 spec).
 */
export function buildGuardrailsVerifyPatch(input: {
  guardrailsDefaultsOn: boolean;
  verifyDefaultsOn: boolean;
  guardrails: GuardrailFields;
  verify: VerifyFields;
  hadGuardrails: boolean;
  hadVerify: boolean;
}): { guardrails?: Guardrails | null; verify?: VerifyRubric | null } {
  const patch: { guardrails?: Guardrails | null; verify?: VerifyRubric | null } =
    {};

  // ── guardrails ──
  if (input.guardrailsDefaultsOn) {
    // Clear a prior override so the smart default reapplies; omit if nothing saved.
    if (input.hadGuardrails) patch.guardrails = null;
  } else {
    const g: Guardrails = { enabled: input.guardrails.enabled };
    const maxPerDay = parsePositiveInt(input.guardrails.maxPerDay);
    if (maxPerDay !== undefined) g.maxPerDayPerAgent = maxPerDay;
    const hours = Number(input.guardrails.minHoursBetween.trim());
    if (Number.isFinite(hours) && hours > 0) {
      g.minMinutesBetweenPerContact = Math.round(hours * 60);
    }
    const startHour = parseHour(input.guardrails.quietStartHour);
    const endHour = parseHour(input.guardrails.quietEndHour);
    const tz = input.guardrails.quietTz.trim();
    // Only attach quiet hours when BOTH bounds parse and a tz is present, and the
    // window isn't degenerate (start === end blocks nothing — drop it).
    if (
      startHour !== undefined &&
      endHour !== undefined &&
      tz &&
      startHour !== endHour
    ) {
      g.quietHours = { startHour, endHour, tz };
    }
    patch.guardrails = g;
  }

  // ── verify (quality checks) ──
  if (input.verifyDefaultsOn) {
    if (input.hadVerify) patch.verify = null;
  } else {
    const checks: VerifyRubric["checks"] = [];
    for (const raw of input.verify.mustInclude) {
      const value = raw.trim();
      if (value) checks.push({ kind: "must_include", value });
    }
    const maxLength = parsePositiveInt(input.verify.maxLength);
    if (maxLength !== undefined) checks.push({ kind: "max_length", max: maxLength });
    patch.verify = { checks };
  }

  return patch;
}

/** Seed the guardrail field buffer from a saved override (or blanks when unset). */
export function guardrailFieldsFrom(g: Guardrails | null): GuardrailFields {
  return {
    enabled: g?.enabled !== false, // default ON (undefined ⇒ enabled)
    maxPerDay: g?.maxPerDayPerAgent != null ? String(g.maxPerDayPerAgent) : "",
    minHoursBetween:
      g?.minMinutesBetweenPerContact != null
        ? String(g.minMinutesBetweenPerContact / 60)
        : "",
    quietStartHour: g?.quietHours ? String(g.quietHours.startHour) : "",
    quietEndHour: g?.quietHours ? String(g.quietHours.endHour) : "",
    quietTz: g?.quietHours?.tz ?? "",
  };
}

/** Seed the verify field buffer from a saved rubric (or blanks when unset). */
export function verifyFieldsFrom(v: VerifyRubric | null): VerifyFields {
  const mustInclude: string[] = [];
  let maxLength = "";
  for (const check of v?.checks ?? []) {
    if (check.kind === "must_include" && typeof check.value === "string") {
      mustInclude.push(check.value);
    } else if (check.kind === "max_length" && typeof check.max === "number") {
      maxLength = String(check.max);
    }
  }
  return { mustInclude, maxLength };
}

// ─── hint formatting (display-only, pure) ────────────────────────────────────

/** Human-readable summary of a skill's default guardrails, for the hint. Returns
 *  null when the skill has no per-skill default (→ "no smart default"). */
export function describeGuardrailsDefault(skill: string | null): string | null {
  const g = skill ? defaultGuardrailsForSkill(skill) : null;
  if (!g) return null;
  const parts: string[] = [];
  if (g.maxPerDayPerAgent != null) parts.push(`max ${g.maxPerDayPerAgent}/day`);
  if (g.quietHours) {
    parts.push(
      `no messages ${formatHour(g.quietHours.startHour)}–${formatHour(
        g.quietHours.endHour,
      )}`,
    );
  }
  if (g.minMinutesBetweenPerContact != null) {
    parts.push(`one per contact / ${formatGap(g.minMinutesBetweenPerContact)}`);
  }
  if (g.enabled === false) parts.push("disabled");
  return parts.length > 0 ? parts.join(", ") : null;
}

/** Human-readable summary of a skill's default verify rubric, for the hint. */
export function describeVerifyDefault(
  skill: string | null,
  channel: string,
): string | null {
  const ch = channel === "email" ? "email" : channel === "sms" ? "sms" : null;
  const rubric = skill ? defaultRubricForSkill(skill, { channel: ch }) : null;
  if (!rubric || rubric.checks.length === 0) return null;
  const parts: string[] = [];
  for (const check of rubric.checks) {
    if (check.kind === "must_include") {
      parts.push(`must include ${check.label ?? `"${check.value}"`}`);
    } else if (check.kind === "must_include_any") {
      parts.push(`must include ${check.label ?? "one of a set"}`);
    } else if (check.kind === "max_length") {
      parts.push(`≤${check.max} chars`);
    } else if (check.kind === "min_length") {
      parts.push("non-empty");
    } else if (check.kind === "must_not_include") {
      parts.push(`no ${check.label ?? `"${check.value}"`}`);
    }
  }
  return parts.length > 0 ? parts.join(", ") : null;
}

/** Format an hour (0–23) as a friendly clock label, e.g. 21 → "9pm", 8 → "8am". */
export function formatHour(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  if (h === 0) return "12am";
  if (h === 12) return "12pm";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

/** Format a minutes gap as a friendly span (e.g. 43200 → "30 days", 60 → "1 hour"). */
export function formatGap(minutes: number): string {
  const days = minutes / (60 * 24);
  if (Number.isInteger(days) && days >= 1)
    return `${days} day${days === 1 ? "" : "s"}`;
  const hours = minutes / 60;
  if (Number.isInteger(hours) && hours >= 1)
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${minutes} min`;
}
