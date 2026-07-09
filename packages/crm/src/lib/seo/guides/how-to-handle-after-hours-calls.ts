import type { Guide } from "./types";

export const guide: Guide = {
  slug: "how-to-handle-after-hours-calls",
  title: "How to Handle After-Hours Calls (Without Losing the Job)",
  description:
    "After-hours calls are where most small businesses quietly lose work. Here's how to handle them — from voicemail scripts to on-call rotations to AI coverage.",
  targetKeyword: "how to handle after hours calls",
  intent: "informational",
  cluster: "ai-receptionist",
  relatedTool: "/tools/ai-receptionist-script-generator",
  relatedBest: "/ai-agents/ai-receptionist",
  dek: "The calls that come in after you've closed are often the most valuable — the burst pipe, the same-day booking, the customer ready to say yes. Here's how to handle after-hours calls so they turn into jobs instead of missed opportunities.",
  sections: [
    {
      h2: "Why after-hours calls matter more than they look",
      body: "Evenings and weekends are exactly when a lot of urgent, high-intent calls happen — the pipe that bursts at 9 p.m., the customer who finally has time to book after work. These callers often need someone now, and they're rarely calling only you.\n\nResponse speed is the whole game here. A widely cited Harvard Business Review study of thousands of companies found that firms attempting to reach a lead within an hour were far more likely to have a meaningful conversation than those who waited longer, with the odds dropping sharply as time passed. An after-hours voicemail you return the next morning is often a call that's already been won by whoever picked up first.",
    },
    {
      h2: "The baseline: a voicemail that actually helps",
      body: "If voicemail is all you can offer tonight, make it work harder. A vague \"leave a message and we'll get back to you\" invites the caller to hang up and dial the next business. A specific one sets expectations and captures what you need: state your hours, say clearly when you'll call back (\"we return calls by 8 a.m.\"), and ask them to leave the key details — name, number, address, and what's going on.\n\nBut be realistic about voicemail's ceiling: many callers simply won't leave one, and urgent callers are the least likely to wait. Voicemail is a floor, not a solution. It keeps you from looking closed, but it doesn't keep you from losing the impatient, ready-to-book caller to a competitor who answered.",
    },
    {
      h2: "The options above voicemail",
      body: "There are a few honest ways to actually answer after hours, each with trade-offs. An on-call rotation — a phone that gets forwarded to whoever's on duty — means a real human answers, but it burns out staff and someone still misses calls in the shower or asleep. A human answering service puts trained operators on your overflow and after-hours line; it works well, especially for sensitive calls, but you pay for staffed minutes and coverage can vary.\n\nAn AI receptionist answers every after-hours call on the first ring, asks your qualifying questions, and books or takes a detailed message without waking anyone. Its honest limit is judgment: for a genuinely emotional or unusual emergency, a trained human still reads the situation better, so the smart setups let AI handle the routine after-hours volume and escalate true emergencies to a person or an urgent alert.",
    },
    {
      h2: "Deciding what happens after the phone rings tonight",
      body: "Whatever you choose, decide the rules in advance instead of improvising at midnight. Define what counts as a real emergency worth waking someone for, what can wait until morning, and where after-hours details need to land so they're in front of you first thing — a text, a calendar hold, a CRM entry. The failure mode isn't usually the answer; it's the details getting lost overnight.\n\nFor most small local businesses, the practical winner is coverage that answers instantly and captures the job, with a clean path to a human for the rare call that needs one. If you want to see how an AI receptionist would greet, qualify, and book your after-hours callers, our AI receptionist script generator drafts a script from your hours, service area, and the questions you'd want asked.",
    },
  ],
  faq: [
    {
      q: "Should a small business answer calls after hours at all?",
      a: "If your calls include urgent or high-intent work — emergencies, same-day bookings, ready-to-buy customers — then yes, some form of coverage usually pays for itself, because responding fast strongly affects whether you win the job. If your after-hours calls are rare and never urgent, a clear, specific voicemail may be enough.",
    },
    {
      q: "What should my after-hours voicemail say?",
      a: "State your business hours, tell the caller exactly when you'll call back, and ask for the specific details you need — name, number, address, and what's going on. A specific voicemail captures more usable messages than a vague \"we'll get back to you,\" though many urgent callers still won't leave one at all.",
    },
    {
      q: "Can an AI receptionist handle after-hours calls?",
      a: "Yes — answering after-hours calls is one of the clearest uses for one, since it picks up instantly at any hour, asks your questions, and books or takes a detailed message without anyone on call. For genuine emergencies it should escalate to a human or fire an urgent alert rather than trying to resolve everything itself.",
    },
  ],
  sources: [
    {
      label: "Harvard Business Review — “The Short Life of Online Sales Leads” (speed of response and odds of connecting)",
      url: "https://hbr.org/2011/03/the-short-life-of-online-sales-leads",
    },
  ],
};
