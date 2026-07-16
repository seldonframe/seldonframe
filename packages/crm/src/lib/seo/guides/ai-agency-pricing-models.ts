import type { Guide } from "./types";

export const guide: Guide = {
  slug: "ai-agency-pricing-models",
  title: "AI Agency Pricing Models: Retainer, Per-Agent, Usage, and Outcome (What Actually Retains Clients)",
  description:
    "How to price AI agent services across a whole client roster, not just one deal: the four agency-level models, a good/better/best menu, the margin mechanics platform fees quietly eat, and how to reprice an existing book.",
  targetKeyword: "ai agency pricing models",
  intent: "commercial",
  cluster: "sell-agents",
  relatedTool: "/tools/agency-margin-calculator",
  relatedBest: "/agencies",
  dek: "Pricing one agent for one client is a different problem than pricing a service menu across a roster of twenty. The model that wins a single deal can quietly wreck your margin at scale, or lock you into a contract structure that makes churn worse instead of better. Here's how agencies structure pricing at the roster level, and where it actually breaks.",
  sections: [
    {
      h2: "The four agency-level pricing models",
      body: "Pricing a single agent for a single client is a build-cost question — see [how much to charge for an AI agent](/guides/how-much-to-charge-for-an-ai-agent) for that math.\n\nPricing across a roster is a different problem. Which structure do you standardize on? What does each one do to your cash flow and your client's trust as the roster grows?\n\n**Flat monthly retainer** per client is the default, and for good reason. Every client pays the same predictable number for a defined bundle of agents and features. That makes the sale simple (\"it's $X a month, here's what's included\") and makes your own revenue forecastable a quarter out.\n\nThe trade-off: a retainer doesn't naturally track how much value a specific client is getting. A client running heavy call volume through their receptionist agent pays the same as one who barely uses it — fine, until the heavy user asks why.\n\n**Per-agent line-item pricing** turns your roster into a menu: a receptionist agent is $X, a review agent is $Y, a booking agent is $Z, and a client buys what they need. It's transparent, and it upsells naturally — a client on one agent is an easy add-on conversation for a second.\n\nBut it also invites a la carte negotiation (\"can I get the receptionist without the review piece, for less\") that a bundled retainer avoids. Your invoice, not your value story, is what the client compares month to month.\n\n**Usage or volume-based pricing** (per conversation, per call minute, per resolved ticket) scales fairly with what a client actually consumes. That reads as honest to a price-sensitive client.\n\nThe cost to you: your own revenue becomes unpredictable, tied to a client's business cycle instead of a flat number you can plan around. Clients also dislike a bill that moves without warning, even when the movement is fair.\n\n**Outcome-based pricing** — a fee per booked job, or a percentage of tracked revenue the agent influenced — aligns your incentive most tightly with the client's. It's the easiest pitch in the room (\"you only pay when it works\").\n\nIt's also the hardest to instrument credibly across a whole roster. You need clean *attribution* per client, a shared definition of what counts as \"the agent's\" booking versus one that would have happened anyway, and a client willing to trust your numbers instead of demanding an audit. It tends to work best as an add-on layered on top of a retainer, not as the sole structure for a diverse client base.\n\nMost agencies that scale past a handful of clients converge on flat retainer as the backbone, with usage or outcome components reserved for specific higher-trust or higher-volume accounts — not the whole roster.",
      callout: {
        kind: "analogy",
        text: "Attribution is like a store trying to prove which sign brought in a walk-in customer. If three signs point the same direction, you can guess, but you can't prove it — and a client who's paying based on your proof will eventually ask for it.",
      },
      diagram: {
        type: "compare",
        title: "Retainer vs. the other three models",
        left: {
          heading: "Flat retainer",
          items: ["Predictable revenue", "Simple to sell", "Doesn't track actual usage"],
        },
        right: {
          heading: "Per-agent / usage / outcome",
          items: ["Scales with value or consumption", "Invites negotiation or unpredictable bills", "Outcome needs clean attribution"],
        },
      },
    },
    {
      h2: "Tiering the service menu: good, better, best",
      body: "The single highest-leverage pricing decision an agency makes isn't the number — it's whether to quote a custom price per client at all.\n\nCustom quoting feels more precise, but it slows every sale down (a proposal cycle instead of a page a prospect can act on). It makes margins inconsistent across the roster, since each deal negotiated in isolation drifts from your real cost structure. And it gives every prospect a reason to ask \"why is mine different from theirs.\"\n\n**Three fixed tiers solve all three problems at once.** A workable shape for a front-office agency:\n\nA **good** tier that's after-hours and overflow answering only — the agent picks up what the client's team misses, nothing more. A **better** tier that's the full front office: agent, booking, CRM, and intake wired together as the client's actual phone and web front door. A **best** tier that adds reputation management — review requests, response monitoring, and reporting — on top of the full front office.\n\nEach tier is a strict superset of the one below it, so the upgrade path is obvious. The sales conversation becomes \"which of these three\" instead of \"what should we build for you.\"\n\nFixed tiers also protect your margin at scale in a way custom quotes can't. Because the deliverable is standardized, your onboarding time per client converges toward a predictable number — exactly the input the margin math in the next section depends on.\n\nA roster of custom-quoted, custom-built clients is a roster of twenty slightly different products to support. A roster of three tiers is three products, however many clients bought them.",
      diagram: {
        type: "stack",
        title: "The good / better / best menu",
        layers: [
          { label: "Best", sub: "Full front office + reputation management" },
          { label: "Better", sub: "Agent, booking, CRM, and intake — the full front office" },
          { label: "Good", sub: "After-hours and overflow answering only" },
        ],
      },
    },
    {
      h2: "The margin mechanics: what scales with clients and what doesn't",
      body: "Two categories of cost sit underneath every client on your roster, and the difference between them is the whole ballgame.\n\nOnboarding time, support tickets, and the occasional custom request scale with headcount — every new client adds real hours, no matter what platform you're on. Platform cost is the one that should not scale with clients but, on a lot of agency tooling, quietly does.\n\nThe pattern to watch for is **per-sub-account or per-location platform pricing**: a flat add-on fee charged for every client workspace you spin up, sometimes stacked with usage that's rebilled at a markup rather than passed through at cost.\n\nRun that math across ten, twenty, fifty clients and the platform's revenue line becomes your COGS line, growing in lockstep with the roster you spent years building. The scarier part is that it grows silently — nobody notices the tenth sub-account fee the way they'd notice one big invoice, because it arrives as ten separate small ones.\n\n**BYOK, flat-fee platforms invert that curve.** If the platform charges one flat monthly fee regardless of workspace count, and the AI and telephony run on your own provider keys at raw cost, then adding the tenth client adds real support hours but effectively zero incremental platform cost.\n\nYour margin per client goes up, not down, as the roster grows, because the fixed cost is amortizing across more revenue instead of multiplying with it.\n\nRun your actual roster size and mix through the [agency margin calculator](/tools/agency-margin-calculator) before you commit to a platform's pricing model — not after you've built twenty client instances on top of it. The per-sub-account trap is far cheaper to avoid than to unwind.",
      callout: {
        kind: "warning",
        text: "A per-sub-account fee is easy to miss on a pricing page because it's quoted per workspace, not per month. Multiply it by your actual roster size — today's and next year's — before you sign anything.",
      },
    },
    {
      h2: "Setup fees, contracts, and guarantees",
      body: "A setup fee should cover exactly the work that doesn't repeat: the persona and script, the calendar and CRM integration, the test calls, and the edits before the agent goes live for that specific client.\n\nIt's real, non-repeatable labor. Skipping the fee doesn't make the client happier long-term — it just trains them to expect free rework the next time they want a change, because nothing signaled the first build had a cost.\n\nOn contract length: **month-to-month, backed by a short recurring proof report** (calls answered, jobs booked, reviews collected), beats an annual lock-in for building trust — even though it looks riskier on paper.\n\nA client who can leave anytime but keeps renewing because the report keeps showing value is a stronger account than one locked into a year they resent by month four. Annual contracts trade a little churn protection for a client relationship built on obligation instead of proof — and a resentful locked-in client is a worse renewal risk at month twelve than a month-to-month client who's seen eleven months of reports.\n\n**Outcome guarantees** — \"we'll book you N jobs a month or your money back\" — are the trap to watch for on the sales side. They're a powerful pitch, but they only work if you actually control every variable the guarantee depends on: lead volume, the client's own follow-through on booked appointments, seasonality, their pricing versus competitors'.\n\nAn agency doesn't control most of those. Promise a guarantee you can't back with real control over the inputs, and you've turned a sales tactic into a liability you'll be negotiating out of by month three.",
      callout: {
        kind: "tip",
        text: "If you're tempted to offer a guarantee, ask which inputs you'd actually control if the number came up short. If the honest answer is \"none of them,\" the guarantee is a promise about someone else's business, not yours.",
      },
    },
    {
      h2: "Repricing an existing roster",
      body: "The roster you priced two years ago is not the roster you'd price today — costs, competitors, and your own delivery quality have all moved. Repricing an existing book without wrecking retention comes down to sequencing more than the number itself.\n\n**Grandfather existing clients** at their current price for a defined window, rather than repricing everyone on the same day. It protects the relationships that are your most reliable revenue while you roll the new price out to new signups immediately.\n\nMove legacy clients to the new pricing at their contract anniversary, with real notice and — ideally — the same proof report used to justify new-client pricing. That way the increase lands as \"here's what you've gotten, here's the new number,\" not an unexplained line-item change.\n\nAnd use the tiering work from earlier: an existing custom-quoted client is a natural candidate to move onto one of your three fixed tiers at renewal. That simplifies your own support burden even if the sticker price doesn't move much in that pass.",
    },
    {
      h2: "Where SeldonFrame fits",
      body: "Disclosure: SeldonFrame is the platform we build, so weigh this section as a disclosed pitch, not neutral advice.\n\nWhat's true regardless of who's telling you: SeldonFrame is a **flat $29/mo with unlimited workspaces** and the first workspace free forever. That means the per-client platform cost described in the margin section above approaches zero as your roster grows, rather than climbing with it — there's no per-sub-account fee to multiply by client count.\n\nIt runs on your own AI provider keys and your own Twilio account (*BYOK*), so usage cost is the raw provider rate, not a rebilled markup.\n\nThe only fee tied to your growth is a **flat 2% GMV share** — and only on deals where SeldonFrame is the sales channel that brought the client in. A client you sourced and closed yourself carries no GMV fee at all.",
    },
  ],
  faq: [
    {
      q: "What should my first pricing model be if I'm starting from zero?",
      a: "Flat monthly retainer, structured as good/better/best tiers rather than custom quotes. It's the easiest to sell, the easiest to forecast, and the easiest to support consistently across a growing roster. Add usage or outcome components later, on specific accounts, once you have the volume and trust to instrument them credibly.",
    },
    {
      q: "Should I publish prices on my agency's website?",
      a: "Publishing at least a starting tier price (even \"from $X/mo\") tends to filter out unqualified leads before a call, and it signals confidence — an agency that hides pricing reads as either expensive or unsure of its own value. It doesn't mean every deal has to close at the published number; it means the published number sets the floor of the conversation instead of leaving it fully open.",
    },
    {
      q: "How do I price a multi-location client?",
      a: "Treat each location as a unit of the same tier structure rather than inventing a custom bundle: a base retainer for the account plus a per-location add-on, so the price scales predictably as the client opens or closes locations. This mirrors the per-agent and per-tier logic elsewhere in your menu — the client is buying more units of a known thing, not a bespoke build.",
    },
    {
      q: "When does outcome-based pricing actually make sense?",
      a: "When you control most of the variables the outcome depends on and you can measure it cleanly — for example, a booking agent where you can show exactly which appointments came through the agent's calendar link. It's weaker when lead volume, the client's own sales follow-through, or seasonality dominate the outcome, because then you're guaranteeing something you can't actually steer. Layer it on top of a retainer for specific accounts rather than betting the whole roster's revenue on it.",
    },
    {
      q: "Does SeldonFrame set what I charge my clients?",
      a: "No. SeldonFrame is the platform an agency builds and deploys agents on; the pricing model and the number you charge your own clients are entirely your call. Disclosure: we're $29/mo flat with unlimited workspaces, BYOK for AI and telephony, and a flat 2% GMV fee that applies only on deals where SeldonFrame is the sales channel and only on solo tiers like this one (0% on agency plans) — never on clients you brought in yourself.",
    },
  ],
  sources: [
    {
      label: "HighLevel — pricing tiers and sub-account limits by plan",
      url: "https://www.gohighlevel.com/pricing",
    },
    {
      label: "Ruby — virtual receptionist plan pricing (what agency clients compare against)",
      url: "https://www.ruby.com/pricing/",
    },
    {
      label: "Anthropic (Claude) API pricing — model pricing table",
      url: "https://platform.claude.com/docs/en/about-claude/pricing",
    },
  ],
};
