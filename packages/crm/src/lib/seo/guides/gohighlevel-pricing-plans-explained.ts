import type { Guide } from "./types";

export const guide: Guide = {
  slug: "gohighlevel-pricing-plans-explained",
  title: "GoHighLevel Pricing Plans Explained: Starter vs Unlimited vs Agency Pro",
  description:
    "A plain-English guide to GoHighLevel's $97, $297, and $497 plans — what each tier unlocks, who it is for, and where the add-on costs begin.",
  targetKeyword: "gohighlevel pricing plans explained",
  intent: "commercial",
  cluster: "gohighlevel",
  relatedTool: "/tools/gohighlevel-cost-calculator",
  relatedBest: "/gohighlevel-pricing",
  dek: "GoHighLevel has three tiers. The real difference between them isn't features — it's **sub-accounts and rebilling**. Here's what each plan actually unlocks.",
  sections: [
    {
      h2: "Starter at $97 — three sub-accounts, best for solo operators",
      body: "Starter is listed at $97 per month. It's the entry point into GoHighLevel.\n\nYou get the core platform: a CRM, sales pipelines, calendars and booking, forms, and the funnel and website builder the product is known for.\n\nThe defining limit is **sub-accounts**. Starter caps you at three, and each sub-account is a separate client or business workspace.\n\nThat cap tells you who this plan is for. It fits a solo marketer, a freelancer, or a small business running its own marketing — plus maybe one or two clients on the side.\n\nIf you're learning the platform or testing whether it fits your workflow, Starter is where you begin.\n\nThe moment you win a fourth client, though, you hit the wall. Three sub-accounts is a hard ceiling. The only way past it is to move up a tier.\n\nSo think of Starter as a proving-ground plan, not a place an active agency stays for long.",
      callout: {
        kind: "analogy",
        text: "A *sub-account* is a locked filing cabinet drawer inside GoHighLevel — one drawer per client. Starter gives you three drawers. Run out, and you can't add a fourth client until you rent a bigger cabinet.",
      },
    },
    {
      h2: "Unlimited at $297 — unlimited sub-accounts and rebilling at cost",
      body: "Unlimited is listed at $297 per month and removes the sub-account cap entirely. This is the plan most working agencies settle on, because you can add as many client accounts as you can sell without paying more for the base platform each time.\n\nUnlimited also unlocks **rebilling**. On this plan, you can pass usage charges — texts, calls, email — through to your clients at cost, so those metered fees don't come out of your own margin.\n\nWhat you can't do on this tier is add your own markup on top of that usage. You recover the cost. You don't profit from it.\n\nFor an agency that mainly wants unlimited clients and clean cost recovery, Unlimited is the natural home. It's the plan where GoHighLevel starts to work as an agency operating system rather than a single-business tool — which is why the jump from Starter to Unlimited is the one most people eventually make."
    },
    {
      h2: "Agency Pro / SaaS at $497 — SaaS mode and rebilling with markup",
      body: "Agency Pro (also called SaaS Mode) is listed at $497 per month. It's aimed at agencies that want to sell GoHighLevel as their own product.\n\nThis is where **SaaS mode** lives. You can package the platform under your own brand, set your own plans and prices, and sign clients up on a self-serve basis.\n\nThe billing difference is the real reason to be here. Rebilling usage without markup is available on both the $297 and $497 plans. Rebilling usage *with your own markup* is only on the $497 SaaS or Agency Pro tier.\n\nIn other words: if you want to turn client texts, calls, and AI minutes into a profit center — not just recover their cost — this is the only plan that allows it.\n\nThat makes the $497 tier a **business-model decision**, not just a bigger bucket of features. You're paying for the ability to run a productized, resold SaaS.\n\nIf that's your model, the plan pays for itself. If it's not, you're likely paying for capabilities you'll never switch on.",
      diagram: {
        type: "bars",
        title: "The three GoHighLevel tiers",
        unit: "per month",
        items: [
          { label: "Starter", value: 97, display: "$97/mo", domain: "gohighlevel.com" },
          { label: "Unlimited", value: 297, display: "$297/mo", domain: "gohighlevel.com" },
          { label: "Agency Pro / SaaS", value: 497, display: "$497/mo", domain: "gohighlevel.com" },
        ],
        note: "Starter caps sub-accounts at three. Unlimited and Agency Pro remove that cap; only Agency Pro allows rebilling with markup.",
      },
    },
    {
      h2: "Annual billing math — roughly two months free",
      body: "GoHighLevel offers a discount for paying yearly. Annual billing gives about two months free compared with paying month to month.\n\nThat works out to roughly $81 per month equivalent on Starter, around $248 on Unlimited, and around $414 on Agency Pro.\n\nThe savings are real, but so is the commitment. To get the discount, you pay for the full year up front. That means you're locking in the plan whether or not it still fits your business in month four or month eight.\n\nFor a stable, established agency that already knows GoHighLevel is its long-term platform, that trade is easy to make.\n\nFor anyone still deciding, the calculation is different. Prepaying a year to save two months only helps if you're certain you'll stay.\n\nIf there's any chance you outgrow the tool, switch platforms, or lose the client volume that justified it, the annual commitment turns a discount into a risk. **Weigh the saving against how sure you are** before you lock in twelve months."
    },
    {
      h2: "Which plan you actually need — and where SeldonFrame fits",
      body: "The honest summary: most solo operators need Starter, most agencies need Unlimited, and only agencies running a resold SaaS with marked-up usage need Agency Pro.\n\nWhere it gets complicated is that none of these numbers include the AI Employee add-on or the metered usage that stacks on top — see our breakdown of [hidden GoHighLevel fees](/guides/hidden-gohighlevel-fees). The tier you pick is only the beginning of the bill.\n\nThe honest comparison for an agency against that $97/$297/$497 ladder is SeldonFrame's **Agency plans, $99–$299 per month flat** — white-label, client sub-accounts, and a branded client portal included, with 0% GMV. There's no separate tier to unlock more clients and no add-on to turn on the AI receptionist — the receptionist is the product, and it's included, along with the website, CRM, booking, reviews, client portal, and custom domains. (Solo operators running only their own workspaces, with no client sub-accounts or white-label, can start on the $29/mo Builder plan instead.)\n\nIt stays flat because it runs on your own AI keys and your own Twilio, so AI and telephony are billed at raw provider cost with no platform markup — see how that [flat pricing compares to SaaS mode](/guides/gohighlevel-saas-mode-vs-flat-pricing). A full client workspace is generated from one conversation in about three minutes, and one booked job tends to cover the month.\n\nTo be fair, the three-tier structure exists for a reason, and GoHighLevel genuinely wins for funnel-heavy agencies. Its funnel builder, its deep library of templates and snapshots, its advanced email and SMS campaign automation, and its large community are hard to match if that's the core of your business.\n\nIf you live inside complex funnels and multi-step campaigns, one of the GoHighLevel tiers is probably right for you. If you mainly want a branded AI front office for each client without choosing a tier or watching per-location fees pile up, SeldonFrame's flat agency plans are the simpler answer.",
      callout: {
        kind: "tip",
        text: "Before you pick a tier, add up sub-accounts × usage × the add-ons you'd actually turn on — the sticker price is rarely the real monthly cost.",
      },
    }
  ],
  faq: [
    {
      q: "What's the difference between Unlimited and Agency Pro?",
      a: "Both give you unlimited sub-accounts and both let you rebill client usage at cost. The difference is markup and SaaS mode. Rebilling usage with your own markup is only available on the $497 Agency Pro or SaaS plan, along with the tools to package and resell GoHighLevel as your own branded product. The $297 Unlimited plan lets you recover usage costs but not profit from them. Choose Agency Pro only if reselling the platform as a SaaS is your business model."
    },
    {
      q: "Do I need the $497 plan to white-label?",
      a: "You need the $497 Agency Pro or SaaS plan for full SaaS mode, self-serve client signups, and rebilling usage with your own markup. If your goal is simply to run unlimited client accounts and pass usage through at cost, the $297 Unlimited plan covers that. If your goal is a fully branded, resold product with marked-up usage, the $497 tier is the one that allows it."
    },
    {
      q: "Is annual billing worth it?",
      a: "Annual billing gives about two months free, roughly $81, $248, and $414 per month equivalent across the three tiers, which is a genuine saving. It is worth it if you are already sure GoHighLevel is your long-term platform, because you prepay the full year up front. If you are still evaluating the tool or your client volume is uncertain, the twelve-month commitment carries more risk than the discount is worth."
    }
  ],
  sources: [
    { label: "GoHighLevel — Pricing", url: "https://www.gohighlevel.com/pricing" },
    {
      label: "HighLevel — Pricing & Billing: Wallets, Charges, Rebilling",
      url: "https://help.gohighlevel.com/support/solutions/articles/155000001156-highlevel-pricing-guide"
    },
    {
      label: "NetPartners — GoHighLevel Agency Pricing, Costs & Margins",
      url: "https://netpartners.marketing/gohighlevel-agency-pricing-guide/"
    },
    {
      label: "Ruzuku — GoHighLevel Pricing: Plans, Add-Ons & Hidden Costs",
      url: "https://www.ruzuku.com/compare/gohighlevel-pricing"
    }
  ]
};
