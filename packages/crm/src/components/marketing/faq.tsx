// Marketing FAQ section for seldonframe.com.
//
// Renders 7 self-contained Q&As + matching FAQPage JSON-LD. The
// on-page text MUST match the schema text exactly — Google's
// structured-data validator drops the schema otherwise.
//
// Audience: agencies and freelancers (1-5 person shops) evaluating
// SeldonFrame as an alternative to GoHighLevel for client ops
// deployment. Operator-targeted questions (the prior version of
// this file) were removed in the May 2026 repositioning — those
// remain useful for end-operator marketing but belong on per-
// vertical pages, not the agency-buyer homepage.
//
// Server-rendered (no client features).

type FaqEntry = {
  question: string;
  answer: string;
};

const FAQS: FaqEntry[] = [
  {
    question: "How does SeldonFrame compare to GoHighLevel?",
    answer:
      "SeldonFrame is the open-source alternative to GoHighLevel. Both bundle CRM, booking, and chatbot for agencies serving local service businesses. The difference is deployment time and cost. GoHighLevel requires days to weeks of configuration per client and costs $97-$497/month per agency before white-label add-ons. SeldonFrame generates a pre-wired client stack from one Claude Code prompt in about 3 minutes, ships a free tier with no credit card, and is AGPL-3.0 if you want to self-host.",
  },
  {
    question: "How long does it take to deploy a client ops stack?",
    answer:
      "Approximately 3 minutes from a single Claude Code prompt. The SeldonFrame MCP server generates the CRM with vertical-specific pipeline stages, a booking page wired to the client's hours and timezone, an intake form with vertical-specific fields, and an AI chatbot that books appointments against the real calendar. All four surfaces share one database and are pre-wired on generation. No Zapier, no webhooks to configure, no integration work.",
  },
  {
    question: "Can I white-label SeldonFrame for my agency clients?",
    answer:
      "Yes. Each generated workspace runs on its own subdomain (client-slug.app.seldonframe.com) or a custom domain on the Growth and Scale tiers. Per-workspace branding includes logo, colors, hero copy, and the chatbot's voice — the client sees their own brand, not SeldonFrame's. Full agency-tier dashboard white-label (operator portal without SeldonFrame chrome) is on the Q3 2026 roadmap. Until then, agencies typically present the per-workspace surface to clients and manage the agency-side workflow themselves.",
  },
  {
    question: "Is SeldonFrame really free for agencies?",
    answer:
      "The Free tier covers 1 complete workspace with CRM, booking, intake form, and AI chatbot. No credit card required. Growth at $29/month covers 3 workspaces — designed for solo agencies serving 2-3 clients. Scale at $99/month is unlimited workspaces — designed for agencies serving 5+ clients. You bring your own LLM key (BYOK) so you pay your own Anthropic or OpenAI bill with no SeldonFrame token margin, typically $3-$15/month per active workspace. Or self-host under AGPL-3.0 for $0.",
  },
  {
    question: "What can agencies charge clients using SeldonFrame?",
    answer:
      "Reddit and freelance-community data from May 2026 shows agencies typically charge $2,500-$7,000 setup plus $500-$1,500/month retainer for a CRM + booking + intake + chatbot stack built on GoHighLevel or a Webflow + Calendly + HubSpot + Zapier combination. Your cost to generate the equivalent on SeldonFrame is approximately 3 minutes of agency time plus a few cents of LLM tokens. The margin is yours; SeldonFrame doesn't take a cut of agency-to-client billing.",
  },
  {
    question: "What verticals does SeldonFrame support?",
    answer:
      "SeldonFrame ships 20+ vertical archetypes that change hero copy, intake fields, pipeline stages, and chatbot tone automatically. Trades use bold-urgency (HVAC, plumbers, electricians, roofers, locksmiths). Medical and legal use clinical-trust (dental practices, chiropractors, attorneys, accountants). Beauty verticals use cinematic-aspirational (medspas, salons). Creative verticals use editorial-warm (real estate agents, photographers). The MCP server detects the right archetype automatically from the client's business description.",
  },
  {
    question: "Do I need to know Claude Code to use SeldonFrame?",
    answer:
      "Claude Code is the canonical agency interface — install the MCP with one command (claude mcp add seldonframe -- npx -y @seldonframe/mcp@latest), then describe the client in natural language. No integration code, no Zapier, no glue work. A web dashboard exists for non-Claude-Code users at app.seldonframe.com, but agencies that adopt the Claude Code workflow deploy 5-10x faster because structural changes that take 15 clicks in a dashboard happen in one sentence via MCP.",
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

export function MarketingFaq() {
  return (
    <section
      id="faq"
      className="mx-auto w-full max-w-3xl px-6 py-16 md:py-24"
      aria-labelledby="faq-heading"
    >
      <h2
        id="faq-heading"
        className="text-center text-3xl font-semibold tracking-tight md:text-4xl"
      >
        Frequently asked questions
      </h2>
      <p className="mt-3 text-center text-sm text-muted-foreground md:text-base">
        What agencies and freelancers ask before installing SeldonFrame.
      </p>

      <div className="mt-10 divide-y divide-border rounded-2xl border border-border bg-card/40">
        {FAQS.map((faq) => (
          <details key={faq.question} className="group px-6 py-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-foreground transition-colors hover:text-primary [&::-webkit-details-marker]:hidden">
              <span>{faq.question}</span>
              <span
                aria-hidden="true"
                className="text-2xl leading-none text-muted-foreground transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground md:text-base">
              {faq.answer}
            </p>
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
