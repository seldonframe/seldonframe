"use client";
// packages/crm/src/app/(dashboard)/proposals/new/proposal-steps-header.tsx

import { useEffect, useState } from "react";

const STEPS = [
  { id: "step-setup", label: "Setup", num: 1 },
  { id: "step-pricing", label: "Pricing", num: 2 },
  { id: "step-customize", label: "Customize", num: 3 },
  { id: "step-save", label: "Save & review", num: 4 },
];

export function ProposalStepsHeader({ brandColor }: { brandColor: string }) {
  const [activeStep, setActiveStep] = useState("step-setup");

  // Use IntersectionObserver to detect which step section is centered in viewport.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActiveStep(visible.target.id);
      },
      { rootMargin: "-30% 0px -50% 0px", threshold: [0, 0.5, 1] },
    );
    STEPS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  function handleClick(id: string) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="sticky top-0 z-10 -mx-3 sm:-mx-4 md:-mx-6 px-3 sm:px-4 md:px-6 py-3 bg-background/95 backdrop-blur-sm border-b border-border/50">
      <ol className="flex items-center gap-2">
        {STEPS.map((step, idx) => {
          const active = step.id === activeStep;
          const visited =
            STEPS.findIndex((s) => s.id === activeStep) > idx;
          return (
            <li key={step.id} className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => handleClick(step.id)}
                className="flex items-center gap-2 group focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md px-1"
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
              {idx < STEPS.length - 1 && (
                <span
                  className="h-px w-4 sm:w-8 transition-colors"
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
