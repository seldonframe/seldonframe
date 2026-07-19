import type { Guide } from "./types";

export const guide: Guide = {
  slug: "how-to-make-money-selling-ai-agents",
  title: "How to Make Money Selling AI Agents (the Honest Version)",
  description:
    "Skip the \"$10k/mo with AI agents\" course pitch. Here are the four ways people are actually getting paid to build AI agents, the real math on cost vs. price, and how to land a first client.",
  targetKeyword: "how to make money selling ai agents",
  intent: "commercial",
  cluster: "sell-agents",
  relatedTool: "/tools/agency-margin-calculator",
  relatedBest: "/marketplace/build",
  dek: "Search this phrase and you'll mostly find course sellers promising a passive-income fantasy. The real answer is narrower and more boring than that, and also more achievable: there are a handful of concrete ways people are getting paid for AI agent work right now, the money is closer to a service business than a software windfall, and the businesses that pay are buying a specific job done, not a demo. Here's the honest version, with the math shown.",
  sections: [
    {
      h2: "The four ways people are actually making money with AI agents",
      body: "Strip away the hype and there are really four working models. They have different effort, skill, and ceiling profiles.\n\nThe first is selling directly to local or service businesses on a monthly retainer. You build (or configure) an agent that answers calls, texts back missed calls, or follows up on leads for a plumber, dentist, or salon, and you charge a flat monthly fee for keeping it running.\n\nThis is the **most accessible model** — no coding required if you're using a builder platform, and the sales cycle is short because the pitch is concrete. But the ceiling per client is modest, and you're doing real account-management work; someone has to answer when the agent breaks or the business's hours change.\n\nThe second is building and listing agents on a marketplace, where you build once and other builders or businesses discover and deploy your agent, and you earn a cut when it's used. This has the **best theoretical leverage** — you're not trading hours for dollars per client.\n\nBut it also has the lowest floor: most listed agents earn little to nothing, because marketplace discovery is genuinely hard and \"build it and they will come\" rarely holds.\n\nThe third is running an agency that builds one solid template — say, a review-request agent, or a booking agent for a specific vertical like HVAC — and white-labels the same underlying build across many clients with light per-client customization. This is where the **real leverage in the retainer model** shows up.\n\nYour marginal cost per additional client drops once the template and onboarding process exist, though it requires you to pick a vertical and actually get good at selling into it.\n\nThe fourth is productized AI services on freelance platforms like Upwork or Fiverr — offering \"I'll build you a custom AI chatbot/agent\" as a fixed-scope gig. This is the lowest barrier to a first dollar, since you're competing on a platform that already has buyers.\n\nBut it's also the most commoditized and price-competed, and freelance marketplaces take a service fee off every job, which eats into a thin project fee.\n\nNone of these four are mutually exclusive. **Most people who make real, sustained money combine the retainer model with either the agency-template leverage or a marketplace listing** as a secondary channel, rather than betting on one alone.",
      diagram: {
        type: "flow",
        title: "Four ways to get paid for agent work",
        steps: [
          { label: "Retainer", sub: "local business, flat monthly fee" },
          { label: "Marketplace listing", sub: "build once, earn per use" },
          { label: "Agency white-label", sub: "one template, many clients" },
          { label: "Freelance gigs", sub: "Upwork/Fiverr, fixed scope" },
        ],
      },
    },
    {
      h2: "What small businesses actually pay for",
      body: "The failure mode almost everyone hits first is building something impressive and discovering nobody will pay for it.\n\nA small business owner does not wake up wanting \"an agent.\" They wake up wanting fewer missed calls, faster follow-up on leads that are currently going cold, appointments that get booked without someone manually juggling a calendar, and reviews that get asked for consistently instead of only when someone remembers.\n\nThose are front-office jobs with a **provable before/after**. You can show a business owner their missed-call log, or their average lead-response time, and then show the same number after the agent is running. That's a sale, because the ROI is legible without any AI vocabulary at all.\n\nA \"cool demo\" agent — one that can hold a clever conversation, write poetry about the business, or demonstrate some flashy capability — doesn't sell nearly as well. The owner has no way to map that capability to a dollar figure.\n\nThe gap between \"impressive\" and \"sellable\" is almost always the gap between a general-purpose showcase and a **narrowly scoped job**. The agents that get renewed month over month are the boring ones that do one job reliably: pick up the phone, text back a missed call within a minute, ask the three qualifying questions a receptionist would ask, and get the appointment on the calendar.\n\n**Lead with the job, not the model.**",
      callout: {
        kind: "analogy",
        text: "An agent here is a line cook, not a chef — it follows a tight, repeatable recipe (answer the phone, ask three questions, log the ticket) instead of improvising something new every order.",
      },
    },
    {
      h2: "The honest math on cost, price, and margin",
      body: "The cost side of running an agent has gotten genuinely cheap, if you architect it right.\n\nIf the agent runs on a bring-your-own-key (*BYOK*) model, the client's or your own model API key pays for the actual usage, and the platform underneath charges a flat fee rather than marking up every token. For a front-office use case — a handful of calls or texts a day — your software cost per client can sit close to the underlying model's per-call cost.\n\nThat's a small fraction of what most owners currently pay for a fraction of a receptionist's time. That's the economic case for [BYOK](/guides/what-is-byok-ai)-style pricing: **it keeps your cost of goods low and predictable** instead of scaling unpredictably with usage.\n\nOn the price side, be honest that this varies a lot by vertical, geography, and how bundled the offer is, and treat any specific number as a starting anchor rather than a guarantee. Retainers in the roughly $100–$500 per month range are a common shape for a single front-office agent sold to a local service business, according to what agencies in this space typically describe charging.\n\nFor a deeper breakdown of pricing models, see [how much to charge for an AI agent](/guides/how-much-to-charge-for-an-ai-agent).\n\nThe way to price it isn't \"what does the AI cost me\" — it's \"**what is one recovered job worth to this business**.\" A missed-call text-back that recovers a single $300 job pays for a month of most retainer pricing on its own; every job after that in a month is the argument for renewal.\n\nIf your all-in software cost is a small slice of what you charge, the margin on a well-run retainer book can be substantial. But that margin gets eaten fast by the time cost of manually onboarding, customizing, and supporting each client — **that's the real expense in this business, not the AI.**",
      callout: {
        kind: "analogy",
        text: "BYOK is the difference between a restaurant that buys your groceries and marks the bill up, and one that charges a flat table fee while you bring your own ingredients — the raw-material cost stays close to what the ingredients actually cost.",
      },
    },
    {
      h2: "How to get your first paying client",
      body: "The fastest path to a first client is narrower than it feels like it should be.\n\nPick one vertical you can plausibly get in front of — landscapers, dentists, HVAC, salons, whatever you have some access or credibility in — rather than building something generic for \"small businesses.\" A **vertical-specific pitch** lets you reuse the same script, the same demo, and the same objection-handling for every prospect after the first one.\n\nLead with a specific, named pain, not a technology pitch: \"you're missing calls when you're on a job\" lands; \"I build AI agents\" doesn't.\n\nThen demo it on their actual business, not a generic sandbox — call the number, show them the text-back happening in real time on their own phone number and their own services. **A live demo on their real setup closes far more often than a slide deck.**\n\nFor more on landing that first conversation, see [how to sell AI agents to local businesses](/guides/how-to-sell-ai-agents-to-local-businesses).\n\n**Charge from day one.** Free pilots overwhelmingly turn into free forever, because there's no forcing function to convert a non-paying user, and a business that won't pay even a modest fee to try it usually isn't going to value it enough to keep it.\n\nA short paid trial period at a lower rate is a reasonable compromise if you need to de-risk the ask, but \"free until you love it\" rarely converts.",
      callout: {
        kind: "tip",
        text: "If a prospect balks at the fee, drop the price before you drop it to free — a small paid pilot still creates a paying customer and a renewal conversation; a free one usually creates neither.",
      },
    },
    {
      h2: "Where SeldonFrame fits in this",
      body: "Disclosure: we build SeldonFrame, so read this section as the sales pitch it partly is.\n\nSeldonFrame is built for the retainer-and-agency models described above: you describe the agent you want in one conversation and get a real, deployed agent — on voice, web chat, SMS, email, or wherever the client needs it — connected to a working CRM, booking calendar, and intake forms.\n\nThat's instead of a demo you then have to wire into a client's actual stack. Pricing is **$29/month flat with unlimited workspaces** and the first workspace free — there's no trial to sign up for, because the free build-and-use flow functions as the trial.\n\nYou can list a build on the marketplace for the marketplace-leverage path, or use the same underlying build as a white-label template across multiple clients for the agency path, without paying more per workspace as you add clients.\n\nThat said, DIY is a completely legitimate path too, and some readers should take it. If you're comfortable wiring MCP servers to your tools, hand-rolling context files, and maintaining your own stack, owning that infrastructure end-to-end gives you more control and, if your time is cheap relative to your learning appetite, a lower marginal cost.\n\n**The trade-off is real** — a hand-built stack needs ongoing maintenance as APIs change and doesn't come with review gates or a marketplace built in. But if assembling your own tooling sounds like a feature rather than a chore, it's a reasonable way to run this.",
      diagram: {
        type: "compare",
        title: "Build it yourself vs. start from SeldonFrame",
        left: {
          heading: "Build it yourself",
          items: [
            "Wire your own MCP servers per tool",
            "Hand-roll and maintain context files",
            "No built-in review gates or marketplace",
            "More control, lower software cost",
          ],
        },
        right: {
          heading: "SeldonFrame",
          items: [
            "CRM, calendar, intake pre-connected",
            "$29/mo flat, unlimited workspaces",
            "Review gates and marketplace built in",
            "Configure it in one conversation",
          ],
        },
      },
    },
    {
      h2: "Common ways this fails",
      body: "The most common failure is selling the technology instead of the outcome — leading a pitch with \"AI-powered\" or \"large language model\" instead of \"you won't miss another call.\"\n\nBusiness owners who don't care about AI as a category will absolutely care about the specific problem it solves. **Leading with the mechanism instead of the result loses the pitch before it starts.**\n\nThe second failure is doing one-off custom builds with no retention built into the business model. You get paid once for a project, the client has no ongoing reason to pay you again, and you're back to zero next month.\n\nThe retainer and white-label-agency models exist specifically to avoid this. **Recurring value — the agent keeps running, keeps needing light tuning, keeps needing support — is what recurring revenue is built on.**\n\nThe third failure is underpricing against what the job is actually worth. If a full-time receptionist costs a business several times what you're charging for an agent that covers a meaningful slice of that job, pricing your agent as if it competes with a $10/hour freelance gig leaves real money on the table and signals low value to the buyer.\n\n**Anchor the price to the job replaced or the revenue recovered, not to your own cost to run it.**",
    },
  ],
  faq: [
    {
      q: "Do I need to know how to code to sell AI agents?",
      a: "Not necessarily. Builder platforms (including SeldonFrame) let you configure and deploy an agent through natural-language conversation rather than writing code. What you do need, regardless of platform, is the ability to scope a specific job the agent should do, talk to a business owner about their actual workflow, and support the agent once it's live — that's more sales-and-ops skill than engineering skill.",
    },
    {
      q: "How much can I realistically make doing this?",
      a: "There's no honest single number — it depends heavily on how many clients you land, what vertical you're in, and whether you're doing one-off builds or recurring retainers. Treat any specific income claim you see online (\"$10k/mo,\" \"$50k in 90 days\") as a marketing hook, not a benchmark; we're not going to fabricate one either. The realistic on-ramp is: a handful of retainer clients at a modest monthly fee each is a plausible early outcome for someone who lands 3-5 clients in their first few months of consistent outreach; scaling meaningfully beyond that is a real small-business-building problem, not something a template solves for you.",
    },
    {
      q: "How long does it typically take to land a first paying client?",
      a: "It varies enormously with how much outreach and existing network access you have, so there's no reliable average to quote. What consistently speeds it up: picking one narrow vertical, having a live demo ready before you pitch anyone, and charging (even a modest amount) from the first conversation instead of offering an open-ended free pilot.",
    },
    {
      q: "Should I list my agent on a marketplace or sell it directly to clients?",
      a: "They're not mutually exclusive, but they reward different effort. Direct sales (retainers, white-label agency work) reward outbound hustle and vertical focus, and tend to produce income faster because you control the pipeline. Marketplace listings reward a build that's differentiated enough to get discovered and reused without your involvement in every sale — which is possible, but discovery is genuinely hard, so treat it as a secondary channel to try after you have at least one paying direct client, not your primary plan.",
    },
    {
      q: "What's the difference between building this myself and using a platform like SeldonFrame?",
      a: "Building it yourself (MCP servers per tool, hand-maintained context files, your own scheduling and review gates) gives you full control and can cost close to nothing in software, at the price of real, ongoing setup and maintenance work. A platform bundles the CRM, calendar, and deployment machinery so you're configuring rather than building infrastructure, in exchange for a flat monthly fee. Neither is objectively correct — it depends whether owning the stack is a feature or a chore for you.",
    },
  ],
  sources: [
    {
      label: "Model Context Protocol — \"What is the Model Context Protocol (MCP)?\"",
      url: "https://modelcontextprotocol.io/introduction",
    },
    {
      label: "HighLevel — official pricing page (agency software stack cost reference)",
      url: "https://www.gohighlevel.com/pricing",
    },
  ],
};
