"use client";
// packages/crm/src/components/proposals/proposal-steps-header.tsx
//
// 2026-05-21 — Four-step wizard stepper. /proposals/new is a focused wizard
// (Client → Pricing → Customize → Review & send). /proposals/[id] renders
// with activeStep="step-review" so the stepper shows the full flow.

export const PROPOSAL_STEPS = [
  { id: "step-client", label: "Client", num: 1 },
  { id: "step-pricing", label: "Pricing", num: 2 },
  { id: "step-customize", label: "Customize", num: 3 },
  { id: "step-review", label: "Review & send", num: 4 },
] as const;

export type ProposalStepId = (typeof PROPOSAL_STEPS)[number]["id"];

export function ProposalStepsHeader({
  brandColor,
  activeStep,
  visitedSteps,
}: {
  brandColor: string;
  /** The step the user is currently on. */
  activeStep: ProposalStepId;
  /** Steps the user has completed (rendered with checkmark). When omitted,
   *  steps with lower num than active are auto-marked as visited. */
  visitedSteps?: ProposalStepId[];
}) {
  const activeIdx = PROPOSAL_STEPS.findIndex((s) => s.id === activeStep);

  function isVisited(idx: number, id: ProposalStepId) {
    if (visitedSteps && visitedSteps.length > 0) {
      return visitedSteps.includes(id);
    }
    return idx < activeIdx;
  }

  return (
    <div className="sticky top-0 z-10 py-4 bg-background/95 backdrop-blur-sm border-b border-border/50">
      <ol className="flex items-center justify-center gap-3 sm:gap-6 px-2 sm:px-4 max-w-xl mx-auto">
        {PROPOSAL_STEPS.map((step, idx) => {
          const active = step.id === activeStep;
          const visited = isVisited(idx, step.id);
          return (
            <li key={step.id} className="flex items-center gap-3 shrink-0">
              <div className="flex items-center gap-2">
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
                  className="text-sm font-medium transition-colors"
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
              </div>
              {idx < PROPOSAL_STEPS.length - 1 && (
                <span
                  className="h-px w-12 sm:w-20 transition-colors"
                  style={{
                    backgroundColor: visited ? brandColor : "var(--border)",
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
