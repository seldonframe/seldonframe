// packages/crm/src/components/landing/marketing-faq-section.tsx
//
// Redesign 2026-06-18 — warm light aesthetic.
// FAQ section. Paper background, stacked <details> cards with
// SeldonFrame green plus/minus icon. FAQPage JSON-LD preserved.
//
// Copy reflects the flat $29/mo (cancel anytime, no trial) + GMV model and
// the BYOK-as-qualifier framing (positioning v2, 2026-06-22; trial removed
// 2026-07-05 — the free ungated build→claim→use experience already IS the
// trial, so checkout charges immediately).
//
// 2026-07-08 pricing ladder (Task 6, flip-time commit): "$29/mo flat"
// stays the anchor truth for the homepage (one-number rule) — the
// white-label + workspace-count answers now mention that agencies
// running CLIENT sub-accounts have a ladder starting at $99/mo,
// without displacing the $29 anchor. Ships as part of the flip-time
// commit alongside the SF_COLUMN comparison-registry edit.

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
      "Yes — and if you use ChatGPT, Claude, or Gemini, you already have what you need. Your agents run on your own key (and Twilio for calls/texts), billed by the provider at cost. That's why it's a flat $29 with no usage markup. The website, booking, and CRM build with no key; you connect a key when you switch an agent on (we show you how).",
  },
  {
    question: "How much is it?",
    answer:
      "$29/mo flat, unlimited workspaces, cancel anytime. Plus 2% only on what you sell through SeldonFrame (payments, proposals, packages) — sell anywhere else and we take nothing. Agency tiers ($99+) pay no GMV fee — 0% on everything you bill your clients.",
  },
  {
    question: "Is it free to start?",
    answer:
      "Yes — we build your first workspace on our AI key so you can see it work instantly, no card required. You're only charged $29/mo flat once you connect through Stripe, and you can cancel anytime.",
  },
  {
    question: "How many workspaces can I run?",
    answer:
      "Unlimited of your own, on the flat $29/mo — there's no per-workspace tax and no per-seat pricing. Running client sub-accounts under your own brand is a separate agency ladder starting at $99/mo (whitelabel included from the first tier).",
  },
  {
    question: "Can I white-label this for my clients?",
    answer:
      "Yes — whitelabel is included on every agency plan, starting at $99/mo. Your brand appears on the entire platform; clients never see SeldonFrame. You set your own per-client pricing and keep the spread. Reselling to your own clients goes through your brand, so it isn't subject to the GMV fee.",
  },
  {
    question: "What if a client wants their own domain?",
    answer:
      "Every workspace can map to its own custom domain. Your client visits booking.theirbusiness.com, not a SeldonFrame subdomain.",
  },
  {
    question: "How does this compare to GoHighLevel?",
    answer:
      "SeldonFrame builds a website, CRM, booking page, intake form, and a multi-surface AI agent in 3 minutes from a URL — no 2–4 week onboarding and no Zapier glue. It's $29/mo flat vs. GoHighLevel Agency Pro at $497/mo, the agents answer across voice, chat, SMS, and email, and you own it (AGPL-3.0 — self-host or use the cloud).",
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
      className="border-t border-[rgba(34,29,23,.08)] px-5 py-20 md:px-8 md:py-28 lg:px-12"
    >
      <div className="mx-auto max-w-[760px]">
        {/* Section head */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center gap-2.5 text-[12px] font-[600] uppercase tracking-[0.09em] text-[#1F2B24]">
            <span className="h-px w-4 bg-[#1F2B24] opacity-50" aria-hidden />
            FAQ
            <span className="h-px w-4 bg-[#1F2B24] opacity-50" aria-hidden />
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
                  <span className="absolute left-1/2 top-[3px] bottom-[3px] w-[2px] -translate-x-1/2 rounded-sm bg-[#1F2B24]" />
                  <span className="absolute top-1/2 left-[3px] right-[3px] h-[2px] -translate-y-1/2 rounded-sm bg-[#1F2B24]" />
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
