import type { Guide } from "./types";

export const guide: Guide = {
  slug: "average-lead-response-time-by-industry",
  title: "Average Lead Response Time by Industry (What the Benchmarks Really Say)",
  description:
    "What's the average lead response time? The honest answer is that it varies a lot by source and most figures are years old. Here's what the studies actually show — and the benchmark to aim for.",
  targetKeyword: "average lead response time",
  intent: "informational",
  cluster: "speed-to-lead",
  relatedTool: "/tools/speed-to-lead-calculator",
  relatedBest: "/ai-agents/ai-receptionist",
  relatedChart: { href: "/charts/missed-revenue-decay", label: "See the decay curve behind this math in the Lead Decay Curve" },
  dek: "Average lead response time is how long a typical business takes to reply after someone reaches out. It's one of the most quoted numbers in sales — and one of the shakiest, because the figures vary wildly by study, industry, and year. Here's what the research actually supports, and what to aim for regardless of the average.",
  sections: [
    {
      h2: "What the average response time actually is (read this part carefully)",
      body: 'There\'s **no single trustworthy "the average is X hours" number**. Anyone who quotes one with a straight face is usually rounding off a study you can\'t see.\n\nThe honest picture: response times measured across companies tend to land somewhere between many hours and a couple of days — not minutes. Widely-circulated benchmark reports have put the typical first-response time anywhere from around a day to nearly two days. Industry breakdowns swing even harder, depending on who was counted and how.\n\nA few things make these numbers slippery. Many of the most-repeated figures trace back to studies that are years — sometimes more than a decade — old. Different reports measure different things.\n\nSome track only leads that eventually got a reply. Some include the ones that never did. Some count auto-replies as a "response" and some don\'t.\n\nAnd a lot of the eye-catching stats float around vendor blogs with no linkable primary source. So treat any specific hours-and-minutes benchmark as a rough signal of direction, not a fact about your business.\n\nWhat\'s consistent across nearly every credible look at this isn\'t the exact figure — it\'s the shape of the finding. **Most companies respond far slower than buyers expect**, and **slower responders connect and close less often**.',
      callout: {
        kind: "warning",
        text: "Be skeptical of any lead-response stat that sounds too specific — \"companies respond in 47 hours on average\" is the kind of line that spreads because it's quotable, not because it's current. Ask what was measured, on whom, and how long ago before you build a plan around it.",
      },
    },
    {
      h2: "Why most businesses are far slower than they think",
      body: 'Ask an owner how fast they respond to a new lead and you\'ll usually hear "pretty quick, same day." Measure it and the average is almost always worse.\n\nThat\'s because **the average isn\'t set by the leads you catch at your desk**. It\'s set by the ones that arrive at 7pm, during a job, over the weekend, or while you\'re on another call — those become tomorrow-morning callbacks, and tomorrow morning is often too late.\n\nThe classic Harvard Business Review analysis of online sales leads made this point years ago. Firms that made **contact within an hour** were dramatically more likely to have a meaningful conversation than those that waited longer. Yet a large share of companies took far longer than an hour — and many never followed up at all.\n\nThe exact percentages from that study are old and specific to its sample, so we won\'t lean on them as gospel. But the underlying gap it exposed — **between how fast businesses believe they respond and how fast they actually do** — is the part that keeps showing up everywhere.\n\nMost "average" response times are dragged down by the after-hours and mid-job window, which is exactly where the average business isn\'t looking.',
    },
    {
      h2: "The benchmark actually worth aiming for",
      body: 'Because the published averages are so noisy, the more useful target isn\'t "beat the industry number" — it\'s "**be fast enough that the lead is still paying attention**." In practice that means minutes, not hours.\n\nThe widely-cited five-minute rule exists because that\'s roughly the window where someone is still on your site or still holding their phone, before they\'ve moved on to the next name on their list. **Under five minutes** is the aspirational target; under an hour is a reasonable floor for anything that comes in during working hours. Anything measured in "next business day" is where most of the loss happens.\n\nFor a small local business, the benchmark that matters even more is **your worst case, not your average**. If you connect quickly with the leads you happen to catch but let the after-hours ones sit until morning, your average can look fine while your actual lost revenue lives entirely in the slow tail.\n\nThat\'s the number to attack. This is what people mean by *speed to lead* — [read the full breakdown](/guides/what-is-speed-to-lead) if the term is new. Our [speed-to-lead calculator](/tools/speed-to-lead-calculator) lets you plug in your own lead volume and close rate to see what that tail is quietly costing you, rather than comparing yourself to a benchmark that was measured on somebody else\'s business.',
      callout: {
        kind: "analogy",
        text: "Speed to lead is a lot like a 100-meter race where only the first ten steps count — a lead who's still on your site, phone in hand, is a completely different prospect than the same person twelve hours and three competitor calls later.",
      },
      diagram: {
        type: "bars",
        title: "The response-time numbers this article actually uses",
        unit: "minutes",
        items: [
          { label: "Five-minute rule (aspirational target)", value: 5, display: "5 min" },
          { label: "Reasonable floor, working hours", value: 60, display: "under 60 min" },
          { label: "Widely-cited benchmark, upper end", value: 2880, display: "~2 days" },
        ],
        note: "The 5-minute and 60-minute marks are targets, not measured averages — the ~2-day figure is the upper end of widely-cited (and old) benchmark reports on actual company behavior.",
      },
    },
    {
      h2: "How to beat the average",
      body: 'Beating the average is less about hustling harder in the moment and more about removing the moments where a lead can sit unseen. Three things reliably help.\n\n**Route every channel — calls, form fills, texts, web chat — into one place** so nothing waits in an inbox nobody\'s watching. **Reply first and qualify second**, because a fast "happy to help, what\'s going on?" beats a slow, perfect quote. And **specifically cover the after-hours and on-a-job gaps**, since that\'s where nearly all of a slow average is created.\n\nThe most durable fix is to stop depending on a person being free the instant a lead arrives. An [AI receptionist](/ai-agents/ai-receptionist) that answers immediately, around the clock — on the phone, in web chat, or over text — asks the qualifying questions and books the appointment while the lead is still engaged, then hands you a warm, already-captured contact.\n\nThat\'s what **turns a response time measured in hours into one measured in seconds**, without asking anyone to sit by the phone. When the after-hours gap is covered, the average takes care of itself.',
      diagram: {
        type: "flow",
        title: "The three moves that actually shrink your average",
        steps: [
          { label: "Route every channel", sub: "calls, forms, texts, chat — one place" },
          { label: "Reply first, qualify second", sub: "a fast \"what's going on?\" beats a slow quote" },
          { label: "Cover the after-hours gap", sub: "nights, weekends, mid-job — where the average is lost" },
        ],
      },
    },
  ],
  faq: [
    {
      q: "What is the average lead response time?",
      a: "There's no single reliable figure — published benchmarks range from several hours to a couple of days, and they disagree a lot because they measure different things and are often years old. The consistent finding isn't the exact number; it's that most businesses respond far slower than buyers expect. Rather than chase the average, aim to respond within five minutes while the lead is still engaged.",
    },
    {
      q: "Why do lead response time statistics vary so much between sources?",
      a: "Because they're not measuring the same thing. Some studies count only leads that eventually got a reply, some include the ones that never did, some treat an auto-reply as a response, and many of the most-quoted numbers come from older studies or vendor blogs with no verifiable source. Treat any specific benchmark as a rough direction, not a precise fact.",
    },
    {
      q: "What's a good lead response time to aim for?",
      a: "Under five minutes is the widely-cited target, because that's when a lead is still engaged and hasn't yet contacted a competitor. Under an hour is a reasonable floor during working hours. For a small business, focus on your worst case — the after-hours and mid-job leads — because that slow tail, not your average, is usually where the lost revenue is.",
    },
  ],
  sources: [
    {
      label:
        "Harvard Business Review — “The Short Life of Online Sales Leads” (Oldroyd, McElheran, Elkington, 2011)",
      url: "https://hbr.org/2011/03/the-short-life-of-online-sales-leads",
    },
  ],
};
