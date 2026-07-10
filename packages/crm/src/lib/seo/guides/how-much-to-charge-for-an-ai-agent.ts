import type { Guide } from "./types";

export const guide: Guide = {
  slug: "how-much-to-charge-for-an-ai-agent",
  title: "How Much to Charge for an AI Agent: Pricing Models, Ranges, and Mistakes",
  description:
    "A practical guide to pricing AI agents for local-business clients — the four pricing models, what to anchor against, the real cost floor, sample price-sheet ranges, and the mistakes that cap what builders earn.",
  targetKeyword: "how much to charge for an ai agent",
  intent: "commercial",
  cluster: "sell-agents",
  relatedTool: "/tools/agency-margin-calculator",
  relatedBest: "/marketplace",
  dek: "Builders shipping their first AI agent almost always underprice it. They copy a SaaS per-seat number that doesn't fit, or they price off their own low running costs instead of what the client is buying. Here's how builders actually structure pricing, what to anchor the number against, and the mistakes that quietly cap what you can charge.",
  sections: [
    {
      h2: "The four pricing models builders actually use",
      body: "Most agent pricing in the wild collapses into four shapes.\n\nA setup fee plus a monthly retainer is the default for local-business agents: a one-time fee for the build and integration work, then a flat monthly amount for hosting, monitoring, and iteration.\n\nFlat per-agent-per-month pricing drops the setup fee and charges a single recurring number. It's simpler to sell, but it front-loads none of the build cost — so it tends to work best for lighter, templated agents rather than a custom voice receptionist wired into a client's calendar and CRM.\n\nUsage-based pricing (per conversation, per booked call, per resolved ticket) scales naturally with client volume and feels fair to price-sensitive clients. But it makes revenue unpredictable for the builder, and the client can't budget against it.\n\nOutcome or *GMV-share* pricing — a cut of the revenue the agent influences — **aligns incentives the most tightly**. It's also the hardest to instrument and verify, and clients are (rightly) wary of a black-box formula on their own numbers.\n\nFor local-business agents specifically, **setup fee plus retainer wins on both sides of the table** for the same reason: predictability. The client knows exactly what hits their card every month, which makes it easy to compare against a human hire or an answering service they're already paying for.\n\nThe builder gets **recurring revenue that isn't hostage to a slow month**. The setup fee covers the real, non-repeatable cost of the first build — the persona, the integrations, the test calls, the edits before it goes live.\n\nUsage-based and outcome-share pricing aren't wrong. They're just better suited to agents where volume is large and easy to measure (e.g., a high-volume chatbot), or where a builder already has the trust and the tooling to prove attribution cleanly.",
      callout: {
        kind: "analogy",
        text: "Outcome pricing is like a real-estate commission — you only get paid when the agent's work actually closes something for the client. It sounds fair until you have to argue, invoice by invoice, over which sale the agent gets credit for.",
      },
    },
    {
      h2: "Price against the alternative, not your own costs",
      body: "The single biggest pricing mistake is anchoring on what the agent costs you to run.\n\nThe client isn't buying tokens and phone minutes. They're buying **a job the agent replaces, or a loss it prevents** — and that's what should set the number.\n\nCompare a [voice-receptionist agent](/guides/how-to-price-an-ai-receptionist-service) against a human receptionist's fully loaded cost: wages plus payroll tax, benefits, and the fact that a human can't answer at 9pm or during lunch. Or compare it against a live answering service's published per-minute or per-month rates, or against the revenue lost when a lead calls, gets voicemail, and books with the next result on Google instead.\n\nRuby, a well-known live virtual-receptionist service, publishes plan pricing that runs from roughly $250/month for a 50-minute plan up to $1,725/month for 500 minutes, scaling with call volume (source below). It's a useful public data point for what businesses already pay for a human-answered phone — and a natural anchor for an AI receptionist priced well under it while still answering every call, after hours included.\n\nThe same anchor logic applies to chat and review agents: price against what a missed lead or an unaddressed bad review costs, not against your API bill.\n\nThe cleanest way to make the number land in a sales conversation is the **\"one booked job pays for the month\"** framing. If the agent's monthly price is less than the value of a single job it books or saves, the math is obvious to a local-business owner without a spreadsheet.\n\nKeep that ratio in view when setting the retainer — **it's doing more selling than any feature list.**",
    },
    {
      h2: "The cost floor: what an agent actually costs to run",
      body: "With a bring-your-own-key model, the raw model cost of running a text or voice agent for a small business's typical volume is genuinely low. It's worth being honest about the shape of that math rather than treating it as a trade secret.\n\nAnthropic's published API pricing puts its smallest current model, Claude Haiku 4.5, at $1 per million input tokens and $5 per million output tokens. Anthropic's own worked example estimates roughly $37 to process 10,000 support-style tickets on that model — call it well under a cent per conversation at that model tier (source below).\n\nA local business doing a few dozen to a few hundred agent conversations a month is nowhere near the volume where that line item becomes material.\n\nTelephony adds a second small cost. Twilio's published US voice pricing lists outbound calls at $0.014/minute and inbound calls at $0.0085/minute on a local number, plus a roughly $1.15/month number fee, as of this writing (source below).\n\nA voice receptionist handling, say, 200 minutes of calls a month is looking at a few dollars in raw telephony cost, not hundreds.\n\nAdd those together and the honest picture for a lower-volume local-business agent is **often single-digit dollars a month in raw model and telephony cost**, sometimes creeping higher for a voice-heavy agent with real call volume.\n\nThat's a **floor, not a target** — it tells you the retainer isn't covering compute. It's covering the build, the maintenance, the monitoring, the iteration, and the fact that the client would rather pay a predictable number than manage infrastructure themselves.\n\nDon't publish a precise \"our margin is X%\" number to a client. The point is **knowing your floor well enough to price confidently above it**.",
      callout: {
        kind: "analogy",
        text: "A cost floor is like a restaurant knowing the raw ingredient cost of a plate — a useful number for the kitchen, and mostly irrelevant to what a diner should pay for the meal, the room, and the service.",
      },
      diagram: {
        type: "bars",
        title: "The cost floor vs. what businesses already pay for a human",
        items: [
          { label: "Claude Haiku 4.5 (output tokens)", value: 5, display: "$5 / million output tokens", domain: "claude.com" },
          { label: "Twilio (inbound call)", value: 0.0085, display: "$0.0085/min", domain: "twilio.com" },
          { label: "Ruby (lowest plan)", value: 250, display: "$250/month", domain: "ruby.com" },
        ],
        note: "Different units, shown together for scale, not as a direct apples-to-apples comparison — the compute and telephony line items run cents to a few dollars; the human-answered alternative is priced in hundreds of dollars a month.",
      },
    },
    {
      h2: "Sample price-sheet shapes by agent type",
      body: "These are ranges, not quotes. Actual numbers should move with market, integration complexity, and what a specific client already pays for the thing being replaced.\n\nA website chat agent handling FAQs and lead capture commonly lands in the **lower end** of a typical builder price sheet, since it's usually the lightest build.\n\nA voice receptionist — phone answering, booking, basic call routing — commonly prices higher than website chat, reflecting the added telephony setup, the call-quality testing, and the fact that it's replacing a phone line a business actively depends on.\n\nA review-automation agent (requesting and monitoring reviews) tends to sit toward the lighter end too, since it's typically a narrower, more automatable workflow.\n\nA **full front office** — agent plus CRM plus booking plus a client-facing portal — commands the highest end of the range, because it's replacing more of the client's existing stack, not just one channel.\n\nWithin any of those categories, setup fees commonly scale with integration complexity. An agent wired into an existing calendar, phone number, and CRM costs more to stand up than a chat widget dropped onto an existing site.\n\nMonthly retainers commonly scale with usage tier and how much ongoing tuning the client expects.\n\nBuilders selling multiple agent types to the same client typically **bundle at a discount** to the sum of individual prices — run the math with the [agency margin calculator](/tools/agency-margin-calculator) — the same setup-fee-plus-retainer logic still applies, just calculated across the bundle.",
    },
    {
      h2: "Common pricing mistakes",
      body: "**Underpricing because your own costs are low** is the most common mistake, and it's covered above: the retainer prices the value delivered, not the token bill.\n\nA close second is charging a one-off project fee with no retainer. It feels client-friendly, but it leaves the builder with zero recurring revenue and no natural touchpoint to catch drift when the client's hours, services, or FAQ change and the agent quietly goes stale.\n\nNot charging a setup fee at all is a related error. Skipping it signals that the initial build was free, which **trains the client to expect free rework** every time they want a change, and it undervalues the real work of the first integration.\n\n*Per-seat* thinking — pricing an agent like SaaS licenses, by number of users who can access it — is a mismatch. An agent isn't consumed by seats, it's consumed by conversations and outcomes on behalf of the whole business.\n\nPricing that way either overcharges a small client with few staff or leaves money on the table for a client running high volume through one login.\n\nThe fix in every one of these cases is the same: come back to **what the agent replaces and what predictability is worth to the client**, and price the retainer against that.",
      callout: {
        kind: "warning",
        text: "A project fee with no retainer means nobody is watching the agent after launch. When the client's hours or services change and the agent starts giving wrong answers, you won't know until the client tells you — or stops being a client.",
      },
    },
    {
      h2: "When and how to raise prices",
      body: "The right time to raise a price is **after proof has accumulated**, not before.\n\nResponse-time stats (how fast the agent answers vs. the old process), a count of jobs booked or leads captured, and reviews collected are all concrete, client-visible evidence that the agent is earning more than it costs. That evidence is what makes a price increase land as fair rather than opportunistic.\n\n**Bring the numbers to the conversation** rather than a general \"costs are going up\" line. A client who's watched the agent book real jobs is far less price-sensitive than one asked to take it on faith.\n\nRaise prices at renewal or contract-anniversary points rather than mid-cycle, and give advance notice.\n\nConsider **grandfathering** existing clients at a lower tier for a period while quoting new clients the higher number — it protects the relationship while still moving the business's average price up.\n\nIf a client resists an increase, the retainer's predictability argument still applies in reverse: point back at what they'd pay for the human or service equivalent today, which has almost certainly gone up more than the agent's price has.\n\nSee also [how to make money selling AI agents](/guides/how-to-make-money-selling-ai-agents) for the wider playbook this pricing logic sits inside.",
    },
  ],
  faq: [
    {
      q: "Should I always charge a setup fee?",
      a: "For anything beyond the lightest templated agent, yes. A setup fee covers real, non-repeatable work — persona, integrations, testing — and it signals the build has value, which makes the ongoing retainer easier to justify. **Skipping it tends to train clients to expect free rework later.**",
    },
    {
      q: "Monthly retainer vs. one-time project fee — which is better?",
      a: "A retainer, in almost every case, for local-business agents. It's predictable for the client, it gives the builder recurring revenue instead of a single payday, and it creates a natural touchpoint to catch the agent drifting out of date as the business's hours, services, or offers change. **A one-time fee with no retainer leaves nobody watching the agent after launch.**",
    },
    {
      q: "What margin should I target between running cost and price?",
      a: "There's no single right number to publish, and be wary of anyone who states one with false precision — it depends on agent type, volume, and market. What matters more than a target percentage is **knowing your floor** (see the cost-floor section above) well enough that the retainer is confidently priced against client value, not against your own cost line.",
    },
    {
      q: "Do I pass model and API costs through to the client as a line item?",
      a: "Most builders don't itemize it — it's folded into the flat retainer, the same way an agency doesn't itemize the electricity a designer's laptop uses. Itemizing invites the client to negotiate the wrong number (your cost) instead of the right one (the value delivered). **The exception is a usage-based pricing model**, where cost pass-through is the explicit structure the client agreed to.",
    },
    {
      q: "Does SeldonFrame set agent pricing for me?",
      a: "No — SeldonFrame is the platform builders use to build and deploy the agent itself; what you charge your client is your call. **Disclosure:** SeldonFrame is $29/mo flat with unlimited workspaces and the first workspace free, and *BYOK* keeps our own model costs at-cost, which is part of why the cost floor described above stays low. We only take a share (5% stepping down to 2%) when SeldonFrame is the sales channel bringing the client in.",
    },
  ],
  sources: [
    {
      label: "Anthropic (Claude) API pricing — model pricing table and worked support-ticket cost example",
      url: "https://platform.claude.com/docs/en/about-claude/pricing",
    },
    {
      label: "Twilio — US voice call pricing (per-minute inbound/outbound rates)",
      url: "https://www.twilio.com/en-us/voice/pricing/us",
    },
    {
      label: "Ruby — virtual receptionist and live chat plan pricing",
      url: "https://www.ruby.com/pricing/",
    },
  ],
};
