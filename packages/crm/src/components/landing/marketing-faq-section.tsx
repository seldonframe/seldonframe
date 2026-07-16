// packages/crm/src/components/landing/marketing-faq-section.tsx
//
// Redesign 2026-06-18 — warm light aesthetic.
// FAQ section. Paper background, stacked <details> cards with
// SeldonFrame green plus/minus icon. FAQPage JSON-LD preserved.
//
// Copy reflects the flat pricing (cancel anytime, no trial) + GMV model and
// the BYOK-as-qualifier framing (positioning v2, 2026-06-22; trial removed
// 2026-07-05 — the free ungated build→claim→use experience already IS the
// trial, so checkout charges immediately).
//
// 2026-07-16 agency persona rewrite (Max's call, with the homepage
// repositioning + 3-tier pricing section): every answer now speaks to the
// agency operator selling client front offices. Pricing truth per
// CLAUDE.md §1b: Agency $99·$199·$299 (0% GMV) / Builder $29 / Managed
// $49 (solo tiers, flat 2% only when SF is the sales channel). The
// client-pricing anchor ($300–800/mo retail) matches the standing range
// used across the SEO comparison pages.

import Link from "next/link";

type FaqItem = { question: string; answer: string };

// Agency-persona FAQ (2026-07-16). The FAQPage JSON-LD schema reads from
// this same const, so the visible answers and the structured data can
// never drift — edit here and the schema regenerates.
const FAQS: readonly FaqItem[] = [
  {
    question: "Can an AI agent really run a client's front office — without dropping the ball?",
    answer:
      "Yes, because it's grounded in the client's real business, not making things up. It answers from their actual services, prices, and hours, reads back what it heard before it books or quotes anything, and stays inside the guardrails you set — so it never invents a price or a promise your client can't keep. You can review every call and message it handles, per client, before anyone else sees it. Your name is on this — that's exactly why it's built to never wing it.",
  },
  {
    question: "Do I need to be a developer to deliver this?",
    answer:
      "No. If you can write an email, you can operate it. Change a client's hours, add a service, or tune what their receptionist says by typing it in plain English — like you'd text ChatGPT. There's no code, no builder to learn, and nothing to wire together: each client's website, booking page, CRM, and agent are already connected the moment the workspace builds.",
  },
  {
    question: "Which plan is right for me?",
    answer:
      "If you run client front offices under your own brand, pick an Agency plan: Starter is $99/mo with 10 client sub-accounts, Growth is $199/mo with 30 plus one-click deploy to all clients, and Scale is $299/mo with unlimited sub-accounts plus API and MCP access. All three include full white-label and branded client portals. Running your OWN business instead? Builder is $29/mo (unlimited workspaces on your own AI key) and Managed is $49/mo (one workspace on ours). Not sure? Build your first workspace free and decide after you've seen it work.",
  },
  {
    question: "What should I charge my clients?",
    answer:
      "That's your call — you set per-client pricing and keep every dollar of the spread, because agency plans pay 0% GMV. For reference, agencies typically retail a managed AI front office at $300–800/mo per client. At that range, one client more than covers Agency Starter ($99/mo for 10 sub-accounts), and everything after is margin. The marketplace is the same story: sell or rent your agents there and the only fee is the standing 5% on marketplace transactions.",
  },
  {
    question: "It's really a flat price? What's the catch?",
    answer:
      "No catch. Flat monthly, no metered AI bills, no per-seat tax, no per-client surprise invoices — and on agency plans, 0% GMV on everything you bill your clients. We don't tax your client work. (The solo plans carry the only variable fee that exists: a flat 2% when SeldonFrame itself is the sales channel — collect any other way and we take nothing.)",
  },
  {
    question: "Do I need my own AI key?",
    answer:
      "If you already use ChatGPT, Claude, or Gemini, you have one — and your agents run on it, billed by the provider at cost. That's exactly why the price stays flat and your margin isn't metered: we never mark up usage. Don't want to touch keys at all? The Managed plan ($49/mo) runs everything on our keys. Either way, websites, booking, and CRMs build with no key at all.",
  },
  {
    question: "Is it free to start?",
    answer:
      "Yes. Build your first client workspace free — from their URL, in about 3 minutes — and watch it answer a call and book a job before you pay a cent, no card to look. You're only charged when you switch a plan on through Stripe, and you can cancel anytime. Most agencies build the demo first and use it to close the client before spending a dollar.",
  },
  {
    question: "Why not just use GoHighLevel?",
    answer:
      "GoHighLevel's white-label tier (Agency Pro) is $497/mo, and a typical build-out takes 2–4 weeks of snapshot setup and Zapier glue per client. SeldonFrame builds a client's whole front office — website, CRM, booking, intake, and an agent across voice, chat, SMS, and email — in about 3 minutes from their URL, with white-label from $99/mo for your entire agency. And you own it: open source, AGPL-3.0, self-host or use the cloud.",
  },
  {
    question: "Do my clients still need Zapier, Calendly, or Typeform?",
    answer:
      "No. CRM, scheduling, intake forms, and the AI agents are native and wired together from the first build — for every client, identically. That's five fewer subscriptions per client to buy, glue, and debug, and no Zapier task fees eating the retainer.",
  },
  {
    question: "Can I white-label it for my clients?",
    answer:
      "Yes — whitelabel is included on every agency plan, from $99/mo. Your brand is on the entire platform and every client sub-account; clients never see SeldonFrame. You set your own per-client pricing and keep the spread, and because it's your brand there's no GMV fee — 0% on everything you bill them. Each workspace can map to its own domain (booking.theirbusiness.com), too.",
  },
  {
    question: "Should I wait until the AI gets better?",
    answer:
      "It already does — automatically. SeldonFrame is a thin harness over the frontier models, so every time Claude, GPT, or Gemini gets better, every agent you've deployed gets better too, with nothing to migrate across your whole client book. Waiting doesn't get you a better product; it just sends more of your clients' missed calls to voicemail. The best time to have agents answering client phones was last month. The next best time is today — and building the first one is free.",
  },
  {
    question: "Can I cancel, and who owns the client work?",
    answer:
      "Cancel anytime, no lock-in and no penalty. And because SeldonFrame is open source (AGPL-3.0), you can export everything or self-host it whenever you want. Your clients, their data, your content, and your agents are yours — we never hold a client book hostage.",
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
