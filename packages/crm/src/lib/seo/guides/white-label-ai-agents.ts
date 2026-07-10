import type { Guide } from "./types";

export const guide: Guide = {
  slug: "white-label-ai-agents",
  title: "White Label AI Agents: How Agencies Resell One Build to Many Clients (2026 Guide)",
  description:
    "White-labeling an AI agent means building it once and deploying it under many client brands. Here is what \"white label\" actually requires, what it costs across platforms, and how to evaluate one.",
  targetKeyword: "white label ai agents",
  intent: "commercial",
  cluster: "sell-agents",
  relatedTool: "/tools/agency-margin-calculator",
  relatedBest: "/agencies",
  dek: "\"White label AI agents\" gets used to mean everything from a rebranded login screen to a full client-facing front office. The difference matters, because it is exactly the difference platforms price around. Here is what white-labeling actually means, what it costs across the platforms agencies are using in 2026, and what to check before you build your resale business on top of one.",
  sections: [
    {
      h2: "What white-labeling an AI agent actually means",
      body:
        "Start with the template-versus-deployment split. It's the concept that makes everything else click.\n\nA *template* is the product: the agent's underlying logic, the model it calls, the tools it can use, the guardrails around it. A *deployment* is tenant configuration layered on top — this client's business info, script, FAQ answers, domain, and brand.\n\nWhite-labeling is what happens when the deployment layer **fully hides** the template layer from the end client.\n\nDone right, your branding runs end to end. The client logs into a portal with your agency's name and colors, not the vendor's. The domain in the address bar is yours.\n\nEmails from the system come from your sender, not the platform's. When the client's customer calls, chats, or texts the agent, nothing in that experience discloses which platform is doing the work underneath. The client experiences **a piece of software you built for them**, full stop.\n\nThat's a higher bar than a rebrand toggle. A vendor logo swapped for yours on a dashboard is branding. A client who never encounters the vendor's name anywhere — not in the product, the domain, or the billing — is white-label.\n\nMost of what separates cheap white-label from expensive white-label comes down to how many touchpoints (portal, domain, emails, client relationship, data ownership) the platform actually **lets you own** versus how many stay tied to the vendor.",
      callout: {
        kind: "analogy",
        text: "A template is the recipe; a deployment is one customer's finished plate — same kitchen, same dish, but the customer only ever sees their own plate, never the recipe or the kitchen behind it.",
      },
    },
    {
      h2: "The economics: build once, deploy many",
      body:
        "The reason white-labeling AI agents is attractive as a business model is simple. The expensive part — designing the agent's behavior, scripts, guardrails, integrations — happens once per template.\n\nEvery additional client is mostly a **configuration pass** on top of that template, not a rebuild. If your onboarding is repeatable, marginal cost per client should fall fast, and margin should climb as your roster grows.\n\nThat's the theory, and it holds up when the platform's pricing scales the same way your cost structure does. It breaks down when the platform charges per client, per seat, or per sub-account on top of your flat build cost.\n\nA ten dollar or fifty dollar per-client platform fee looks trivial on paper. Multiply it by ten, twenty, or fifty clients and it becomes a **real tax** on the exact margin the build-once model was supposed to create.\n\nThe honest way to model this: your resale price minus your delivery cost minus your platform's per-client fee is your actual margin. That last term is the one agencies most often forget to price in before they sign a client.\n\nThis is also where **BYOK** (*bring your own API keys*) matters more than it sounds like it should. If the AI usage runs on your own model provider and telephony accounts — rather than a marked-up per-seat platform fee — your variable cost per client tracks the provider's raw rate, not the platform's markup.\n\nThat's the difference between a cost structure that **scales with your roster** and one that scales against it.",
      callout: {
        kind: "tip",
        text: "Ask any white-label platform directly: does the AI itself run on my provider keys, or yours? That answer predicts your cost curve as you add clients more reliably than the headline price does.",
      },
    },
    {
      h2: "What to evaluate in a white-label platform",
      body:
        "Six questions cover most of what separates a platform you can build a resale business on from one that quietly caps how far you can grow.\n\n**Per-client isolation**: does each client get a genuinely separate environment — its own data, its own configuration, its own conversation history — or is it a shared instance with cosmetic separation?\n\n**Whose brand is on every surface**: not just the dashboard, but the domain, the outbound emails, the SMS sender, and anything the client's customers see.\n\n**Who owns the client relationship and the data**: if you leave the platform, do you take the client's contact history, conversation logs, and configuration with you, or does it stay behind?\n\nPricing shape: flat per month, or per seat, per sub-account, per agent, per minute, or some stack of all of them? A platform that looks cheap at the headline number can be expensive once every client adds a recurring per-unit fee.\n\n[BYOK](/guides/what-is-byok-ai) support: can you run the AI usage on your own provider keys and telephony accounts at raw cost, or are you required to buy usage through the platform's marked-up meter?\n\nPortability: what actually happens if you leave. Do your client configurations, scripts, and data export in a usable form, or are you rebuilding from zero on whatever platform you move to?\n\nNone of these questions have a universally right answer — a platform that locks in more but hands you a more mature reselling engine can be the correct trade for an established agency. The point is to ask all six **before** you sign clients on top of the answer, not after.",
    },
    {
      h2: "The vendor landscape, as of this writing",
      body:
        "Stammer AI is built specifically as a white-label AI agent reseller platform. Its own site states clients \"never see Stammer, only YOUR company,\" with custom-domain deployment (its example is a subdomain pattern like agents.youragency.com), full branding control, and a branded client dashboard.\n\nIts published pricing runs an **Agency plan at $197/month** (up to roughly 20 chat and 20 voice agents, unlimited client capacity, white-label dashboard and API access) up to a **Full SaaS Mode plan at $497/month** for a larger agent allotment plus custom AI functions and analytics. Add-on fees layer on top — additional chat agents around $10/month each, additional voice agents around $5/month each, plus per-model usage costs. Enterprise pricing is custom.\n\nTreat the $197 and $497 figures, and the add-on prices, as reported by Stammer's own pricing page as of this writing; usage and add-on costs will move your real number.\n\nSynthflow is a voice AI platform with a white-label offering aimed at agencies. Its own blog describes full dashboard rebranding, per-client sub-accounts with individually allocated call minutes, and automated rebilling — so an agency's markup is built into billing rather than reconciled by hand. It also lists a GoHighLevel integration for agencies already running on that stack.\n\nSynthflow's own pricing page, fetched for this article, lists only an **Enterprise tier** with contracts \"starting at $30,000 annually,\" scoped to call volume and requirements; it does not publish a self-serve white-label price.\n\nTreat any per-client or toolkit pricing below that Enterprise floor as third-party reporting, not confirmed on Synthflow's own site as of this writing.\n\nVapi is a widely used voice AI infrastructure platform. As of this writing its own pricing page lists a usage-based **Build tier** ($0.05/min calls, $10/month per concurrent line beyond the first ten, $0.005/message for SMS/chat) and a custom-quoted Scale/Enterprise tier — with no white-label dashboard, branded client portal, or sub-account system listed at any tier.\n\nAgencies wanting to resell Vapi under their own brand generally do so through **third-party wrapper products** built on top of Vapi's API, not a white-label feature Vapi itself sells; if you're evaluating one of those wrappers, its pricing and terms are a separate vendor relationship to verify on its own.\n\nGoHighLevel is the incumbent pattern from the CRM/funnel world, and it's worth knowing even outside its niche because most agencies pricing white-label AI have GHL's numbers as their reference point.\n\nThe full white-label reselling experience, called **SaaS Mode**, sits on the **Agency Pro plan at $497/month**, which GHL's own pricing page describes as turning the platform into \"your own sellable software product\" with automated client account creation and the ability to rebill and mark up phone/email usage.\n\nA separate White Label Mobile App add-on runs $497/month per instance on top of that. Lower GHL tiers give you the platform for your own use but not the branded reselling engine.\n\nAnd disclosure, since it's relevant here: this is our product, so weigh this paragraph as the sales pitch it partly is.\n\nSeldonFrame includes a branded client portal, custom domains, and a full front office (AI receptionist across voice/chat/SMS, website, CRM, booking) at **$29/month flat**, with unlimited workspaces and the first workspace free forever. The AI runs on your own provider keys (BYOK) rather than a marked-up per-seat meter, so per-client platform cost doesn't climb with your roster the way it does on per-seat or per-location pricing.\n\nSF only takes a percentage (5% stepping down to 2%) on *GMV* when SF itself is the sales channel; otherwise it's the flat fee.",
      diagram: {
        type: "bars",
        title: "Published white-label / reseller tier pricing, as of this writing",
        items: [
          { label: "Stammer AI — Agency plan", value: 197, display: "$197/month", domain: "stammer.ai" },
          { label: "Stammer AI — Full SaaS Mode", value: 497, display: "$497/month", domain: "stammer.ai" },
          { label: "GoHighLevel — Agency Pro (SaaS Mode)", value: 497, display: "$497/month", domain: "gohighlevel.com" },
          { label: "GoHighLevel — White Label Mobile App add-on", value: 497, display: "$497/month", domain: "gohighlevel.com" },
        ],
        note: "Synthflow's only published tier is Enterprise (\"starting at $30,000 annually\"); Vapi publishes usage-based pricing with no white-label layer. Neither has a comparable self-serve monthly figure to chart here.",
      },
    },
    {
      h2: "Pitfalls to check for before you scale",
      body:
        "Per-sub-account fees **stack quietly**. A platform advertised at one headline price can carry a second fee per client, a third fee per agent, and a fourth fee per usage tier. Model your cost at your target client count, not at one client, before you commit.\n\nLock-in via non-portable configuration is the pitfall agencies feel latest and hardest. If a client's scripts, integrations, and history live in a format only the platform understands, migrating that client to a different vendor later means rebuilding from scratch rather than exporting and reconfiguring. Ask what leaving looks like **before** you're locked in, not after.\n\nAn agent that hallucinates under your brand is a **reputation risk**, not a bug report you can quietly patch. When the agent is white-labeled, a wrong answer, a fabricated policy, or a bad booking confirmation reads to the client's customer as your company's mistake — not the platform vendor's.\n\nThat's why guardrails, a grounded [*read-back*](/guides/how-to-make-an-ai-agent-reliable) step, and some form of automated evaluation of the agent's answers against source-of-truth facts are a white-label requirement, not a nice-to-have to add later. Reselling without operating compounds this: if you hand a client a white-labeled agent and don't monitor what it's actually saying, you find out about a bad interaction from the client — after it already happened, the fastest way to lose the account you just signed.",
      callout: {
        kind: "warning",
        text: "A white-labeled agent's mistakes never point back to the vendor in the client's mind — they point at you. Monitoring what the agent actually says isn't optional once your brand is the only name the client's customer ever sees.",
      },
    },
    {
      h2: "Getting started",
      body:
        "The workable path is narrower than the pitch decks suggest: **one template, one vertical, three clients** before you scale further.\n\nPick a single vertical you understand well enough to write the agent's scripts and guardrails correctly on the first pass. Build one solid template for it, then deploy that template to three real clients as separate, isolated configurations. Watch what actually breaks, what clients ask to change, and what the agent gets wrong before it reaches a customer.\n\n**Fix the template**, not just the individual client's instance, when you find a pattern. Only after three clients are running cleanly does it make sense to widen to a second vertical or a larger roster — scaling a template that hasn't been proven against real client traffic just multiplies whatever is wrong with it.",
      diagram: {
        type: "flow",
        title: "The narrow path to scaling a white-label build",
        steps: [
          { label: "Pick one vertical", sub: "one you know well enough to script correctly" },
          { label: "Build one template", sub: "scripts + guardrails, done once" },
          { label: "Deploy to 3 clients", sub: "separate, isolated configurations" },
          { label: "Fix the template", sub: "not just the one client's instance" },
          { label: "Then scale", sub: "second vertical or larger roster" },
        ],
      },
    },
  ],
  faq: [
    {
      q: "Can clients tell an AI agent is white-labeled?",
      a: "Not if the platform actually delivers on the label. A true white-label setup puts your branding on the portal, the domain, the outbound emails and texts, and the agent's own responses — nothing in the client's experience should surface the underlying platform's name. Where agencies get caught is a partial white-label: a rebranded dashboard sitting on top of a domain or an email sender that still says the vendor's name. Check every touchpoint, not just the login screen, before you call something white-labeled to a client.",
    },
    {
      q: "What should I charge clients versus what it costs me?",
      a: "Your margin is your client price minus your delivery time minus the platform's per-client fee (flat, per-seat, or usage-based) minus any AI/telephony usage cost. That last usage line is easy to underprice if you're on a metered platform rather than BYOK, since a busy client's usage can grow faster than the flat fee you quoted them. Model your cost at the client volume you actually expect, and re-check the model whenever a platform changes its pricing.",
    },
    {
      q: "Who handles support when something goes wrong with the agent?",
      a: "In a true white-label relationship, you do — the client doesn't know a separate vendor exists, so they come to you first regardless of whether the root cause is your configuration or a platform issue. That means your own monitoring (conversation logs, eval pass rates, error alerts) has to catch problems before the client's customer does, since you can't rely on the client escalating a vendor ticket for you.",
    },
    {
      q: "Can I migrate clients off a white-label platform later?",
      a: "Only if the platform makes your data portable — the client's contact history, conversation logs, and agent configuration exportable in a usable format. This is exactly the pitfall covered above: verify export/portability terms before you build a client roster on a platform, because discovering the answer during a migration attempt is the expensive way to find out.",
    },
    {
      q: "Is a cheaper flat-fee platform always better than a mature per-seat one?",
      a: "No — it depends on which problem you actually have. A platform with a deep, mature reselling and pricing-tier configurator (GoHighLevel's SaaS Mode is the clearest example) can be worth a higher top-tier price if your business model depends on that granularity and a large snapshot/template ecosystem. A flat, BYOK platform is the better fit if your priority is keeping per-client cost from climbing as your roster grows and getting a branded environment running fast without a large upfront plan commitment.",
    },
  ],
  sources: [
    {
      label: "Stammer AI — Pricing",
      url: "https://www.stammer.ai/pricing",
    },
    {
      label: "Stammer AI — homepage (white-label positioning)",
      url: "https://www.stammer.ai/",
    },
    {
      label: "Synthflow — Pricing",
      url: "https://synthflow.ai/pricing",
    },
    {
      label: "Synthflow — \"How to Become a Successful White Label Reseller\"",
      url: "https://synthflow.ai/blog/white-label-reseller",
    },
    {
      label: "Vapi — Pricing",
      url: "https://vapi.ai/pricing",
    },
    {
      label: "GoHighLevel — Pricing",
      url: "https://www.gohighlevel.com/pricing",
    },
  ],
};
