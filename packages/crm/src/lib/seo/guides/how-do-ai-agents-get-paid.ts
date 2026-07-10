import type { Guide } from "./types";

export const guide: Guide = {
  slug: "how-do-ai-agents-get-paid",
  title: "How Do AI Agents Get Paid? Subscriptions, Metering, and the Machine-Payments Experiments",
  description:
    "\"How do AI agents get paid\" almost always means the agent's owner getting paid through ordinary rails — subscriptions, metering, marketplace payouts. Here's that layer end to end, plus the honest state of agent-to-agent payments.",
  targetKeyword: "ai agent payments",
  intent: "informational",
  cluster: "sell-agents",
  relatedTool: "/tools/claude-project-brief-generator",
  relatedBest: "/marketplace",
  dek: "The phrase gets asked two different ways at once, and most answers online blur them together. Here's the payment layer split cleanly in two: what already works today for a builder who wants to get paid for an agent, and the experimental frontier of agents paying each other, kept honestly separate.",
  sections: [
    {
      h2: "Two different questions hiding in one phrase",
      body: "\"How do AI agents get paid\" almost always means one of two things. Conflating them is where most explanations go wrong.\n\n**The first question, by far the more common one today**: the agent's owner gets paid, through completely conventional rails — a subscription, a retainer, a metered bill, a cut of a transaction. The money moves between humans and businesses exactly like it always has. The agent is just the thing being sold, or the thing doing the work behind the sale.\n\n**The second question, much rarer in practice**: agents paying each other programmatically, machine to machine, per request, with no human approving each individual transfer. That's a live area of protocol work. It is not, today, how anyone's rent gets paid.\n\nKeep those two planes distinct as you read anything on this topic. A post that starts with \"agents can now pay for their own API calls\" and ends with pricing advice for your AI agency is quietly switching planes on you. This guide keeps them separate on purpose.",
      diagram: {
        type: "compare",
        title: "Two planes, kept separate",
        left: {
          heading: "Works today — humans pay",
          items: ["Subscription or retainer", "Usage metering", "Marketplace payouts, GMV share"],
        },
        right: {
          heading: "Experimental — machines pay machines",
          items: ["x402 / HTTP 402 protocols", "Stablecoin, per-request settlement", "No human approves each transfer"],
        },
      },
    },
    {
      h2: "The rails that actually work today",
      body: "**Subscription or retainer**: a human buys monthly access to what the agent does, billed on a normal card-on-file cycle. This is the dominant model for local-business agents — an AI receptionist or booking agent sold the same way a software subscription or a service retainer always has been, because the buyer is a person with a credit card, not another machine.\n\n**Usage metering**: billing per conversation, per call, per task, or per token — still charged conventionally (a card, an invoice) but the amount scales with actual use instead of a flat fee. This is common for API-shaped agents and for builders who want price to track cost.\n\n**Marketplace payouts**: the platform meters usage on the buyer's side and remits a share to the agent's builder. This sounds simple, but there's an honest caveat backed by our own [comparison of agent marketplace fee structures](/guides/ai-marketplace-fees-compared): a meaningful number of consumer AI stores have not published clear payout terms at all. Before you build for a marketplace's payout model, check that the model is actually documented — not assumed.\n\n**GMV or outcome share**: a percentage of the value the agent demonstrably drove — bookings closed, revenue attributed, deals moved — rather than a flat access fee. This requires attribution the operator actually controls (a booking system, a CRM, a checkout the agent's action can be tied to); without that, \"outcome share\" is just a marketing label on a flat fee nobody can verify.",
      diagram: {
        type: "stack",
        title: "Four rails, all charging a human",
        layers: [
          { label: "Subscription or retainer", sub: "flat monthly access, card on file" },
          { label: "Usage metering", sub: "billed per conversation, call, task, or token" },
          { label: "Marketplace payouts", sub: "platform meters usage, remits a share" },
          { label: "GMV or outcome share", sub: "a % of the value the agent demonstrably drove" },
        ],
      },
    },
    {
      h2: "The experimental plane: machines paying machines",
      body: "HTTP status code 402, \"Payment Required,\" has existed in the HTTP specification for decades as a nonstandard code reserved for future use. MDN's own documentation describes it as created \"to enable digital cash or (micro) payment systems,\" intended to indicate that requested content isn't available until the client pays, but never standardized into a common convention and not supported by browsers as anything other than a generic error.\n\nThat decades-old reservation is what a newer effort called *x402* is trying to finally use. By its own description, x402 positions itself as \"an open, neutral standard for internet-native payments\" built as a Linux Foundation project, aimed at API monetization and agent-to-agent commerce.\n\nHere's the mechanism: a server declares that an endpoint requires payment. An unpaid request gets a 402 response. The client — often an AI agent acting on a human's behalf — retries the request with a stablecoin payment attached.\n\nThe project describes itself as blockchain-agnostic across several chains. On its own site, it claims production status with real transaction volume. Take that self-reported number as exactly that — a claim from the project about itself, not an independently audited figure, and not something to build a revenue model around this year.\n\nThe honest summary: 402-based machine payments are a **real, active piece of protocol work** with real infrastructure behind it, not vaporware. They are also, for a builder selling an agent to a small business or an agency client today, **not where any actual money is currently coming from**. Treat this section as \"worth watching,\" not \"worth betting the business on.\"",
      callout: {
        kind: "analogy",
        text: "A reserved-but-unused status code is like a *spare key* cut for a lock that was never installed — technically real, sitting in a drawer for decades, waiting for someone to finally build the door it opens.",
      },
    },
    {
      h2: "What agent-to-agent payments would still need beyond a protocol",
      body: "A wire format for moving money — even a working one — solves only the transport problem. Four things a protocol alone doesn't provide, and that any real agent-to-agent payment system needs before it's usable in a business context:\n\n**Identity**: whose agent is this, acting on whose behalf, and how does the receiving party verify that claim rather than trusting a bare API key.\n\n**Authorization limits**: a spend cap a human principal sets and the agent cannot exceed — per transaction, per day, per counterparty — because \"the agent decided to pay\" is not an acceptable answer to \"why did this charge happen\" without a limit behind it.\n\n**Dispute and refund norms**: what happens when an agent pays for something that turns out to be wrong, broken, or fraudulent, and who has standing to reverse it — a question ordinary card networks answer with decades of chargeback infrastructure that machine-payment rails mostly don't have yet.\n\n**Accounting and tax treatment**: whose books does the transaction land on, how is it categorized, and what happens at tax time when a machine, not a person, initiated thousands of small payments — an unresolved question with real regulatory weight, not a technical detail.\n\nThis list is the part worth remembering even if you forget the protocol names: a payment rail is necessary but not sufficient. The four items above are what actually gates whether agent-to-agent payments become normal business infrastructure or stay a demo.",
      callout: {
        kind: "tip",
        text: "If you're speccing a machine-payment feature, write down your answers to these four questions before writing a line of code — the protocol is the easy 10% of the problem.",
      },
    },
    {
      h2: "Practical guidance for a builder right now",
      body: "**Charge humans, on conventional rails, today.** If you're building and selling agents, the working models are a subscription or retainer for local-business work, metering for API-shaped usage, and a marketplace or GMV share when a platform is doing the selling for you — see the practitioner walkthrough on [renting an agent out over MCP](/guides/how-to-rent-out-an-ai-agent-via-mcp) for the mechanics of getting paid that way, and the [MCP marketplace explainer](/guides/what-is-an-mcp-marketplace) for how the distribution layer around that works.\n\nDesign your metering and logging so per-use billing is possible later, even if you charge flat today. Log what the agent actually did — conversations handled, tasks completed, tokens used — even if today's invoice is a flat monthly number. That log is what lets you switch to usage-based pricing, or plug into a future payment rail, without re-instrumenting the agent later.\n\n**Watch the standards; don't bet the business on them.** x402 and similar efforts are worth a bookmark, not a pivot. Revisit this space in a year, not this quarter.",
    },
    {
      h2: "Where SeldonFrame fits in this (disclosed)",
      body: "We build SeldonFrame, so weigh this section as the vendor's answer it partly is. SeldonFrame's marketplace lets a builder rent an agent out to a client over MCP with a signed rental key and usage metering behind the scenes.\n\nBut the money itself moves on the boring, working rails from the section above: a **$29/month flat subscription** with the first workspace free, keys the builder brings themselves (*BYOK*, so there's no markup to hide in usage costs), and a **GMV fee that steps down from 5% to 3% to 2%** — and only applies when SeldonFrame is actually the sales channel that closed the deal.\n\nNo stablecoins, no per-request machine settlement — deliberately, because that's not what pays anyone's bills yet.",
      callout: {
        kind: "analogy",
        text: "A percentage cut that only applies when the platform closed the sale works like a *real-estate referral fee* — the referring party only gets paid on deals that actually closed through the referral, not on everything the buyer does afterward.",
      },
    },
  ],
  faq: [
    {
      q: "Can an AI agent have its own bank account or hold money?",
      a: "Not on its own, in any legally meaningful sense — **an agent isn't a legal person**. In practice, the owner's business entity holds the account, the card, or the wallet, and the agent acts within limits that entity's owner sets. This isn't legal advice; if you're structuring real money movement through an agent, confirm the entity and liability structure with an actual lawyer or accountant, not a guide like this one.",
    },
    {
      q: "What is x402, in one sentence?",
      a: "*x402* is a Linux Foundation project that revives HTTP's long-reserved 402 \"Payment Required\" status code as a standard for stablecoin-based, per-request payments, aimed mainly at API monetization and agent-initiated commerce, and it describes itself as production-ready — though that's the project's own self-reported status, not an independently verified one.",
    },
    {
      q: "How do marketplace payouts to an agent builder actually work?",
      a: "The platform meters the buyer's usage of your agent and remits a share on some cadence — but \"how\" varies a lot by platform, and not every consumer AI marketplace has published its payout terms clearly. Before you rely on a marketplace's payout model for real revenue, **find the actual published terms** rather than assuming a percentage.",
    },
    {
      q: "Should I build for agent-to-agent payments now?",
      a: "**Not as your revenue model.** Build the boring rails first — subscriptions, metering, GMV share — and keep your usage logging clean enough that you could switch to per-request billing later if a standard like x402 actually becomes something buyers expect. Betting a business today on machines paying each other is premature; watching it isn't.",
    },
  ],
  sources: [
    {
      label: "MDN Web Docs — \"402 Payment Required\"",
      url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/402",
    },
    {
      label: "x402.org — protocol overview",
      url: "https://www.x402.org",
    },
    {
      label: "Model Context Protocol — \"What is the Model Context Protocol (MCP)?\"",
      url: "https://modelcontextprotocol.io/introduction",
    },
  ],
};
