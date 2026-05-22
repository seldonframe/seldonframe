"use client";

// build-animation/index.tsx
// Thin re-export shim. The actual orchestrator + phases live in
// build-stage-v2.tsx. The wrapper here adapts the BuildAnimation prop
// surface that ClientsNewForm has used since Phase O — keeping the
// external API stable so the form file doesn't need to change shape
// when the v2 design lands.
//
// The v2 stage is full-bleed (fills the parent's calc(100vh-9rem) box
// set on <main> in page.tsx) and theme-aware (reads next-themes). The
// v1 fixed-canvas Stage (720x960 scaled) is gone — see git history for
// the prior implementation if needed.

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
};

export function BuildAnimation({ active, input, eventSource }: BuildAnimationProps) {
  return (
    <BuildStageV2 active={active} input={input} eventSource={eventSource ?? null} />
  );
}
