import type { Guide } from "./types";

export const guide: Guide = {
  slug: "best-ai-agent-marketplaces",
  title: "The Best AI Agent Marketplaces in 2026 (For Builders Who Want to Get Paid)",
  description:
    "GPT Store, Poe, Salesforce AgentExchange, AWS Marketplace — and what \"AI agent marketplace\" actually means once you ask the one question builders care about: how do I get paid?",
  targetKeyword: "ai agent marketplace",
  intent: "commercial",
  cluster: "sell-agents",
  relatedTool: "/tools/agency-margin-calculator",
  relatedBest: "/marketplace",
  dek: "\"AI agent marketplace\" gets used for at least three genuinely different things right now, and builders researching where to list their work usually discover the difference the hard way — after building for the wrong one. Here's an honest map of what's actually out there, how each one pays (or doesn't), and how to pick.",
  sections: [
    {
      h2: "\"AI agent marketplace\" is three different products wearing one name",
      body: "Search the term and you'll get results that barely have anything in common with each other. **Consumer app stores** let anyone build a custom assistant and publish it to end users inside a chat app — OpenAI's GPT Store is the clearest example.\n\n**Enterprise and platform exchanges** let software vendors and systems integrators list agent-based solutions for large buyers already locked into a platform. Salesforce's AgentExchange and AWS Marketplace's AI Agents and Tools category are this shape.\n\nAnd **deploy-and-operate marketplaces** are the newest category. A buyer doesn't just discover an agent — they rent a working instance of it, connected to their own calendar, CRM, or phone number, running on someone's infrastructure.\n\nThis distinction matters more than the marketing copy suggests, because it sorts every other question. Who can list depends on it. How discovery works depends on it.\n\nAnd — the question builders actually care about — whether and how you get paid depends on it almost entirely. A GPT Store listing and an AgentExchange listing aren't competing for the same builder's time. They're not even the same kind of listing.",
      diagram: {
        type: "stack",
        title: "Three products wearing one name",
        layers: [
          { label: "Consumer app stores", sub: "GPT Store, Poe — publish to end users inside a chat app", domain: "openai.com" },
          { label: "Enterprise & platform exchanges", sub: "AgentExchange, AWS Marketplace — ISV partners sell to platform customers", domain: "salesforce.com" },
          { label: "Deploy-and-operate marketplaces", sub: "The buyer rents a working instance, connected to their own tools" },
        ],
      },
    },
    {
      h2: "The list",
      body: "**OpenAI GPT Store.** Anyone with a ChatGPT account can build and publish a custom GPT. Access to browse and publish to the store went free in May 2024, after launching as a paid-tier feature in January 2024.\n\nDiscovery happens inside ChatGPT itself — categories, search, and a leaderboard. OpenAI said in 2024 it was testing a usage-based program to pay builders, but the publicly available material doesn't clearly confirm the program is fully live, what the revenue share is, or how usage gets measured today. **Treat any specific payout number you see elsewhere as unverified** until OpenAI's own current documentation states it.\n\n**Poe (by Quora).** Poe lets creators build and publish bots — including ones backed by their own custom logic or servers — with a dedicated creator-monetization track described on creator.poe.com. The site confirms a \"Creator Monetization\" program and a \"How We Cover Your Costs\" mechanism exist.\n\nBut the specific revenue-share percentage and eligibility mechanics live behind Poe's fuller creator docs, not the summary page. We're not going to repeat a number we couldn't independently confirm. If payout terms are the deciding factor for you, read Poe's current creator-monetization docs directly before building.\n\n**Salesforce AgentExchange.** This is the rebrand of the long-running Salesforce AppExchange for the agent era — appexchange.salesforce.com now states plainly that \"Salesforce AppExchange is now AgentExchange.\" Listing is for Salesforce *ISV* partners and consulting partners, not individual hobbyist builders.\n\nDiscovery is Salesforce customers browsing inside their own org. AppExchange has historically operated on partner program terms, with revenue-share agreements negotiated as part of ISV partnership — not a flat public rate. Expect a **partner-application process**, not a self-serve upload.\n\n**AWS Marketplace — AI Agents and Tools.** AWS's category page describes listings spanning \"pre-built agents, agent tools, agent development solutions, and professional services,\" deployable as SaaS, containers, AMIs, APIs, or on Amazon Bedrock AgentCore. Sellers go through a partner/seller application (\"Sign up as a Seller\").\n\nThe page is explicit that buyers get \"pay-as-you-go and contract subscriptions, or negotiate custom pricing and terms,\" with payment and licensing centralized through the buyer's AWS account. AWS doesn't publish its *take rate* on this page — it exists, as it does on every cloud marketplace. You'll see the actual number in seller onboarding, not the customer-facing page.\n\nTwo adjacent channels are worth knowing about, even though they're not agent marketplaces in the strict sense: app directories like Zapier's, and the early *MCP* (Model Context Protocol) server registries now forming. Neither is really a place you \"sell an agent\" today — they're places a tool or connector gets discovered. Worth watching as the **agents-as-MCP-servers** pattern matures (see the final section).\n\n**SeldonFrame marketplace** — this is our product, so weigh this entry accordingly. SeldonFrame lets builders publish agents they've built, rent them out via a signed MCP key, and deploy white-labeled multi-client versions for agencies serving their own customers.\n\nThe platform itself is $29/mo flat, with the first workspace free and *BYOK* (bring your own key) for model costs — so Seldon's own costs stay near zero and pricing doesn't need to move with usage. Seldon only takes a cut — a **flat 2% GMV fee** — when SeldonFrame is actually the sales channel that brought the buyer, and only on solo tiers (0% on agency plans). If you sell directly and just use Seldon to build and host, that fee doesn't apply.",
      callout: {
        kind: "analogy",
        text: "A GMV fee that only fires when the platform brought the buyer is like a landlord who only charges rent on the tenants they personally walked through the door — bring your own buyer, and that month's rent is zero.",
      },
    },
    {
      h2: "The comparison that actually matters",
      body: "**Four questions** cut through the category noise faster than any feature list. How do you get paid — a published rate, a negotiated partner agreement, or genuinely unclear? How much gatekeeping stands between you and a listing — self-serve upload, or a partner application and review?\n\nDo you own the customer relationship, or does the platform sit between you and the buyer permanently? And does the agent run on the platform's infrastructure, or does it connect out to infrastructure and accounts you control?\n\nBy those four questions, the GPT Store and Poe sit closest to self-serve consumer publishing, with payout mechanics that are either unconfirmed or intentionally undocumented at the public-page level. AgentExchange and AWS Marketplace sit at the other end — real partner programs with real (if opaque) revenue terms, but a gatekeeping process built for ISVs and consulting shops, not a solo builder shipping one agent this week.\n\n**Deploy-and-operate marketplaces** are the newest shape, and the one to watch. Because the buyer is renting a working instance rather than just discovering an idea, the platform has to be explicit about who owns the runtime, the keys, and the customer record. That explicitness is itself the product, not a footnote.",
    },
    {
      h2: "The uncomfortable truth: most builder revenue isn't coming from marketplace payouts yet",
      body: "Ask around in builder communities and a consistent picture emerges. Most people making real money building AI agents today do it through **direct sales to businesses** — a retainer, a project fee, a monthly seat — not a marketplace revenue-share check.\n\nThat's not a knock on any platform above; it's a fair read of where the category is right now. Consumer-app-store payout programs are new and, per the GPT Store's own public history, still being tested and refined. Enterprise exchanges pay real partner revenue, but the deals are large and the sales cycles are long — which suits an ISV far more than a solo builder.\n\nWhat marketplaces reliably deliver today is **discovery and credibility**, not a passive income stream. A listing gets you found, and gives a prospect a reason to trust you're a real operator rather than a freelancer with a GitHub repo.\n\nIn the deploy-and-operate model, a listing also gives a buyer a lower-friction way to try your agent before they'll agree to a direct retainer. Treat the marketplace as the top of the funnel and the direct relationship as where the **revenue actually lives** — and you'll size your expectations correctly.",
      callout: {
        kind: "tip",
        text: "Size your marketplace expectations like a lead source, not a paycheck — a listing brings a buyer to the table, it doesn't close the deal.",
      },
      diagram: {
        type: "compare",
        title: "Where the money actually is today",
        left: {
          heading: "Marketplace listing",
          items: ["Gets you found", "Signals you're a real operator", "Lower-friction trial (deploy-and-operate)"],
        },
        right: {
          heading: "Direct sales",
          items: ["Retainer, project fee, or monthly seat", "Where the real revenue lives today", "Cold outreach, referrals, a live demo"],
        },
      },
    },
    {
      h2: "How to pick a channel by builder type",
      body: "If you're a hobbyist experimenting with a clever assistant and want an audience with zero sales effort, a **consumer app store** — GPT Store or Poe — is the right starting point. You're optimizing for reach and iteration speed, not revenue certainty.\n\nIf you're an enterprise ISV or a consulting shop already selling into Salesforce or AWS customers, AgentExchange or AWS Marketplace is worth the partner-application overhead. You're already positioned for the deal sizes and sales cycles those channels assume.\n\nIf you're a freelancer or small agency building agents for local or SMB clients, the honest playbook is **direct sales as the primary motion** — cold outreach, referrals, a portfolio. Pair that with a deploy-and-operate marketplace as a credibility and discovery layer, not the primary revenue source.\n\nThat's the segment a **rent-via-MCP** or white-label deploy model is actually built for. It's the segment where a marketplace listing plus a direct retainer realistically compound — if you're weighing retainer pricing against marketplace fees, run the numbers with the [agency margin calculator](/tools/agency-margin-calculator) first.",
    },
    {
      h2: "What to watch in the next wave",
      body: "**Three shifts** are worth tracking rather than betting on today. First: **agents-as-MCP-servers** — treating a deployed agent like any other tool a client's own AI stack can call, rather than a standalone destination. That turns \"marketplace listing\" into something closer to a connector registry entry.\n\nSecond: rentable agents with signed, revocable keys. They give buyers a way to try an agent without a builder having to hand over source code or unrestricted access — which lowers the trust bar on both sides.\n\nThird: **public evals** — a track record a buyer can actually check, not just a star rating. In a category where anyone can claim their agent \"works,\" verifiable performance is the only differentiator that doesn't rot.",
      callout: {
        kind: "analogy",
        text: "Agent-as-MCP-server is the difference between a restaurant, a destination you visit, and a caterer, a service your own kitchen calls in — the agent still does the work, it just shows up inside someone else's stack instead of being the place people go.",
      },
    },
  ],
  faq: [
    {
      q: "Does the GPT Store pay builders?",
      a: "OpenAI said in 2024 it was testing a usage-based program to pay GPT builders, and access to the store itself became free that May. What isn't clearly confirmed in public material is whether that payout program is fully live today, what the actual rate is, or how usage gets measured. **Check OpenAI's current builder documentation directly** rather than trusting a number you saw secondhand.",
    },
    {
      q: "Where can I actually sell an AI agent to a small business?",
      a: "Realistically: **direct outreach and referrals first**, backed by a live demo the prospect can try. Consumer app stores and enterprise exchanges aren't built for SMB deals — the buyer isn't browsing the GPT Store or AgentExchange looking for a plumber's booking agent. A deploy-and-operate marketplace can add credibility and inbound discovery on top of direct sales, but it's rarely the primary channel for this buyer type today.",
    },
    {
      q: "Do I need my own hosting to list on one of these marketplaces?",
      a: "It depends on the category. Consumer app stores (GPT Store, Poe) run your agent on their infrastructure — you don't host anything. Enterprise exchanges (AgentExchange, AWS Marketplace) usually expect you to bring a deployable package or a hosted service you operate and support. Deploy-and-operate marketplaces vary by platform; SeldonFrame's, for example, hosts the runtime so a builder isn't standing up their own infrastructure per client.",
    },
    {
      q: "Is it better to sell through a marketplace or sell directly?",
      a: "For most builders right now, direct sales is where the revenue actually is, and a marketplace listing is a discovery and trust layer on top of it — not a replacement for it. Enterprise-exchange partner revenue can be substantial, but the sales cycle and gatekeeping suit an established ISV more than a builder just starting out. Treat marketplace presence as marketing, and build your pipeline on direct relationships until a specific channel proves otherwise for your product.",
    },
    {
      q: "What should I check before listing an agent on any marketplace?",
      a: "Four things, in order: **how you actually get paid** (a published rate beats a vague promise), how much gatekeeping stands between you and a listing, whether you keep the customer relationship or the platform owns it, and whether the agent runs on the platform's infrastructure or yours. If a marketplace's own public pages can't answer the payout question clearly, that's information too — it tells you the terms are negotiated case-by-case, not a self-serve rate you can plan around.",
    },
  ],
  sources: [
    {
      label: "AWS Marketplace — AI Agents and Tools",
      url: "https://aws.amazon.com/marketplace/solutions/ai-agents-and-tools/",
    },
    {
      label: "Poe — Creator monetization",
      url: "https://creator.poe.com/",
    },
    {
      label: "Salesforce — AppExchange is now AgentExchange",
      url: "https://appexchange.salesforce.com/",
    },
    {
      label: "Wikipedia — GPT Store",
      url: "https://en.wikipedia.org/wiki/GPT_Store",
    },
  ],
};
