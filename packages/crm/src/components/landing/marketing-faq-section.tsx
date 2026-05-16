// Cut C Phase 6 — Marketing landing FAQ section.
//
// REPLACES the older `components/marketing/faq.tsx` MarketingFaq on
// the public home page. Different audience: the older variant was
// agency-vs-GoHighLevel positioning; this one is the final due-
// diligence objection-handler that sits between the open-source
// section and the why-now / final-CTA closer. The older component
// file is kept (other surfaces may import it later) — only the home-
// page mount swaps to this new section in `(public)/page.tsx`.
//
// Copy refined by design:ux-copy (May 2026). Each answer leads with
// Yes/No then layers proof — the agency buyer's due-diligence pattern.
// On-page answer text MUST match the FAQPage JSON-LD schema verbatim
// (mismatch drops the Google rich result), so the FAQS array is the
// canonical source for both surfaces.
//
// Design pattern: stacked individual <details> cards (not a single
// divided container) — matches the home-page card rhythm and lets
// each closed Q feel weighty. Open-state accent is a teal border on
// the active card (NOT teal summary text) — calmer animation, no
// text-color flicker on toggle.

type FaqItem = { question: string; answer: string };

const FAQS: readonly FaqItem[] = [
  {
    question: "Can I white-label this for my clients?",
    answer:
      "Yes. Growth ($29/mo) hides all SeldonFrame branding from your client's landing page, portal, and emails. Scale ($99/mo) adds full white-label of the client-facing dashboard — your logo on every surface they see.",
  },
  {
    question: "What if a client wants their own domain?",
    answer:
      "Each workspace can map to its own domain on Growth and Scale. Your client visits booking.theirbusiness.com, not theirbusiness.app.seldonframe.com.",
  },
  {
    question: "Does it work with my Anthropic key?",
    answer:
      "Yes. Bring-your-own Anthropic key is supported on every tier including Free. You pay Anthropic directly, we never charge a token margin, and the key is encrypted at rest with no plaintext logs.",
  },
  {
    question: "How many client workspaces can I run?",
    answer:
      "One on Free, three on Growth, unlimited on Scale. The workspace cap is the only thing tiers gate on count — features like custom domains, white-label, and AI agents stack on top per tier.",
  },
  {
    question: "Can I use Claude Code instead of the web app?",
    answer:
      "Yes. Both surfaces share the same backend, and Claude Code (via our MCP server) stays available on every tier including Free. Most agencies use the web for onboarding non-technical staff and Claude Code for bulk operations.",
  },
  {
    question: "Is each client's data isolated from the others?",
    answer:
      "Yes. Every workspace is a separate org with its own CRM contacts, booking calendar, intake submissions, and chatbot transcripts. No cross-workspace read path exists in the codebase.",
  },
];

// Google FAQPage rich result — text MUST mirror the on-page <p>
// answers verbatim. Build from the same FAQS const so the two can
// never drift.
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
      className="mx-auto max-w-3xl border-t border-zinc-800/30 px-6 py-16 md:py-20"
    >
      <div className="text-center">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
          Before you sign up
        </p>
        <h2
          id="faq-heading"
          className="text-3xl font-bold text-zinc-100 md:text-4xl"
        >
          Last 6 questions agencies ask.
        </h2>
      </div>

      <div className="mt-10 space-y-3">
        {FAQS.map((faq) => (
          <details
            key={faq.question}
            className="group rounded-xl border border-zinc-800 bg-zinc-900 p-5 transition-colors hover:border-zinc-700 open:border-[#14b8a6]/40"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-zinc-100 [&::-webkit-details-marker]:hidden">
              <span>{faq.question}</span>
              <span
                aria-hidden="true"
                className="text-2xl leading-none text-zinc-500 transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">{faq.answer}</p>
          </details>
        ))}
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
    </section>
  );
}
