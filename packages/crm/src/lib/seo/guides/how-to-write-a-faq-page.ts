import type { Guide } from "./types";

export const guide: Guide = {
  slug: "how-to-write-a-faq-page",
  title: "How to Write a FAQ Page That Actually Answers Questions",
  description:
    "A practical guide to writing an FAQ page for a small service business: which questions to include, how to phrase them, and how to keep the answers honest and useful.",
  targetKeyword: "how to write a faq page",
  intent: "informational",
  cluster: "service-faq",
  relatedTool: "/tools/service-business-faq-generator",
  relatedBest: "/best/ai-agent-for-small-business",
  dek: "A good FAQ page isn't a legal disclaimer or a marketing brochure in disguise. It's the set of real questions your customers ask before they hire you — answered plainly, in their words, so they can decide to book without having to call and wait for an answer.",
  sections: [
    {
      h2: "Start from the questions people actually ask",
      body: "The most common mistake is inventing questions that make the business look good — \"Why are you the best plumber in town?\" — instead of writing down the questions customers genuinely have. Nobody types that into a search bar. They type \"do you charge for a callout\" or \"can you come out today.\"\n\nThe raw material for a great FAQ page is already sitting in your inbox, your texts, and your call history. Spend twenty minutes listing the questions you answer over and over: pricing, service area, hours, what's included, how booking works, what happens if something goes wrong. Nielsen Norman Group's long-running research on FAQs makes the same point — the questions should reflect the current, real concerns of your visitors, not fabricated ones.",
    },
    {
      h2: "Write the question the way a customer would say it",
      body: "Phrase each question in the customer's voice, not yours. \"Do you service my area?\" beats \"Service coverage information.\" \"How much does a drain unblock cost?\" beats \"Pricing.\" This matters for two reasons: it's easier to scan, and it matches the exact wording people type into search engines. As NN/G puts it, people don't search for your solution — they search for their problem.\n\nKeep one question per entry. If you find yourself cramming three concerns into one heading, split them. A person skimming for their specific worry should be able to spot it in a second or two.",
    },
    {
      h2: "Answer honestly, including the awkward parts",
      body: "The answers that build the most trust are the ones that admit a limit. If you have a minimum callout fee, say the number or the range. If you don't work weekends, say so. If a job \"depends,\" explain what it depends on rather than hiding behind \"prices vary.\" Vague answers just push the customer back to phoning you — which is the friction the page was supposed to remove.\n\nGood FAQ answers are short, plain, and factual, and they openly acknowledge known limitations rather than reading like marketing copy. That candor is exactly what makes a nervous first-time customer comfortable enough to book.",
    },
    {
      h2: "Keep it scannable, and keep it current",
      body: "Group related questions (pricing, booking, service area, guarantees) and use the question itself as a bold heading so people can jump straight to what they need. Avoid burying answers behind clever layouts — a plain, well-spaced list beats a fancy multi-column grid for readability.\n\nAn FAQ page is never really finished. Every time a customer asks something the page doesn't cover, that's a new entry. If writing and maintaining all of this from scratch feels like a chore, our service business FAQ generator drafts a starter set of questions and honest answers from a few details about your business, so you can edit rather than stare at a blank page.",
    },
  ],
  faq: [
    {
      q: "How many questions should a FAQ page have?",
      a: "Enough to cover the things customers genuinely ask before booking — often somewhere between eight and twenty for a small service business. Quality beats quantity: a focused page that answers real concerns is more useful than a long list padded with questions no one asks.",
    },
    {
      q: "Where should the FAQ page live on my website?",
      a: "Give it its own page and link to it from the footer and from any page where people hesitate, like pricing or booking. Some businesses also add a short FAQ block directly on the homepage or service page for the two or three most common questions.",
    },
    {
      q: "Should I write the FAQ myself or use a tool?",
      a: "Either works, as long as the answers are true for your business. A tool can save you the blank-page problem by drafting common questions and answers you then edit, but you should always adjust prices, hours, and policies to match your own.",
    },
  ],
  sources: [
    {
      label: "Nielsen Norman Group — “FAQs Still Deliver Great Value” (Susan Farrell)",
      url: "https://www.nngroup.com/articles/faqs-deliver-value/",
    },
    {
      label: "Nielsen Norman Group — “An FAQ’s User Experience Deconstructed” (Susan Farrell)",
      url: "https://www.nngroup.com/articles/faq-ux-deconstructed/",
    },
  ],
};
