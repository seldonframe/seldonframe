// Seed article for the /blog engine — a POV piece, not a how-to guide, and
// not video-sourced (sourceVideo intentionally omitted; proves the type
// handles both cases). Every factual claim about Google's own policies is
// backed by a real developers.google.com source in `sources` (never-lies) —
// no invented statistics anywhere in this file.

import type { BlogArticle } from "./types";

export const article: BlogArticle = {
  slug: "why-original-content-wins-seo",
  title: "Why Original Content Wins SEO Now (and AI Slop Loses)",
  description:
    "Google has published a policy for exactly this moment: pages generated at scale with no original value get demoted. Here's what that policy actually says, and what it means for anyone writing with AI help.",
  dek: "Google's own spam policy has a name for content mass-produced with no original value: scaled content abuse. The practical question for anyone using AI to write isn't whether the words came from a model — it's whether a real person's judgment, facts, or experience are in there.",
  targetKeyword: "why original content wins seo",
  date: "2026-07-13",
  sections: [
    {
      h2: "Google already named the problem",
      body:
        "It is tempting to treat \"AI content is bad for SEO\" as a vibe — something people repeat without a source. It isn't a vibe. Google's spam policies define **scaled content abuse** directly: pages \"generated for the primary purpose of manipulating search rankings and not helping users,\" regardless of how those pages were produced.\n\nThe policy is explicit that the method doesn't matter. It calls out \"generating numerous pages via AI tools without user benefit,\" but it also lists non-AI tactics in the same bucket: harvesting feeds or search results, combining content from multiple sources without meaningful additions, and publishing pages with minimal coherence that mainly exist to capture keywords. The common thread across every example is the same: *no added value*, at *scale*.\n\nThat framing matters because it means the AI-vs-human question is a distraction. A human writer padding out a thin listicle with no original insight is doing scaled content abuse just as much as a script that generates the same page a thousand times. The variable that matters is whether the page adds something that wasn't already sitting in the search results.",
    },
    {
      h2: "The real test is Google's own 'who, how, why'",
      body:
        "Google's helpful-content guidance gives a more useful lens than \"is this AI\": ask *who*, *how*, and *why*.\n\n*Who* made this — is there a real, identifiable author with actual expertise, not an anonymous byline. *How* was it made — if automation (including AI generation) was involved, is that self-evident rather than disguised. And *why* does it exist — Google says this is \"perhaps the most important question,\" because content made primarily to attract search visits, rather than to help a specific reader, is not what its ranking systems are built to reward.\n\nRead literally, that is not a ban on using AI to write. Google's own language draws the line at content made using \"extensive automation to produce content on many topics\" with no editorial judgment behind it — the volume-over-substance failure mode, not the tool itself. A person who uses a model to draft faster, then puts real facts, a real position, and real editing into the result, passes the *why* test. A pipeline that spins up hundreds of near-identical pages targeting long-tail keyword variants does not, whether a human or a script clicked \"publish.\"",
      callout: {
        kind: "tip",
        text: "The fastest self-check: could you defend this specific page to a specific reader who found it, or does it only make sense as one of a thousand near-identical pages built to rank for keyword variants? If it's the second one, it's the failure mode Google named, not an SEO trick that just needs better prompts.",
      },
    },
    {
      h2: "What this means in practice for anyone writing with AI",
      body:
        "None of this is a reason to avoid AI tools. It's a reason to be honest about what they're for. A model is genuinely good at structure, at drafting a first pass, at rephrasing something you already understand — it compresses the mechanical part of writing. It is not a substitute for having something specific to say.\n\nThe practical version of \"people-first content\" is boring and achievable: cite a real source instead of a vague claim, disclose who wrote it and why, and make sure the page would still be worth reading if it were the only page on the topic instead of one of a thousand. That is a much lower bar than \"never use AI\" — and it is the bar Google's own documentation actually sets.\n\nFor anyone running a content program at any scale — one article a week or fifty — the operating rule that follows directly from Google's own policy is simple: **write fewer pages that are actually true and actually useful, sourced honestly, before writing more pages.** Scale without originality is exactly the pattern the policy names. Originality with reasonable scale is not.",
    },
  ],
  faq: [
    {
      q: "Does Google penalize content just because it was written with AI?",
      a: "No — Google's own scaled content abuse policy targets content \"generated for the primary purpose of manipulating search rankings and not helping users,\" and explicitly lists non-AI tactics (like combining scraped content without adding value) in the same category. The method isn't the trigger; the absence of user value at scale is.",
    },
    {
      q: "What is 'scaled content abuse' exactly?",
      a: "It's Google's own term, defined in its spam policies as pages generated in large numbers primarily to manipulate rankings rather than help users — including AI-generated pages with no added value, scraped/combined content, and thin pages built mainly to capture search keywords.",
    },
    {
      q: "What's the practical takeaway for someone using AI to write blog posts or guides?",
      a: "Use AI for the mechanical part — drafting, structuring, rephrasing — but make sure the specific page adds something real: a cited fact, a disclosed author, an actual position. Google's helpful-content framework asks who made it, how, and why; content made primarily to attract search visits fails the why test regardless of who or what wrote the sentences.",
    },
  ],
  relatedGuide: "/guides/what-is-generative-engine-optimization",
  sources: [
    { label: "Google Search Central — Spam policies for Google web search (scaled content abuse)", url: "https://developers.google.com/search/docs/essentials/spam-policies" },
    { label: "Google Search Central — Creating helpful, reliable, people-first content", url: "https://developers.google.com/search/docs/fundamentals/creating-helpful-content" },
  ],
};
