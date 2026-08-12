import type { Guide } from "./types";

export const guide: Guide = {
  slug: "is-geo-legit",
  title: "Is GEO (Generative Engine Optimization) Legit, or Just SEO Rebranded? A Practitioner's Answer",
  description:
    "Is generative engine optimization (GEO) legit or just SEO with a new name? A measured answer from a team that publishes its own AI-visibility scores — including the months we don't show up.",
  targetKeyword: "is geo legit",
  intent: "informational",
  cluster: "ai-visibility",
  relatedTool: "/tools/ai-visibility-checker",
  relatedBest: "/best/ai-agent-for-small-business",
  relatedChart: { href: "/charts/ai-recommendation-index", label: "See our own AI Recommendation Index — including the month we didn't show up" },
  dek: "*Generative engine optimization* (GEO) is either the most important new marketing skill or a rebrand of SEO sold by people who found a new word for an old job. Both camps are loud. This is the answer from a team that runs a 90-plus-page site built around this exact question, measures it in public, and just published a scorecard where our own brand didn't show up.",
  sections: [
    {
      h2: "The honest thesis",
      body: "Here's the straight answer: **about 90% of GEO is SEO**. Clear writing, real expertise, pages that actually answer the question, and other sites linking to you — none of that changed when AI answer engines showed up.\n\nThe other 10% is real too, and you can measure it. It's about being **citation-shaped**: easy for a model to quote without guessing, with a source it can point to.\n\nWe wrote a deeper breakdown of the academic research behind that 10% in [what generative engine optimization actually is](/guides/what-is-generative-engine-optimization) — the short version is a 2024 research paper found real, measurable gains from making content more citable, not more gamed.",
      diagram: {
        type: "compare",
        title: "What's still SEO vs. what GEO actually adds",
        left: {
          heading: "Still SEO (~90%)",
          items: ["Crawlable, well-structured pages", "Genuinely useful content", "Real expertise", "Other sites linking to you"],
        },
        right: {
          heading: "The citability layer (~10%)",
          items: ["Machine-readable page twins", "Verified, dated freshness", "Clear, named authorship", "Structured facts a model can quote"],
        },
      },
    },
    {
      h2: "What we actually built, and why",
      body: "Talk is cheap, so here's what the 10% looks like in practice on this site. Every guide and tool page has a **Markdown twin** — the same content at `/page.md` instead of HTML — so a model can read it without fighting our layout.\n\nWe also publish an [llms.txt file](/llms.txt), a plain-text index for AI crawlers proposed by Jeremy Howard in 2024. Every factual claim on this page carries a **dated, linked source** in a sources row, the same pattern you're reading right now.\n\nNone of this guarantees a citation. It just removes the excuses a model would otherwise have for getting us wrong.",
      callout: {
        kind: "analogy",
        text: "A Markdown twin is a translated menu handed to a guest who doesn't read the local script — same dish, no guessing required.",
      },
    },
    {
      h2: "What the sellers oversell",
      body: "Search \"GEO\" and you'll find agencies selling **em-dash removal**, \"AI detection proofing,\" and secret prompt phrasings that supposedly move you up an AI answer. Treat all three as noise.\n\nPunctuation doesn't decide whether a model cites you — clarity and evidence do. And \"AI detection proofing\" is chasing a target that doesn't reliably exist: OpenAI built its own AI-text detector, then shut it down after it correctly caught only a quarter of AI writing while wrongly flagging **9% of human writing** as AI-made.\n\nOpenAI's own words when they pulled it: **\"it is impossible to reliably detect all AI-written text.\"** If the company that trained the model can't detect its own writing reliably, no $500 rewrite service can guarantee it either.",
      callout: {
        kind: "warning",
        text: "If a vendor's main pitch is beating AI detectors or scrubbing em dashes, that pitch is decoration, not evidence — spend the budget on genuinely better content instead.",
      },
    },
    {
      h2: "How to actually measure it, instead of guessing",
      body: "The market is taking this seriously at scale: in November 2025, Adobe agreed to buy Semrush for **$1.9 billion**, citing AI-driven traffic to retail sites growing **1,200% year over year**. That's a real signal GEO matters — it's not proof any specific tactic works for your business.\n\nSo we built our own honest measuring stick. The [AI Recommendation Index](/charts/ai-recommendation-index) asks Claude the same 10 buyer questions every month and scores which brands it recommends.\n\nIn the July 2026 snapshot, **SeldonFrame didn't appear in any of the 10 answers**. We published that absence anyway, because a scorecard that only counts when it flatters you isn't a scorecard — it's an ad. Run the same kind of check on your own business with our [AI visibility checker](/tools/ai-visibility-checker) before spending on any GEO service.",
      diagram: {
        type: "stack",
        title: "What actually stacks up to \"citable\"",
        layers: [
          { label: "The HTML page", sub: "what a person reads" },
          { label: "A Markdown twin", sub: "what a model reads cleanly" },
          { label: "An llms.txt entry", sub: "so crawlers find both" },
          { label: "Dated, linked sources", sub: "so claims are checkable" },
        ],
      },
    },
    {
      h2: "A plain do-this list",
      body: "Skip the gimmicks and do the boring things that actually move the needle. **Answer real questions clearly**, with specific facts instead of padding.\n\nAdd a source and a date to any claim that isn't obvious common sense. If you can publish a plain-text or Markdown version of your key pages, do it — it costs little and removes a real barrier for AI crawlers.\n\nThen check what AI models already say about your business, on a normal schedule, and fix what's wrong. That's most of GEO — the rest is good SEO wearing a new hat.",
    },
  ],
  faq: [
    {
      q: "Is GEO just SEO rebranded?",
      a: "Mostly, yes. **About 90% of what works is classic SEO** — clear, well-structured, genuinely useful content with real expertise behind it. The other 10% is new: making that content easy for a model to quote directly, with machine-readable formats and clear, dated sourcing.",
    },
    {
      q: "Do I need to stop using em dashes so AI doesn't flag my writing?",
      a: "No. Punctuation doesn't determine whether an AI answer engine cites you. That advice comes from the same corner of the industry selling \"AI detection proofing\" — a service aimed at a test that isn't reliable in the first place.",
    },
    {
      q: "How do I know if my GEO efforts are actually working?",
      a: "Ask the AI models directly, on a repeatable schedule, and write down what they say. Our [AI Recommendation Index](/charts/ai-recommendation-index) does this monthly with 10 fixed questions; our free [AI visibility checker](/tools/ai-visibility-checker) does the same thing for one business at a time.",
    },
    {
      q: "Should a small business pay for a GEO agency?",
      a: "Be skeptical of anyone promising guaranteed rankings inside ChatGPT or AI Overviews — these systems are probabilistic and change often, so no one can promise a fixed spot. Spend first on genuinely better, well-sourced content; that's the majority of what actually helps.",
    },
  ],
  sources: [
    {
      label: "Adobe — \"Adobe to Acquire Semrush\" (official press release, Nov 19, 2025)",
      url: "https://news.adobe.com/news/2025/11/adobe-to-acquire-semrush",
    },
    {
      label: "llmstxt.org — the llms.txt specification (proposed by Jeremy Howard, 2024)",
      url: "https://llmstxt.org/",
    },
    {
      label: "Gulf News — \"OpenAI shuts AI text detection tool over 'low rate of accuracy'\"",
      url: "https://gulfnews.com/technology/media/openai-shuts-ai-text-detection-tool-over-low-rate-of-accuracy-1.1690365699838",
    },
    {
      label: "Aggarwal et al., \"GEO: Generative Engine Optimization\" (arXiv 2311.09735, KDD 2024)",
      url: "https://arxiv.org/abs/2311.09735",
    },
  ],
};
