// ICP-3 — env-aware wrapper around the pure `selectTurnModel`.
//
// WHY a wrapper: `selectTurnModel` (select-turn-model.ts) is intentionally pure
// and reads NO env so it stays trivially testable. But the two live call sites
// (runtime.ts `executeTurn` and stateless-turn.ts `runStatelessAgentTurn`) both
// need the SAME env-driven behavior:
//
//   - SF_ADAPTIVE_RUNTIME_MODEL === "off"  → kill switch: always the default
//     model, no adaptive selection at all (instant rollback lever).
//   - ANTHROPIC_RUNTIME_PREMIUM_MODEL      → override the premium tier for hard
//     turns (defaults to DEFAULT_PREMIUM_MODEL = "claude-sonnet-4-6").
//
// Centralizing that here means both paths behave identically and the env contract
// lives in one place. This module is NOT "use server" — it exports a sync helper,
// which a "use server" module (runtime.ts) is free to IMPORT (the export
// restriction is on what the "use server" module itself exports, not on what it
// calls).
//
// FAIL-SOFT: this is the highest-stakes path in the product — it runs on every
// live customer message. `resolveTurnModel` therefore wraps everything in
// try/catch and, on ANY error, returns the caller's `defaultModel` unchanged. A
// turn must NEVER break — or silently get more expensive — because of model
// selection. The selector is already never-throws; this wrapper is the
// belt-and-suspenders second layer at the env boundary.

import {
  selectTurnModel,
  DEFAULT_PREMIUM_MODEL,
  type TurnModelSignals,
} from "./select-turn-model";

/** The env kill-switch value that force-disables adaptive selection. */
const ADAPTIVE_OFF = "off";

/**
 * Resolve the model for ONE live turn, honoring the env kill-switch and the
 * env premium-model override, then delegating the hard/easy decision to the pure
 * `selectTurnModel`.
 *
 * @param signals  The in-scope turn signals EXCEPT `premiumModel` (resolved from
 *                 env here) — the caller supplies `defaultModel` (its current
 *                 model) plus whatever hard-signal context it has.
 * @returns        The premium model on a hard turn, else `defaultModel`. On the
 *                 kill-switch or ANY error, `defaultModel` unchanged.
 */
export function resolveTurnModel(
  signals: Omit<TurnModelSignals, "premiumModel">,
): string {
  const defaultModel = signals?.defaultModel;
  try {
    // Kill switch — instant, total rollback to the prior single-model behavior.
    if (process.env.SF_ADAPTIVE_RUNTIME_MODEL?.trim().toLowerCase() === ADAPTIVE_OFF) {
      return defaultModel;
    }

    const premiumModel =
      process.env.ANTHROPIC_RUNTIME_PREMIUM_MODEL?.trim() || DEFAULT_PREMIUM_MODEL;

    return selectTurnModel({ ...signals, premiumModel });
  } catch {
    // Any failure (env access, selector) → the caller's current default model.
    // Never break the live turn; never silently upgrade cost.
    return defaultModel;
  }
}
