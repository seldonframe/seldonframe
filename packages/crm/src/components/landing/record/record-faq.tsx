// packages/crm/src/components/landing/record/record-faq.tsx
//
// FAQ section for record mode (Task 8): mirrors marketing-faq-section.tsx's
// visual/disclosure structure, but token-native (renders correctly in the
// dark record theme) and with record-specific, truth-passed copy — no
// dark-flag features promised.
//
// JSON-LD: `withSchema` gates a single FAQPage <script>, built by mapping
// this same FAQS array (never duplicate strings). Default is NO schema —
// the build-mode page already embeds its own FAQPage schema via
// LandingMarketingFaqSection, and emitting two FAQPage graphs on the same
// URL would confuse Google rich results.

type FaqItem = { question: string; answer: string };

const FAQS: readonly FaqItem[] = [
  {
    question: "Are my recordings private?",
    answer:
      "Yes. Recordings stay private — they train your agent only. They're never published, never shared to the marketplace, and you can start fresh at any time.",
  },
  {
    question: "What kinds of work compile well?",
    answer:
      "Repeatable computer work with a clear start and finish: quoting, intake triage, moving data between tools, follow-up emails. If you can screen-record one clean run of it, Seldon can trace it.",
  },
  {
    question: "Do I have to narrate?",
    answer:
      "You don't have to, but it helps a lot — narration is half the signal. Seldon asks about anything the recording didn't show.",
  },
  {
    question: "How do I know the agent got it right?",
    answer:
      "You see the traced plan before anything runs: green for covered, yellow for assumed, red for missing. Seldon interviews you about the gaps, and you test the compiled agent before switching it on.",
  },
  {
    question: "How many recordings do I need?",
    answer:
      "One normal, successful run is enough to start. Add more recordings to teach edge cases — Seldon merges them into one model of the job.",
  },
  {
    question: "What does it cost?",
    answer:
      "Recording, compiling, and testing are free — no signup to start. It's $29/mo when you switch your agent on. Cancel anytime.",
  },
];

function buildFaqSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
}

export function RecordFaq({ withSchema = false }: { withSchema?: boolean }) {
  return (
    <section
      id="record-faq"
      aria-labelledby="record-faq-heading"
      className="border-t border-[var(--lp-border-soft)] bg-[var(--lp-bg)] px-5 py-20 md:px-8 md:py-28 lg:px-12"
    >
      <div className="mx-auto max-w-[760px]">
        {/* Section head */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center gap-2.5 text-[12px] font-[600] uppercase tracking-[0.09em] text-[var(--lp-accent)]">
            <span className="h-px w-4 bg-[var(--lp-accent)] opacity-50" aria-hidden />
            FAQ
            <span className="h-px w-4 bg-[var(--lp-accent)] opacity-50" aria-hidden />
          </div>
          <h2
            id="record-faq-heading"
            className="mt-3.5 text-[clamp(27px,4.2vw,42px)] font-[500] leading-[1.08] tracking-[-0.025em] text-[var(--lp-ink)]"
          >
            Honest answers.
          </h2>
        </div>

        {/* FAQ items — stacked details cards */}
        <div className="mt-10 border-t border-[var(--lp-border)]">
          {FAQS.map((faq) => (
            <details key={faq.question} className="group border-b border-[var(--lp-border)]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-[17px] font-[500] leading-tight tracking-[-0.01em] text-[var(--lp-ink)] [&::-webkit-details-marker]:hidden">
                <span>{faq.question}</span>
                <span
                  aria-hidden
                  className="relative flex size-[22px] shrink-0 transition-transform duration-[300ms] group-open:rotate-[135deg]"
                >
                  {/* + icon — two bars */}
                  <span className="absolute left-1/2 top-[3px] bottom-[3px] w-[2px] -translate-x-1/2 rounded-sm bg-[var(--lp-accent)]" />
                  <span className="absolute top-1/2 left-[3px] right-[3px] h-[2px] -translate-y-1/2 rounded-sm bg-[var(--lp-accent)]" />
                </span>
              </summary>
              <p className="pb-6 pr-10 text-[16px] leading-[1.55] text-[var(--lp-body)] max-w-[66ch]">
                {faq.answer}
              </p>
            </details>
          ))}
        </div>
      </div>

      {withSchema ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(buildFaqSchema()) }}
        />
      ) : null}
    </section>
  );
}
