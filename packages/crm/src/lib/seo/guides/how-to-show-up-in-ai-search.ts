import type { Guide } from "./types";

export const guide: Guide = {
  slug: "how-to-show-up-in-ai-search",
  title: "How to Show Up in AI Search (ChatGPT, Gemini, AI Overviews)",
  description:
    "AI search summarizes answers instead of listing links. Here's how to make your business one of the sources these engines pull from — based on what's actually known.",
  targetKeyword: "how to show up in ai search",
  intent: "informational",
  cluster: "ai-visibility",
  relatedTool: "/tools/ai-visibility-checker",
  relatedBest: "/best/ai-agent-for-small-business",
  relatedChart: { href: "/charts/ai-recommendation-index", label: "See what AI recommends across 10 buyer questions in the AI Recommendation Index" },
  dek: "AI search — Google's AI Overviews and AI Mode, ChatGPT, Gemini, Perplexity — answers a question directly and cites a handful of sources instead of showing ten links. Showing up means being one of those cited sources. The good news: most of what works is well-understood SEO plus being genuinely credible. The honest news: no one can guarantee a spot, and much of the \"AI search\" advice online is unproven.",
  sections: [
    {
      h2: "How AI search decides what to cite",
      body: "Most AI search features work the same basic way. They **retrieve relevant web content**, then summarize it. This is often called *retrieval-augmented generation*, or grounding.\n\nGoogle confirms this is how its AI features work. It adds that AI Overviews and AI Mode may use a *query fan-out* — firing off several related searches across subtopics before writing one answer.\n\nThat means your page can get cited for a question you never targeted directly. It just has to be the best match for one of those sub-searches.\n\nHere's the key consequence: **to be cited, you first have to be retrievable.** If a page isn't crawlable, indexed, and reasonably well ranked for the underlying query, it can't become a source.\n\nThat's why showing up in AI search starts with the same fundamentals as showing up in regular search.",
      callout: {
        kind: "analogy",
        text: "*Grounding* is a reporter who won't print a claim without checking it against a real document first — the model isn't just recalling facts from memory, it's pulling up your page and reading from it before it answers.",
      },
      diagram: {
        type: "flow",
        title: "How a page becomes a cited source",
        steps: [
          { label: "Page gets indexed", sub: "crawlable & ranked for the query" },
          { label: "AI fires a query fan-out", sub: "several related searches, one topic" },
          { label: "Best-matching content retrieved" },
          { label: "Answer written & sources cited" },
        ],
      },
    },
    {
      h2: "The fundamentals that actually move the needle",
      body: "Google's guidance on this is blunt: optimizing for AI search **is still SEO**. It runs on the same ranking systems as regular search.\n\nThe foundation is the usual one. Make sure your pages are **indexable and crawlable**, meet the basic technical requirements, and load fast.\n\nAvoid duplicate content. Write things that are genuinely **unique and useful** — not a rehash of what's already out there.\n\nGoogle is explicit about what you *don't* need: no llms.txt file, no special AI-only schema, no content \"chunking,\" no AI-specific rewrites.\n\nFor a local or service business, its actual advice is boring and verifiable: keep a **Google Business Profile** current, and a Merchant Center feed if you sell products.\n\nIn short, the boring fundamentals are the strategy.",
      diagram: {
        type: "compare",
        title: "What Google says vs. what's actually required",
        left: {
          heading: "Not required for AI features",
          items: ["An llms.txt file", "Special AI-only schema", "Content \"chunking\"", "AI-specific rewrites"],
        },
        right: {
          heading: "What actually helps",
          items: ["Crawlable, indexable pages", "Fast, technically solid site", "Unique, useful content", "Current Google Business Profile"],
        },
      },
    },
    {
      h2: "Write in a way models can quote",
      body: "Beyond the fundamentals, some content is just easier for a model to cite cleanly than other content.\n\nPages that answer a specific question **directly, near the top, in plain language** give a summarizing model something safe to lift.\n\nBack claims with **credible sources or concrete detail**. The original academic research on this, called *GEO* (short for [Generative Engine Optimization](/guides/what-is-generative-engine-optimization)), found that adding relevant statistics, citations, and authoritative quotes **measurably improved visibility** inside a generative engine, in controlled tests.\n\nTreat that as a helpful direction, not a magic formula. It's really just the habits of good, trustworthy writing: be specific, be accurate, be the clearest answer available.\n\nWhat you're avoiding is thin, vague, keyword-stuffed content. A model has no real reason to trust or quote that.",
      callout: {
        kind: "analogy",
        text: "A GEO-optimized page is a well-sourced encyclopedia entry sitting next to a rambling blog post — when a model has to pick which one to quote, the one with real numbers and citations wins.",
      },
    },
    {
      h2: "Measure it instead of guessing",
      body: "AI answers vary between engines, change often, and can't be guaranteed. So the sane move is to **measure, not assume**.\n\nAsk the major engines the questions a customer would actually ask, in your category and location. Note whether you show up, and whether the details are right.\n\nIt's common to find you're **missing entirely** — or that an engine states something **outdated** about your business.\n\nOur [AI visibility checker](/tools/ai-visibility-checker) gives you that snapshot fast: how AI assistants currently describe your business, so you can fix errors and see where you're absent.\n\nFrom there, keep expectations grounded. You're **improving your odds and correcting errors** — not buying placement.\n\nAnyone promising guaranteed AI-search rankings is selling certainty these systems **don't provide**.",
      callout: {
        kind: "tip",
        text: "Test the same question in more than one engine, not just one. They don't cite the same sources — a business can show up cleanly in one and be missing entirely from another.",
      },
    },
  ],
  faq: [
    {
      q: "Is showing up in AI search different from regular SEO?",
      a: "Mostly it's the same foundation. Google says optimizing for its generative AI features **is still SEO**, built on its normal ranking systems. AI search adds emphasis on being clearly quotable and accurate, but if you're not crawlable, indexed, and useful, you can't be retrieved and cited in the first place.",
    },
    {
      q: "Do I need special schema or an llms.txt file to show up in AI search?",
      a: "For Google's AI features, no. Google explicitly states you don't need llms.txt, special AI schema, content chunking, or AI-specific rewrites. Other engines behave differently, but no special file is a proven requirement. Focus on crawlable, accurate, genuinely useful content instead.",
    },
    {
      q: "How do I know if I already show up in AI search?",
      a: "Test it. Ask ChatGPT, Gemini, Google (AI Overviews), and Perplexity the questions your customers would ask, and check whether you appear and whether the details are right. An AI visibility checker automates this so you can see your current standing and spot inaccuracies to fix.",
    },
  ],
  sources: [
    {
      label:
        "Google Search Central — “Optimizing your website for generative AI features on Google Search”",
      url: "https://developers.google.com/search/docs/fundamentals/ai-optimization-guide",
    },
    {
      label:
        "Aggarwal et al., “GEO: Generative Engine Optimization” (arXiv 2311.09735, KDD 2024)",
      url: "https://arxiv.org/abs/2311.09735",
    },
    {
      label:
        "Search Engine Journal — “Google’s New AI Search Guide Calls AEO And GEO ‘Still SEO’”",
      url: "https://www.searchenginejournal.com/googles-new-ai-search-guide-calls-aeo-and-geo-still-seo/575026/",
    },
  ],
};
