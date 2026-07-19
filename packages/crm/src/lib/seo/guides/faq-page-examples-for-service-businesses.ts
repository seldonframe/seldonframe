import type { Guide } from "./types";

export const guide: Guide = {
  slug: "faq-page-examples-for-service-businesses",
  title: "FAQ Page Examples for Service Businesses (What Good Ones Do)",
  description:
    "Real-world FAQ patterns for plumbers, cleaners, electricians, salons and other local service businesses — the questions to include and how the best pages are structured.",
  targetKeyword: "faq page examples",
  intent: "informational",
  cluster: "service-faq",
  relatedTool: "/tools/service-business-faq-generator",
  relatedBest: "/best/ai-agent-for-small-business",
  dek: "Rather than copy another company's FAQ word for word, it's more useful to see the patterns that good service-business FAQ pages share — the categories they cover and the way they're laid out — and then fill those patterns with your own honest answers.",
  sections: [
    {
      h2: "The five categories almost every good FAQ covers",
      body: "Across trades — plumbing, cleaning, electrical, landscaping, salons, mobile repair — the FAQ pages that work tend to answer the same five kinds of question.\n\n**Pricing**: how you charge, minimums, whether quotes are free. **Service area**: the towns or postcodes you cover.\n\n**Availability**: hours, lead time, whether you do emergencies or same-day. **Process**: what happens after someone books, and what to expect on the day.\n\nAnd **trust**: licensing, insurance, guarantees, and what happens if something goes wrong.\n\nIf your page answers those five honestly, it already does more than most. (See [common customer questions to answer on your website](/guides/common-customer-questions-to-answer-on-your-website) for a fuller list by topic.)\n\nThe exact wording changes by trade. But the worry underneath is the same everywhere: will they show up, what will it cost, can I trust them.",
    },
    {
      h2: "What a strong FAQ entry looks like in practice",
      body: "Take a mobile dog groomer. A weak entry reads: \"Q: Do you offer quality grooming? A: Yes, we pride ourselves on quality.\" That answers nothing.\n\nA strong entry reads: \"Q: Do you come to my house? A: Yes — we groom from a self-contained van outside your home. We cover [town] and up to 10 miles around it. You just need a parking spot; the van has its own power and water.\"\n\nThe difference is **specificity**. The strong version removes a real reason someone might hesitate to book.\n\nEvery good FAQ entry does that same job: it takes **one unspoken worry** and settles it with a concrete fact.",
      callout: {
        kind: "tip",
        text: "Quick test for any answer you write: could it appear word-for-word on a competitor's site? If yes, it's still too vague — add the number, the mile radius, the specific policy that makes it yours.",
      },
    },
    {
      h2: "How the best pages are laid out",
      body: "Nielsen Norman Group's teardown of real FAQ pages found the effective ones share a few traits: legible typography, questions written as bold headings, related questions grouped together, and easy ways to jump to a specific answer on longer pages.\n\nThe weak ones bury answers in dense text, use low-contrast links, or scatter questions with no order.\n\nFor most local businesses you don't need anything elaborate. Use **a single page**, questions as headings, grouped into the five categories above, with the **most common questions near the top**.\n\nAdd a short FAQ block on your booking or pricing page too — just the two or three questions people ask right before they commit.",
      diagram: {
        type: "compare",
        title: "What separates strong FAQ pages from weak ones",
        left: {
          heading: "Strong pages",
          items: ["Legible typography", "Questions as bold headings", "Related questions grouped together", "Jump links on longer pages"],
        },
        right: {
          heading: "Weak pages",
          items: ["Answers buried in dense text", "Low-contrast links", "Questions scattered with no order"],
        },
      },
    },
    {
      h2: "Turning the pattern into your own page",
      body: "The quickest way to start: write out your real questions in each of the five categories. Then answer each one as if a nervous first-time customer were asking.\n\nRead it back and **cut anything that sounds like a slogan**. If an answer could appear on any competitor's site unchanged, it's probably too vague to be useful.\n\nIf you'd rather start from a draft than a blank page, try the [service business FAQ generator](/tools/service-business-faq-generator). It produces a first set of questions and answers tailored to your trade and details.\n\nTreat it as a starting point: **confirm the prices, hours, and policies are right for you**, add anything specific to how you work, and delete anything that doesn't apply. For the full page-writing process, see [How to Write a FAQ Page](/guides/how-to-write-a-faq-page).",
      diagram: {
        type: "flow",
        title: "From blank page to a real FAQ",
        steps: [
          { label: "Write real questions", sub: "one per category" },
          { label: "Answer honestly", sub: "as a nervous first-time customer" },
          { label: "Cut the slogans", sub: "if it fits any competitor, it's too vague" },
          { label: "Confirm the details", sub: "prices, hours, policies are yours" },
        ],
      },
    },
  ],
  faq: [
    {
      q: "Can I just copy another business's FAQ page?",
      a: "Copy the **structure and categories**, not the answers. Prices, service areas, hours, and guarantees are specific to each business, so lifting another company's answers will mislead your customers and can create real problems when reality doesn't match the page.",
    },
    {
      q: "What questions do service-business customers ask most?",
      a: "Most cluster around cost, availability, service area, what's included, and what happens if something goes wrong. Reviewing your own recent calls and messages will surface the exact wording your customers use.",
    },
    {
      q: "How long should each FAQ answer be?",
      a: "Long enough to actually answer the question and short enough to scan — usually **one to three plain sentences**. If an answer runs longer, it's often two questions that should be split apart.",
    },
  ],
  sources: [
    {
      label: "Nielsen Norman Group — “An FAQ’s User Experience Deconstructed” (Susan Farrell)",
      url: "https://www.nngroup.com/articles/faq-ux-deconstructed/",
    },
    {
      label: "Nielsen Norman Group — “Strategic Design for Frequently Asked Questions” (report)",
      url: "https://www.nngroup.com/reports/strategic-design-faqs/",
    },
  ],
};
