import type { Guide } from "./types";

export const guide: Guide = {
  slug: "is-geo-legit",
  title: "Is GEO Legit, or Just SEO Rebranded? A Practitioner's Answer",
  description:
    "GEO is mostly SEO with a citation-shaped scoring function. The honest 90/10 split, what genuinely differs, what's oversold, and how to measure it with real receipts.",
  targetKeyword: "is geo legit",
  intent: "informational",
  cluster: "ai-visibility",
  relatedTool: "/tools/ai-visibility-checker",
  relatedChart: { href: "/charts/ai-recommendation-index", label: "See our own live, receipts-included measurement in the AI Recommendation Index" },
  dek: "\"Generative Engine Optimization\" is either the most important SEO shift in a decade or a rebrand selling old tactics at new prices, depending on who you ask. We run a 500+ page GEO estate with real instrumentation, so here's the answer from the practitioner seat: mostly SEO, a real 10% that's genuinely different, and a lot of noise in between.",
  sections: [
    {
      h2: "The honest thesis: GEO is about 90% SEO",
      body: "Strip away the new vocabulary and *generative engine optimization* (GEO) is asking for the same things SEO always has: **crawlable pages, real expertise, and content that actually answers the question**.\n\nGoogle says as much directly. Its own guidance on optimizing for AI search states that best practices for SEO **continue to be relevant**, because its generative AI features are rooted in the same core ranking and quality systems as regular Search.\n\nSo when someone sells you a \"GEO strategy\" that's really just good SEO with new language, that's not a scam. It's just **not a new discipline**.",
      callout: {
        kind: "analogy",
        text: "GEO handing you a scoring function on top of SEO — same inputs (crawlable, credible, well-structured content), a slightly different output (does a model quote you, not just rank you).",
      },
    },
    {
      h2: "The real 10%: what genuinely differs",
      body: "The part that's actually new is narrower, but it's **real and measurable**. It comes down to being *citable* by a system that quotes sources rather than just ranking links.\n\nOn our own pages, that means a few concrete things stacked on top of normal SEO: a plain **Markdown twin** of every article an AI agent can fetch directly, a **sources row** on every factual claim, a **verified last-updated date**, and an **author entity** a model can attach the claim to.\n\nNone of that replaces good content. It's the layer that makes good content **easier for a model to lift and attribute** instead of paraphrase from a listicle.",
      diagram: {
        type: "stack",
        title: "What sits on top of a normal SEO page",
        layers: [
          { label: "Base page", sub: "crawlable, answers the real question" },
          { label: "Sources + verified dates", sub: "every claim hedged or cited" },
          { label: "Agent-readable Markdown twin", sub: "/page.md, fetchable directly" },
          { label: "Author entity", sub: "a named, consistent byline a model can attach a claim to" },
        ],
      },
    },
    {
      h2: "One honest caveat: not all of it moves Google",
      body: "Here's where a practitioner's answer has to stay honest, even when it undercuts our own build. Google's AI-optimization guide is explicit: it **doesn't use llms.txt files**, and adding one \"will neither harm nor help\" a site's Google visibility.\n\nSo the Markdown twins and llms.txt registration we run aren't a Google-ranking hack. They exist for the *other* engines and agents that do fetch structured, agent-readable content directly — and for a simple reason: **when a page is genuinely easy for anything to read, it's rarely worse for the reader either**.\n\nAnyone telling you llms.txt guarantees a Google AI Overview citation is stating something Google itself denies.",
    },
    {
      h2: "What GEO sellers oversell",
      body: "The GEO sales pitch has picked up some tactics with **no evidence behind them**. Scrubbing every em dash from your writing because \"AI detectors flag it.\" \"AI-optimized rewrites\" that reformat existing content without adding a single new fact. Magic prompt injections claiming to guarantee a citation.\n\nNone of that is measurable, and none of it is what the actual GEO research points to. The 2024 academic paper that coined the term found the tactics that helped were substantive ones — **adding real statistics, citing credible sources, quoting authoritative voices** — not formatting tricks.\n\nIf a vendor can't show you a before/after measurement, they're selling a story, not a result.",
      callout: {
        kind: "warning",
        text: "A guaranteed AI citation is not a real product. These systems are probabilistic and change often — anyone promising a fixed outcome is overselling.",
      },
    },
    {
      h2: "How to actually measure it — with our own receipts",
      body: "Talk is cheap; a public, dated measurement isn't. We publish our own [AI Recommendation Index](/charts/ai-recommendation-index): 10 fixed buyer questions run through Claude every month, scored into a leaderboard, with the raw answers archived so every score is auditable.\n\nIn the July 2026 snapshot, **SeldonFrame did not appear in any of the 10 answers**. We published that absence as-is instead of nudging the questions to flatter ourselves — because a measurement you'd only trust if it were flattering isn't a real measurement.\n\nFor a single business instead of a market, our [AI visibility checker](/tools/ai-visibility-checker) does the same thing at your scale: it shows what AI currently says about your business, wrong facts included.",
      diagram: {
        type: "loop",
        title: "The only cadence that counts as measuring GEO",
        steps: ["Check what AI says about you today", "Fix the wrong facts, add real sources", "Publish genuinely citable content", "Re-check next month"],
      },
    },
    {
      h2: "The plain do-this list",
      body: "Start by running a free check on your own business, not by writing anything new. Most of the gap is a model repeating a **wrong phone number or a service you dropped years ago**, not a content gap.\n\nNext, make your business information **consistent everywhere it appears** — your site, directories, socials. Inconsistent facts are the fastest way to get a model to guess wrong.\n\nThen write a handful of pages that **directly answer a real customer question**, cite anything you claim, and date them. Skip the formatting gimmicks entirely — they've shown no measurable effect, and the fundamentals shown above are what the evidence actually supports.",
      callout: {
        kind: "tip",
        text: "Run the free check before you touch a single page. You can't fix what you haven't measured, and most businesses are surprised by what AI already gets wrong about them.",
      },
    },
  ],
  faq: [
    {
      q: "Is GEO legit, or is it just SEO with a new name?",
      a: "Both, honestly. The core mechanics are the same crawlable, credible, well-structured content SEO has always rewarded — Google says its own AI features are rooted in normal ranking systems. What's genuinely new is a narrower layer: being directly citable by a system that quotes rather than ranks. That layer is real, but it's roughly 10% of the picture, not a whole new discipline.",
    },
    {
      q: "Should I pay an agency for a dedicated 'GEO package'?",
      a: "Be skeptical of anything sold as guaranteed or as a proprietary formula — the research doesn't support fixed outcomes, and Google explicitly says common 'AI files' like llms.txt don't affect its rankings either way. Ask any vendor for a before/after measurement. If they can't show one, you're paying for a rebrand of existing SEO work.",
    },
    {
      q: "How do I know if AI already recommends my business?",
      a: "Ask it directly, the way a customer would, and read the answer carefully for wrong facts. Our free AI visibility checker automates that for one business; the AI Recommendation Index does the same thing across a market of competitors, with the raw answers published so you can check the method yourself.",
    },
  ],
  sources: [
    {
      label: "Google Search Central — \"Optimizing your website for generative AI features on Google Search\"",
      url: "https://developers.google.com/search/docs/fundamentals/ai-optimization-guide",
    },
    {
      label: "Aggarwal et al., \"GEO: Generative Engine Optimization\" (arXiv 2311.09735, KDD 2024)",
      url: "https://arxiv.org/abs/2311.09735",
    },
  ],
};
