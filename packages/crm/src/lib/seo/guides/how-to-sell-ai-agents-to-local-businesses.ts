import type { Guide } from "./types";

export const guide: Guide = {
  slug: "how-to-sell-ai-agents-to-local-businesses",
  title: "How to Sell AI Agents to Local Businesses (Scripts, Demos, and the One-Booked-Job Close)",
  description:
    "The tactical field manual: how to prospect, demo, pitch, and close AI-agent retainers with local service businesses — with an honest objection-handling script and the retention loop that keeps them paying.",
  targetKeyword: "sell ai agents to local businesses",
  intent: "commercial",
  cluster: "sell-agents",
  relatedTool: "/tools/missed-call-calculator",
  relatedBest: "/marketplace",
  dek: "Knowing the business models is one thing; getting a plumber or a dentist to actually sign is another. This is the field manual — how to find the businesses that are already losing money to missed calls, how to demo on their real business instead of a sandbox, how to price against the job it books instead of what the AI costs you, and how to answer the objections honestly instead of talking over them.",
  sections: [
    {
      h2: "Why local and service businesses are the beachhead",
      body: "If you've read the business-model overview, you know the retainer path is the most accessible one. Local and service businesses — plumbers, dentists, salons, HVAC, landscapers, law firms with a front desk — are the easiest place to start that path for three reasons that have nothing to do with AI. First, their demand is phone-driven: a missed call or a slow follow-up is a lead that goes to whoever answers next, not a soft metric buried in a dashboard. Second, the pain is provable, not theoretical — you can point at a specific missed call, a specific gap in their hours, a specific lead that went cold, and show the same business with it fixed. Third, the buyer is almost always the owner, sitting at the desk or answering the phone themselves, which means there's no procurement committee and no six-week evaluation cycle standing between a good demo and a signed retainer.\n\nThat combination — provable pain, fast decisions, one person who both feels the problem and signs the check — is what makes this beachhead different from selling into a mid-size company with a marketing department. You're not competing on features against other AI vendors most of these owners have never heard of. You're competing against the status quo of a missed call going unanswered, which is a much easier thing to beat.",
    },
    {
      h2: "Prospecting that proves the pain before you ever pitch",
      body: "The single highest-leverage thing you can do before a pitch meeting is arrive with evidence instead of a generic deck. Call the business's own number after their posted hours, or during a busy period, and note exactly what happens: does it ring out, go to a generic voicemail, get answered by someone clearly juggling a counter and a phone at once? Write down the timestamp and what you heard. That's not a hypothetical — it's their own phone, doing what it actually does when nobody's watching.\n\nThen check their website for booking friction: is there a way to request an appointment without calling, or does every path funnel back to \"call us\"? A business with no online booking path is losing every lead who'd rather not make a phone call at all, especially after hours. Between the after-hours call and the site check, you'll usually find a specific, nameable gap — a missed-call problem, a no-online-booking problem, or both — and that gap is worth more in a pitch than any slide about what AI agents can do in general. You're not selling a technology category; you're showing someone their own front door.",
    },
    {
      h2: "The demo: build it on their business before the meeting",
      body: "This is the single highest-converting move in the whole process, and it's simple to describe even though it takes real prep work: build the agent on their actual business — their services, their hours, their FAQ, their booking flow — before you ever sit down with them. Then hand them a phone, or open a chat window, and let the owner talk to it themselves. Not a script you read to them. Not a generic sandbox demo with a fictional business. Their business, answering as if it already worked there.\n\nDemoing on their own business is the entire trick, and it's worth saying plainly why it works: a generic demo asks the owner to imagine how this would apply to them, and most people are bad at that kind of imaginative leap under a sales pitch. A demo on their real services and their real hours removes the imagination step entirely — they're not evaluating a category, they're watching their own front desk work correctly for the first time. It also does something a slide deck can't: it surfaces their real objections immediately, in the room, while you can still answer them, instead of after they've gone quiet and stopped returning your calls.",
    },
    {
      h2: "The pitch structure: pain, proof, one-booked-job math",
      body: "Structure the pitch in the order the owner needs to hear it, not the order that's easiest to say. Start with the pain you already found — the specific missed call, the specific booking gap — stated plainly, not as a warm-up but as the reason you're both in the room. Then move straight to proof: the live demo on their business, or if you couldn't build it ahead of time, the after-hours call recording and the site walkthrough. Don't lead with capability lists; lead with what you found and what you built.\n\nThe close is the one-booked-job anchor, and it's the same math whether you're pricing at $150/month or $400/month: price the retainer under the value of a single job the agent books or saves in a month, so that one recovered appointment pays for the whole month and every job after that is pure argument for renewal. If a typical job for this business is worth $250 and you're asking $150/month, you only need the agent to save one job in four to break even for the owner — say that number out loud, because it's the whole pitch in one sentence. Don't quote your own AI cost or platform fee as the basis for price; the owner doesn't care what it costs you to run, they care what it's worth to them.",
    },
    {
      h2: "Objection handling, honestly",
      body: "\"I already have an answering service.\" Don't dismiss this — many owners already pay for exactly this coverage, and a live human answering service like Ruby prices its plans by the minute, starting around $250/month for 50 minutes and climbing to roughly $1,725/month for 500 minutes on its published pricing page. That's a real, fair comparison to have ready: ask what they're paying and for how many minutes, then compare it honestly against an agent that answers every call around the clock without a per-minute cap, rather than claiming to be strictly better in every way — a live human is still better at some judgment calls, and you should say so.\n\n\"What if the AI says something wrong to a customer?\" This is the question every serious buyer should ask, and the honest answer isn't \"it won't\" — it's guardrails: enforced read-back of anything critical (the appointment time, the price quoted, the address), a defined set of situations where the agent hands off to a human rather than guessing, and eval results you can actually show, not just promise. A builder who can pull up a report of how the agent performed against a test set of real scenarios is answering this objection with evidence; a builder who just says \"trust me, it's good\" is not, and a sharp owner will notice the difference.\n\n\"We're too small for this.\" Reframe rather than argue: the smaller the business, the more a single missed call matters as a share of total revenue, and the less headcount there is to cover the phone during a job, lunch, or after hours — smallness is the argument for this, not against it. If the honest answer is that a business genuinely has too low a call volume to justify any monthly fee, say so; it's a small enough slice of prospects that losing that pitch costs you nothing and saying it builds trust for every pitch after.",
    },
    {
      h2: "Close and onboard the same week, then keep them with proof",
      body: "Once an owner is sold, don't let momentum die waiting on a follow-up call — close and onboard in the same week if you can. Get the agent configured with their real details (which, if you built the demo on their business, is mostly done already), connect the number or the chat widget, and get it live before the excitement from the demo fades. A signed retainer that doesn't go live for three weeks is a retainer that's easy to cancel before it ever proves itself.\n\nThe real retention engine isn't a contract term — it's a recurring proof point. Send a simple monthly report: calls answered, leads captured, jobs booked (or saved) that the owner can trace back to specific real appointments. This is the same proof-before-pitch instinct from prospecting, just running in reverse — instead of showing them evidence of the problem before they buy, you're showing them evidence of the fix after they buy. An owner who gets a monthly number showing exactly what the agent recovered has a concrete reason to keep paying; an owner who just has a line item on a credit card statement is the one who cancels during a slow month.",
    },
  ],
  faq: [
    {
      q: "Should I cold call, walk in, or email prospects first?",
      a: "There's no single right channel — it depends on the vertical and what access you already have. A walk-in works well for businesses with a physical storefront where you can hand someone a phone and demo on the spot; a cold call works if you can get a decision-maker on the line directly; email tends to be the weakest opener alone because it's easy to ignore, but it works as a follow-up after an in-person or phone touch. Whichever channel you use, the after-hours-call-plus-site-check research described above works the same way and is what actually moves the pitch, not the channel you used to get in the door.",
    },
    {
      q: "How many prospects does it typically take to land a first client?",
      a: "There's no honest, specific number to give here — it depends heavily on your vertical, your existing network, and how much outreach you're doing, and treat any \"X out of 10 close\" claim you see online as a marketing hook rather than a benchmark. What reliably helps: narrowing to one vertical so your pitch, demo, and objection handling all reuse cleanly from prospect to prospect, and having the live demo built before the meeting rather than promising to build it after they say yes.",
    },
    {
      q: "Should I charge for the demo build, or build it for free before the meeting?",
      a: "Build the demo for free before the first meeting — it's the thing that gets you the sale, and asking someone to pay before they've seen it defeats the point of proving the value first. Where it's reasonable to charge is a small setup or onboarding fee once they've said yes, separate from the monthly retainer, to cover the time of fully wiring up their real calendar, phone number, and integrations rather than the demo itself.",
    },
    {
      q: "What do I do if a prospect wants a feature the agent can't do reliably?",
      a: "Say so plainly rather than overselling and hoping it works out — the guardrails-and-handoff answer to the \"what if it says something wrong\" objection only holds up if you actually mean it. Scope the agent to the jobs it can do reliably (answering, qualifying, booking, texting back a missed call) and hand off or exclude the ones it can't (complex diagnosis, price negotiation, anything irreversible) rather than promising broad capability to close the deal. A narrower agent that does its job correctly every time earns a renewal; a broad one that occasionally embarrasses the business in front of a customer does not.",
    },
  ],
  sources: [
    {
      label: "Ruby — official pricing page (live answering-service price anchor)",
      url: "https://www.ruby.com/pricing/",
    },
    {
      label: "HighLevel — official pricing page (conventional agency-stack cost reference)",
      url: "https://www.gohighlevel.com/pricing",
    },
  ],
};
