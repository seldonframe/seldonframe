import type { Guide } from "./types";

export const guide: Guide = {
  slug: "what-is-speed-to-lead",
  title: "What Is Speed-to-Lead? (And Why 5 Minutes Changes Everything)",
  description:
    "Speed-to-lead is how fast you respond after someone reaches out. Here's what it means, why the first 5 minutes matter so much, and how to measure and improve it.",
  targetKeyword: "what is speed to lead",
  intent: "informational",
  cluster: "speed-to-lead",
  relatedTool: "/tools/speed-to-lead-calculator",
  relatedBest: "/ai-agents/ai-receptionist",
  relatedChart: { href: "/charts/missed-revenue-decay", label: "See the decay curve behind this math in the Lead Decay Curve" },
  dek: "Speed-to-lead is the time between a potential customer reaching out and you actually responding. It's one of the few growth levers that costs nothing to pull and quietly decides how many of your leads ever become customers.",
  sections: [
    {
      h2: "What speed-to-lead actually means",
      body: "Speed-to-lead (sometimes called lead response time) is the elapsed time between a prospect's first contact — a phone call, form fill, text, or DM — and your first genuine response to them. Not an autoresponder saying \"we got your message,\" but a real reply that moves things forward: answering the question, asking a qualifying one, or offering a time to talk.\n\nIt matters because a new lead is rarely talking only to you. Someone with a burst pipe or a same-day appointment need is usually reaching out to two or three businesses at once, and tends to go with whoever responds first and makes it easiest to move forward.",
    },
    {
      h2: "Why the first five minutes matter so much",
      body: "The best-known research on this is a Harvard Business Review study of thousands of US companies, which found that firms trying to contact leads within an hour were far more likely to have a meaningful conversation than those that waited longer — and that the odds dropped sharply as time passed.\n\nThe practical takeaway that stuck is the \"5-minute rule\": responding within about five minutes, while the person is still on your website or still holding their phone, dramatically raises your chance of connecting. Wait hours and you're often calling someone who has already moved on — or already booked with a competitor. The exact numbers vary by industry and source, but the direction is consistent everywhere it's been measured.",
    },
    {
      h2: "What slow response quietly costs you",
      body: "Slow speed-to-lead doesn't show up as a line item, which is why it's easy to ignore. It shows up as leads that \"went quiet,\" quotes that never got a reply, and a close rate that's lower than it should be — all blamed on the leads being \"tire-kickers\" rather than on the delay.\n\nThe math is simple: if you close a healthy share of leads you reach quickly but only reach a fraction of the ones you get to slowly, most of your lost revenue is hiding in the gap between \"someone reached out\" and \"someone followed up.\" Our speed-to-lead calculator lets you put a rough dollar figure on that gap for your own numbers.",
    },
    {
      h2: "How to actually respond faster",
      body: "A few things reliably shrink response time: route every channel (calls, forms, texts, chat) into one place so nothing sits unseen; reply first and qualify second, since a fast \"happy to help — what's going on?\" beats a slow, perfect answer; and cover the after-hours and on-a-job gaps where most slow responses actually happen.\n\nThe most durable fix is to not depend on a human being free the moment a lead arrives. An AI agent that answers instantly, 24/7 — on the phone, website chat, or text — asks the qualifying questions and books the appointment before the lead moves on, then hands you a warm, already-captured contact.",
    },
  ],
  faq: [
    {
      q: "What is a good speed-to-lead time?",
      a: "Under five minutes is the widely-cited target, because that's when a lead is still engaged and hasn't yet contacted a competitor. Under an hour is a reasonable floor; anything measured in hours or the next day is where most leads go cold.",
    },
    {
      q: "How do I measure my speed-to-lead?",
      a: "Track the timestamp of each new lead (call, form, text) against the timestamp of your first real reply, and look at the average and the worst cases. The after-hours and mid-job gaps usually drag the average down the most.",
    },
    {
      q: "Does speed-to-lead matter for small businesses?",
      a: "Especially for small local businesses, where the customer is often comparing a few options at once and books with whoever answers first. It's one of the cheapest ways to win more of the leads you already get.",
    },
  ],
  sources: [
    {
      label: "Harvard Business Review — “The Short Life of Online Sales Leads” (Oldroyd, McElheran, Elkington)",
      url: "https://hbr.org/2011/03/the-short-life-of-online-sales-leads",
    },
  ],
};
