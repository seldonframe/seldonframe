// FAQ section for the homepage.
// Visible Q&A content + matching FAQPage schema (JSON-LD).
// Per Google guidelines, the on-page text MUST match the schema text exactly,
// or the structured data is ignored / penalized.

type FaqEntry = {
  question: string;
  answer: string;
};

const FAQS: FaqEntry[] = [
  {
    question: "What is SeldonFrame?",
    answer:
      "SeldonFrame is an open-source, MCP-native Business OS. It generates a complete operator stack — website, booking page, intake form, CRM, and AI receptionist — from a single Google Maps paste in about 3 minutes. The platform is designed for local service businesses like HVAC contractors, plumbers, electricians, dental practices, and real estate agents.",
  },
  {
    question: "How does the 3-minute Business OS generation work?",
    answer:
      "You install the SeldonFrame MCP server in Claude Code with one command (claude mcp add seldonframe -- npx -y @seldonframe/mcp@latest), paste a public Google Maps listing into Claude Code, and run the create_workspace_from_google_paste tool. The MCP server detects the vertical, picks the right aesthetic archetype, and generates all five Business OS surfaces in roughly 3 minutes. The workspace is live at a subdomain on app.seldonframe.com immediately.",
  },
  {
    question: "What does MCP-native mean?",
    answer:
      "MCP-native means every action an operator can take through the SeldonFrame dashboard is exposed as a Model Context Protocol tool that AI agents like Claude Code can call directly. The dashboard UI is a thin layer over the same tool surface — the AI agent and the human operator use the same primitives. This is different from MCP-enabled platforms that bolt an MCP connector onto an existing product.",
  },
  {
    question: "Is SeldonFrame really free?",
    answer:
      "Yes. The Free tier includes 1 complete workspace with all five Business OS surfaces — website, booking page, intake form, CRM, and AI receptionist. No credit card required. You bring your own LLM key (BYOK) so you pay your own Anthropic or OpenAI bill for the AI receptionist's tokens, with no SeldonFrame token margin. The Growth tier at $29/month covers 3 workspaces and Scale at $99/month is unlimited.",
  },
  {
    question: "Can SeldonFrame replace Hubspot, Calendly, and Wix?",
    answer:
      "Yes for local service businesses. SeldonFrame replaces Hubspot's CRM, Calendly's booking page, Wix's website, the intake form, and the standalone AI receptionist with one unified workspace. The five surfaces share one database — the chatbot reads the same calendar the booking page uses, the form writes to the same CRM the operator logs into. No Zapier glue. For enterprise sales teams with multi-touch nurture sequences, Hubspot remains the right call.",
  },
  {
    question: "Which industries does SeldonFrame support?",
    answer:
      "SeldonFrame ships 20+ vertical archetypes. Trades use bold-urgency (HVAC contractors, plumbers, electricians, roofers, locksmiths). Aesthetic verticals use cinematic-aspirational (medspas, salons). Medical and legal use clinical-trust (dental practices, chiropractors, attorneys, accountants). Creative verticals use editorial-warm (real estate agents, photographers). Each archetype changes the website hero, the intake form fields, the booking defaults, and the chatbot tone.",
  },
  {
    question: "Where can I see a live demo?",
    answer:
      "A real HVAC contractor workspace is live at phoenix-ac-air-conditioning-heating-inc.app.seldonframe.com. It was generated in 3 minutes from a public Google Maps listing. The chatbot books real appointments in the America/Phoenix timezone. You can click the chat widget bottom-right and ask for a drain repair — the full flow runs in under 30 seconds.",
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

export function Faq() {
  return (
    <section className="mt-16 w-full max-w-3xl mx-auto px-2 text-left">
      <h2 className="text-center text-2xl font-semibold tracking-tight md:text-3xl">
        Frequently asked questions
      </h2>
      <p className="mt-2 text-center text-sm text-muted-foreground">
        What operators ask before installing SeldonFrame.
      </p>

      <div className="mt-8 divide-y divide-border rounded-2xl border border-border bg-card/40">
        {FAQS.map((faq) => (
          <details key={faq.question} className="group px-6 py-4">
            <summary className="cursor-pointer list-none font-medium text-foreground transition-colors hover:text-primary [&::-webkit-details-marker]:hidden">
              <span className="flex items-center justify-between gap-4">
                <span>{faq.question}</span>
                <span className="text-muted-foreground transition-transform group-open:rotate-45">
                  +
                </span>
              </span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{faq.answer}</p>
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
