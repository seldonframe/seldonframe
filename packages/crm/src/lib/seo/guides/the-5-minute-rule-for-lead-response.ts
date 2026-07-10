import type { Guide } from "./types";

export const guide: Guide = {
  slug: "the-5-minute-rule-for-lead-response",
  title: "How Fast Should You Respond to a Lead? The 5-Minute Rule, Explained",
  description:
    "The 5-minute rule says you should answer a new lead within five minutes. Here's where it comes from, what the evidence really shows, and how a small business can actually hit it.",
  targetKeyword: "how fast should you respond to a lead",
  intent: "informational",
  cluster: "speed-to-lead",
  relatedTool: "/tools/speed-to-lead-calculator",
  relatedBest: "/ai-agents/ai-receptionist",
  dek: "The short answer is: within five minutes, and ideally sooner. That's the well-known \"5-minute rule\" for lead response. Here's where the number comes from, what the research honestly supports, why speed beats a polished reply, and how a real small business can hit it without hiring a night shift.",
  sections: [
    {
      h2: "What the 5-minute rule is — and where it comes from",
      body: "The 5-minute rule is a simple guideline. When a new lead reaches out, try to give them a real response within about **five minutes**. Not an autoreply that says \"thanks, we'll be in touch\" — a human (or human-quality) reply that answers the question, asks a qualifying one, or offers a time to talk.\n\nThe number traces back to research on how fast the odds of connecting with a lead fall off. The most-cited version is a Harvard Business Review analysis of thousands of US companies. It found that businesses who tried to reach a lead within the first hour were far more likely to have a real conversation than those who waited — and that waiting even a few hours cut the odds sharply.\n\nFrom that pattern, five minutes became the practical target. It's the window where the person is still on your site, still holding their phone, and still deciding who to go with.\n\nSo \"five minutes\" isn't a magic threshold where something flips. It's shorthand for \"**respond while the lead is still warm**,\" and it stuck because it's specific enough to actually aim at."
    },
    {
      h2: "What the evidence actually shows (and what it doesn't)",
      body: "It's worth being honest about the research. The 5-minute rule gets quoted with a lot of false precision. Different studies use different industries, lead types, and definitions of \"contact\" versus \"qualify\" — so exact multipliers you'll see floating around (\"21x more likely!\") vary a lot and shouldn't be treated as gospel.\n\nWhat the research does consistently find is the pattern, not one exact number. The odds of reaching and qualifying a lead are highest right after they reach out, then fall off fast — often within minutes to the first hour — and keep declining the longer you wait. That's the *decay curve* research keeps finding across multiple analyses of inbound sales leads, and the Harvard Business Review study is the canonical source for it.\n\nThe takeaway to trust is the shape of the curve, not a precise figure. **Fast beats slow, minutes beat hours, and hours beat \"tomorrow.\"** If you can't verify a specific statistic for your industry, it's safer to say \"research consistently finds that response odds drop sharply with delay\" than to repeat a number you can't back up.",
      callout: {
        kind: "analogy",
        text: "A decay curve is like a scoop of ice cream left on a hot sidewalk — it doesn't vanish at any one instant, it just melts fastest in the first few minutes and keeps melting, slower, after that."
      }
    },
    {
      h2: "Why speed beats a polished reply",
      body: "A common instinct — especially for careful, quality-minded owners — is to wait until you can send the perfect, detailed response: the full quote, the availability, the pricing breakdown. The problem is that a new lead is almost never talking only to you.\n\nSomeone with a leaking water heater or a same-week appointment need typically contacts two or three businesses at once. They tend to go with whoever responds first and makes it easiest to move forward.\n\nThat's why a fast, imperfect reply usually wins. \"Happy to help — what's going on and where are you located?\" sent in three minutes beats a flawless, itemized quote sent in three hours, because by hour three the lead may have already booked someone else. **Speed gets you into the conversation; polish can come once you're in it.**\n\nThe cost of being slow rarely shows up as an obvious line item. It shows up as leads that \"went quiet,\" quotes that never got a reply, and a close rate you blame on tire-kickers rather than on the delay. If you want to put a rough dollar figure on that gap for your own numbers, our [speed-to-lead calculator](/tools/speed-to-lead-calculator) does exactly that.",
      diagram: {
        type: "compare",
        title: "Fast and imperfect beats slow and polished",
        left: {
          heading: "Fast, imperfect reply",
          items: ["Sent in about 3 minutes", "\"What's going on, where are you?\"", "Still in the conversation"]
        },
        right: {
          heading: "Polished, delayed reply",
          items: ["Sent in about 3 hours", "Full itemized quote", "Lead may already be booked elsewhere"]
        }
      }
    },
    {
      h2: "How to actually hit a 5-minute response in a real small business",
      body: "Hitting five minutes reliably is hard for a small service business, for one honest reason: the person who answers leads is usually the same person on a ladder, under a sink, or with a client. Most slow responses happen in exactly those gaps — after hours, on weekends, and mid-job — not because anyone is lazy.\n\nA few things reliably shrink the delay. **Funnel every channel** — calls, web forms, texts, chat, DMs — into one place so nothing sits unseen in an inbox no one checks.\n\n**Reply first, qualify second.** A quick acknowledgment that a real person is engaging buys you time to follow up properly. Prepare a couple of fast, reusable openers too, so the first reply takes seconds, not minutes of drafting.\n\nThe most durable fix is to stop depending on a human being free the instant a lead arrives. An **AI receptionist** or agent that answers immediately, 24/7 — on the phone, website chat, or by text — can greet the lead, ask the qualifying questions, and even book the appointment before they move on, then hand you a warm, already-captured contact.\n\nThat's how a two-person shop can respond in under five minutes at 9pm on a Sunday, without anyone staying up for it. If leads are going cold before you even see them, [why leads go cold](/guides/why-leads-go-cold) walks through the other common causes.",
      callout: {
        kind: "tip",
        text: "If you only fix one thing this week, fix the after-hours gap — that's when a lead is most likely reaching out with nobody around to answer, and it's the easiest slice to hand to an instant responder."
      },
      diagram: {
        type: "flow",
        title: "Shrinking the delay, step by step",
        steps: [
          { label: "Funnel every channel", sub: "calls, forms, texts, chat, DMs into one place" },
          { label: "Reply first, qualify second", sub: "a quick acknowledgment buys time" },
          { label: "Prepare fast openers", sub: "first reply takes seconds, not minutes" },
          { label: "AI receptionist covers gaps", sub: "answers 24/7 when no one's free" }
        ]
      }
    }
  ],
  faq: [
    {
      q: "How fast should you respond to a lead?",
      a: "As fast as you reasonably can — ideally within five minutes. Research consistently finds the odds of reaching and qualifying a lead are highest right after they reach out and drop sharply as time passes. Under an hour is a sensible floor; anything measured in hours or the next day is where most leads go cold."
    },
    {
      q: "Is the 5-minute rule a hard scientific threshold?",
      a: "No. Five minutes is a practical target, not a magic cutoff where results suddenly change. The underlying research shows a steady decay curve — response odds fall off fastest in the first minutes to an hour and keep declining after that. The exact numbers vary by industry and study, so treat five minutes as \"respond while the lead is still warm,\" not as a precise law."
    },
    {
      q: "What if I can't respond in five minutes because I'm working?",
      a: "That's the normal reality for most small service businesses, and it's exactly the gap that costs the most leads. The fix isn't to answer mid-job yourself — it's to route every channel into one place and let an instant responder (an AI receptionist, agent, or at minimum a fast human-quality acknowledgment) engage the lead until you're free."
    }
  ],
  sources: [
    {
      label: "Harvard Business Review — “The Short Life of Online Sales Leads” (Oldroyd, McElheran, Elkington)",
      url: "https://hbr.org/2011/03/the-short-life-of-online-sales-leads"
    }
  ]
};
