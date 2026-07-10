import type { Guide } from "./types";

export const guide: Guide = {
  slug: "how-much-does-gohighlevel-cost",
  title: "How Much Does GoHighLevel Really Cost in 2026? (Full Price Breakdown)",
  description:
    "GoHighLevel plans start at $97/mo, but the AI Employee add-on and usage fees push the real bill higher. Here is the full 2026 cost breakdown.",
  targetKeyword: "how much does gohighlevel cost",
  intent: "commercial",
  cluster: "gohighlevel",
  relatedTool: "/tools/gohighlevel-cost-calculator",
  relatedBest: "/gohighlevel-pricing",
  dek: "The sticker price is only the first line of the bill. This is what GoHighLevel actually costs once the AI add-on and usage fees are counted.",
  sections: [
    {
      h2: "The three base plans and what each includes",
      body: "GoHighLevel sells three main tiers. The **Starter plan** is listed at $97 per month. It includes a working CRM, pipelines, calendars, and up to three sub-accounts — enough to run a small shop or a couple of clients.\n\nThe **Unlimited plan** is listed at $297 per month and removes the sub-account cap. It's the plan most agencies land on once they have more than a few clients.\n\nThe **Agency Pro** (SaaS Mode) plan is listed at $497 per month. It adds the SaaS features that let you resell the platform under your own brand.\n\nOn paper this looks simple: pick a tier, pay the monthly fee, done. The problem is the number on the pricing page isn't the number that lands on your card.\n\nTwo big categories of cost sit outside those base plans, and both scale with how much you actually use the software. That gap between the sticker price and the real bill is where most people get surprised.\n\nBefore you commit, it helps to walk through each cost layer. That way you can estimate your true monthly spend instead of the advertised one.",
      diagram: {
        type: "bars",
        title: "GoHighLevel's three base plans",
        items: [
          { label: "Starter", value: 97, display: "$97/mo", domain: "gohighlevel.com" },
          { label: "Unlimited", value: 297, display: "$297/mo", domain: "gohighlevel.com" },
          { label: "Agency Pro (SaaS Mode)", value: 497, display: "$497/mo", domain: "gohighlevel.com" }
        ],
        note: "Listed monthly price per tier. The AI Employee add-on and usage fees are extra — see below."
      }
    },
    {
      h2: "The AI Employee add-on — the cost most people miss",
      body: "The feature GoHighLevel markets hardest right now is its *AI Employee* — the bundle that answers calls, replies to messages, and books appointments.\n\nHere's the part that catches people out: the AI Employee is an **add-on**, not something included in any base plan. You pay for it on top of the $97, $297, or $497 you're already paying.\n\nThe reported pricing is roughly $50 per month per location on the Growth option, or around $97 per month per location on the Unlimited option. There's also a usage-based route reported at around $0.02 to $0.05 per minute.\n\nThe word to notice is **per location**. Run one business and you pay it once — run an agency with many client accounts, and that fee repeats for every single client who wants AI answering their phone.\n\nThis matters because the AI receptionist is the exact feature most small businesses want most. So the thing that sells the platform is often the thing missing from the price you first saw, and it's billed in a way that grows with your client count.",
      callout: {
        kind: "analogy",
        text: "Per-location billing is like paying a cover charge at every venue on the same bar crawl. Turn AI Employee on for ten client accounts, and you pay the fee ten separate times, not once."
      }
    },
    {
      h2: "Usage fees that stack on top",
      body: "On top of the base plan and the AI add-on, GoHighLevel rebills you for the messages and calls your accounts send and receive. These are **pass-through usage charges**.\n\nText messages are reported at around $0.0079 per segment. Email is around $0.675 per one thousand sends, and calls are around $0.014 per minute — with inbound reported near $0.0128 and outbound near $0.021.\n\nAny single charge looks tiny, and that's exactly why it's easy to ignore. But a busy account sending appointment reminders, follow-ups, and review requests, while also taking and making calls, runs through thousands of segments and minutes a month.\n\nVoice AI in particular is reported at around $0.163 per minute at the platform level, and agencies commonly resell it to clients at around $0.40 per minute.\n\nThe key thing to understand: **usage is metered and never stops climbing** as you grow. More clients and more conversations mean a bigger usage bill every month, layered on top of everything else — not a fixed cost you can plan around once.\n\nFor the fuller list of charges people miss on their first quote, see [the hidden GoHighLevel fees guide](/guides/hidden-gohighlevel-fees)."
    },
    {
      h2: "What a real agency bill looks like at 1, 5, and 10 clients",
      body: "Run the layers together and the picture changes. A single business on the Starter plan pays $97 for the software, then adds the AI Employee, then adds its own usage. Already the real number is well above the advertised $97.\n\nNow scale it. Because the AI Employee is charged **per location**, the fee multiplies with every client you onboard.\n\nA ten-client agency running the flat-rate AI Employee is reported to pay about **$970 per month** in AI Employee fees alone, and that figure sits on top of the base plan and on top of all the metered usage. At five clients, you're roughly halfway to that, again before base and usage.\n\nNone of this makes GoHighLevel a bad tool. It's a warning to **model the full stack before you commit**.\n\nThe advertised tier is the floor, not the ceiling, and the ceiling rises with every client and every conversation. If you plan around $97, or even $297, you'll likely be planning around the wrong number.",
      callout: {
        kind: "tip",
        text: "Before you sign anything, add up base plan + AI Employee × your client count + expected monthly usage. That total, not the $97 on the pricing page, is the number to compare against any alternative."
      },
      diagram: {
        type: "stack",
        title: "The three layers of a real GoHighLevel bill",
        layers: [
          { label: "Base plan", sub: "$97, $297, or $497/mo — the sticker price" },
          { label: "AI Employee add-on", sub: "per location — repeats for every client" },
          { label: "Usage fees", sub: "metered texts, email, calls — climbs as you grow" }
        ]
      }
    },
    {
      h2: "The flat-priced alternative — and when GoHighLevel is still worth it",
      body: "SeldonFrame takes the opposite approach: **$29 per month, flat**, with unlimited workspaces and unlimited client sub-accounts. The first workspace is free forever, you can cancel anytime, and there's no trial gate — the free build, claim, and use flow *is* the trial.\n\nThe AI receptionist that GoHighLevel charges extra for is the product here, and it's included. So are the website, CRM, booking, reviews, client portal, and custom domains.\n\nThe reason the price can stay flat is the mechanism underneath it. SeldonFrame runs on your own AI keys, such as Claude, ChatGPT, or Gemini, and your own Twilio account.\n\nThat means AI and telephony run at **raw provider cost with no platform markup**. The per-location fees and resold minutes that inflate a GoHighLevel bill simply aren't there.\n\nA full client workspace, with a site, CRM, booking, and a live agent, is generated from one conversation in about three minutes. One booked job usually pays for the whole month.\n\nTo be fair, GoHighLevel earns its keep for the right buyer. Its funnel builder, its huge library of templates and snapshots, its deep email and SMS campaign automation, and its large community are genuine strengths.\n\nIf your business is built on high-volume funnels and complex multi-step campaigns, and you have the budget and time to master it, GoHighLevel remains a strong choice. If you mainly want an AI front office per client without a bill that grows every time you add one, [the flat-priced alternative](/guides/gohighlevel-vs-seldonframe) is the safer math.",
      callout: {
        kind: "analogy",
        text: "*BYOK* (bring your own key) is like using your own gas card instead of a rental car's built-in fuel plan — you pay the pump price directly, and nobody adds a markup on top for convenience."
      }
    }
  ],
  faq: [
    {
      q: "Is the AI receptionist included in GoHighLevel's price?",
      a: "No. GoHighLevel's *AI Employee* is an add-on billed on top of your base plan, reported at around $50 per month per location on the Growth option or around $97 per month per location on the Unlimited option, with a usage-based route reported near $0.02 to $0.05 per minute. Because it is charged **per location**, the cost repeats for every client account. By contrast, SeldonFrame includes the AI receptionist in its flat $29 per month price."
    },
    {
      q: "What does a 10-client agency really pay?",
      a: "More than the sticker price suggests. A ten-client agency on the flat-rate AI Employee is reported to pay about **$970 per month** in AI Employee fees alone, and that sits on top of the base plan of $97, $297, or $497 and on top of metered usage for texts, email, and calls. The real monthly total depends on message and call volume, but it scales up with every client you add."
    },
    {
      q: "Is there a cheaper flat-price alternative?",
      a: "Yes. SeldonFrame is **$29 per month flat** with unlimited workspaces and client sub-accounts, the first workspace free forever, no trial gate, and cancel anytime. The AI receptionist, website, CRM, booking, reviews, client portal, and custom domains are all included. It runs on your own AI keys and your own Twilio, so AI and telephony run at raw provider cost with no platform markup, which is how the price stays flat as you grow."
    }
  ],
  sources: [
    { label: "GoHighLevel — Pricing", url: "https://www.gohighlevel.com/pricing" },
    {
      label: "HighLevel — AI Products Pricing",
      url: "https://help.gohighlevel.com/support/solutions/articles/155000006652-ai-product-pricing"
    },
    {
      label: "HighLevel — Pricing & Billing: Wallets, Charges, Rebilling",
      url: "https://help.gohighlevel.com/support/solutions/articles/155000001156-highlevel-pricing-guide"
    },
    {
      label: "NetPartners — GoHighLevel AI Pricing 2026",
      url: "https://netpartners.marketing/gohighlevel-ai-pricing/"
    }
  ]
};
