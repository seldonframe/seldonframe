// packages/crm/src/components/landing/marketing-faq-section.tsx
//
// Redesign 2026-06-18 — warm light aesthetic.
// FAQ section. Paper background, stacked <details> cards with
// SeldonFrame green plus/minus icon. FAQPage JSON-LD preserved.
//
// Copy updated to reflect new pricing tiers (Builder/Workspace/Agency)
// while keeping the same factual content.

type FaqItem = { question: string; answer: string };

// Updated to reflect the new 3-tier pricing (Builder/Workspace/Agency).
// The FAQPage JSON-LD schema reads from the same const so answers
// cannot drift between visible text and structured data.
const FAQS: readonly FaqItem[] = [
  {
    question: "Who is SeldonFrame for?",
    answer:
      "Two audiences: SMBs who want a complete AI front office (website, booking, chatbot, CRM) for their own business, and agencies who resell these systems done-for-you to their clients — white-labeled under their own brand.",
  },
  {
    question: "How many workspaces can I run?",
    answer:
      "The Builder plan ($19/mo) gives you landing pages only — no full workspace. The Workspace plan ($49/mo) gives you 1 full workspace. The Agency plan ($297/mo) includes 10 client workspaces (add more as you grow), plus white-labeling and your own client pricing.",
  },
  {
    question: "Can I white-label this for my clients?",
    answer:
      "Yes, on the Agency plan ($297/mo). Your brand appears on the entire platform — clients never see SeldonFrame. You set your own per-client pricing and keep the spread.",
  },
  {
    question: "What if a client wants their own domain?",
    answer:
      "Every full workspace (Workspace and Agency tiers) can map to its own custom domain. Your client visits booking.theirbusiness.com, not a SeldonFrame subdomain.",
  },
  {
    question: "Are there usage fees or surprise bills?",
    answer:
      "No. Pricing is flat per tier — no metered usage, no prepaid wallet, no surprise invoices. The only optional add-on is the AI voice receptionist ($99/mo per agent, with 500 talk-minutes included). Everything else — website, booking, intake, CRM, and chat — is included.",
  },
  {
    question: "Do I need to bring my own AI key?",
    answer:
      "No. AI is fully included and managed — no API keys to set up, no token bills to track. Paste your site and your front office builds itself.",
  },
  {
    question: "How does this compare to GoHighLevel?",
    answer:
      "SeldonFrame builds a CRM, booking page, intake form, and AI chatbot in 60 seconds from a URL — no 2–4 week onboarding. Pricing starts at $19/mo vs. GoHighLevel Agency Pro at $497/mo. SeldonFrame is open source (AGPL-3.0), so you can self-host or use the cloud.",
  },
  {
    question: "Do I still need Zapier, Calendly, or Typeform?",
    answer:
      "No. CRM, scheduling, intake forms, and the AI chatbot are all native and wired together. No Zapier task fees, no broken integrations, no tab-switching between five tools.",
  },
];

const faqSchema = {
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

export function LandingMarketingFaqSection() {
  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      className="border-t border-[rgba(34,29,23,.08)] bg-[#F6F2EA] px-5 py-20 md:px-8 md:py-28 lg:px-12"
    >
      <div className="mx-auto max-w-[760px]">
        {/* Section head */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center gap-2.5 text-[12px] font-[600] uppercase tracking-[0.09em] text-[#00897B]">
            <span className="h-px w-4 bg-[#00897B] opacity-50" aria-hidden />
            FAQ
            <span className="h-px w-4 bg-[#00897B] opacity-50" aria-hidden />
          </div>
          <h2
            id="faq-heading"
            className="mt-3.5 text-[clamp(27px,4.2vw,42px)] font-[500] leading-[1.08] tracking-[-0.025em] text-[#221D17]"
          >
            Honest answers.
          </h2>
        </div>

        {/* FAQ items — stacked details cards */}
        <div className="mt-10 border-t border-[rgba(34,29,23,.10)]">
          {FAQS.map((faq) => (
            <details
              key={faq.question}
              className="group border-b border-[rgba(34,29,23,.10)]"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-[17px] font-[500] leading-tight tracking-[-0.01em] text-[#221D17] [&::-webkit-details-marker]:hidden">
                <span>{faq.question}</span>
                <span
                  aria-hidden
                  className="relative flex size-[22px] shrink-0 transition-transform duration-[300ms] group-open:rotate-[135deg]"
                >
                  {/* + icon — two bars */}
                  <span className="absolute left-1/2 top-[3px] bottom-[3px] w-[2px] -translate-x-1/2 rounded-sm bg-[#00897B]" />
                  <span className="absolute top-1/2 left-[3px] right-[3px] h-[2px] -translate-y-1/2 rounded-sm bg-[#00897B]" />
                </span>
              </summary>
              <p className="pb-6 pr-10 text-[15px] leading-[1.62] text-[#6E665A] max-w-[66ch]">
                {faq.answer}
              </p>
            </details>
          ))}
        </div>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
    </section>
  );
}
