"use client";

// build-animation/index.tsx
// Thin re-export shim. The actual orchestrator + phases live in
// build-stage-v2.tsx. The wrapper here adapts the BuildAnimation prop
// surface that ClientsNewForm has used since Phase O — keeping the
// external API stable so the form file doesn't need to change shape
// when the v2 design lands.
//
// The v2 stage is full-bleed (fills the parent's calc(100vh-9rem) box
// set on <main> in page.tsx) and theme-aware by inheritance — it reads
// host CSS vars (--background, --card, --border, --foreground, etc.)
// directly off :root / .dark via the cascade. No next-themes coupling.
// The v1 fixed-canvas Stage (720x960 scaled) is gone — see git history
// for the prior implementation if needed.

import type { DetectVerticalInput } from "@/lib/workspace/detect-vertical";
import { BuildStageV2 } from "./build-stage-v2";

export type BuildAnimationProps = {
  /** Whether the build animation is currently active (parent fades it in
   *  after submit, keeps it mounted until close). */
  active: boolean;
  /** The original form input that triggered the build. Drives Stage A
   *  vertical detection + mock copy. */
  input: DetectVerticalInput | null;
  /** Live EventSource feeding the orchestrator. Optional — the animation
   *  runs on its own timeline if SSE isn't attached yet (e.g., during
   *  fade-out after success). */
  eventSource?: EventSource | null;
  /** URLs surfaced on the REVEAL phase's CTAs after the orchestrator's
   *  `done` event fires. Open = the freshly-built workspace dashboard.
   *  Share = the public landing the operator can hand to the client.
   *  Null until `done` arrives — the buttons render in a disabled-looking
   *  state until then so the visual moment still lands. */
  revealLinks?: { open: string; share?: string | null } | null;
  /** Optional total build duration (seconds) the phase clock + footer stat
   *  scale to. Passed straight through to BuildStageV2 — omitting it (every
   *  call site except /try) preserves the original 60s pacing. */
  totalS?: number;
};

export function BuildAnimation({ active, input, eventSource, revealLinks, totalS }: BuildAnimationProps) {
  return (
    <BuildStageV2
      active={active}
      input={input}
      eventSource={eventSource ?? null}
      revealLinks={revealLinks ?? null}
      totalS={totalS}
    />
  );
}
