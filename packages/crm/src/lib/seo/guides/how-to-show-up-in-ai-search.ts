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
      body: "Most AI search features work by retrieving relevant web content and then summarizing it — a technique often called retrieval-augmented generation, or grounding. Google describes exactly this for its AI features and adds that AI Overviews and AI Mode may use a \"query fan-out\" approach, issuing several related searches across subtopics before composing an answer. That means your content can surface for questions you never targeted directly, as long as it's the best match for one of those sub-searches.\n\nThe key consequence: to be cited, you first have to be retrievable. If a page isn't crawlable, indexed, and reasonably ranked for the underlying query, it can't become a source. This is why \"showing up in AI search\" starts with the same fundamentals as showing up in regular search.",
    },
    {
      h2: "The fundamentals that actually move the needle",
      body: "Google's guidance on its generative AI features is refreshingly blunt: optimizing for AI search is optimizing for the search experience, and thus still SEO. It points to the usual foundation — make sure your pages are indexable and crawlable, meet technical requirements, load well, and avoid duplicate content — and stresses creating content that is genuinely unique, useful, and non-commodity rather than a rehash of what's already out there.\n\nNotably, Google explicitly says several popular \"AI optimization\" tactics are unnecessary for its features: you don't need an llms.txt file, special AI-only schema, content \"chunking,\" or AI-specific rewrites. For a local or service business, it recommends practical, verifiable steps like maintaining a Google Business Profile and, for products, Merchant Center. In short, the boring fundamentals are the strategy.",
    },
    {
      h2: "Write in a way models can quote",
      body: "Beyond the fundamentals, there's a real difference between content a model can cite cleanly and content it can't. Pages that answer a specific question directly, near the top, in plain language — and back claims with credible sources or concrete detail — give a summarizing model something safe to lift. The original academic GEO research found that adding relevant statistics, citations, and authoritative quotes measurably improved a source's visibility inside a generative engine in controlled tests.\n\nTreat that as a helpful direction, not a magic formula. These are essentially the habits of good, trustworthy writing: be specific, be accurate, be the clearest available answer. What you're avoiding is thin, vague, keyword-stuffed content that a model has no reason to trust or quote.",
    },
    {
      h2: "Measure it instead of guessing",
      body: "Because AI answers vary between engines, change frequently, and can't be guaranteed, the sane approach is to measure rather than assume. Periodically ask the major engines the questions a customer would ask in your category and location, and note whether you appear and whether the details are correct. It's common to find you're missing entirely, or that an engine states something outdated about you.\n\nOur AI visibility checker gives you that snapshot quickly — how AI assistants currently describe your business, so you can fix inaccuracies and see where you're absent. From there, keep expectations grounded: you're improving your odds and correcting errors, not buying placement. Anyone promising guaranteed AI-search rankings is selling certainty these systems don't provide.",
    },
  ],
  faq: [
    {
      q: "Is showing up in AI search different from regular SEO?",
      a: "Mostly it's the same foundation. Google says optimizing for its generative AI features is still SEO, built on its normal ranking systems. AI search adds emphasis on being clearly quotable and accurate, but if you're not crawlable, indexed, and useful, you can't be retrieved and cited in the first place.",
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
