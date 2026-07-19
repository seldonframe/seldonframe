import type { Guide } from "./types";

export const guide: Guide = {
  slug: "how-to-get-ai-agency-clients",
  title: "How to Get Clients for an AI Agency (Channels That Compound, Not Hacks)",
  description:
    "A pipeline-first guide to getting clients for an AI agency: the trust-first order of operations, the lighthouse-client flywheel, and channels ranked honestly for a new agency — no invented conversion rates.",
  targetKeyword: "how to get clients for ai agency",
  intent: "commercial",
  cluster: "sell-agents",
  relatedTool: "/tools/agency-margin-calculator",
  relatedBest: "/agencies",
  dek: "Most \"how to get AI agency clients\" advice is really about the close — the demo script, the pitch deck, the objection you didn't expect. That's real, but it's not the bottleneck for a new agency. The bottleneck is where the next lead comes from next month, and the month after. This is a pipeline guide: the channels that keep producing clients once the first few land, ranked by how honestly they work for someone starting from zero.",
  sections: [
    {
      h2: "Where the first 3-5 clients actually come from (and why skipping this stalls agencies at zero)",
      body: "Here's the uncomfortable part of this business: your first several clients **almost never come from a channel.** They come from people who already trust you — a past employer, a vendor relationship from a trade you worked in, a group chat of people in one industry who know your name.\n\nIf you spent five years doing estimates for HVAC contractors before you learned to build agents, your first client is far more likely to be a contractor who already knows you're competent than a stranger who found your LinkedIn post.\n\nThis is why a lot of new AI agencies stall at zero clients despite doing everything the guides say. They built a landing page, wrote a cold outreach sequence, and set up ads — before asking a single person they already know if they had a problem worth solving.\n\n**Trust is the actual currency in this category right now.** Buyers have been burned by vague \"AI for your business\" pitches, so a stranger's cold DM has to overcome that skepticism from nothing. Someone who already trusts you doesn't have to overcome it at all.\n\nA quick note on scope: this page is about pipeline — where clients come from, month after month, once you're past the first few. If you're looking for the demo script, the pitch structure, and how to handle \"we already have a website guy\" in the room, that's covered in the [companion guide on selling AI agents to local businesses](/guides/how-to-sell-ai-agents-to-local-businesses). Read that one for the close; read this one for what keeps leads arriving so you have something to close.",
    },
    {
      h2: "The lighthouse-client flywheel",
      body: "The channel that compounds fastest for a new agency isn't really a channel at all. It's one *lighthouse client* — operated brilliantly, turned into proof.\n\nPick your first client, ideally the trust-based one from the section above. Over-deliver on the actual outcome they care about. Then ask permission to document it: real numbers, their name, their business.\n\nNot a vague testimonial — **a one-page case study** with a before/after a skeptical peer in the same trade would actually believe.\n\nThat one document unlocks the second layer of trust-based distribution: the client's own network. Trade associations, supplier reps who visit dozens of businesses a month, the Facebook group every plumber in a metro area is quietly a member of.\n\nWord travels inside a vertical differently than it does across one. A roofer telling other roofers \"this thing actually books my after-hours calls\" carries weight no amount of generic AI marketing copy can buy.\n\nThat's the flywheel: **one well-run client produces the proof that opens the next five**, and each of those can produce its own referral if you keep the operating bar high.\n\nThe failure mode is doing this in reverse — chasing five mediocre clients at once instead of making one client the reference story your whole vertical talks about.",
      callout: {
        kind: "analogy",
        text: "A lighthouse client is the one business every other prospect in that trade already trusts — get it right for the first roofer, and the other roofers in his supplier's group chat hear the story secondhand before you ever message them.",
      },
      diagram: {
        type: "loop",
        title: "The lighthouse-client flywheel",
        steps: ["Lighthouse client", "Case study", "Referrals", "Next client"],
      },
    },
    {
      h2: "Channels ranked honestly for a new AI agency",
      body: "In roughly the order they work for someone starting with no existing client base, from most to least reliable:\n\n1. **Your network and vertical referrals** — covered above. The highest close rate, because trust already exists.\n\n2. Local and trade associations, BNI-style referral groups, chamber-of-commerce events. Slower to build than a cold list, but the relationships are durable and self-reinforcing — you show up consistently, and referrals start flowing both directions.\n\n3. Strategic partners who already sell into your vertical: accountants, insurance agents, equipment suppliers, web designers, bookkeepers. They have the trust relationship you're trying to build, they're not your competitor, and a referral fee or reciprocal arrangement — check what that's worth with the [agency margin calculator](/tools/agency-margin-calculator) — gives them a reason to mention you.\n\n4. Content and SEO in your vertical's own language — not \"AI agent for small business\" but the specific problem your *ICP* searches for (\"missed calls after hours plumbing,\" \"HVAC no-show rate\"). Slow to compound, genuinely compounding once it does — a piece written a year ago can still be producing leads today.\n\n5. Cold outreach, but armed with the prospect's own evidence rather than a generic pitch — see the demo-as-lead-magnet section below. Works, but it's a grind, and deliverability and response rates are volatile enough that nobody should build a plan around a specific conversion number here.\n\n6. Paid ads, last, and only once you have an offer that already converts warm intros reliably. **Ads amplify a working funnel; they don't create one.** Spending on ads before you know your close rate on warm leads is the fastest way to burn budget learning what a referral would have told you for free.\n\nFor comparison, look at how an established category player prices distribution: HighLevel's own pricing page lists an Unlimited plan at $297/month aimed at \"growing agencies\" with unlimited sub-accounts — a price point built around agencies that already have enough of a client pipeline to fill unlimited seats. That's the plan for an agency with a working channel, not a starting point for finding your first one.",
      diagram: {
        type: "stack",
        title: "Channels for a new agency, most to least reliable",
        layers: [
          { label: "Network & vertical referrals", sub: "highest close rate — trust already exists" },
          { label: "Trade associations & referral groups", sub: "slower to build, durable once running" },
          { label: "Strategic partners", sub: "accountants, insurers, suppliers who already have the trust" },
          { label: "Content & SEO in your vertical's language", sub: "slow to compound, keeps compounding once it does" },
          { label: "Cold outreach with evidence attached", sub: "works, but it's a grind" },
          { label: "Paid ads", sub: "last — only once warm intros already convert" },
        ],
      },
    },
    {
      h2: "The demo-as-lead-magnet",
      body: "The single highest-leverage outreach hook for a new AI agency isn't a pitch deck. It's a free audit or a pre-built demo running on the prospect's own business.\n\nPull their actual Google Business Profile listing, their actual website, their actual after-hours voicemail. Show them specifically what a caller experiences at 7pm on a Tuesday when no one answers.\n\n\"Let me show you what your business misses after 6pm\" out-pulls \"we do AI\" because it's concrete and it's about them, not about your category. A generic AI pitch asks the prospect to imagine a hypothetical improvement; **a demo built on their real business shows them a gap they can verify is real** in under a minute.\n\nIt also sidesteps the skepticism fatigue every small-business owner has built up toward AI sales pitches in the last two years. You're not asking them to trust a claim — you're showing them evidence.\n\nThis only works as a channel if producing the demo is cheap enough to do at volume, which is the mechanical reason it belongs in this pipeline section rather than the close-tactics guide: **the demo is what gets the meeting, the pitch is what happens once you're in it.**",
      callout: {
        kind: "tip",
        text: "Build the demo on data the prospect can check in ten seconds — their real phone number, their real hours, their real reviews. The moment they spot one accurate detail, the rest of the demo reads as credible too.",
      },
    },
    {
      h2: "What kills pipelines",
      body: "Four patterns account for most stalled AI agency pipelines.\n\n**Horizontal positioning** — \"AI for any business\" — sounds like more addressable market and is actually less, because nobody refers a generalist the way they refer someone who obviously specializes in their exact trade.\n\n**Invisible pricing** forces every prospect to have an awkward first conversation just to find out if you're in their budget. That quietly filters out referrals before they ever reach you — someone won't refer a friend to a page with no numbers on it.\n\n**No case study** means every pitch starts from zero credibility instead of borrowed credibility from a peer's result.\n\nAnd churn is the quiet pipeline killer nobody accounts for. A client who leaves within a few months doesn't just cost that revenue — they actively un-sell the next three prospects in their network when someone asks how it went. Retention is acquisition in a trust-based channel: the flywheel from section two runs in reverse just as fast as it runs forward.",
      callout: {
        kind: "warning",
        text: "Losing a client doesn't just cost that client. In a trust-based channel, a bad off-boarding is a referral in reverse — the same network that would have sent you the next three prospects now hears why not to call you.",
      },
    },
    {
      h2: "Where SeldonFrame fits (disclosed)",
      body: "We build SeldonFrame, so read this section as the sales pitch it partly is.\n\nThe demo-as-lead-magnet approach above is only cheap at volume if producing each demo doesn't cost you real time or money. SeldonFrame's first workspace is free, so building a working agent, CRM, and booking flow on a prospect's actual business — to use as your outreach hook — costs you nothing to produce before you've closed a single deal.\n\nDeploys are white-label, so the relationship — and the trust you're compounding through the flywheel in section two — stays attached to your agency's brand, not ours.\n\nBeyond the free first workspace, SeldonFrame is **$29/month flat** with *BYOK* for the model calls, so your margin on each client isn't taxed by usage the way many category tools structure pricing.\n\nNone of that replaces the actual channel-building work above. It just removes one excuse — cost of producing the proof — from the list of reasons pipeline-building gets postponed.",
    },
  ],
  faq: [
    {
      q: "How long until I have a steady pipeline of AI agency clients?",
      a: "There's no honest single number here — it depends heavily on how much pre-existing trust and vertical network you're starting with. An agency starting from a trade background with an existing network can land a first client in weeks; someone starting cold with no vertical relationships should expect the trust-building channels (associations, partners, content) to take months before they compound. Treat any specific timeline promise elsewhere with real skepticism.",
    },
    {
      q: "Do cold email and cold DM campaigns actually work for AI agencies?",
      a: "They can produce clients, but they're the **fifth channel** on the list above for a reason — deliverability has gotten harder across email and social platforms, response rates are volatile, and a cold message with no evidence attached competes against real AI-sales fatigue in most small-business inboxes. Pairing cold outreach with a concrete demo built on the prospect's own business (see the demo-as-lead-magnet section) measurably changes the conversation, but don't build a revenue plan around an assumed cold-outreach conversion rate — nobody can honestly hand you one that will hold for your specific vertical and list.",
    },
    {
      q: "Should I niche down to one vertical, or stay horizontal to widen my funnel?",
      a: "Niching down is the stronger starting position for pipeline, even though it feels like it narrows your addressable market. A specific vertical is what makes the trust-network and referral channels in this guide work at all — \"the AI agency that works with dental practices\" gets referred inside dental-practice circles in a way \"AI for any business\" never does. You can widen later once a vertical is producing reliably; starting horizontal usually means no single referral network ever forms.",
    },
    {
      q: "Do I need a website before I start getting clients?",
      a: "Not before your first few trust-based clients — those close on relationship, not on a polished site. You do need somewhere credible to send a referral or a partner by the time the lighthouse-client flywheel starts working, since that's the moment strangers start hearing about you and checking you out before reaching out. A simple site with a real case study on it beats a generic template with none.",
    },
  ],
  sources: [
    {
      label: "HighLevel — Pricing (Unlimited plan, $297/mo, unlimited sub-accounts)",
      url: "https://www.gohighlevel.com/pricing",
    },
    {
      label: "Model Context Protocol — \"What is the Model Context Protocol (MCP)?\"",
      url: "https://modelcontextprotocol.io/introduction",
    },
  ],
};
