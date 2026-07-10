import type { Guide } from "./types";

export const guide: Guide = {
  slug: "how-many-faqs-should-a-website-have",
  title: "How Many FAQs Should a Website Have?",
  description:
    "There's no magic number of FAQs. Here's how to decide how many questions your small-business website really needs, and why coverage beats a padded list.",
  targetKeyword: "how many faqs should a website have",
  intent: "informational",
  cluster: "service-faq",
  relatedTool: "/tools/service-business-faq-generator",
  relatedBest: "/best/ai-agent-for-small-business",
  dek: "The honest answer is: as many as it takes to cover the questions your customers actually ask, and not one more. There's no universal number, but there is a sensible way to figure out yours — and a few signs you've gone too far.",
  sections: [
    {
      h2: "There's no magic number — but there is a range",
      body: "You'll see confident claims online that a website \"should\" have exactly ten or fifteen FAQs. **Ignore them.**\n\nThe right count is driven entirely by how many distinct things your customers genuinely wonder about before they hire you.\n\nFor a typical small local service business, that tends to land somewhere between roughly **eight and twenty questions**. A one-service mobile business might need eight; a firm offering several services across a wide area might need thirty.\n\nBoth are fine. The number is an **output** of your customers' real questions, not a target to hit.",
    },
    {
      h2: "Coverage matters more than count",
      body: "The useful question isn't \"how many\" but \"have I covered everything that makes someone hesitate?\" Nielsen Norman Group's research frames a good FAQ as one that reflects the current, real questions of a site's users.\n\nIf a common concern — say, whether you're insured, or what your callout fee is — has no answer on the page, adding five questions nobody asks doesn't fix that gap.\n\nSo build from your own evidence: your inbox, texts, and calls. Every recurring question earns a spot. Every question you've never actually been asked is a candidate to cut.",
      callout: {
        kind: "analogy",
        text: "**Coverage** is a net, not a pile. A pile of thirty FAQs with three big holes in it still lets customers fall through. A net of twelve that catches every real question they ask holds them all.",
      },
    },
    {
      h2: "When a FAQ page is too long",
      body: "It's possible to overdo it. A page with sixty entries becomes a wall of text people won't scan, which defeats the purpose.\n\nWarning signs include duplicate questions asking the same thing different ways, questions invented to sound impressive, and answers so long they're really articles in disguise.\n\nIf your list is getting unwieldy, group questions into clear categories (pricing, booking, service area, guarantees) so people can navigate, and consider moving genuinely deep topics onto their own pages.\n\nOn long pages, links that jump to a specific question help a lot. The goal is that any visitor can find their specific worry in seconds.",
      callout: {
        kind: "warning",
        text: "If you're duplicating questions to pad the count, inventing questions to sound impressive, or writing answers long enough to be their own article, your FAQ page has stopped serving visitors and started serving a number.",
      },
      diagram: {
        type: "compare",
        title: "Right-sized vs. bloated",
        left: {
          heading: "Right-sized FAQ",
          items: ["Every question is real", "Grouped by category", "Answers are short", "Visitor finds their worry in seconds"],
        },
        right: {
          heading: "Bloated FAQ",
          items: ["Duplicate questions, reworded", "Questions invented to look thorough", "Answers are full articles", "Visitor gives up scanning"],
        },
      },
    },
    {
      h2: "A practical way to land on your number",
      body: "List every question you can remember being asked in the last month or two. **De-duplicate** them, merge near-identical ones, and drop anything you've genuinely never been asked.\n\nWhatever survives is your number — and it will be the right one, because it came from real demand.\n\nRevisit it every few months. New questions surface as your business changes, and old ones fall away.\n\nIf you'd like a head start on the list, our [service business FAQ generator](/tools/service-business-faq-generator) drafts a coverage-focused starter set for your trade, which you can trim to exactly the questions that fit how you work.",
      diagram: {
        type: "flow",
        title: "How to land on your number",
        steps: [
          { label: "List every question", sub: "from the last month or two" },
          { label: "De-duplicate", sub: "same question, different wording" },
          { label: "Merge near-identical ones", sub: "keep one version" },
          { label: "Drop the unasked", sub: "never actually asked" },
          { label: "What's left is your number" },
        ],
      },
    },
  ],
  faq: [
    {
      q: "Is it bad to have too many FAQs?",
      a: "It can be. A very long, padded list is hard to scan and buries the answers people actually need. If your page is getting long, **group questions into categories** and move deep topics onto dedicated pages rather than adding questions no one asks.",
    },
    {
      q: "Can a small business have too few FAQs?",
      a: "Yes, if common concerns go unanswered. The problem isn't a low count itself — it's a gap in **coverage**. If customers still have to call to learn your prices or service area, the page needs those questions regardless of how short it is.",
    },
    {
      q: "Should every product or service have its own FAQ?",
      a: "Not necessarily. Many small businesses do well with one central FAQ page grouped by topic. Splitting into per-service FAQs only helps when the questions genuinely differ a lot between services.",
    },
  ],
  sources: [
    {
      label: "Nielsen Norman Group — “FAQs Still Deliver Great Value” (Susan Farrell)",
      url: "https://www.nngroup.com/articles/faqs-deliver-value/",
    },
    {
      label: "Nielsen Norman Group — “Strategic Design for Frequently Asked Questions” (report)",
      url: "https://www.nngroup.com/reports/strategic-design-faqs/",
    },
  ],
};
