import type { Guide } from "./types";

export const guide: Guide = {
  slug: "faq-schema-for-local-seo",
  title: "FAQ Schema and Local SEO: What Still Helps in 2026",
  description:
    "FAQ schema no longer earns most sites rich results in Google. Here's an honest look at what FAQPage structured data still does — and doesn't — for a local business.",
  targetKeyword: "faq schema seo",
  intent: "informational",
  cluster: "service-faq",
  relatedTool: "/tools/service-business-faq-generator",
  relatedBest: "/best/ai-agent-for-small-business",
  relatedChart: { href: "/charts/ai-recommendation-index", label: "See what AI recommends across 10 buyer questions in the AI Recommendation Index" },
  dek: "FAQ schema was once a reliable way to grab extra space in Google's results. That's largely over. Here's what actually happened, what FAQPage markup still does for a local service business, and why the FAQ content itself matters more than the code around it.",
  sections: [
    {
      h2: "What FAQ schema is",
      body: "FAQ schema — technically *FAQPage structured data* — is a small block of code you add to a page. It tells search engines: \"this page has a list of questions and answers.\" It doesn't change what visitors see on your site; it's **metadata aimed at machines**.\n\nFor a while, adding it could make Google display your Q&A directly in the search results, as an expandable *rich result*. That gave your listing more visual space.\n\nThat's the outcome most people mean when they ask about \"FAQ schema for SEO.\" It's worth being clear about what's changed, because **a lot of older advice online is now out of date**.",
      callout: {
        kind: "analogy",
        text: "FAQPage markup is a shipping label on a box — it doesn't change what's inside. It just tells the machine sorting the packages what's there and how to handle it a little faster.",
      },
    },
    {
      h2: "The honest status: rich results are mostly gone",
      body: "In **August 2023**, Google announced it was rolling back FAQ rich results. Going forward, they'd only appear for \"well-known, authoritative government and health websites.\" For the vast majority of businesses — including essentially every local plumber, cleaner, or salon — the FAQ rich result **simply stopped showing** from that point.\n\nGoogle has continued to wind the feature down since. Its own structured-data documentation now reflects that the FAQ rich result is **no longer a general search feature**.\n\nSo if the goal of adding FAQ schema is to win those expandable Q&A snippets in Google, that door is closed for ordinary local sites. Anyone promising you FAQ rich results today is selling something Google no longer offers.",
      diagram: {
        type: "flow",
        title: "What happened to the FAQ rich result",
        steps: [
          { label: "Before Aug 2023", sub: "FAQ rich results could appear for any site with markup" },
          { label: "Aug 2023", sub: "Google announces the rollback" },
          { label: "Today", sub: "Only well-known gov/health sites still qualify" },
        ],
      },
    },
    {
      h2: "What FAQ markup still does — and doesn't",
      body: "FAQPage structured data is still valid markup. Google states you don't need to remove existing markup — **unused structured data doesn't harm your Search performance**.\n\nOther systems and search engines can still read it. Structured, clearly-labelled content is generally easier for machines to parse, which may matter as AI-driven search and assistants become more common.\n\nJust don't expect it to move rankings on its own. It's a description of your content, **not a ranking booster**.\n\nThe bigger point: the value was never really in the code. It was in having clear, genuinely useful answers to the questions people ask.\n\nThat content still helps you — through the on-page experience, through matching what people search for, and through being quotable by assistants — **with or without the schema wrapper**.",
      diagram: {
        type: "compare",
        title: "The code vs. the content",
        left: {
          heading: "The FAQPage code",
          items: ["Still valid, safe to leave in place", "Readable by other engines and AI systems", "No longer earns rich results for local sites"],
        },
        right: {
          heading: "The FAQ content itself",
          items: ["Matches how people actually search", "Improves the page for hesitant buyers", "Gives AI assistants clean answers to quote"],
        },
      },
    },
    {
      h2: "Where local businesses should actually focus",
      body: "For local SEO, spend your energy on the fundamentals that still work: a complete, accurate Google Business Profile; consistent name, address, and phone details; and genuine reviews.\n\nAdd website content that answers the real questions customers ask, in their own words. A strong FAQ page supports all of that — it matches the natural-language, question-shaped queries people type and increasingly speak, and it gives assistants clean answers to quote.\n\nSo **write the FAQ for humans first** — see [how to write a FAQ page](/guides/how-to-write-a-faq-page) for a full walkthrough. If your platform adds valid FAQPage markup automatically, there's no harm in leaving it on for other consumers of structured data — just don't build your strategy around rich results that no longer appear.\n\nIf you want help producing that question-and-answer content, our [service business FAQ generator](/tools/service-business-faq-generator) drafts a starter set tailored to your trade that you can edit and publish.",
    },
  ],
  faq: [
    {
      q: "Does FAQ schema still get rich results in Google?",
      a: "For almost all businesses, **no**. Since August 2023, Google has shown FAQ rich results only for well-known, authoritative government and health sites, and it has continued to retire the feature. Ordinary local business pages no longer get the expandable Q&A snippet.",
    },
    {
      q: "Should I remove FAQ schema from my site?",
      a: "You don't have to. Google says FAQPage markup is **still valid** and that structured data which isn't being used for a rich result doesn't cause problems for Search. Other search engines and AI systems may still read it, so it's generally fine to leave in place.",
    },
    {
      q: "Is an FAQ page still worth having for SEO?",
      a: "Yes, but for the **content, not the schema**. Clear answers to real customer questions match how people search, improve the experience for hesitant buyers, and give AI assistants clean answers to quote. That value is independent of whether any rich result shows.",
    },
  ],
  sources: [
    {
      label: "Google Search Central — FAQ (FAQPage) structured data documentation",
      url: "https://developers.google.com/search/docs/appearance/structured-data/faqpage",
    },
    {
      label: "Google Search Central Blog — “Changes to HowTo and FAQ rich results” (Aug 2023)",
      url: "https://developers.google.com/search/blog/2023/08/howto-faq-changes",
    },
  ],
};
