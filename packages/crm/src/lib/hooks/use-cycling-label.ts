"use client";

// packages/crm/src/lib/hooks/use-cycling-label.ts
//
// Polish #4: when a long-running async action is in flight, cycle a status
// label through a short list of LLM-style words instead of showing one
// frozen string. The cycling makes the wait feel alive — the user sees the
// system "thinking…", "searching…", "editing…", "applying…" in sequence
// instead of a frozen "Applying..." that gives no signal whether the call
// has hung.
//
// Used by the landing editor (edit-shell.tsx) for the customize_landing
// flow. Generic enough to reuse elsewhere (e.g., proposal generation,
// agent eval runs) — just pass your own word list.

import { useEffect, useRef, useState } from "react";

// Default word list for landing-editor apply. Exported so tests can
// assert the exact order — reordering changes the perceived UX flow
// (think → search → edit → apply) and should be a deliberate design
// decision, not an accidental rename.
export const LANDING_LOADING_WORDS = [
  "thinking…",
  "searching…",
  "editing…",
  "applying…",
] as const;

// Pure cycle-math helper. Given a word list and a tick index (0, 1, 2, …),
// return the corresponding word. Wraps modularly so any positive index
// (including very large ones for long-running calls) lands on a real word
// without crashing. Empty-array case returns "" defensively so a caller
// who passes a bad list sees a blank label, not a crash.
//
// Exported separately from the hook so the cycling math can be unit-tested
// as a pure function — no React, no DOM, no fake timers needed.
export function cyclingLabelAt(words: readonly string[], index: number): string {
  if (words.length === 0) return "";
  // JS modulo on negatives is sign-preserving; clamp to non-negative just
  // in case a caller passes a negative tick. Floor to integer in case a
  // float slips through.
  const safe = Math.max(0, Math.floor(index));
  return words[safe % words.length] ?? "";
}

// Hook: while `active` is true, cycle through `words` at `intervalMs`.
// Returns the current label. When `active` flips to false, the hook
// stops the timer and resets the index to 0, so the next time it
// activates the user sees the first word ("thinking…"), not whatever
// label happened to be showing when the previous cycle ended.
//
// Contract notes:
//   • Initial label when active first becomes true is words[0]
//     (the "thinking…" entry for the landing-loading list).
//   • The interval increments the index every `intervalMs`. The first
//     transition (words[0] → words[1]) happens at t=intervalMs, not t=0.
//   • When `active` becomes false, the timer is cleared and the
//     internal index resets to 0. There's no leak — the cleanup runs
//     on every deactivation and on unmount.
//   • If the caller's `words` array reference changes mid-flight, the
//     effect re-runs cleanly (timer is cleared and restarted). In
//     practice the caller should pass a stable reference (module-level
//     constant) to avoid unnecessary timer churn.
export function useCyclingLabel(
  active: boolean,
  words: readonly string[],
  intervalMs: number,
): string {
  // The visible label is whatever cyclingLabelAt returns for `tick`.
  // We need a state setter to trigger re-renders, but we also need to
  // read the latest tick without re-creating the interval on every
  // render — hence the ref + state pairing. The ref is the source of
  // truth; setState mirrors it just to nudge React.
  const tickRef = useRef(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!active) {
      // Deactivating: the *next* activation re-enters this effect with
      // active=true and resets tickRef.current to 0 below. We avoid
      // calling setState here — that would cascade a render on every
      // deactivation purely to write a value the next activation will
      // overwrite anyway. (eslint-plugin-react-compiler flags setState
      // in an effect as a perf smell; this avoids it.)
      return;
    }

    // Activating: start the cycle at index 0 (the spec requires the
    // first label shown to be "thinking…", not whatever happened to be
    // showing when the previous cycle ended). We seed both the ref
    // (which the interval increments) and the state (which the render
    // reads) so the initial render of the active state sees index 0.
    // The synchronous setState here is intentional — it's the canonical
    // pattern for "reset derived state on a prop change", which the
    // react-hooks lint rule conservatively flags. The render returns
    // cyclingLabelAt(words, active ? tick : 0) below, so we already
    // tolerate the inactive→active edge without an extra render. But
    // the explicit setTick(0) keeps the render-time fall-through and
    // the interval-driven path symmetric, which is easier to reason
    // about than relying on the `active ? tick : 0` ternary alone.
    tickRef.current = 0;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: reset cycle index on activation
    setTick(0);

    const id = setInterval(() => {
      tickRef.current += 1;
      setTick(tickRef.current);
    }, intervalMs);

    return () => {
      clearInterval(id);
    };
  }, [active, words, intervalMs]);

  // When inactive, the displayed label is words[0] — same as the
  // initial activation moment. This keeps the surface consistent
  // (a non-empty word visible the moment active flips true, no flash
  // of empty string).
  return cyclingLabelAt(words, active ? tick : 0);
}
