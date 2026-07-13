// packages/crm/src/components/landing/record/record-steps.tsx
//
// 3-step how-it-works for record mode (spec §4.2). Server component.

const STEPS = [
  {
    n: "1",
    title: "Record yourself working",
    body: "One normal, successful run — start to finish. Talk out loud: narration is half the signal.",
  },
  {
    n: "2",
    title: "Answer Seldon's questions",
    body: "Seldon shows you what it traced — green, yellow, red — and asks only about what the recording didn't show.",
  },
  {
    n: "3",
    title: "Get your agent",
    body: "Compiled from your real workflow. Testable before it touches anything. Yours to switch on.",
  },
] as const;

export function RecordSteps() {
  return (
    <section aria-label="How it works" className="px-5 py-16 md:px-8 md:py-20">
      <div className="mx-auto grid w-full max-w-[1000px] gap-8 md:grid-cols-3">
        {STEPS.map((s) => (
          <div key={s.n} className="flex flex-col items-start gap-3">
            <span className="flex size-8 items-center justify-center rounded-full bg-[var(--lp-accent-soft)] text-[14px] font-[700] text-[var(--lp-accent)]">
              {s.n}
            </span>
            <h3 className="text-[18px] font-[600] leading-[1.3] text-[var(--lp-ink)]">{s.title}</h3>
            <p className="text-[16px] leading-[1.55] text-[var(--lp-body)]">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
