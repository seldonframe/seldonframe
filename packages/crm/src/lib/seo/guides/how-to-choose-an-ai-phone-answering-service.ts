import type { Guide } from "./types";

export const guide: Guide = {
  slug: "how-to-choose-an-ai-phone-answering-service",
  title: "How to Choose an AI Phone Answering Service (A Buyer's Guide)",
  description:
    "An AI phone answering service is software that answers your business calls 24/7 in a natural voice. Here's exactly what to look for, what to ask, and what to avoid.",
  targetKeyword: "ai phone answering service",
  intent: "commercial",
  cluster: "ai-receptionist",
  relatedTool: "/tools/ai-receptionist-cost-calculator",
  relatedBest: "/ai-agents/ai-receptionist",
  dek: "An AI phone answering service is software that picks up your business calls around the clock, talks in a natural voice, and books or routes the caller — no human required. Choosing the right one comes down to six things: how it answers, how it books, and how honestly it charges.",
  sections: [
    {
      h2: "What an AI phone answering service actually does",
      body: "An *AI phone answering service* is a piece of software that answers your business phone line instead of a person. It talks to the caller in a natural-sounding voice, follows the script and rules you've set up, and either **books an appointment**, answers a common question, or takes a message.\n\nIt's not a robotic phone tree where you press 1 for sales. A good one holds a real back-and-forth conversation — \"what's the address,\" \"do you have anything Thursday\" — the way a receptionist would.\n\nThe promise is simple: **every call gets answered**, day or night, without you paying a person to sit by the phone waiting for it to ring.",
      callout: {
        kind: "analogy",
        text: "Think of it as a receptionist who never takes a lunch break, never gets sick, and never lets a call go to voicemail — because there's no shift to cover.",
      },
    },
    {
      h2: "How it's different from voicemail and a human answering service",
      body: "Voicemail is the lowest bar: the caller leaves a message and *hopes* someone calls back. Most don't wait around for that. A recent CallRail benchmarking report found that **up to 85% of customers whose calls go unanswered will not call the business back** — they just try the next name on the list.\n\nA [human answering service](/guides/ai-receptionist-vs-answering-service) fixes the \"nobody answered\" problem by paying a person to pick up, usually billed by the minute. An AI phone answering service fixes the same problem with **software instead of staffed minutes** — it answers instantly, every time, at a cost that doesn't spike with call volume.\n\nThe difference that matters when you're choosing: voicemail captures *nothing* in real time, a human service captures everything but costs more per call, and AI aims for the middle — instant, consistent, and connected straight into your systems.",
      diagram: {
        type: "compare",
        title: "What happens when the phone rings",
        left: {
          heading: "Voicemail or no answer",
          items: ["Caller leaves a message, or hangs up", "No booking happens live", "Most won't call back", "You call back cold, hours later"],
        },
        right: {
          heading: "AI phone answering service",
          items: ["Answers on the first or second ring", "Books the appointment live", "Sends the details to your CRM/calendar", "No staffed minutes to pay for"],
        },
      },
    },
    {
      h2: "The six things that actually matter when choosing one",
      body: "Vendors will show you a slick demo. What decides whether it actually works for your business is narrower than that. Here's the short list worth checking before you sign anything.\n\n**24/7 coverage** — does it answer nights, weekends, and holidays, or only during business hours with a human backup? **Real booking**, not just message-taking — can it check your actual calendar and confirm a slot, or does it just promise \"someone will call you back\"?\n\n**A hand-off to your CRM and calendar** — does the booked appointment and the caller's info land automatically in the tools you already use, or does someone have to retype it? **A voice that sounds natural** — test it yourself; a robotic or laggy voice loses trust in the first ten seconds.\n\n**Transparent pricing** — flat monthly rate, per-minute, or per-call, and what happens when you go over? **Handles your real FAQs** — can it actually answer *your* most common questions (hours, pricing, service area) instead of just generic small talk?",
      diagram: {
        type: "stack",
        title: "What to check, top to bottom",
        layers: [
          { label: "24/7 coverage", sub: "nights, weekends, holidays" },
          { label: "Real booking", sub: "checks the calendar, confirms a slot" },
          { label: "CRM/calendar hand-off", sub: "no manual re-entry" },
          { label: "Natural-sounding voice", sub: "test it yourself before buying" },
          { label: "Transparent pricing", sub: "flat, per-minute, or per-call" },
          { label: "Handles your real FAQs", sub: "not just generic small talk" },
        ],
      },
    },
    {
      h2: "The exact questions to ask a vendor",
      body: "Bring a short list to the sales call instead of relying on the demo alone. Ask: \"What happens on a call you can't handle — does it escalate to a person, or just apologize and hang up?\" \"Can I hear a recording of a real call, not a scripted demo?\"\n\nAsk **\"what's the total cost at my actual call volume\"** — not the advertised starting price, since per-minute plans can climb fast for a busy phone line. And ask **\"where does the booking actually go\"** — get specific about which calendar and CRM it connects to, and whether that connection is live or a manual export.\n\nFinally: \"Can I edit the script and FAQs myself, or do I need to file a support ticket every time my hours change?\" A vendor who answers all of these plainly, with specifics, is a good sign. One who deflects to \"it just works\" is not.",
      callout: {
        kind: "tip",
        text: "Call the demo line yourself and try to break it — ask an odd question, interrupt it, or give an out-of-town address. How gracefully it handles a curveball tells you more than any feature list.",
      },
    },
    {
      h2: "Rough cost ranges and how billing works",
      body: "Pricing in this category comes in **two shapes**: a flat monthly rate that covers a set volume of calls or minutes, or a per-minute / per-call rate that scales with usage. Flat pricing is easier to budget; per-minute pricing can be cheaper if your phone rarely rings but expensive if it's busy.\n\nExact numbers vary a lot by vendor, call volume, and what's included (booking, CRM sync, custom scripting), so **get a quote for your own call volume** rather than trusting an advertised \"starting at\" price. Our [AI receptionist cost calculator](/tools/ai-receptionist-cost-calculator) helps you estimate what your specific call volume would actually cost.\n\nThe honest rule: if a vendor won't give you a straight answer about total cost at your volume before you sign up, **that's the answer**.",
    },
    {
      h2: "Red flags to watch for",
      body: "**No live demo you can actually test** — if you can't call a number and talk to it yourself before buying, that's a problem. **Vague pricing** that only reveals itself after a sales call, or a low \"starting at\" price that hides per-minute overages.\n\n**No real calendar integration** — if bookings just generate an email someone has to manually enter, you've bought a fancier voicemail, not a receptionist. **Long lock-in contracts** with no month-to-month option, especially from a vendor you haven't tested at scale yet.\n\nAnd **a voice that sounds obviously robotic** in the demo — if it sounds off in a sales pitch, it will sound worse on a real call from a stressed customer.",
      callout: {
        kind: "warning",
        text: "If a vendor can't tell you where a booked appointment actually goes — which calendar, which CRM, in real time or a manual export — assume the answer is \"nowhere useful\" until they prove otherwise.",
      },
    },
  ],
  faq: [
    {
      q: "What is an AI phone answering service?",
      a: "It's software that answers your business phone calls in a natural-sounding voice, follows the script and rules you set, and books appointments or answers common questions on its own — instead of a human operator or a voicemail box picking up.",
    },
    {
      q: "How much does an AI phone answering service cost?",
      a: "It depends on the vendor and your call volume. Most charge either a flat monthly rate for a set number of calls or minutes, or a per-minute/per-call rate that scales with usage. Get a quote based on your actual call volume rather than an advertised starting price.",
    },
    {
      q: "Is an AI phone answering service better than voicemail?",
      a: "For capturing business, generally yes — voicemail only records a message and hopes for a callback, and most callers whose calls go unanswered simply don't call back. An AI phone answering service answers live and can book the appointment in the moment instead.",
    },
    {
      q: "Can an AI phone answering service book appointments directly?",
      a: "A good one can — it checks your real calendar availability and confirms a slot with the caller, then syncs the booking to your CRM or calendar automatically. That's one of the key things to verify before choosing a vendor, since some only take a message instead of actually booking.",
    },
  ],
  sources: [
    {
      label: "CallRail — “From Conversations to Conversions: How Small Businesses Can Market Smarter” (2025), via Plumber magazine",
      url: "https://www.plumbermag.com/online_exclusives/2025/01/callrail-releases-report-analyzing-which-marketing-efforts-best-convert-leads-into-business",
    },
  ],
};
