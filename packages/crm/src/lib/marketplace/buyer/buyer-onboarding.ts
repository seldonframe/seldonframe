// Marketplace buyer onboarding — the PURE step helpers (no DB, no I/O).
//
// The buyer's wizard writes existing per-deployment config (business info,
// services, booking hours) and, at the end, flips the deployment live. Two bits
// of that logic are pure and worth testing in isolation:
//
//   1. validateBusinessInfo — the business_info form's client/server validation
//      (a name is required; services are normalized; a single open/close window
//      maps to the structured per-day booking hours the booking engine reads).
//   2. goLiveBlockers       — what (if anything) blocks "Go live": the REQUIRED
//      onboarding steps the buyer hasn't completed yet. Go-live is gated only on
//      these true blockers (per the plan), never on skippable steps.
//
// Both are pure so the wizard, the server actions, and the unit tests share one
// implementation. Shape-tolerant at the edges (form values + jsonb progress).

import type { DayWindow } from "@/lib/agents/booking/booking-policy";
import type { OnboardingStep } from "@/lib/marketplace/onboarding/steps";
import {
  firstIncompleteStep,
  type OnboardingProgress,
} from "@/lib/marketplace/onboarding/progress";

// ─── business_info validation ────────────────────────────────────────────────

/** One service line the buyer enters (name + optional price string). */
export type BusinessInfoServiceInput = { name: string; price?: string };

/** The raw business_info form values (all strings off inputs). */
export type BusinessInfoInput = {
  name: string;
  whatYouDo?: string;
  services?: BusinessInfoServiceInput[];
  /** Open time as an HH:MM 24h string (e.g. "08:00"). */
  hoursOpen?: string;
  /** Close time as an HH:MM 24h string (e.g. "18:00"). */
  hoursClose?: string;
};

export type ValidatedBusinessInfo = {
  /** The trimmed business name (required). */
  name: string;
  /** What the business does (trimmed; empty → undefined). */
  whatYouDo?: string;
  /** Cleaned, non-empty service lines (blank rows dropped, fields trimmed). */
  services: { name: string; price?: string }[];
  /** A human-readable hours string for `businessInfo.hours` (the persona facts),
   *  e.g. "8:00 AM – 6:00 PM". Undefined when no window was entered. */
  hoursText?: string;
  /** The structured Mon–Fri window for `bookingPolicy.hours` (weekday 1..5 →
   *  {start,end}), or undefined when no/invalid window. The booking engine reads
   *  THIS; the text above is only for what the agent tells callers. */
  bookingHours?: Partial<Record<number, DayWindow>>;
};

export type ValidateBusinessInfoResult =
  | { ok: true; value: ValidatedBusinessInfo }
  | { ok: false; error: "name_required" | "invalid_hours" };

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "08:00" → "8:00 AM"; "18:00" → "6:00 PM". Returns null for a malformed value. */
function hhmmToDisplay(hhmm: string): string | null {
  if (!HHMM_RE.test(hhmm)) return null;
  const [hStr, mStr] = hhmm.split(":");
  const h = Number(hStr);
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr} ${period}`;
}

/**
 * Validate + normalize the business_info form. Pure.
 *
 *   - `name` is REQUIRED (trimmed, non-empty) — it's what the agent calls the
 *     business; a blank name is the one hard error.
 *   - `services` blank rows are dropped, fields trimmed; a row with a name but no
 *     price keeps an undefined price.
 *   - hours: when BOTH open + close are present they must be valid HH:MM with
 *     close > open (`invalid_hours` otherwise); they then produce both a
 *     human `hoursText` (for the persona facts) and a structured Mon–Fri
 *     `bookingHours` map (for the booking engine). When neither is present, hours
 *     are simply omitted (not an error — the buyer can set them later).
 */
export function validateBusinessInfo(
  input: BusinessInfoInput,
): ValidateBusinessInfoResult {
  const name = (input?.name ?? "").trim();
  if (!name) return { ok: false, error: "name_required" };

  const whatYouDoRaw = (input?.whatYouDo ?? "").trim();
  const whatYouDo = whatYouDoRaw || undefined;

  const services: { name: string; price?: string }[] = [];
  for (const s of input?.services ?? []) {
    const sName = (s?.name ?? "").trim();
    if (!sName) continue; // drop blank rows
    const price = (s?.price ?? "").trim();
    services.push(price ? { name: sName, price } : { name: sName });
  }

  // Hours: only validate when at least one bound is provided. Both-or-neither.
  const open = (input?.hoursOpen ?? "").trim();
  const close = (input?.hoursClose ?? "").trim();
  let hoursText: string | undefined;
  let bookingHours: Partial<Record<number, DayWindow>> | undefined;

  if (open || close) {
    const openDisp = open ? hhmmToDisplay(open) : null;
    const closeDisp = close ? hhmmToDisplay(close) : null;
    // Need both, valid, and close strictly after open.
    if (!openDisp || !closeDisp || close <= open) {
      return { ok: false, error: "invalid_hours" };
    }
    hoursText = `${openDisp} – ${closeDisp}`;
    const window: DayWindow = { start: open, end: close };
    bookingHours = {};
    for (let day = 1; day <= 5; day++) bookingHours[day] = window; // Mon..Fri
  }

  return { ok: true, value: { name, whatYouDo, services, hoursText, bookingHours } };
}

// ─── go-live blocker check ───────────────────────────────────────────────────

/** A required onboarding step the buyer still has to finish before going live. */
export type GoLiveBlocker = { kind: OnboardingStep["kind"]; label: string };

/**
 * Compute what blocks "Go live": every REQUIRED step (except `go_live` itself)
 * whose kind isn't in the saved progress. Skippable steps (connectors, the test/
 * preview step) never block. Pure.
 *
 * Returns an empty array when the buyer is clear to go live. The wizard disables
 * the Go-live button + lists these when non-empty; the server action refuses with
 * them so a buyer can never activate a half-configured agent.
 */
export function goLiveBlockers(
  steps: OnboardingStep[],
  progress: OnboardingProgress | null | undefined,
): GoLiveBlocker[] {
  const done = new Set((progress?.doneKinds ?? []).filter(Boolean));
  const blockers: GoLiveBlocker[] = [];
  for (const step of steps) {
    if (step.kind === "go_live") continue; // the act of going live, not a prereq
    if (step.required && !done.has(step.kind)) {
      blockers.push({ kind: step.kind, label: step.label });
    }
  }
  return blockers;
}

/** Convenience: is the buyer clear to go live? (no required step outstanding). */
export function canGoLive(
  steps: OnboardingStep[],
  progress: OnboardingProgress | null | undefined,
): boolean {
  return goLiveBlockers(steps, progress).length === 0;
}

/** Re-export so the wizard can resolve its resume point from one import. */
export { firstIncompleteStep };
