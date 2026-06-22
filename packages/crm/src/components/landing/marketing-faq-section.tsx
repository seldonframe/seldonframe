// packages/crm/src/components/landing/marketing-faq-section.tsx
//
// Redesign 2026-06-18 — warm light aesthetic.
// FAQ section. Paper background, stacked <details> cards with
// SeldonFrame green plus/minus icon. FAQPage JSON-LD preserved.
//
// Copy updated to reflect new pricing tiers (Builder/Workspace/Agency)
// while keeping the same factual content.

type FaqItem = { question: string; answer: string };

// Updated 2026-06-22 to the flat $29/mo + GMV model. The FAQPage JSON-LD
// schema reads from this same const, so the visible answers and the
// structured data can never drift — edit here and the schema regenerates.
const FAQS: readonly FaqItem[] = [
  {
    question: "Who is SeldonFrame for?",
    answer:
      "Two audiences on one platform: SMBs who want a complete AI front office (website, booking, intake, CRM, and a 24/7 agent across voice, chat, SMS, and email) for their own business — and builders and agencies who build any agent in the Studio, deploy it to clients as a whitelabel front office, and resell it.",
  },
  {
    question: "How much does it cost?",
    answer:
      "$29/mo flat, unlimited workspaces, with a 14-day free trial — and your first workspace is free forever. On top of that there's a small GMV fee, but only when SeldonFrame is your sales channel (a marketplace sale, a booking, an accepted proposal): 5% on your first $10k/mo, 3% over $10k, 2% over $50k. We only make money when you do — we don't tax your work.",
  },
  {
    question: "How many workspaces can I run?",
    answer:
      "$29/mo flat covers unlimited workspaces, and the first one is free. There's no per-workspace tax and no per-seat pricing — build one front office for yourself or a hundred for your clients on the same flat plan.",
  },
  {
    question: "Can I white-label this for my clients?",
    answer:
      "Yes — it's included in the flat $29/mo. Your brand appears on the entire platform; clients never see SeldonFrame. You set your own per-client pricing and keep the spread. Reselling to your own clients goes through your brand, so it isn't subject to the GMV fee.",
  },
  {
    question: "What if a client wants their own domain?",
    answer:
      "Every workspace can map to its own custom domain. Your client visits booking.theirbusiness.com, not a SeldonFrame subdomain.",
  },
  {
    question: "Are there usage fees or surprise bills?",
    answer:
      "No metered markup. It's a flat $29/mo plus a GMV fee that only applies when SeldonFrame is your sales channel. The voice, SMS, chat, and email AI agents are all included — voice is not a $99 add-on. You bring your own AI key (and Twilio for calls and texts) and pay those providers directly at cost, which is exactly why the platform fee can stay flat with no usage surprises.",
  },
  {
    question: "Do I need to bring my own AI key?",
    answer:
      "Not to start. Your first workspace is free — no key to babysit, just paste your site and watch it build. To run your agents live and spin up more client workspaces, you add your own AI key (and Twilio for calls and texts). That's why it's a flat $29 with no usage markup: you pay the providers at cost, and we don't tax your work.",
  },
  {
    question: "How does this compare to GoHighLevel?",
    answer:
      "SeldonFrame builds a website, CRM, booking page, intake form, and a multi-surface AI agent in 60 seconds from a URL — no 2–4 week onboarding and no Zapier glue. It's $29/mo flat vs. GoHighLevel Agency Pro at $497/mo, the agents answer across voice, chat, SMS, and email, and you own it (AGPL-3.0 — self-host or use the cloud).",
  },
  {
    question: "Do I still need Zapier, Calendly, or Typeform?",
    answer:
      "No. CRM, scheduling, intake forms, and the AI agents are all native and wired together. No Zapier task fees, no broken integrations, no tab-switching between five tools.",
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
