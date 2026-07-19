import type { Guide } from "./types";

export const guide: Guide = {
  slug: "common-customer-questions-to-answer-on-your-website",
  title: "Common Customer Questions to Answer on Your Website",
  description:
    "The questions local service customers ask before they book — pricing, availability, area, trust — and why answering them on your site wins more of them.",
  targetKeyword: "common customer questions",
  intent: "informational",
  cluster: "service-faq",
  relatedTool: "/tools/service-business-faq-generator",
  relatedBest: "/best/ai-agent-for-small-business",
  dek: "Most people would rather find an answer themselves than call and ask. If your website answers the handful of questions every customer has before booking, you'll capture the ones who'd otherwise quietly click away to a competitor who did.",
  sections: [
    {
      h2: "Why answering questions on your site matters",
      body: "Customers reach for *self-service* first. Harvard Business Review found that across industries, a full **81% of customers** try to solve a problem themselves before contacting a live person.\n\nFor a local service business, that means most visitors are trying to answer their own questions on your website — before they ever pick up the phone.\n\nIf the answer isn't there, some of them won't call to find it. They'll just click back and try the next business instead.\n\nSo the questions on your site aren't a courtesy — they're part of whether a visitor **becomes a customer or bounces**.",
      callout: {
        kind: "analogy",
        text: "Self-service is a store that leaves price tags on every shelf. Shoppers who'd rather not flag down a clerk can just read the tag and decide for themselves — the ones who can't find a tag often just walk out.",
      },
      diagram: {
        type: "compare",
        title: "What happens at the moment of hesitation",
        left: { heading: "The answer is on the site", items: ["Visitor gets what they need", "They book or move forward"] },
        right: { heading: "The answer is missing", items: ["They won't call to ask", "They click back and try a competitor"] },
      },
    },
    {
      h2: "The questions almost every customer has",
      body: "Before booking a local service, most people want to know the same handful of things. **How much does it cost** — or at least what's the range, and is a quote free? **Do you cover my area?**\n\nWhen can you come — today, this week, evenings, weekends? What exactly is **included, and what isn't**? Are you licensed, insured, and reviewed?\n\nAnd what happens if something goes wrong or I'm not happy? Those six themes — **price, area, availability, scope, trust, and recourse** — cover the overwhelming majority of pre-booking questions across trades.\n\nAnswer them plainly and you remove most of the reasons a ready-to-buy visitor hesitates. For how many of these actually belong on one page, see [how many FAQs a website should have](/guides/how-many-faqs-should-a-website-have).",
    },
    {
      h2: "Trade-specific questions worth adding",
      body: "On top of the universal six, each trade has its own recurring worries. A cleaner gets asked whether they bring their own supplies, and whether someone needs to be home.\n\nAn electrician gets asked about certificates and whether the power will be off. A mobile groomer gets asked about parking and access. A gardener gets asked who clears the waste.\n\nYou already know yours — they're the questions you answer on the phone every week. Listening to your own recent calls and messages is the fastest way to find the specific concerns that cost you jobs when left unanswered.",
      callout: {
        kind: "tip",
        text: "Your own call and text history is the most accurate FAQ research you'll ever do — it's free, it's specific to your business, and it's already sitting in your phone.",
      },
    },
    {
      h2: "Turning questions into booked jobs",
      body: "Answering questions well does double duty. It matches how people search — in plain, question-shaped language — and it removes friction right at the moment someone is deciding whether to book.\n\nHBR's point about self-service is really a point about winning: businesses that let customers help themselves **capture the ones who won't wait on hold**.\n\nThe practical step is to collect your real questions, answer each one honestly, and put them where hesitation happens — an FAQ page linked from the footer, plus a short block on your pricing or booking page. See [how to write a FAQ page](/guides/how-to-write-a-faq-page) that actually gets read.\n\nWant a drafted starting point? Our [service business FAQ generator](/tools/service-business-faq-generator) produces a tailored set built around these common themes, ready for you to edit to match your prices, area, and policies.",
      diagram: {
        type: "flow",
        title: "From real question to booked job",
        steps: [
          { label: "Collect the real questions", sub: "from your calls and messages" },
          { label: "Answer each one honestly" },
          { label: "Place them where hesitation happens", sub: "FAQ page + pricing/booking page" },
        ],
      },
    },
  ],
  faq: [
    {
      q: "What is the most important question to answer on my website?",
      a: "Usually **price**. Uncertainty about cost is the single biggest reason people hesitate or click away. Even a range, a starting price, or a clear \"free quote\" removes a major barrier and tends to increase enquiries rather than scare people off.",
    },
    {
      q: "How do I find out what my customers actually ask?",
      a: "Look at your own recent phone calls, texts, emails, and messages. The questions you answer over and over are exactly the ones to put on your website. That real evidence beats guessing or copying a generic list.",
    },
    {
      q: "Will answering questions on my site reduce the number of leads?",
      a: "Generally the **opposite**. Most customers try to self-serve before calling, so giving clear answers captures people who wouldn't have phoned to ask. It also means the calls you do get are from better-informed, more ready-to-book prospects.",
    },
  ],
  sources: [
    {
      label: "Harvard Business Review — “Kick-Ass Customer Service” (Dixon, Ponomareff, Turner, DeLisi)",
      url: "https://hbr.org/2017/01/kick-ass-customer-service",
    },
    {
      label: "Nielsen Norman Group — “FAQs Still Deliver Great Value” (Susan Farrell)",
      url: "https://www.nngroup.com/articles/faqs-deliver-value/",
    },
  ],
};
