// packages/crm/src/components/landing/marketing-faq-section.tsx
//
// Redesign 2026-06-18 — warm light aesthetic.
// FAQ section. Paper background, stacked <details> cards with
// SeldonFrame green plus/minus icon. FAQPage JSON-LD preserved.
//
// Copy reflects the flat $29/mo + 14-day-trial + GMV model and the
// BYOK-as-qualifier framing (positioning v2, 2026-06-22).

type FaqItem = { question: string; answer: string };

// Updated 2026-06-22 to the flat $29/mo + GMV model. The FAQPage JSON-LD
// schema reads from this same const, so the visible answers and the
// structured data can never drift — edit here and the schema regenerates.
const FAQS: readonly FaqItem[] = [
  {
    question: "Who is SeldonFrame for?",
    answer:
      "Service-business owners — plumbers, estheticians, contractors, clinics, coaches — who want a complete AI front office (website, booking, intake, CRM, and a 24/7 agent across voice, chat, SMS, and email) for their own business. It's also for builders and agencies, who are simply the top rung of the same ladder: power users whose product is agents — they build one in the Studio and resell it, or run it for clients under their own brand.",
  },
  {
    question: "Do I need my own AI key?",
    answer:
      "Yes — and if you use ChatGPT, Claude, or Gemini, you already have what you need. Your agents run on your own key (and Twilio for calls/texts), billed by the provider at cost. That's why it's a flat $29 with no usage markup. The website, booking, and CRM build with no key during your trial; you connect a key when you switch an agent on (we show you how).",
  },
  {
    question: "How much is it?",
    answer:
      "$29/mo flat, unlimited workspaces, with a 14-day free trial. Plus 2% only on what you sell through SeldonFrame (payments, proposals, packages) — sell anywhere else and we take nothing.",
  },
  {
    question: "Is it free to start?",
    answer:
      "You get a 14-day free trial — we even build your first workspace on our AI key so you can see it work instantly. After that it's $29/mo flat for unlimited workspaces.",
  },
  {
    question: "How many workspaces can I run?",
    answer:
      "Unlimited, on the flat $29/mo. There's no per-workspace tax and no per-seat pricing — build one front office for yourself or a hundred for your clients on the same flat plan.",
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
