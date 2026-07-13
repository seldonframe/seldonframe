// packages/crm/src/app/(public)/record/record-ui/step-strip.tsx
//
// The 3-step onboarding strip under the hero ("Record" → "Answer" →
// "Get your agent"). Pure presentation, driven by recorder-machine.ts's
// currentStep(state) selector — no state of its own.
"use client";

type Step = {
  n: 1 | 2 | 3;
  title: string;
  sub: string;
};

const STEPS: Step[] = [
  { n: 1, title: "Record yourself working", sub: "Talk out loud — narration is half the signal." },
  { n: 2, title: "Answer Seldon's questions", sub: "It asks only what the recording didn't show." },
  { n: 3, title: "Get your agent", sub: "Compiled, testable, yours to switch on." },
];

export function StepStrip({ current }: { current: 1 | 2 | 3 }) {
  return (
    <div className="mt-8 flex flex-wrap gap-x-9 gap-y-5">
      {STEPS.map((step) => {
        const isDone = step.n < current;
        const isCurrent = step.n === current;
        return (
          <div key={step.n} className="flex min-w-[200px] flex-1 items-start gap-3">
            <div
              className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border text-[13px] font-[600] tabular-nums"
              style={{
                background: isDone ? "var(--lp-accent)" : isCurrent ? "rgba(20,184,166,.14)" : "transparent",
                color: isDone ? "var(--lp-on-accent)" : isCurrent ? "var(--lp-accent-strong)" : "var(--lp-muted)",
                borderColor: isDone ? "var(--lp-accent)" : isCurrent ? "rgba(20,184,166,.5)" : "var(--lp-border)",
              }}
            >
              {isDone ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              ) : (
                <span>{step.n}</span>
              )}
            </div>
            <div>
              <p
                className="text-[13.5px] font-[600]"
                style={{ color: isCurrent || isDone ? "var(--lp-ink)" : "var(--lp-muted)" }}
              >
                {step.title}
              </p>
              <p className="mt-0.5 max-w-[220px] text-[13.5px] leading-[1.55]" style={{ color: "var(--lp-body)" }}>
                {step.sub}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
