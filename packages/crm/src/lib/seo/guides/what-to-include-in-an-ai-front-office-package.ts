import type { Guide } from "./types";

export const guide: Guide = {
  slug: "what-to-include-in-an-ai-front-office-package",
  title: "What to Include in an AI Front Office Package (The Full Deliverable, Priced Right)",
  description:
    "The full spec for the flagship AI front office package: which components belong in it, what to leave out, how to run it as a retainer, and how to price it against what it replaces.",
  targetKeyword: "ai front office",
  intent: "commercial",
  cluster: "sell-agents",
  relatedTool: "/tools/agency-margin-calculator",
  relatedBest: "/agencies",
  dek: "\"AI front office\" gets used loosely — sometimes it means a phone bot, sometimes a whole CRM. If you're selling one as a package, the buyer needs a concrete answer to \"what am I actually getting,\" and you need a concrete answer to \"what am I actually building and charging for.\" This is the full spec: the component checklist, the operating layer that justifies a retainer, the onboarding sequence, and how to price the thing without inventing numbers.",
  sections: [
    {
      h2: "What \"an AI front office\" means to the buyer",
      body: "A front office is everything that happens between a customer's first contact and a confirmed job: the phone gets answered, the text gets a reply, the web lead gets followed up before it goes cold, the appointment lands on the real calendar, and the review request goes out after the work is done. For most small service businesses, that chain is currently held together by a voicemail box, a sticky note, and whoever's free — which is exactly why calls go unanswered and leads sit for hours.\n\nThe pitch for a packaged AI front office is that the buyer gets that whole chain delivered and operated as one thing, not five separate tools they have to stitch together and manage themselves. That's the difference between \"here's a chatbot\" and \"here's a front office\": one is a component, the other is an outcome. If you're building the packaging method behind offers like this — bundling, naming, positioning a monthly service instead of a one-off build — that's covered in the companion piece on productized AI services; this page is about what belongs inside the one flagship package once you've decided to build it.",
    },
    {
      h2: "The component checklist",
      body: "Phone agent (24/7 or after-hours-only). This is usually the headline component and the easiest to justify: every unanswered call is a lead going to the next business that picks up. Missed-call text-back. The moment a call is missed, an automatic text goes out — even a business with no phone agent at all should have this, and it's cheap to add once the phone agent exists.\n\nSpeed-to-lead follow-up on web forms. A form fill that sits for two hours is close to dead; a reply inside minutes is what separates a booked job from a lead that called three other businesses first. Booking into the real calendar, with read-back confirmation. The agent has to write to the calendar the business actually uses, and confirm the time back to the customer before treating the slot as booked — a booking nobody can verify is worse than no booking system at all.\n\nReview requests after the job is marked done. Timed to go out once, not nagged, tied to job completion rather than a fixed schedule. The CRM where all of it lands. Every call, text, form, and booking needs one place a human can see it, or the \"front office\" is just a set of bots nobody can audit. The client portal and the monthly proof report. This is what the client actually looks at to decide the retainer is worth it — call volume, leads captured, bookings made, reviews requested.\n\nOptional, add if the client wants it: website chat widget, appointment reminders. Explicitly out of scope for this package: running ads, and writing ongoing marketing content. Those are different disciplines with different pricing models — don't fold them in just because they're adjacent; sell them separately if you offer them at all.",
    },
    {
      h2: "The operating layer that justifies the retainer",
      body: "Anyone can hand a client a phone number and a bot. What justifies charging monthly — not just a one-time build fee — is the layer above the tools: the guardrails and escalation rules written with the client (what the agent can promise, what it must never say, when it hands off to a human), a weekly review of the actual call and message logs in month one while the agent is still being tuned to how this specific business talks to customers, and a monthly walk-through of the report with the client rather than an email they might not open.\n\nBuying the tools is the cheap part. The client is paying for it still working next month, and the month after, when their hours change, a new service gets added, or the agent says something wrong on a call nobody caught. That operating discipline — not the phone agent itself — is what a retainer is actually for, and it's the part a client can't easily replicate by buying software off a shelf.",
    },
    {
      h2: "Onboarding week: staged, not big-bang",
      body: "Intake first: business hours, the service list, pricing policy (what the agent can quote and what it must defer), emergency criteria (what counts as urgent enough to interrupt someone), and tone (how this business actually talks to customers, not a generic script). Configure the agent and calendar against that intake. Have the owner run test calls and correct anything that's off before a real customer ever reaches it.\n\nThen launch in stages: after-hours and overflow first, while the business's existing process still handles daytime calls, so the first real customer interactions happen at low stakes with a fallback already in place. Only move to full cutover — the agent as the primary front line — once after-hours has run clean for a stretch. A staged launch means the first mistake gets caught by an owner reviewing a log, not by a customer who hung up.",
    },
    {
      h2: "Pricing the package",
      body: "Anchor against what the client is replacing, not an invented market rate. A human answering service alone commonly runs a few hundred dollars a month before scheduling or review tools are added — Ruby's published virtual-receptionist plans, for example, list $250/month for 50 minutes up to $1,725/month for 500 minutes (Ruby pricing, verified below), and that's phone coverage only, with no CRM, booking, or review layer attached. A full front office replacing an answering service plus a scheduling tool plus a review tool is worth pricing against that stack, not against a single component.\n\nTier it rather than selling one flat price: after-hours-only as the entry tier, full front office (everything in the checklist above) as the core offer, and front office plus reputation management (review requests, response monitoring) as the top tier for clients who want more. Structure the price as a setup fee — covering intake, configuration, and the staged launch — plus a monthly retainer that covers the operating layer, not just the software. Keep the actual numbers hedged; what a market will bear varies by vertical, region, and what you're bundling. Run your own numbers through the margin calculator before quoting anything, rather than guessing at a rate.",
    },
    {
      h2: "Delivering it without building a platform (disclosed)",
      body: "Everything above is a spec, not a build guide — someone still has to stand up the phone agent, the CRM, the calendar integration, and the client portal, and keep all four working together. Disclosure: we build a product for exactly this. SeldonFrame ships the whole stack — agent, CRM, calendar, portal, white-labeled — as one workspace per client, at $29/mo flat with BYOK (bring your own model API key, so there's no markup on usage baked into the price). The package described in this article maps directly onto one SeldonFrame workspace per client: the components above are what's in the workspace, and the operating layer above is what you do with it.\n\nDIY assembly is a legitimate path too — wiring together a phone provider, a CRM, a calendar API, and a portal yourself, or subcontracting the build. It's the right call if you want to own every piece of the stack and don't mind the integration and maintenance work that comes with it. If you'd rather start selling the package this week than spend it stitching four tools together, that's the gap a packaged platform is built to close.",
    },
  ],
  faq: [
    {
      q: "Can I sell the components separately instead of the full package?",
      a: "Yes, and it's often the right way to start — an after-hours phone agent or missed-call text-back alone is an easier first sale than the full bundle. Selling components separately is exactly the ladder that leads here: once a client is happy with one piece, the case for the full front office (and the retainer that comes with it) makes itself.",
    },
    {
      q: "What does it actually cost me to deliver this?",
      a: "Two cost lines, roughly: the software/platform cost per client workspace, and the model usage cost for whatever LLM the agent runs on (call minutes, message volume). Both scale with client count and usage, not with a per-client license fee if you're on a BYOK platform. Run your specific numbers — client count, expected call volume, your price point — through the margin calculator rather than assuming a flat cost per client.",
    },
    {
      q: "How many front-office clients can one operator handle?",
      a: "This depends heavily on how repeatable your onboarding is and how much of the weekly log review you've automated versus doing by hand, so treat any specific number as a rough starting point, not a rule. Operators who template the intake, reuse guardrail language across similar verticals, and keep the review step tight tend to scale further per person than those re-deriving the setup for every client from scratch.",
    },
    {
      q: "What vertical should I start with?",
      a: "One where a missed call is obviously expensive and the business already has some booking discipline to plug into — home services (plumbing, HVAC, garage doors), dental and medical practices, and legal intake are common starting points because the cost of a missed lead is easy for the buyer to picture. Pick one vertical, get the intake and guardrail language dialed in, then reuse that template rather than starting fresh with a second unrelated vertical too early.",
    },
  ],
  sources: [
    {
      label: "Ruby — Virtual Receptionist & Live Chat Pricing",
      url: "https://www.ruby.com/pricing/",
    },
    {
      label: "HighLevel — Pricing",
      url: "https://www.gohighlevel.com/pricing",
    },
  ],
};
