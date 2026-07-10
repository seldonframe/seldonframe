import type { Guide } from "./types";

export const guide: Guide = {
  slug: "ai-marketplace-fees-compared",
  title: "AI Marketplace Fees Compared: Who Takes What Cut in 2026 (and What's Actually Public)",
  description:
    "Apple takes 15-30%, published. OpenAI's GPT Store payout program's status isn't public. Here's exactly what each AI agent marketplace discloses about fees — and what it doesn't.",
  targetKeyword: "ai marketplace fees",
  intent: "commercial",
  cluster: "sell-agents",
  relatedTool: "/tools/agency-margin-calculator",
  relatedBest: "/marketplace",
  dek: "Most \"AI marketplace fees compared\" content invents percentages nobody actually published. This page doesn't. Every number below is what the platform itself discloses on its own current page, checked this session — and every gap is labeled a gap, not filled in with a guess.",
  sections: [
    {
      h2: "Why comparing marketplace fees is genuinely hard right now",
      body: "Ask \"what percentage does an AI marketplace take\" and most answers you'll find are a single blended number. It doesn't hold up to a second look.\n\nHere's the honest picture. Consumer AI app stores mostly **haven't published builder payout terms at all** — OpenAI has talked about testing a compensation program for GPT builders, but the current public documentation doesn't confirm the program is fully live or what the split is.\n\nEnterprise marketplaces like Salesforce AgentExchange and AWS Marketplace negotiate partner terms case by case. There's no single public rate to quote.\n\nAnd the fee that actually determines your margin is often not the headline cut at all. It's the adjacent taxes: a per-sub-account platform fee, a required infrastructure subscription, a payment-processing pass-through, or a usage markup stacked on top of a flat price.\n\nRead a marketplace's pricing page **like a seller pricing out a deal**, not a buyer comparing sticker prices, and the real comparison starts to look different from the ones you'll find elsewhere.\n\nFor a broader map of what \"AI agent marketplace\" even means as a category — consumer app store vs. enterprise exchange vs. deploy-and-operate — see our companion piece, [The Best AI Agent Marketplaces in 2026](/guides/best-ai-agent-marketplaces). This page is the fee deep-dive that sits underneath it.",
    },
    {
      h2: "The baseline everyone already half-knows: app store commissions",
      body: "Software marketplaces have published commission structures for over a decade. They're the anchor most people mean when they say \"platform cut.\"\n\nApple's App Store charges a standard commission of **30% on paid apps and in-app purchases**, dropping to **15%** for developers enrolled in the Small Business Program (available to developers with up to $1 million in prior-year proceeds), and as low as 10% for subscriptions past the first year under the EU's alternative terms.\n\nGoogle Play runs a similar structure: **15% on the first $1 million in annual revenue** for most transactions and on all auto-renewing subscriptions regardless of revenue level, rising to 30% above that threshold for non-subscription transactions. Google states that 99% of developers who pay any fee at all qualify for 15% or less through one program or another.\n\nGoogle is also rolling out a lower-friction 10-20% structure in the EEA, UK, and US as external payment options expand.\n\nNeither of these is an \"AI agent marketplace.\" They're the baseline every reader already has some intuition for — the anchor against which the newer categories below look genuinely different: not lower or higher on average, but largely undisclosed.",
      callout: {
        kind: "analogy",
        text: "A *take rate* is the restaurant's cut when you pay your server with a credit card instead of cash — the kitchen still gets the same meal made, but a slice of every sale goes to whoever processed the transaction before the rest reaches the owner.",
      },
      diagram: {
        type: "bars",
        title: "Published app store commission range",
        items: [
          { label: "Apple App Store (Small Business Program)", value: 15, display: "15%", domain: "apple.com" },
          { label: "Apple App Store (standard)", value: 30, display: "30%", domain: "apple.com" },
          { label: "Google Play (first $1M / subscriptions)", value: 15, display: "15%", domain: "google.com" },
          { label: "Google Play (above $1M, non-subscription)", value: 30, display: "30%", domain: "google.com" },
        ],
        note: "Published commission ranges as of this writing. Neither is an AI agent marketplace — they're the baseline anchor.",
      },
    },
    {
      h2: "The AI-agent platforms, one by one",
      body: "**OpenAI GPT Store.** OpenAI has discussed testing a usage-based program to compensate GPT builders since early 2024, and access to build and publish to the store itself is free.\n\nBut current public material does not confirm whether a payout program is fully live today, what the revenue share is, or how usage is measured. Wikipedia's own summary of the store, sourced from OpenAI's public statements, describes creators having \"the opportunity to monetize\" without confirming the program's operational status.\n\n**Verdict: not publicly disclosed.**\n\n**Poe (by Quora), creator monetization.** Poe's own creator site confirms a \"Creator Monetization\" program and a \"How We Cover Your Costs\" mechanism exist, with dedicated docs promising to explain \"how to earn revenue from your creations.\"\n\nThe introductory page we fetched does not itself state a specific *revenue-share* percentage or payout formula — that detail lives deeper in Poe's creator documentation, not on the front page.\n\n**Verdict: program confirmed, exact split not publicly disclosed on the page we checked.**\n\n**AWS Marketplace — AI Agents and Tools.** AWS's category page describes a real listing model: pre-built agents, agent tools, and professional services sold as SaaS, containers, APIs, or via Amazon Bedrock AgentCore, with sellers going through a formal \"Sign up as a Seller\" application.\n\nOn the buyer side the page states pricing runs \"pay-as-you-go and contract subscriptions, or negotiate custom pricing and terms.\" It does not state AWS's take rate anywhere on the public page.\n\n**Verdict: not publicly disclosed** — you'll see the actual number in seller onboarding, not the marketing page.\n\n**Salesforce AgentExchange.** The rebrand of AppExchange for the agent era: the page confirms \"Salesforce AppExchange is now AgentExchange\" but contains no financial or commercial terms at all — no revenue-share percentage, no listing fee.\n\nHistorically AppExchange has run on negotiated *ISV* (independent software vendor) partner agreements rather than one public rate.\n\n**Verdict: not publicly disclosed**; expect a partner-application process, not a self-serve rate card.\n\n**White-label platforms, where the \"fee\" is a subscription, not a cut.** GoHighLevel publishes its pricing outright: Starter at **$97/month** (3 sub-accounts), Unlimited at **$297/month** (unlimited sub-accounts, its most popular tier), and Agency Pro at **$497/month** (adds SaaS-mode resale), plus usage-based charges for telephony and AI beyond the base plan.\n\nStammer.ai also publishes its tiers: Agency at **$197/month** and Full SaaS Mode at **$497/month**, both with unlimited client resale and no revenue share on top — agencies instead mark up a usage-based wallet system.\n\nOperators describe reselling Stammer's usage costs to clients at a multiple, though those resale figures come from agency reports rather than Stammer's published pages — treat them as reported, not guaranteed.\n\nNeither platform takes a cut of what you charge your client. The fee is the subscription plus whatever markup you choose.",
    },
    {
      h2: "The hidden-fee taxonomy: how to read a pricing page like a seller",
      body: "The published headline number rarely tells you your actual margin. Four patterns to check for on every marketplace or platform you're evaluating.\n\n**Per-sub-account or per-client platform fees** — GoHighLevel and Stammer both charge more as you add clients, which is a real cost curve even with zero revenue share.\n\n**Per-minute or per-message usage markups** on top of a flat subscription — voice and AI usage on both platforms above is billed separately from the base plan.\n\n**Payment-processing pass-throughs** — a marketplace's payment rail (Stripe or equivalent) takes its own 2-3% regardless of what the platform charges, and it's easy to forget when comparing headline rates.\n\n**Revenue-share-on-top-of-subscription combos**, where a platform charges both a flat fee and a percentage of what flows through it.\n\nNone of these show up in a single \"take rate\" number, which is exactly why a comparison that only quotes one number per platform is missing the real cost structure. Add up the base subscription, the per-client scaling cost, the usage markup, and any percentage cut before you compare two platforms on \"fees\" — the platform with the lower headline number sometimes costs more per client once all four are counted.",
    },
    {
      h2: "SeldonFrame's fees, stated plainly",
      body: "We build this product, so weigh this section as the disclosure it is.\n\nSeldonFrame is **$29/month flat, unlimited workspaces**, with the first workspace free — no per-sub-account fee, no tier that charges more as you add clients.\n\nModel costs run *BYOK*, at cost, so they're not a hidden markup on our end.\n\nWe take a *GMV fee* that steps down from **5% to 3% to 2%** as volume grows, and it only applies when SeldonFrame is actually the sales channel that brought the buyer — if you close the deal yourself and just use SF to build and host, that fee doesn't apply.\n\nOn top of that there's a marketplace usage fee for agents rented through the SF marketplace specifically.\n\nAll of it is published, not negotiated per partner, because the thesis is that a platform shouldn't tax a builder's growth. **The flat subscription and the volume-scaling GMV rate are supposed to make the platform cheaper per client as you add more of them** — the opposite of the per-sub-account model above.",
    },
    {
      h2: "How to actually choose on fees",
      body: "The headline percentage matters less than two questions the percentage doesn't answer.\n\nFirst: **do you own the customer relationship**, or does the platform sit between you and the buyer permanently? A 0% marketplace you can't get discovered on, or one where the platform owns the customer record, earns you less over time than a fee'd channel with real buyers and a relationship you keep.\n\nSecond: **do costs scale per client, or stay flat?** A subscription-plus-markup platform can look cheap at one client and expensive at twenty; a flat platform fee with a usage-linked cut does the opposite.\n\nCompare marketplaces the way you'd compare any distribution channel — by what you keep after the deal closes and what happens to your margin as you scale — not by which one advertises the smallest number.",
    },
  ],
  faq: [
    {
      q: "Does the GPT Store take a cut of what builders earn?",
      a: "OpenAI has said since early 2024 that it was testing a usage-based compensation program for GPT builders, and access to build and publish is free. What current public documentation does not confirm is whether that program is fully live today, what the actual split is, or how usage is measured — treat this as not publicly disclosed until OpenAI's own current builder docs state a number.",
    },
    {
      q: "What's a fair marketplace fee for AI agents?",
      a: "There's no single fair number in isolation — a fee only makes sense relative to what you get for it. A percentage-based fee that only applies when the platform actually brought you the buyer (rather than a flat tax on everything you sell) is structurally fairer than a fee you pay regardless of whether the platform did any selling. Weigh the fee against whether you keep the customer relationship afterward, since a marketplace that owns the customer record is extracting more value than the published percentage alone suggests.",
    },
    {
      q: "Do white-label platforms like GoHighLevel or Stammer charge revenue share?",
      a: "Not in the traditional sense. Both publish flat subscription tiers (GoHighLevel: $97/$297/$497 per month; Stammer: $197/$497 per month) rather than taking a cut of what you charge clients. The real cost to watch is usage-based markup and per-sub-account scaling — GoHighLevel's telephony and AI usage bills separately from the base plan, and Stammer's model runs on a client wallet that agencies resell at a markup — a figure operators report themselves rather than one Stammer publishes — which functions like a margin even though it isn't a platform revenue share.",
    },
    {
      q: "Why do enterprise marketplaces like AgentExchange and AWS Marketplace hide their fees?",
      a: "They're not hiding them so much as negotiating them — AppExchange/AgentExchange and AWS Marketplace both run on partner programs where terms are set per ISV agreement or per seller application, not a single public rate. Neither platform's public page states a take rate; the actual number shows up during partner or seller onboarding, which is standard for enterprise channels built around large deals rather than self-serve listings.",
    },
    {
      q: "Is a 0% marketplace fee actually the best deal?",
      a: "Only if the marketplace also gets you found. A platform that takes nothing but delivers no discovery and no buyer traffic is worth exactly what it costs you in time spent unlisted. Compare fee structures against actual distribution — a marketplace charging a real percentage but bringing real buyers usually nets a builder more than a free listing nobody sees.",
    },
  ],
  sources: [
    {
      label: "Apple — App Store Small Business Program",
      url: "https://developer.apple.com/app-store/small-business-program/",
    },
    {
      label: "Google Play Help — Service fees",
      url: "https://support.google.com/googleplay/android-developer/answer/112622",
    },
    {
      label: "GoHighLevel — Pricing",
      url: "https://www.gohighlevel.com/pricing",
    },
    {
      label: "Stammer.ai — Pricing",
      url: "https://stammer.ai/pricing",
    },
    {
      label: "Wikipedia — GPT Store",
      url: "https://en.wikipedia.org/wiki/GPT_Store",
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
      label: "AWS Marketplace — AI Agents and Tools",
      url: "https://aws.amazon.com/marketplace/solutions/ai-agents-and-tools/",
    },
  ],
};
