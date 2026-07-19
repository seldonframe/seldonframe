import type { Guide } from "./types";

export const guide: Guide = {
  slug: "where-to-sell-ai-agents",
  title: "Where to Sell AI Agents: 7 Channels Ranked by Effort and Revenue Reality",
  description:
    "Direct sale, white-label through agencies, your own site, freelance platforms, marketplaces, resellers, consumer stores — 7 channels for selling AI agents, ranked honestly by effort and how fast money actually shows up.",
  targetKeyword: "where to sell ai agents",
  intent: "commercial",
  cluster: "sell-agents",
  relatedTool: "/tools/agency-margin-calculator",
  relatedBest: "/marketplace",
  dek: "\"Where do I sell an AI agent\" sounds like a discovery problem. It's really an ownership problem: every channel trades distribution for a piece of the customer relationship — and the margin. Here are the **7 real channels**, ranked by realistic revenue for a solo builder or small agency — not by hype.",
  sections: [
    {
      h2: "The real question isn't \"where\" — it's who owns the customer",
      body: "Every channel for selling an AI agent makes the same trade. The more distribution a channel hands you, the more it usually takes back. That \"take\" is a cut of revenue, ownership of the customer relationship, or both.\n\nA cold outreach retainer gives you 100% of the customer and zero built-in distribution. A consumer app store gives you access to millions of users — and almost no say in who finds you, what they pay, or whether you ever hear from them again.\n\nNeither end of that spectrum is wrong. **The mistake is picking a channel without noticing which end of the trade you're on.**\n\nRanked by realistic revenue for a solo builder or small agency, roughly best-to-worst: direct sale to local or SMB businesses on retainer, white-label through other agencies, your own vertical productized-service site, freelance platforms like Upwork or Fiverr, agent marketplaces, reseller or affiliate programs, and consumer app stores like the GPT Store.\n\nThat order isn't a law of nature. A builder with an existing audience might do better starting near the bottom of this list. A builder already inside an agency network might skip straight to white-label.\n\nBut if you're starting from zero, **this order tends to produce a first dollar fastest** — and lets you keep the most of what you earn.",
      diagram: {
        type: "stack",
        title: "The 7 channels, ranked money → grind → lottery",
        layers: [
          { label: "1. Direct sale on retainer", sub: "you own the pitch, price, and relationship" },
          { label: "2. White-label through agencies", sub: "you build, they resell under their brand" },
          { label: "3. Your own productized-service site", sub: "direct-sale ownership, but you need inbound" },
          { label: "4. Freelance platforms", sub: "Upwork, Fiverr — platform owns the buyer first" },
          { label: "5. Agent marketplaces", sub: "a discovery layer, not a first channel" },
          { label: "6. Reseller / affiliate programs", sub: "commission only, no build ownership" },
          { label: "7. Consumer app stores", sub: "GPT Store and similar — a distribution lottery", domain: "openai.com" },
        ],
      },
    },
    {
      h2: "The money channels: direct sale and white-label through agencies",
      body: "Direct sale to local and service businesses — plumbers, dentists, salons, HVAC — ranks first for one reason: **you control every variable.** The pitch, the price, the timeline, and the relationship after the sale are all yours.\n\nA week of effort looks like prospecting: finding businesses with a provable, nameable pain, like a missed call or no online booking. Then you build a demo on the prospect's actual business before the meeting, and pitch the one-booked-job math.\n\nFirst revenue arrives whenever you close your first retainer. That depends entirely on how many prospects you can reach and how sharp the demo is — there's no honest universal number to give here. The field-manual version of this channel, with scripts and objection handling, lives in [the companion guide on selling to local businesses](/guides/how-to-sell-ai-agents-to-local-businesses).\n\nWhat you give up: nothing to a platform, but everything to your own hustle. No channel here does the selling for you.\n\n*White-label* through other agencies ranks second — building agents that other agencies resell under their own brand, to their own clients.\n\nIt inherits the same ownership — you set your price, you own the build — while trading direct-sales effort for relationship-building effort. Instead of pitching one business at a time, you pitch one agency once and get access to their whole client roster.\n\nA week of effort looks like finding agencies already selling something adjacent — web design, marketing, IT support — who don't want to build AI agents themselves. You prove your build quality on one client before asking for the roster.\n\nFirst revenue arrives on roughly the same timeline as direct sales. But it **compounds faster** once one agency relationship is proven, because each new client the agency signs is incremental revenue for you, with no incremental prospecting.\n\nWhat you give up: your name on the finished product (it ships as theirs), and some pricing control if the agency negotiates hard on the wholesale rate.",
      callout: {
        kind: "analogy",
        text: "A store brand at the grocery store is the closest comparison to white-label: same product inside, different name on the box. The store keeps the shelf and the shopper relationship — not the company that made the product.",
      },
    },
    {
      h2: "The grind channels: your own site and freelance platforms",
      body: "A vertical productized-service site is a landing page selling one specific, packaged agent — \"AI receptionist for dental offices,\" priced and scoped — to a niche you pick. It ranks third because it's **direct-sale ownership without direct-sale prospecting effort.**\n\nThe trade: you now need inbound instead. That's its own grind.\n\nA week of effort looks like SEO content, a clear pricing page, and enough proof — case studies, a live demo — to convert someone who arrived with zero relationship to you.\n\nFirst revenue realistically takes longer to arrive than direct outreach, because you're waiting on search or referral traffic to find you rather than finding the buyer yourself. Hedge any specific timeline claim you see for this channel — it depends entirely on the niche's search volume and your content cadence.\n\nWhat you give up: the fast, controllable timeline of direct sales. In exchange, you get a channel that can eventually run with less of your active selling time once it's built.\n\nFreelance platforms — Upwork, Fiverr, and similar — rank fourth, and honestly lower than their traffic numbers suggest.\n\nThe trade most builders underweight until they hit it: **the platform, not you, owns the buyer relationship** for the first project. Every job runs through the platform's fee structure taken off the top.\n\nNeither platform publishes a page we could independently verify for this piece. So state it plainly and qualitatively, rather than quoting a number: expect a real service fee on every job, standard for the category. For a closer, channel-by-channel breakdown of this trade, see [the Fiverr vs. owning your agent comparison](/guides/selling-ai-services-on-fiverr-vs-owning-your-agent).\n\nA week of effort looks like building a profile, bidding on postings, and delivering fast enough to earn reviews that unlock better-paying work.\n\nFirst revenue can arrive faster than the other channels here — some buyers hire within days of a good proposal. But the per-project fee and platform-mediated relationship make it a **weaker foundation for a recurring retainer** than a client you found and closed yourself.\n\nWhat you give up: a cut of every job, and the buyer's contact information until — if — the relationship moves off-platform.",
    },
    {
      h2: "The leverage and lottery channels: marketplaces, resellers, consumer stores",
      body: "Agent marketplaces rank fifth. They're worth doing — but as a credibility and discovery layer stacked on top of a direct-sales motion, not a replacement for one.\n\nThe category itself splits into consumer app stores, enterprise exchanges, and deploy-and-operate marketplaces, each with different gatekeeping and payout mechanics. The full breakdown of which is which, and how each one actually pays, is its own piece — see [the marketplace comparison guide](/guides/best-ai-agent-marketplaces) rather than re-deriving it here.\n\nA week of effort looks like polishing a listing. For deploy-and-operate marketplaces specifically, it also means making the agent easy to try before a buyer commits.\n\nFirst revenue is genuinely unpredictable. Some listings get discovered quickly; most don't, because you're relying on the platform's search and browse behavior rather than your own outreach.\n\nWhat you give up: a share of revenue on marketplace-sourced sales, and some control over how your agent is presented next to competitors.\n\nReseller or affiliate programs — earning a commission for referring customers to someone else's AI product — rank sixth. You're selling someone else's roadmap and someone else's pricing power, with **no path to owning the build or the customer long-term.**\n\nA week of effort is genuinely low: share a link, make the case in conversations you're already having. That's exactly why the payout per hour tends to be low too.\n\nFirst revenue can arrive quickly for an easy referral. But there's no compounding — each sale is a one-off commission, not a growing book of your own clients.\n\nWhat you give up: essentially everything except the commission. No product ownership, no client relationship, no pricing say.\n\nConsumer app stores — the GPT Store and similar — rank last for a builder trying to make a living. Not because they're bad, but because they're a **distribution lottery.**\n\nThe GPT Store went free to publish to in May 2024, after launching to paying users only in January 2024, per Wikipedia's summary of the platform. OpenAI has tested usage-based payouts for builders, but the public record doesn't clearly confirm a fully live, specific revenue-share rate today. Treat any number you see quoted for this as unverified until OpenAI's own current documentation states it.\n\nA week of effort is low: publish and hope for discovery. That's the whole problem — so is everyone else's, and the store's own discovery mechanics, not your sales skill, decide who gets found.\n\nFirst revenue, if it arrives at all, is unpredictable and platform-dependent.\n\nWhat you give up: essentially all pricing and relationship control, in exchange for a shot at reach you can't get any other way.",
    },
    {
      h2: "Stacking channels sanely",
      body: "The temptation, especially early, is to try to be everywhere at once — a marketplace listing, a GPT Store publish, an Upwork profile, and cold outreach, all in the same week.\n\nIn practice that produces zero traction anywhere. Each channel has its own skill: a good demo pitch is different from writing SEO copy, which is different from optimizing a marketplace listing. Splitting a week seven ways means none of them get enough attempts to actually work.\n\nThe sane order: start with direct sales, even if it's not where you plan to end up. The discipline of pitching a real business forces your offer to get sharp — you'll find out fast whether \"AI agent\" means anything to a buyer, or whether you need to talk about missed calls and booked jobs instead.\n\nOnce direct sales is producing a repeatable pitch and a couple of paying clients, **add exactly one leverage channel second** — white-label through one agency relationship, or one marketplace listing — rather than adding all of them simultaneously. Prove the second channel works before adding a third.\n\nWhere SeldonFrame fits into this, disclosed plainly since we build the product: the appeal of a channel-agnostic build is that you're not rebuilding the agent seven times for seven channels.\n\nOne build on SeldonFrame works across most of the channels above at once. Sell it direct to a client on retainer. White-label the same build for an agency's client roster. List it on the Seldon marketplace, or rent it out via a signed *MCP key* rather than handing over the source.\n\nThe platform is $29/mo flat, with the first workspace free, and *BYOK* for model costs. Seldon only takes a cut — a *GMV fee* stepping down from 5% to 3% to 2% — when Seldon is actually the channel that brought the buyer. Sell direct, and that fee doesn't apply.\n\nThat's a real advantage for stacking channels without rebuilding for each one. And it's also, plainly, the sales pitch in this paragraph.",
      callout: {
        kind: "analogy",
        text: "A GMV fee works the way a real-estate agent's commission works: it only applies when the agent actually brought the buyer to the table. Walk in on your own, and no commission is owed.",
      },
    },
  ],
  faq: [
    {
      q: "What's the fastest channel to a first dollar?",
      a: "Direct sale to a local or SMB business, honestly. It's the only channel where you control the entire timeline — you find the prospect, build the demo, pitch, and close. No platform's discovery algorithm or review queue gets in the way. It's also the most work per dollar in a given week, which is the trade: **fastest doesn't mean easiest, it means most within your control.**",
    },
    {
      q: "Can I sell the same agent on multiple channels at once?",
      a: "Yes — it's one of the better reasons to build the agent on a platform rather than bespoke code per client. The same build can go direct to a client, white-label through an agency, and sit on a marketplace listing, all at once. The caveat is bandwidth, not technology: each channel needs its own attention — a pitch, a relationship, a listing. **Stacking channels works once one is already producing, not as a day-one strategy.**",
    },
    {
      q: "Are freelance platforms like Upwork or Fiverr worth it?",
      a: "It depends on what you're optimizing for. They can produce a first project faster than cold outreach, because demand is already there and browsing. But the platform takes a service fee off every job and mediates the buyer relationship, at least initially. That makes it a **weaker foundation for a recurring retainer** than a client you found and closed yourself. Treat it as a way to get reps and reviews early — not as the channel you build a business on long-term.",
    },
    {
      q: "When is listing on an agent marketplace actually worth the effort?",
      a: "Once you already have a build worth listing and some credibility to point to. A marketplace listing works best as a discovery and trust layer stacked on top of direct sales, **not as a first channel on its own.** If you're starting from zero — no clients, no proof — a marketplace listing alone is unlikely to be where your first revenue comes from. Add it after direct sales is producing, not instead of it.",
    },
    {
      q: "Should I try to get into a consumer app store like the GPT Store?",
      a: "Only if reach itself is the goal, not near-term revenue. Publishing is low-effort — but so is everyone else's, and the store's own discovery mechanics decide who gets found, not your sales skill. Builders trying to make a living from AI agents are generally better served **ranking this channel last.** It's a lottery ticket worth holding if it's free to enter, not a plan to build a business around.",
    },
  ],
  sources: [
    {
      label: "Wikipedia — GPT Store",
      url: "https://en.wikipedia.org/wiki/GPT_Store",
    },
    {
      label: "AWS Marketplace — AI Agents and Tools",
      url: "https://aws.amazon.com/marketplace/solutions/ai-agents-and-tools/",
    },
    {
      label: "HighLevel — official pricing page (conventional agency-stack cost reference)",
      url: "https://www.gohighlevel.com/pricing",
    },
  ],
};
