import type { Guide } from "./types";

export const guide: Guide = {
  slug: "productized-ai-services",
  title: "Productized AI Services: Package Agents So Clients Understand What They're Buying",
  description:
    "Custom AI work sells slowly and delivers slower. A productized offer — a named package, a fixed scope, a fixed price — sells faster, onboards faster, and gets more profitable with every delivery. Here's the method.",
  targetKeyword: "productized ai services",
  intent: "commercial",
  cluster: "sell-agents",
  relatedTool: "/tools/agency-margin-calculator",
  relatedBest: "/marketplace",
  dek: "\"We'll build you a custom AI solution\" is a hard sentence to buy and a hard sentence to sell — it forces a scoping call before anyone can say yes. A productized offer replaces it with a name, a price, and a defined outcome. This is the method for turning repeatable AI work into something a client can buy off a menu.",
  sections: [
    {
      h2: "Why productizing beats custom, on all three axes that matter",
      body: "\"Custom AI consulting\" and \"a productized AI package\" can involve the exact same underlying work — the difference is entirely in how it's packaged, and that difference shows up in three places a services business actually feels.\n\nIt sells faster. A named package with a fixed scope and a fixed price is something a prospect can say yes to on the spot; a custom engagement requires a discovery call, a proposal, and a negotiation before anyone commits to anything. Removing that scoping friction is most of what \"productized\" buys you commercially.\n\nIt delivers faster. Custom work means re-deriving the approach for every client — what to build, how to configure it, what \"done\" looks like. A productized offer has one onboarding path you run repeatedly, which means the second delivery is faster than the first, and the tenth is close to instant.\n\nIt gets more profitable with every delivery. Custom engagements don't get materially cheaper to deliver as you do more of them — each one is still bespoke. A productized offer's delivery cost drops as the template, the checklist, and the configuration process get reused and refined. Custom AI consulting is the opposite of all three: it sells slowly (every deal needs its own scoping call), delivers slowly (every build starts from a blank page), and margins stay flat or shrink as complexity creeps in project by project.",
    },
    {
      h2: "The anatomy of a productized agent offer",
      body: "A productized offer has five parts, and the exercise worth doing before you touch a build tool is writing all five down — ideally as an actual sales page, even a rough one.\n\nA name the client repeats back to you. Not \"AI agent implementation\" but \"The After-Hours Package\" or \"The Missed-Call Recovery System\" — something concrete enough that a client can describe it to their business partner without your help.\n\nA one-sentence outcome. Not a feature list — the result. \"Every inquiry that comes in after 6pm gets answered and booked before your team opens tomorrow,\" not \"we configure a conversational AI agent with calendar integration.\"\n\nWhat's included, specifically. The agent itself, which surfaces it runs on (SMS, web chat, voice — see the surface list in the pricing-models guide below), and what the client receives on an ongoing basis — typically a usage or performance report.\n\nWhat's NOT included — the scope fence. This is the part most first-time productizers skip, and it's the one that protects the margin. Explicitly list what triggers a change order: a new integration, a second location, a custom escalation flow. Without a written fence, every client request becomes free scope creep.\n\nThe price and the onboarding week. One number, not a range, and a stated timeline for going live. Write the sales page for this offer before you build anything — if you can't describe it in five bullet points, it isn't productized yet, it's just a project with a name.\n\nFor how to price and structure this offer itself — flat fee, subscription, or fee-plus-usage — that's covered in depth in the pricing-models guide; this piece is about the packaging method that pricing model gets applied to.",
    },
    {
      h2: "Designing for repeatability",
      body: "The thing that makes a package a package, rather than a series of similarly-named custom projects, is that the second delivery reuses real work from the first — not just the pitch, the actual build.\n\nA client-onboarding checklist you run every time. The same set of questions, in the same order, for every client: business hours, services offered, who handles escalations and how, tone and voice preferences, any existing tools to connect to. Ad-libbing this discovery per client is where delivery time quietly balloons.\n\nConfiguration, not code, per client. The differences between one client's agent and the next should live in a config layer — business hours, script details, integration targets — not in a rebuilt agent. If delivering client #12 means writing new logic instead of filling in new values, the offer isn't productized, regardless of what the sales page says.\n\nThe template you clone, not the build you restart. Every delivery should start from the same base rather than a blank canvas. Template is the product; deployment is the configuration applied to it. That single distinction is what separates a package from a series of custom projects wearing the same name.",
    },
    {
      h2: "The delivery week",
      body: "A defined onboarding timeline beats \"we'll get started right away\" for the same reason a fixed price beats \"let's talk about your needs\" — it's a promise the client can hold you to and plan around, instead of an open-ended wait.\n\nA workable shape for a one-week rollout: day 1 is the intake call, running the onboarding checklist above and collecting anything client-specific (hours, scripts, integration credentials). Days 2-3 are configuration against the template — this is where the reusable base pays off, since most of the work is filling in values, not writing new logic. Day 4 is a test pass with the business owner present, checking the agent's behavior against real scenarios before anything goes live. Day 5 is go-live, with the first performance report scheduled on a recurring cadence from there.\n\nThe specific day count matters less than the shape: a named checkpoint on each day, an owner-in-the-loop test before launch, and a first report already on the calendar before you finish onboarding — not something you'll \"set up later.\"",
    },
    {
      h2: "Scaling the menu",
      body: "The temptation once the first package sells is to build a second one immediately. Resist it until the first one's delivery is boring — until you can run the onboarding week without surprises, without the founder personally debugging a config issue, and without a client asking for something the scope fence didn't anticipate. A second package built before the first is boring just doubles the number of things that can go wrong at once.\n\nOnce the first offer is genuinely repeatable, the next moves are a bundle (two packages sold together at a discount to the sum of their parts) and an upgrade ladder (a client who bought the After-Hours Package becomes the natural prospect for a broader Front-Office Package six months later, once trust and results are established). This is the same principle as the fixed scope fence in reverse: it's the deliberate, priced path for outgrowing that fence, instead of quietly scope-creeping the original package to death.\n\nRetire a package when its delivery checklist stops being boring for a structural reason — the underlying tool it depends on changed its API, or the demand simply moved on — rather than carrying a package that needs constant one-off exceptions just to keep selling it.",
    },
    {
      h2: "Where SeldonFrame fits (disclosed: we build this product)",
      body: "Worth saying plainly, since this section is describing our own product: SeldonFrame is built around the productization mechanics described above, and this paragraph is part sales pitch. Weigh it accordingly.\n\nA SeldonFrame workspace is the \"template you clone\" made literal — a workspace built for one client can be cloned as the starting point for the next, rather than rebuilt. Agents can publish to a marketplace as reusable templates, which is the same clone-not-rebuild principle applied at the agent level instead of the workspace level. White-label output keeps the agency's brand on what the client sees, which matters for a productized offer specifically because the package needs to read as your product, not a vendor's.\n\nOn cost: SeldonFrame is BYOK (bring your own API key), which is what keeps the platform price flat regardless of how much usage a client's agent generates — $29/mo covers unlimited workspaces, and the first workspace is free. None of that replaces the packaging work in the sections above; it's infrastructure for the mechanics once you've decided what the package is. For a fuller worked example of one specific package's contents, see the front-office package guide linked below.",
    },
  ],
  faq: [
    {
      q: "Isn't a productized AI service just a worse version of SaaS?",
      a: "The comparison runs the other way. A pure self-serve SaaS product has to work with zero human involvement for every customer, which is a much harder bar than a productized service, where you're delivering configuration and support alongside the software. The moat in a productized service is that you operate it — the onboarding checklist, the client relationship, the judgment calls a pure software product can't make. That's real, durable differentiation a SaaS competitor can't undercut by shipping a cheaper subscription.",
    },
    {
      q: "How narrow should the first package be?",
      a: "Narrower than feels comfortable. A package that solves one specific, describable problem for one type of business (\"after-hours lead capture for home-service companies\") is easier to name, price, sell, and deliver consistently than a broad \"AI for your business\" offer. Broad offers are the thing that quietly turns back into custom consulting, because every client's version of \"broad\" is different.",
    },
    {
      q: "What do I do when a client asks for customization beyond the package?",
      a: "That request is exactly what the scope fence in the offer's anatomy is for. Point to what's explicitly not included, and offer it as a priced add-on or a separate custom-tier engagement rather than folding it into the fixed price. Saying yes for free to every customization request is the single fastest way to turn a productized offer back into unprofitable bespoke consulting.",
    },
    {
      q: "Can one person actually deliver a productized AI service, or does it need a team?",
      a: "One person can deliver it precisely because it's productized — that's the point of the checklist-and-template structure over a from-scratch build per client. The onboarding week described above is designed to be run solo: a fixed checklist, a cloned template, and a test pass, not a project team standing up custom infrastructure each time.",
    },
  ],
  sources: [
    {
      label: "Model Context Protocol — \"What is the Model Context Protocol (MCP)?\"",
      url: "https://modelcontextprotocol.io/introduction",
    },
    {
      label: "HighLevel — Pricing (Starter/Unlimited/Agency Pro tiers)",
      url: "https://www.gohighlevel.com/pricing",
    },
  ],
};
