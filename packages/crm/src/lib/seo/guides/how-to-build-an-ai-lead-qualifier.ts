import type { Guide } from "./types";

export const guide: Guide = {
  slug: "how-to-build-an-ai-lead-qualifier",
  title: "How to Build an AI Lead Qualifier for Service Businesses (Filter, Don't Just Follow Up)",
  description:
    "A builder's spec for the qualification layer: an agent that decides which leads deserve the owner's time, tags the pipeline, and declines the ones that don't fit — with the pricing and pitch to sell it.",
  targetKeyword: "ai lead qualification",
  intent: "commercial",
  cluster: "sell-agents",
  relatedTool: "/tools/speed-to-lead-calculator",
  relatedBest: "/marketplace",
  dek: "Answering every lead fast is one problem. Deciding which of those leads is worth the owner's time is a different one — and for businesses that get more inquiries than they can serve, it's the more expensive problem. Here's how to spec, build, and sell an agent that qualifies instead of just replies.",
  sections: [
    {
      h2: "This isn't the speed-to-lead pitch",
      body: "It's worth drawing this line before anything else, because the two agents look similar from a distance and get pitched to the same buyer. A speed-to-lead agent solves for time: it replies in seconds so a lead doesn't go cold in an unanswered inbox. This guide solves for a different problem entirely — one that shows up in businesses that already reply fast, or that get more inquiries than they have capacity to serve: paid on-site estimators, contractors with a bounded service area, firms with intake requirements, anyone who has learned the hard way that not every inquiry is a fit.\n\nFor those businesses, the cost isn't a slow reply. It's hours spent driving to a job outside the service area, quoting a job type they don't do, or sitting on a call with someone who was never going to book. The qualifier's job is to let every lead feel answered — nobody gets ignored — while sorting the pipeline before it reaches a human, so the owner's time goes to the leads worth having. If you haven't read the speed-to-lead guide, start there for the instant-response case; this one picks up after the reply is already sent.",
    },
    {
      h2: "The spec",
      body: "A qualifier is a short conversational intake, not an interrogation: what's the job, where is it, roughly when, and — only if the business actually prices this way — a budget band. Three to five questions, asked in whatever order the conversation naturally goes, not a rigid form marching through fields.\n\nEvery answer gets scored against the business's own criteria, not a generic template: service area (does the address fall inside the radius they'll actually drive), job type (do they do this kind of work at all), and minimums (is this job big enough to be worth a visit). That scoring produces a CRM tag — hot, nurture, or decline — and hot leads get an instant handoff to the owner exactly the way a speed-to-lead agent would hand one off, because qualification and speed aren't in competition; a good pipeline runs both.\n\nThe decline path is the part most builders skip and shouldn't: a lead outside the service area or job scope gets a graceful, specific answer — not a form silently going nowhere — ideally with a referral or an honest \"that's not something we handle.\" And the guardrail that matters most here: the agent recommends a tag, it doesn't make the final call on anything ambiguous, and it never quotes a firm price. Scoring a lead hot or cold is a judgment call trained on the business's own criteria; deciding what to charge is the owner's call, always.",
    },
    {
      h2: "The build, honestly, both paths",
      body: "DIY, this is a form or chat intake with a few questions, a set of scoring rules written in whatever logic your stack supports, and a write path into the CRM that tags the lead and files the answers. Connecting that intake to the tools it needs to read and write — the calendar, the CRM, the messaging channel — is exactly the integration problem the Model Context Protocol was built to reduce; the standard describes itself as letting an AI application \"connect to data sources... tools... and workflows\" without a custom integration per tool. None of the individual pieces are hard — the work is translating the owner's actual judgment (\"we don't do jobs under $500,\" \"we don't cross the river\") into rules a script can apply consistently, and keeping those rules current as the business's criteria change.\n\nThat translation is the real asset here, more than the code around it. A written scoring-criteria doc — the client's judgment, put into words for the first time in a lot of cases — is worth more to the relationship than the automation wrapped around it, because it's the thing the owner can review, correct, and hand to a new hire later.\n\nThe assembled path is what we build: SeldonFrame wires intake, CRM tagging, and routing into one conversation, so the scoring criteria live alongside the agent rather than being reconstructed in a separate integration layer. SeldonFrame is our own product, so this particular recommendation comes from the interested party — discount it accordingly. Either path needs the same criteria doc; the difference is how much of the wiring is pre-connected.",
    },
    {
      h2: "Selling it: a different pain than missed calls",
      body: "Don't pitch this with the speed-to-lead line — a business that already answers fast doesn't feel that pain. Ask a different question instead: \"how much time did you spend last week on quotes that went nowhere?\" Most owners who do paid estimates or field a lot of out-of-area calls have a number for that, and it's usually a number they've never said out loud to anyone selling them software.\n\nThe best-fit verticals follow from the problem: contractors who send someone out for a paid estimate, firms with real intake requirements (licensing, permits, insurance types), and any business with a hard service-area boundary. If the owner has ever said \"I wish people would stop calling about jobs we don't do,\" that's the opening line for this pitch, not the speed-to-lead one.",
    },
    {
      h2: "Pricing and running it",
      body: "Same shape as most agent retainers: a monthly fee, with a report the owner actually reads. For a qualifier, that report is leads processed, hot-lead response time (so the qualification layer doesn't quietly become the new bottleneck), and an honest, clearly-labeled estimate of owner-hours saved — never a hard number presented as measured fact, since there's no way to observe the counterfactual hours a business would have spent without the agent.\n\nThe criteria drift, and the retainer should account for that: sit down with the client quarterly and walk through what got tagged hot, nurture, and decline over the period, and adjust the rules to match what they'd have actually wanted. A qualifier tuned once at setup and never revisited slowly drifts out of sync with how the business actually operates.",
    },
    {
      h2: "Failure modes to design against",
      body: "Over-qualifying is the most common one: an agent that keeps asking questions until a genuinely hot lead gets annoyed and leaves. Cap the question count and bias toward handing off early when a lead is clearly interested — qualification should never cost you a lead speed-to-lead would have caught.\n\nScoring on criteria the client never actually agreed to is the second: a rule you inferred rather than one the owner confirmed in the criteria doc will eventually tag the wrong lead the wrong way, and the client will find out from a customer complaint instead of from you.\n\nThird, silently declining leads the owner would have wanted is worse than it sounds, because nobody notices until a competitor books the job. Log every decline with the reason, and review the log with the client — don't let the decline path run as a black box.\n\nFourth, and the general rule underneath the other three: the false-positive trap. It's better to pass a maybe to the human than to auto-decline it. A qualifier that's too eager to say no costs the business real revenue in a way that's much harder to notice than a qualifier that's a little too generous with hot tags.",
    },
  ],
  faq: [
    {
      q: "How many questions should a qualifier ask?",
      a: "As few as it takes to sort the lead — usually three to five. Enough to score service area, job type, and rough scope; any more than that risks reading as an interrogation and losing a lead that speed-to-lead would have kept.",
    },
    {
      q: "Can it qualify phone leads, or just form and chat leads?",
      a: "The scoring logic is channel-agnostic — it's the same three or four questions either way. Applying it to a phone call requires a voice agent (or a human reading from the same script) rather than a form, but the underlying spec — ask, score, tag, hand off or decline — doesn't change. If the handoff to the owner happens over SMS, budget for it as a real per-message cost rather than something free in the background — Twilio's US pricing lists $0.0083 per outbound SMS segment before carrier fees, which is small per message but adds up across a busy pipeline.",
    },
    {
      q: "What CRM does it need?",
      a: "Any CRM that can hold a lead record and a tag field works — the qualifier just needs a write path in. The important part isn't which CRM; it's that the tag (hot / nurture / decline) and the answers that produced it are visible to whoever picks up the lead next.",
    },
    {
      q: "Should it ever quote prices?",
      a: "No. A qualifier scores and tags; it doesn't price. The one exception is a budget band the client has explicitly approved in writing for the agent to state — and even then, treat it as a range, never a firm quote, and keep it opt-in per client rather than a default.",
    },
  ],
  sources: [
    {
      label: "Model Context Protocol — \"What is the Model Context Protocol (MCP)?\"",
      url: "https://modelcontextprotocol.io/introduction",
    },
    {
      label: "Twilio — SMS Pricing (US)",
      url: "https://www.twilio.com/en-us/sms/pricing/us",
    },
  ],
};
