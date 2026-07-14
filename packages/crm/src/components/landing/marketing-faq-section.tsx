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

import Link from "next/link";

type FaqItem = { question: string; answer: string };

// Updated 2026-06-22 to the flat $29/mo + GMV model. The FAQPage JSON-LD
// schema reads from this same const, so the visible answers and the
// structured data can never drift — edit here and the schema regenerates.
const FAQS: readonly FaqItem[] = [
  {
    question: "Can an AI agent really run my front office — without dropping the ball?",
    answer:
      "Yes, because it's grounded in your real business, not making things up. It answers from your actual services, prices, and hours, reads back what it heard before it books or quotes anything, and stays inside the guardrails you set — so it never invents a price or a promise you can't keep. You can review every call and message it handles. Most owners find it more consistent than a tired human at 9pm, because it never forgets to follow up.",
  },
  {
    question: "I'm not technical. Can I actually run this myself?",
    answer:
      "If you can text, you can run it. Change your hours, add a service, or tune what your receptionist says just by typing it in plain English — like you'd text ChatGPT. There's no code, no builder to learn, and nothing to wire together. Your website, booking page, CRM, and agent are already connected on day one.",
  },
  {
    question: "Which plan is right for me?",
    answer:
      "Three simple paths. If you run your OWN business (or a few) and you already use ChatGPT, Claude, or Gemini, choose Builder — $29/mo, unlimited workspaces on your own AI key. If you'd rather we handle the keys and just run it for you, choose Managed — $49/mo for one workspace on SeldonFrame's keys, nothing to set up. If you build sites and agents for CLIENTS under your own brand, choose an Agency plan — $99/mo for 10 client sub-accounts, $199 for 30, or $299 for unlimited, whitelabel included. Not sure? Start free on Builder — you can move up in a click once you outgrow it.",
  },
  {
    question: "Do I need my own AI key?",
    answer:
      "On Builder, yes — and if you use ChatGPT, Claude, or Gemini you already have one. Your agents run on your own key (and Twilio for calls/texts), billed by the provider at cost — that's exactly why the price stays flat with no usage markup. Don't want to touch keys at all? The Managed plan ($49/mo) runs everything on our keys. Either way, your website, booking, and CRM build with no key at all.",
  },
  {
    question: "It's really a flat price? What's the catch?",
    answer:
      "No catch. Flat monthly, no metered AI bills, no per-seat tax, no surprise invoices. The only variable is a flat 2% on what you actually SELL through SeldonFrame (payments and proposals) on the solo plans — collect any other way and we take nothing, and agency plans pay 0%. We only make money when you do.",
  },
  {
    question: "Is it free to start?",
    answer:
      "Yes. We build your first workspace and let you watch it answer a call and book a job before you pay a cent — no card to look. You're only charged when you switch it on for real through Stripe, and you can cancel anytime. One booked job pays for the whole year.",
  },
  {
    question: "Why not just hire someone, or use GoHighLevel?",
    answer:
      "A part-time receptionist costs more in a week than SeldonFrame does in a month, and still sleeps. GoHighLevel Agency Pro is $497/mo and takes 2–4 weeks of setup plus Zapier glue. SeldonFrame builds the whole front office — website, CRM, booking, intake, and an agent across voice, chat, SMS, and email — in 3 minutes from your URL, for $29/mo, and you own it (open source, AGPL-3.0: self-host or use the cloud).",
  },
  {
    question: "Do I still need Zapier, Calendly, or Typeform?",
    answer:
      "No. CRM, scheduling, intake forms, and the AI agents are all native and wired together from the start. No Zapier task fees, no broken integrations, no tab-switching between five tools that don't talk to each other.",
  },
  {
    question: "Can I white-label it for my clients?",
    answer:
      "Yes — whitelabel is included on every agency plan, from $99/mo. Your brand is on the entire platform and every client sub-account; clients never see SeldonFrame. You set your own per-client pricing and keep the spread, and because it's your brand there's no GMV fee — 0% on everything you bill them. Each workspace can map to its own domain (booking.theirbusiness.com), too.",
  },
  {
    question: "Should I wait until the AI gets better?",
    answer:
      "It already does — automatically. SeldonFrame is a thin harness over the frontier models, so every time Claude, GPT, or Gemini gets better, your agent does too, with nothing to migrate. Waiting doesn't get you a better product; it just sends more of this week's missed calls to voicemail. The best time to have an agent answering was last month. The next best time is today — and building it is free.",
  },
  {
    question: "Can I cancel, and do I own my work?",
    answer:
      "Cancel anytime, no lock-in and no penalty. And because SeldonFrame is open source (AGPL-3.0), you can export everything or self-host it whenever you want. Your customers, your content, and your agents are yours — we never hold them hostage.",
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

        {/* Route to the plan picker — the "which plan is right for me" answer,
            made actionable. */}
        <div className="mt-10 flex flex-col items-center gap-3 text-center">
          <p className="text-[15px] leading-[1.55] text-[#6E665A]">
            Still deciding? Compare every plan side by side and pick the one that fits.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 rounded-[11px] bg-[#1F2B24] px-5 py-3 text-[14px] font-[600] text-[#F6F2EA] transition-transform hover:-translate-y-px"
            >
              Compare all plans →
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-[11px] border border-[rgba(34,29,23,.18)] px-5 py-3 text-[14px] font-[500] text-[#221D17] transition-colors hover:border-[#1F2B24]/50"
            >
              Start free
            </Link>
          </div>
        </div>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
    </section>
  );
}
