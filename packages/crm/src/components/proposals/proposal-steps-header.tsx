"use client";
// packages/crm/src/components/proposals/proposal-steps-header.tsx

import { useEffect, useState } from "react";

export const PROPOSAL_STEPS = [
  { id: "step-setup", label: "Setup", num: 1 },
  { id: "step-pricing", label: "Pricing", num: 2 },
  { id: "step-customize", label: "Customize", num: 3 },
  { id: "step-review", label: "Review", num: 4 },
  { id: "step-send", label: "Send & track", num: 5 },
] as const;

export type ProposalStepId = (typeof PROPOSAL_STEPS)[number]["id"];

export function ProposalStepsHeader({
  brandColor,
  mode,
  fixedActiveStep,
  visitedSteps,
}: {
  brandColor: string;
  /** "scroll" = active step derived from scroll position (used on /proposals/new
   *  where steps 1-3 are scrollable sections). "fixed" = active step provided
   *  by parent (used on /proposals/[id] where the active step depends on
   *  proposal.status, not scroll position). */
  mode: "scroll" | "fixed";
  /** Required when mode="fixed". The step id that should render as active. */
  fixedActiveStep?: ProposalStepId;
  /** Step ids that are considered visited (rendered with checkmark). When
   *  omitted, only steps with lower num than active are visited. */
  visitedSteps?: ProposalStepId[];
}) {
  const [scrollActive, setScrollActive] = useState<ProposalStepId>("step-setup");

  useEffect(() => {
    if (mode !== "scroll") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setScrollActive(visible.target.id as ProposalStepId);
      },
      { rootMargin: "-30% 0px -50% 0px", threshold: [0, 0.5, 1] },
    );
    PROPOSAL_STEPS.slice(0, 3).forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [mode]);

  const activeStep =
    mode === "fixed" ? fixedActiveStep ?? "step-setup" : scrollActive;
  const activeIdx = PROPOSAL_STEPS.findIndex((s) => s.id === activeStep);

  function handleClick(id: ProposalStepId) {
    if (mode !== "scroll") return; // page-state mode: not clickable
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function isVisited(idx: number, id: ProposalStepId) {
    if (visitedSteps && visitedSteps.length > 0) {
      return visitedSteps.includes(id);
    }
    return idx < activeIdx;
  }

  return (
    <div className="sticky top-0 z-10 -mx-3 sm:-mx-4 md:-mx-6 px-3 sm:px-4 md:px-6 py-3 bg-background/95 backdrop-blur-sm border-b border-border/50">
      <ol className="flex items-center gap-2 overflow-x-auto">
        {PROPOSAL_STEPS.map((step, idx) => {
          const active = step.id === activeStep;
          const visited = isVisited(idx, step.id);
          const clickable = mode === "scroll" && idx <= 2;
          return (
            <li key={step.id} className="flex items-center gap-2 min-w-0 shrink-0">
              <button
                type="button"
                onClick={() => handleClick(step.id)}
                disabled={!clickable}
                className="flex items-center gap-2 group focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md px-1 disabled:cursor-default"
              >
                <span
                  className="flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold border-2 transition-all"
                  style={{
                    backgroundColor: active
                      ? brandColor
                      : visited
                      ? `${brandColor}20`
                      : "transparent",
                    borderColor: active || visited ? brandColor : "var(--border)",
                    color: active ? "white" : visited ? brandColor : "var(--muted-foreground)",
                  }}
                >
                  {visited ? "✓" : step.num}
                </span>
                <span
                  className="text-sm font-medium hidden sm:inline transition-colors"
                  style={{
                    color: active
                      ? "var(--foreground)"
                      : visited
                      ? "var(--foreground)"
                      : "var(--muted-foreground)",
                  }}
                >
                  {step.label}
                </span>
              </button>
              {idx < PROPOSAL_STEPS.length - 1 && (
                <span
                  className="h-px w-4 sm:w-8 shrink-0 transition-colors"
                  style={{
                    backgroundColor: visited || (active && idx < activeIdx) ? brandColor : "var(--border)",
                  }}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
