import type { Guide } from "./types";

export const guide: Guide = {
  slug: "how-to-build-and-sell-a-speed-to-lead-agent",
  title: "How to Build and Sell a Speed-to-Lead Agent (Instant Follow-Up as a Service)",
  description:
    "A builder's walkthrough for packaging instant lead response as a paid retainer: the spec, the DIY vs. assembled build, how to sell it with the prospect's own numbers, and how to price it.",
  targetKeyword: "speed to lead automation",
  intent: "commercial",
  cluster: "sell-agents",
  relatedTool: "/tools/speed-to-lead-calculator",
  relatedBest: "/marketplace",
  dek: "Every service business has the same leak: a lead comes in, and nobody answers it for hours. An agent that replies in seconds is one of the more sellable things a builder can ship right now — here's the spec, the build, and how to price and sell it as a retainer.",
  sections: [
    {
      h2: "The pitch in one line",
      body: "A lead decays fast. The exact multiplier gets thrown around a lot online, and most of those numbers trace back to research that's now paywalled or hard to verify directly, so treat any specific \"you're X times less likely to convert\" claim you see with some skepticism — including on this site.\n\nWhat's not in dispute, and what you can verify yourself in about ten minutes with any target business, is the underlying gap: most service businesses reply to a new lead in hours, not seconds, because the lead sits in an inbox or voicemail until a human gets to it. An **agent that responds within seconds**, on the channel the lead actually used, closes that gap without touching headcount. That's the whole pitch, and it's strong enough that you don't need to inflate it with a number you can't stand behind.\n\nFor the buyer-side case on why this matters and what \"fast\" actually means, see [What Is Speed-to-Lead?](/guides/what-is-speed-to-lead) and [The 5-Minute Rule for Lead Response](/guides/the-5-minute-rule-for-lead-response). This guide assumes you've read the pitch. It skips straight to building and selling the agent.",
    },
    {
      h2: "The spec",
      body: "Strip it down and it's a straightforward *agent* spec, not a research project. Six things have to happen, in order.\n\nIt **triggers on every new lead** — a form fill, a missed call, a marketplace inquiry, a DM. It replies within seconds on the lead's own channel: SMS if they texted, email if they emailed, chat if they used the widget.\n\nIt asks exactly **one qualifying question**, so the reply doesn't read as a canned autoresponder. It offers real booking times pulled from the business's actual calendar, then writes the lead, the channel, and the timestamp to the CRM so nothing depends on someone remembering to log it. Anything that reads as hot — a phone number, an urgent job, \"call me now\" — escalates straight to the owner's phone.\n\nThe *guardrail* beat matters as much as the speed: the agent should never quote a firm price or promise a specific scope of work before a human has looked at the job. **Speed sells the response; it doesn't sell the estimate.** An agent that fires back an instant reply and then lowballs a quote it shouldn't have made costs the business more than the slow-response problem it was hired to fix.",
      callout: {
        kind: "analogy",
        text: "A guardrail here is the same idea as a bumper lane at a bowling alley — the agent can still move fast and get the ball down the lane, it just can't roll into the gutter of promising a price or a scope nobody signed off on.",
      },
      diagram: {
        type: "flow",
        title: "The speed-to-lead agent, end to end",
        steps: [
          { label: "New lead" },
          { label: "Instant reply", sub: "seconds, on the lead's own channel" },
          { label: "Qualify", sub: "one question" },
          { label: "Book", sub: "real calendar slots" },
          { label: "CRM", sub: "lead, channel, timestamp logged" },
          { label: "Escalate", sub: "hot leads to the owner's phone" },
        ],
      },
    },
    {
      h2: "The build, honestly, both paths",
      body: "You can build this yourself with no product in the middle. You'll need a *webhook* off every lead source you want covered, an SMS and email sending account, a way to read the business's calendar for free-slot lookups, a write path into whatever CRM the business already uses, and your own guardrail logic to stop it from quoting prices or overpromising.\n\nEvery piece here is well-trodden — form webhooks, transactional SMS/email, calendar APIs — so nothing about it is exotic. The real cost is integration and maintenance: **every lead source is a separate connection to build and keep working** as forms change and APIs version.\n\nThe assembled path is what we build: SeldonFrame wires the agent, the CRM, and the booking calendar together from one conversation, so a new lead source is a connection you turn on rather than a webhook you write from scratch. Disclosure is due since we make that product — weigh this paragraph as the sales pitch it partly is.\n\nEither path produces the **same agent from the spec above**. The difference is how much of the wiring you do yourself versus start from already connected.",
      diagram: {
        type: "compare",
        title: "DIY vs. assembled",
        left: {
          heading: "DIY",
          items: [
            "Webhook per lead source, built by hand",
            "Your own SMS/email sending account",
            "Your own calendar + CRM write logic",
            "You maintain it as APIs change",
          ],
        },
        right: {
          heading: "Assembled (SeldonFrame)",
          items: [
            "Agent, CRM, and calendar already wired",
            "A new lead source is a connection you turn on",
            "BYOK — no markup on model calls",
            "$29/mo flat, first workspace free",
          ],
        },
      },
    },
    {
      h2: "Selling it with the prospect's own math",
      body: "Don't sell speed-to-lead as a concept — sell it as a number the prospect just watched happen to them. Fill their own contact form, or call their business line and hang up before anyone answers, and time how long the reply actually takes.\n\nMost service businesses have never seen that number written down, and it's usually worse than they'd guess. Then run their lead volume and average job value through the [speed-to-lead calculator](/tools/speed-to-lead-calculator) to turn \"we respond slowly\" into \"here's what a faster response is plausibly worth per month at your volume.\" That's a **demo you can do in the discovery call**, not a deck.\n\nThe pitch that follows is simple: this agent doesn't do their sales job. It makes sure every lead gets a first reply inside seconds instead of hours, and **everything it does is logged** so they can see it working.",
    },
    {
      h2: "Pricing and packaging it as a retainer",
      body: "Package it as a monthly *retainer*, not a one-time build fee. The value compounds every month leads keep coming in, and a retainer is what turns a project into recurring revenue for you.\n\nBundle the retainer with however many lead-source integrations the business actually has — site form, Facebook lead ads, missed calls, one or two marketplaces. Each additional source is a **natural upsell line** rather than scope creep.\n\nThe retention engine is a monthly report: median time-to-first-reply, how many leads got engaged versus went cold, and how many bookings the agent produced. That report is **the thing that keeps the retainer renewed** — it's the receipt that proves the agent is still doing the job it was sold to do, every month, without the owner having to take it on faith.\n\nOn the running cost: if you're texting leads yourself rather than through a bundled platform, outbound SMS from a US number runs $0.0083 per segment on Twilio's published pricing, plus a small per-message carrier fee — trivial at typical lead volumes, but worth knowing so you're not guessing at your own margin. See [How Much to Charge for an AI Agent](/guides/how-much-to-charge-for-an-ai-agent) for how that rolls into a retainer price.",
      callout: {
        kind: "analogy",
        text: "A retainer is a gym membership, not a personal-training session — the client pays every month for the thing staying on, not for one visit, which is exactly why the monthly report matters: it's the proof the membership is worth renewing.",
      },
    },
    {
      h2: "Failure modes to design against",
      body: "Instant but generic is the most common failure. A reply that arrives in five seconds but reads like a template that ignores what the lead actually asked for reads as spam, not service, and can do more harm than a slower, more human reply.\n\nThe agent has to reference the specific job or question the lead mentioned, not just acknowledge that a message arrived. Too aggressive is the second failure: following up repeatedly across every channel because the first message didn't get an instant reply back burns leads instead of warming them.\n\nOne prompt reply, one well-timed follow-up if there's no response, then hand off to the human cadence — **not a barrage**. The third is the quiet one: dropping leads from a channel nobody wired.\n\nIf the business gets leads from a marketplace, a Facebook form, and a phone line, and the agent only covers the website form, the owner will credit the agent with fixing the leak while a third of their leads keep going cold. **Get the honest inventory of every channel a lead can arrive on before you sell it** — that inventory is the actual scope of the job, not the demo channel you happened to build first.",
      callout: {
        kind: "tip",
        text: "Before you scope the retainer, ask the owner to list every place a lead can come from — website, ads, marketplaces, the phone line, DMs. Whatever's on that list and unwired is the gap that'll surface in month two.",
      },
    },
  ],
  faq: [
    {
      q: "Which lead sources can a speed-to-lead agent actually cover?",
      a: "Anything that produces a webhook, an email, or an API event: website forms, Facebook/Google lead ads, missed or unanswered calls, marketplace inquiries (Angi, Thumbtack, and similar), and inbound SMS or DMs. The scope of the agent is exactly the list of sources you wire — a source you skip is a source that keeps going unanswered, so **inventory every channel before you scope the job**.",
    },
    {
      q: "What response time should I actually promise a client?",
      a: "Promise seconds for the first automated touch, and put the real number in the monthly report rather than in the contract. A report showing a consistent median response time earns trust by demonstrating it every month; a contractual number invites a dispute the first time a lead source has an outage or a busy hour.",
    },
    {
      q: "Does this replace the salesperson or the business owner?",
      a: "No, and it shouldn't be sold that way. The agent's job is the first touch and qualification — get a reply out fast, ask one question, offer times, log it, and flag anything hot. Closing the job, quoting the real price, and doing the work stays with the human. **Selling it as a replacement for the salesperson sets an expectation the agent isn't built to meet.**",
    },
    {
      q: "What does it actually cost to run, month to month?",
      a: "The main variable cost is outbound SMS and, if you're using a paid model for the qualifying reply, LLM tokens — both small at typical small-business lead volumes. Twilio publishes outbound US SMS at $0.0083 per segment plus a modest carrier fee, and Anthropic's cheapest current model (Claude Haiku 4.5) runs $1 per million input tokens and $5 per million output tokens as of this writing — a single lead-qualification exchange is a few hundred tokens, so the per-lead cost is a fraction of a cent even before volume discounts. SeldonFrame is *BYOK*, so those provider costs are billed directly to whatever key you connect rather than marked up; the platform itself is $29/mo flat with the first workspace free.",
    },
  ],
  sources: [
    {
      label: "Twilio — SMS Pricing for United States",
      url: "https://www.twilio.com/en-us/sms/pricing/us",
    },
    {
      label: "Anthropic — Claude Platform pricing (model pricing table)",
      url: "https://platform.claude.com/docs/en/about-claude/pricing",
    },
  ],
};
