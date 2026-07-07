// The "alternative to X" registry — one entry per competitor, driving the
// /alternative-to-<slug> comparison pages (components/seo/alternative-page.tsx)
// and their sitemap entries. Same pattern as agent-pages.ts: pure data → static
// HTML, no DB, additive.
//
// Content rules (never-lies applies to marketing too):
// - Competitor numbers come from their PUBLIC pricing pages / documented review
//   themes (researched 2026-07-07). Hedge with "from"/"~"/"listed at"; when a
//   vendor hides pricing, SAY it's quote-only rather than inventing a number.
// - Every page credits the competitor honestly (`whenTheyWin`) — an honest
//   comparison is what LLMs cite and buyers trust.
// - Update `LAST_UPDATED` when refreshing facts.

export const LAST_UPDATED = "July 2026";

export type AltFaqItem = { q: string; a: string };
export type SwitchReason = { title: string; body: string };

export type Competitor = {
  /** URL slug: /alternative-to-<slug> */
  slug: string;
  name: string;
  /** Short category kicker, e.g. "agency platform". */
  category: string;
  /** Factual one-sentence description (used in intro + meta). */
  oneLiner: string;
  /** Hero subheadline: the specific wall people hit + what SF gives instead. */
  heroSub: string;
  /** Two honest intro paragraphs: [the pain with specifics, the credit]. */
  intro: [string, string];
  /** Their side of the standard comparison rows. */
  them: {
    bestFor: string;
    pricingModel: string;
    aiReceptionist: string;
    frontOffice: string;
    whitelabel: string;
    aiCosts: string;
    resale: string;
  };
  /** The 4 "why people switch" cards. */
  switchReasons: SwitchReason[];
  /** Honest "choose them if…" sentence. */
  whenTheyWin: string;
  faq: AltFaqItem[];
};

/** SeldonFrame's side of the comparison table — identical on every page. */
export const SF_COLUMN = {
  bestFor: "Agencies & builders running AI front offices for clients",
  pricingModel: "$29/mo flat — unlimited workspaces, no per-feature add-ons",
  aiReceptionist: "Native — AI receptionist answers, qualifies & books across voice, SMS & web chat",
  frontOffice: "Included — multi-page website, CRM, booking calendar, intake forms, review requests in every workspace",
  whitelabel: "Included — whitelabel client portal, per-client workspaces, custom domains, one-click multi-client deploy",
  aiCosts: "BYOK — bring your own AI (and Twilio) keys and pay providers at raw cost, zero markup",
  resale: "Built in — publish agents to the marketplace or rent them via MCP (2% seller fee)",
} as const;

export const COMPARISON_LABELS: { key: keyof typeof SF_COLUMN; label: string }[] = [
  { key: "bestFor", label: "Best for" },
  { key: "pricingModel", label: "Pricing model" },
  { key: "aiReceptionist", label: "AI receptionist (calls, SMS, chat)" },
  { key: "frontOffice", label: "Website, CRM & booking behind the agent" },
  { key: "whitelabel", label: "Whitelabel & client workspaces" },
  { key: "aiCosts", label: "AI usage costs" },
  { key: "resale", label: "Sell / resell what you build" },
];

/** FAQ items every page shares (appended after the competitor-specific ones). */
export const SHARED_FAQ: AltFaqItem[] = [
  {
    q: "How can SeldonFrame be $29/mo flat when competitors charge per minute or per credit?",
    a: "Because you bring your own keys. Your agents run on your own AI provider key (Claude, ChatGPT or Gemini) and, for phone, your own Twilio account — so you pay providers at raw cost and SeldonFrame never resells tokens or minutes with a markup. The subscription is the platform, not a meter.",
  },
  {
    q: "Do you take a cut of what I charge my clients?",
    a: "No. What you invoice your clients is yours — there is no revenue share on client work you sell yourself. Marketplace sales carry a small seller fee (2%), and a GMV fee applies only when SeldonFrame itself is the sales channel.",
  },
  {
    q: "How fast can I see it working?",
    a: "Paste a business's website (or describe it in a sentence) and SeldonFrame builds the whole workspace — site, CRM, booking, intake and the AI agent — in about 3 minutes, free, before you ever sign up.",
  },
];

export const COMPETITORS: Competitor[] = [
  {
    slug: "gohighlevel",
    name: "GoHighLevel",
    category: "agency platform",
    oneLiner:
      "GoHighLevel is an all-in-one white-label CRM and marketing-automation platform agencies use to run funnels, email/SMS and pipelines for local-business clients.",
    heroSub:
      "Stop stacking per-feature and per-location fees for AI that's an add-on. SeldonFrame gives every client a complete AI front office — receptionist, website, CRM, booking — at $29/mo flat, running on your own AI keys.",
    intro: [
      "Most people looking for a GoHighLevel alternative hit the same wall: the AI isn't the platform, it's an add-on. Plans run $97–$497/mo, the AI Employee costs another $50–$97/mo per location, outbound Voice AI is still metered per minute on top, and users consistently report a 2–4 week learning curve before the platform earns its keep. The costs are real, they stack, and they stack per client.",
      "That's not to say GoHighLevel isn't impressive — it's the most complete agency toolbox ever built, with funnels, email, courses, a huge template ecosystem and true SaaS-mode reselling. If your business is funnels and email campaigns, it's hard to beat. But if what your clients actually need is an AI that answers their phone, qualifies the lead and books the job into a real calendar and CRM, you're paying for a toolbox to get a receptionist.",
    ],
    them: {
      bestFor: "Agencies running funnels, email/SMS campaigns & pipelines",
      pricingModel: "$97–$497/mo + AI Employee $50–$97/mo per location + metered voice, SMS & email usage",
      aiReceptionist: "Add-on (AI Employee), priced per location, with per-minute voice usage on top",
      frontOffice: "Yes — broad suite (funnels, CRM, calendars), with a multi-week learning curve",
      whitelabel: "Yes — SaaS mode on the $497/mo plan",
      aiCosts: "Runs through GoHighLevel's wallet at their rates — no bring-your-own-key",
      resale: "Yes — resell the platform under SaaS mode",
    },
    switchReasons: [
      {
        title: "AI is an add-on, not the platform",
        body: "The AI Employee costs $50–$97/mo per location on top of your $97–$497 base plan, and outbound Voice AI still bills per minute. On SeldonFrame the AI receptionist IS the product, included in the flat $29/mo.",
      },
      {
        title: "Costs stack per client",
        body: "Every location you onboard adds its own AI fees and usage meters, so your margin shrinks as you grow. SeldonFrame is unlimited workspaces on one flat subscription, with AI usage on your own keys at raw cost.",
      },
      {
        title: "Weeks of learning curve vs one conversation",
        body: "Users report 2–4 weeks to get comfortable with GoHighLevel and months to master it. A SeldonFrame workspace — site, CRM, booking, agent — is generated from one conversation in about 3 minutes.",
      },
      {
        title: "No bring-your-own-key",
        body: "GoHighLevel meters AI through its own wallet at its own rates. SeldonFrame is BYOK: your Claude/ChatGPT/Gemini key, your Twilio account, provider-cost economics, full transparency.",
      },
    ],
    whenTheyWin:
      "Choose GoHighLevel if your agency's core deliverable is funnels, email marketing and complex campaign automation — its breadth and template ecosystem there are genuinely unmatched.",
    faq: [
      {
        q: "Is SeldonFrame a full GoHighLevel replacement?",
        a: "For the AI-front-office job — answering calls and chats, qualifying leads, booking jobs, tracking them in a CRM on a client-branded site — yes, and at a fraction of the stacked cost. For deep funnel-building and email campaign tooling, GoHighLevel still has more surface area.",
      },
      {
        q: "Can I white-label SeldonFrame for my clients like GHL's SaaS mode?",
        a: "Yes — client workspaces, a branded client portal and custom domains are included at $29/mo, not gated to a $497/mo tier.",
      },
    ],
  },
  {
    slug: "vapi",
    name: "Vapi",
    category: "voice AI API",
    oneLiner:
      "Vapi is a developer-first API platform for building custom voice AI agents, where you assemble and host your own voice stack.",
    heroSub:
      "Skip the engineering project. SeldonFrame ships the working receptionist — plus the website, CRM and booking calendar it books into — from one conversation, at $29/mo flat on your own keys.",
    intro: [
      "Most people looking for a Vapi alternative hit the same wall: the advertised $0.05/min is only Vapi's hosting fee. Real-world cost lands around $0.25–$0.33/min once speech-to-text, the LLM, text-to-speech and telephony stack on top — and despite the no-code framing, most real implementations require actual coding to set up and maintain. HIPAA alone is a $2,000/mo add-on. And after all that, you still have no CRM, no calendar and no client dashboard — just a voice agent that needs a business system built around it.",
      "That's not to say Vapi isn't impressive — for engineering teams that want full control over every component of a custom voice stack, it's one of the most flexible platforms there is, with a bring-your-own-API-key option and a big developer community. But agencies deploying receptionists for local businesses don't need a voice stack; they need the whole front office.",
    ],
    them: {
      bestFor: "Engineering teams building custom voice stacks",
      pricingModel: "$0.05/min hosting + STT/LLM/TTS/telephony pass-through (~$0.25–$0.33/min real-world); HIPAA $2,000/mo",
      aiReceptionist: "Voice agents only — you design, integrate and maintain them via API",
      frontOffice: "None — no CRM, website or booking calendar; you build the system around the agent",
      whitelabel: "None — no agency dashboard or client management",
      aiCosts: "BYO API key possible, but every other component still meters per minute",
      resale: "No native reseller program",
    },
    switchReasons: [
      {
        title: "The $0.05/min isn't the real price",
        body: "Stack speech-to-text, the LLM, text-to-speech and telephony and real calls commonly land 5–6× the advertised hosting fee. SeldonFrame runs on your own AI and Twilio keys at raw provider cost — no per-minute platform meter.",
      },
      {
        title: "It's an engineering project",
        body: "Vapi is an API. Someone has to design the agent, wire the tools, host the logic and fix it when a platform update breaks it. SeldonFrame generates a working receptionist from a description of the business.",
      },
      {
        title: "A voice agent isn't a front office",
        body: "After you build the Vapi agent you still need the CRM, the booking calendar, the website and the client's dashboard. SeldonFrame includes all of them in every workspace — the agent books real jobs into a real calendar.",
      },
      {
        title: "Nothing to hand your clients",
        body: "Vapi has no whitelabel layer or client workspaces. SeldonFrame gives every client a branded portal your agency operates.",
      },
    ],
    whenTheyWin:
      "Choose Vapi if you're an engineering team building a genuinely custom voice product and want component-level control over the whole stack.",
    faq: [
      {
        q: "Does SeldonFrame do real phone calls like Vapi?",
        a: "Yes — the AI receptionist answers real phone calls, plus SMS and web chat, and books directly into the workspace calendar and CRM. Connect your own Twilio number and you pay carrier rates, not platform-marked-up minutes.",
      },
      {
        q: "I already built agents on Vapi — why switch?",
        a: "If your deliverable to clients is a working receptionist plus the business system behind it, SeldonFrame replaces the agent AND the stitched-together CRM/calendar/website around it with one $29/mo platform you can whitelabel.",
      },
    ],
  },
  {
    slug: "retell-ai",
    name: "Retell AI",
    category: "voice AI API",
    oneLiner:
      "Retell AI is developer infrastructure for building voice and chat AI agents, priced per minute from unbundled components.",
    heroSub:
      "The whole third-party ecosystem of 'white-label Retell wrappers' exists because agencies need what Retell doesn't ship. SeldonFrame ships it: whitelabel client workspaces, CRM, booking and the receptionist — $29/mo flat.",
    intro: [
      "Most people looking for a Retell AI alternative hit the same wall: it's excellent infrastructure with nothing around it. Calls run $0.07–$0.31/min all-in, and the add-ons stack — knowledge base, denoising, guardrails, PII removal and QA each bill per minute on top. There's no native whitelabel dashboard, no CRM and no client management; an entire cottage industry of third-party 'Retell wrapper' products exists purely to bolt on the agency layer Retell doesn't ship.",
      "That's not to say Retell isn't impressive — its pricing is refreshingly transparent and itemized, it starts free with no contract, and technical teams love the component-level configurability. If you're building your own voice product on solid rails, it's a strong choice. But if you're an agency, buying infrastructure plus a wrapper plus a CRM plus a calendar to deliver one receptionist is the long way around.",
    ],
    them: {
      bestFor: "Developers building custom voice/chat agents on API rails",
      pricingModel: "$0.07–$0.31/min all-in, plus per-minute add-ons (KB, guardrails, PII, QA) and monthly fees per number",
      aiReceptionist: "Voice + chat agents via API — you build the receptionist yourself",
      frontOffice: "None — no CRM, website or booking calendar",
      whitelabel: "None native — third-party wrapper products fill the gap",
      aiCosts: "Metered per minute per component",
      resale: "Certified-partner referrals, but no native whitelabel product",
    },
    switchReasons: [
      {
        title: "The wrapper ecosystem is the tell",
        body: "Multiple third-party products exist solely to add branding, client portals and billing on top of Retell. SeldonFrame includes the whitelabel layer — client workspaces, branded portal, custom domains — natively.",
      },
      {
        title: "Per-minute components add up",
        body: "Infra + TTS + LLM + telephony + knowledge base + guardrails + QA, each metered. SeldonFrame's flat $29/mo plus your own keys at raw cost makes per-client economics predictable.",
      },
      {
        title: "The agent has nowhere to put the job",
        body: "A Retell agent can take a call, but the CRM record, the calendar slot and the client's website are your problem. SeldonFrame's receptionist books into the workspace's own calendar and CRM out of the box.",
      },
      {
        title: "Templates beat blank APIs for agency speed",
        body: "Every new client on Retell is an integration project. On SeldonFrame it's one conversation — the workspace, site and agent generate in about 3 minutes.",
      },
    ],
    whenTheyWin:
      "Choose Retell if you're a developer building your own voice product and want transparent, itemized infrastructure pricing with deep configurability.",
    faq: [
      {
        q: "Is SeldonFrame's voice quality comparable?",
        a: "SeldonFrame's receptionist runs on modern realtime voice models with a deterministic tool bridge for the parts that must never be improvised — availability lookups, bookings, message-taking — which is what keeps it from hallucinating appointments.",
      },
      {
        q: "Can I still customize agent behavior deeply?",
        a: "Yes — every agent is built from editable skills (plain-language playbooks), tools, guardrails and knowledge, and each client deployment can override greeting, voice, script and business info without touching the template.",
      },
    ],
  },
  {
    slug: "synthflow",
    name: "Synthflow AI",
    category: "no-code voice AI",
    oneLiner:
      "Synthflow AI is a no-code voice-agent builder for phone-based receptionist and appointment-booking use cases.",
    heroSub:
      "Whitelabel shouldn't cost $2,000/mo. SeldonFrame includes the whitelabel agency layer — and the website, CRM and booking system behind every agent — at $29/mo flat.",
    intro: [
      "Most people looking for a Synthflow alternative hit the same wall: the agency story has a steep price tag. The white-label dashboard, custom domain and reseller toolkit are listed as a $2,000/month add-on (or bundled into enterprise contracts starting around $30k/year), and per-minute costs stack — base engine, LLM and telephony — so a busy client's bill is hard to predict. Cost is the single most common complaint theme in public reviews.",
      "That's not to say Synthflow isn't impressive — it's genuinely no-code, ships useful vertical templates, and unlike most voice platforms it actually productized the agency motion with sub-accounts and client pricing controls. But it's still a voice agent alone: no website, no CRM, no booking system underneath. You're paying voice-platform prices and still assembling the rest of the client's front office elsewhere.",
    ],
    them: {
      bestFor: "Non-technical teams launching phone agents from templates",
      pricingModel: "Usage-based from ~$0.08–$0.09/min + LLM & telephony add-ons; whitelabel listed at $2,000/mo or enterprise contracts from ~$30k/yr",
      aiReceptionist: "Yes — no-code voice agents with booking flows",
      frontOffice: "None — voice agent only; CRM, website and calendar live elsewhere",
      whitelabel: "Yes, but as a $2,000/mo add-on or enterprise bundle",
      aiCosts: "Per-minute, with engine/LLM/telephony components stacking",
      resale: "Yes — via the (paid) whitelabel program",
    },
    switchReasons: [
      {
        title: "Whitelabel at $29, not $2,000",
        body: "SeldonFrame's agency layer — client workspaces, branded portal, one-click multi-client deploy — is part of the flat $29/mo plan, not a four-figure add-on.",
      },
      {
        title: "Predictable per-client economics",
        body: "Per-minute pricing that varies by model and telephony makes quoting clients a gamble. BYOK means your AI and Twilio costs are raw provider rates you can see and cap.",
      },
      {
        title: "The agent comes with its business system",
        body: "Synthflow books appointments into someone else's calendar stack. SeldonFrame's receptionist books into the client's own workspace — calendar, CRM, website and intake included.",
      },
      {
        title: "One conversation replaces flow-building",
        body: "Describe the business and SeldonFrame generates the agent AND the workspace around it in about 3 minutes — no drag-and-drop flow assembly per client.",
      },
    ],
    whenTheyWin:
      "Choose Synthflow if you want a mature template library for pure phone agents and your clients already have their CRM and calendar stack settled.",
    faq: [
      {
        q: "Does SeldonFrame have vertical templates like Synthflow?",
        a: "Yes — an agent library covering the common local-business jobs (receptionist, speed-to-lead, review requests and more), each deployable per client with per-deployment customization of greeting, voice and script.",
      },
      {
        q: "What do voice minutes cost on SeldonFrame?",
        a: "You connect your own Twilio number and AI key, so calls cost what the providers charge — SeldonFrame doesn't meter or mark up minutes on the $29/mo plan.",
      },
    ],
  },
  {
    slug: "chatbase",
    name: "Chatbase",
    category: "AI chatbot builder",
    oneLiner:
      "Chatbase is a no-code platform for building AI chatbots trained on your own data and embedding them on a website.",
    heroSub:
      "A chatbot that can't answer the phone or book the job is half a receptionist. SeldonFrame's agent handles calls, SMS and chat — and books into a real calendar and CRM — at $29/mo flat, no message credits.",
    intro: [
      "Most people looking for a Chatbase alternative hit the same wall: credits. Plans jump from $120/mo (4,000 credits) straight to $400/mo (15,000 credits) with nothing in between, overage bills at $40 per 1,000, credits burn faster on better models, and removing the Chatbase branding costs $1,188/yr unless you're on Enterprise. And after all that, the bot chats — it doesn't answer phones, doesn't write to a CRM, and can't book a real appointment without you wiring custom actions.",
      "That's not to say Chatbase isn't impressive — it defined the train-a-bot-on-your-data category, setup is genuinely fast, and the integration list is broad. For a support-FAQ widget on a content site, it's a fine tool. But local service businesses don't lose money on unanswered FAQs — they lose it on unanswered phones and unbooked jobs.",
    ],
    them: {
      bestFor: "Support/FAQ chatbots trained on docs and websites",
      pricingModel: "$40–$400/mo credit-metered + $40/1,000 overage; branding removal $1,188/yr below Enterprise",
      aiReceptionist: "Chat only — no phone answering, no SMS receptionist",
      frontOffice: "None — no CRM, website builder or booking calendar",
      whitelabel: "Enterprise-gated (or paid branding removal)",
      aiCosts: "Credit-metered; better models burn more credits",
      resale: "No agency resale program",
    },
    switchReasons: [
      {
        title: "Calls are where the money is",
        body: "Chatbase can't answer the phone. SeldonFrame's receptionist handles voice, SMS and web chat with the same brain — and missed-call text-back turns missed rings into booked jobs.",
      },
      {
        title: "No credit cliffs",
        body: "The $120→$400 plan jump and per-credit overages make growth expensive. SeldonFrame is $29/mo flat with AI usage on your own key at provider cost.",
      },
      {
        title: "The bot can actually book",
        body: "On Chatbase, booking and CRM writes are custom-action projects. SeldonFrame's agent books into the workspace calendar and logs the lead in the CRM natively — that's the whole point of it.",
      },
      {
        title: "Whitelabel isn't an enterprise privilege",
        body: "Client workspaces, your branding and custom domains are included at $29/mo — not gated behind a custom Enterprise contract or a $1,188/yr branding fee.",
      },
    ],
    whenTheyWin:
      "Choose Chatbase if you need a pure documentation/support chatbot embedded on a content-heavy site and message volume is modest.",
    faq: [
      {
        q: "Can SeldonFrame's chatbot train on my client's website like Chatbase?",
        a: "Yes — paste the business's URL and SeldonFrame extracts services, FAQs and business facts to ground the agent (and generates the workspace site from the same analysis).",
      },
      {
        q: "Is there a message limit?",
        a: "SeldonFrame doesn't sell message credits. Conversations run on your own AI key at provider cost, so there's no platform meter to outgrow.",
      },
    ],
  },
  {
    slug: "botpress",
    name: "Botpress",
    category: "agent platform",
    oneLiner:
      "Botpress is an open-source-rooted, developer-oriented platform for building and orchestrating AI chatbots and agents.",
    heroSub:
      "Powerful rails, but you're the builder, the host and the integrator. SeldonFrame ships the finished front office — agent, website, CRM, booking — from one conversation at $29/mo flat.",
    intro: [
      "Most people looking for a Botpress alternative hit the same wall: it takes real engineering to get value out of it. Historically AI usage billed at raw provider rates on top of the $89–$495/mo subscription, channel fees (WhatsApp, Twilio) billed separately and could exceed the platform cost itself, and advanced multi-bot setups mean reverse-engineering sample projects. The May 2026 pricing update simplified some of this, but the platform still assumes a developer is driving.",
      "That's not to say Botpress isn't impressive — the open-source core is a genuine moat, self-hosting is possible, and for teams with engineers it's one of the most extensible agent platforms available. But an agency deploying receptionists for plumbers and med-spas doesn't want an extensible platform; it wants a deployed outcome.",
    ],
    them: {
      bestFor: "Developer teams building custom bots with code-level control",
      pricingModel: "Free tier, then $89–$495/mo + AI spend; channel fees historically billed separately",
      aiReceptionist: "Chat-first; voice requires assembly — no turnkey phone receptionist",
      frontOffice: "None — bot infrastructure only",
      whitelabel: "Branding removal on paid plans; no full agency resale program",
      aiCosts: "AI spend bundled per plan (post-May-2026); previously raw provider billing on top",
      resale: "No native agency reseller motion",
    },
    switchReasons: [
      {
        title: "Outcome, not infrastructure",
        body: "Botpress gives you rails to build on. SeldonFrame generates the working agent AND the business system it operates — site, CRM, booking — from a description of the client.",
      },
      {
        title: "No engineer required per client",
        body: "Advanced Botpress setups mean studio work and maintenance per bot. SeldonFrame's per-client deploy is one click from a template, with per-deployment customization built in.",
      },
      {
        title: "Phones, not just chat widgets",
        body: "Local businesses win or lose on answered calls. SeldonFrame's receptionist is voice-first with SMS and chat on the same brain — no channel assembly.",
      },
      {
        title: "Flat, legible pricing",
        body: "Subscription + AI spend + channel fees is three meters. SeldonFrame is one flat $29/mo with usage on your own keys at provider cost.",
      },
    ],
    whenTheyWin:
      "Choose Botpress if you have engineering resources and need code-level extensibility or self-hosting for a custom conversational product.",
    faq: [
      {
        q: "Is SeldonFrame open too?",
        a: "SeldonFrame is open-source at its core, and everything you build is portable: your agents are defined in plain, editable skill files, your data lives in your workspace, and BYOK means the AI relationship is yours.",
      },
      {
        q: "Can I still customize deeply without code?",
        a: "Yes — agents are assembled from six primitives (surface, skill, tools, knowledge, guardrails, voice) that you edit in plain language; developers can go deeper via the MCP/API layer.",
      },
    ],
  },
  {
    slug: "stammer-ai",
    name: "Stammer.ai",
    category: "whitelabel agent platform",
    oneLiner:
      "Stammer.ai is a white-label AI chat and voice agent platform built for agencies to resell agents under their own brand.",
    heroSub:
      "Stammer sells the agent layer — you still stitch the CRM, website and calendar per client. SeldonFrame is the whole whitelabel front office in one $29/mo platform.",
    intro: [
      "Most people looking for a Stammer.ai alternative hit the same wall: the agent is only one piece of the deliverable. The $197/mo agency tier covers whitelabel chat and voice agents, but there's no CRM, no website builder and no booking calendar behind them — so every client engagement still means stitching Stammer to a separate stack. Usage fees (roughly $0.11–$0.17/min voice, per-message chat) stack on top of the subscription, and regulated verticals are out — there's no HIPAA path.",
      "That's not to say Stammer isn't impressive — it took the agency resale motion seriously before almost anyone: unlimited client resale, agencies keep their full markup, and a real white-label dashboard at a price small agencies can pay. If agents-as-a-product is your whole offer, it works. But agencies win local clients by delivering the outcome — answered calls, booked jobs, a working site — not a chatbot subscription.",
    ],
    them: {
      bestFor: "Agencies reselling standalone chat/voice agents",
      pricingModel: "$49–$497/mo tiers + usage (~$0.11–$0.17/min voice; per-message chat)",
      aiReceptionist: "Yes — chat and voice agents",
      frontOffice: "None — no CRM, website or booking calendar behind the agent",
      whitelabel: "Yes — white-label dashboard at $197/mo",
      aiCosts: "Platform usage rates per message/minute on top of subscription",
      resale: "Yes — unlimited client resale, agency keeps markup",
    },
    switchReasons: [
      {
        title: "Sell the front office, not a chatbot",
        body: "With SeldonFrame each client gets a branded website, CRM, booking calendar, intake and the agent — one deliverable worth $300–800/mo retail, from one platform.",
      },
      {
        title: "No usage meter eating your margin",
        body: "Stammer bills per message and per minute on top of the subscription. SeldonFrame is BYOK — your keys, raw provider cost, margins you control.",
      },
      {
        title: "The agent books real jobs",
        body: "SeldonFrame's receptionist writes to the client's own calendar and CRM natively — no per-client integration between the agent platform and the business stack.",
      },
      {
        title: "$29 flat vs $197 + usage",
        body: "The whole whitelabel platform — unlimited client workspaces included — costs less than a sixth of the comparable Stammer tier before usage.",
      },
    ],
    whenTheyWin:
      "Choose Stammer if your offer is strictly agents-as-a-product and your clients' CRM, site and calendar stack is already settled and staying.",
    faq: [
      {
        q: "Does SeldonFrame let me resell like Stammer does?",
        a: "Yes — deploy agents (and whole front offices) to unlimited client workspaces under your brand, charge what you like, and keep it: there's no revenue share on client work you sell yourself.",
      },
      {
        q: "Can I deploy one agent to many clients?",
        a: "Yes — templates deploy per client in one click, and each deployment customizes greeting, voice, script and business info without forking the template.",
      },
    ],
  },
  {
    slug: "podium",
    name: "Podium",
    category: "SMB messaging & reviews",
    oneLiner:
      "Podium is a messaging, reviews and AI-employee platform for local businesses, sold through a sales-quote process.",
    heroSub:
      "Skip the quote call and the $400+/mo base. SeldonFrame gives a local business the AI receptionist, website, CRM and booking system at $29/mo flat — try it free before signing up.",
    intro: [
      "Most people looking for a Podium alternative hit the same wall: nobody will tell you the price. The pricing page is a contact-sales gate; third-party breakdowns consistently report ~$399–$599/mo base plans, an AI Employee add-on running $99–$399/mo, +$50/mo per additional location, and real multi-location bills landing $800–$1,200/mo. Switchers repeatedly report paying for far more platform than they use.",
      "That's not to say Podium isn't impressive — it earned its reputation as the review-generation and business-texting category leader, and the AI Employee is a real, native product. For a multi-location business that lives on review volume, it's credible. But most local service businesses need calls answered and jobs booked, and $29 vs $500 a month buys a lot of forgiveness.",
    ],
    them: {
      bestFor: "Multi-location SMBs focused on reviews & messaging volume",
      pricingModel: "Quote-only; reported ~$399–$599/mo base + AI Employee $99–$399/mo + $50/mo per extra location",
      aiReceptionist: "Yes — AI Employee, priced as an add-on",
      frontOffice: "Partial — messaging/reviews/payments, but no website builder or full CRM-with-booking",
      whitelabel: "No — sold direct to businesses, not an agency platform",
      aiCosts: "Bundled into opaque quoted plans",
      resale: "No",
    },
    switchReasons: [
      {
        title: "Transparent $29 vs opaque quotes",
        body: "Podium requires a sales call to learn the price; reported real-world bills run $400–$1,200/mo. SeldonFrame's pricing is public, flat and cancel-anytime.",
      },
      {
        title: "Pay for what you use",
        body: "Podium switchers commonly report using a fraction of what they pay for. SeldonFrame's core — receptionist, site, CRM, booking, reviews — is one coherent front office, not a bundle of modules.",
      },
      {
        title: "Reviews are included, not the product",
        body: "SeldonFrame's review-request agent fires automatically after completed jobs — the Podium headline feature, inside the flat plan.",
      },
      {
        title: "Built for your agency too",
        body: "Podium sells to businesses one at a time. SeldonFrame lets an agency run the same stack whitelabeled for every client it serves.",
      },
    ],
    whenTheyWin:
      "Choose Podium if you're a multi-location brand whose growth engine is review volume and centralized texting at scale, with budget to match.",
    faq: [
      {
        q: "Does SeldonFrame do review requests like Podium?",
        a: "Yes — a review-request agent triggers after completed bookings and asks happy customers for a Google review, over the same SMS/email rails.",
      },
      {
        q: "Can I try it without talking to sales?",
        a: "Yes — paste your website and SeldonFrame builds your workspace free in about 3 minutes, before you ever create an account.",
      },
    ],
  },
  {
    slug: "vendasta",
    name: "Vendasta",
    category: "agency platform",
    oneLiner:
      "Vendasta is a white-label platform and product marketplace agencies use to resell digital services to local-business clients.",
    heroSub:
      "No minimum spend, no 12-month contract, no $999 tier for the AI receptionist. SeldonFrame is the whitelabel AI front office at $29/mo flat.",
    intro: [
      "Most people looking for a Vendasta alternative hit the same wall: the sticker price isn't the price. Plans are minimum-spend commitments ($99–$999/mo) rather than flat fees, the tiers most agencies need carry 12-month contracts, onboarding reportedly takes 4–8 weeks, and the AI Voice Receptionist is gated to the Premium tier (a $999/mo minimum) with capped minutes. Agencies report real costs running well above the advertised floor once seats and reports are added.",
      "That's not to say Vendasta isn't impressive — the white-label product marketplace is deep, the multi-location portal is mature, and the snapshot prospecting reports are genuinely good sales tools. For agencies whose model is reselling a broad catalog of digital products, it fits. But if the product your clients actually want in 2026 is an AI that answers their phone and books their jobs, it shouldn't sit behind a $999/mo minimum.",
    ],
    them: {
      bestFor: "Agencies reselling a broad catalog of digital products",
      pricingModel: "Minimum-spend tiers $99–$999/mo; 12-month contracts on Professional/Premium; extra seats & reports billed",
      aiReceptionist: "Yes, but gated to the Premium tier (~$999/mo minimum) with capped minutes",
      frontOffice: "Via marketplace products — assembled per client from the catalog",
      whitelabel: "Yes — core strength",
      aiCosts: "Bundled into marketplace product pricing",
      resale: "Yes — the whole model",
    },
    switchReasons: [
      {
        title: "Flat $29 vs minimum-spend math",
        body: "Vendasta's pricing is a spend commitment you must fill; real bills run above sticker. SeldonFrame is a flat subscription with unlimited client workspaces.",
      },
      {
        title: "AI receptionist for everyone, not the top tier",
        body: "Vendasta gates voice AI to its ~$999/mo Premium minimum. On SeldonFrame it's the core product at $29.",
      },
      {
        title: "Live in minutes, not 4–8 weeks",
        body: "Vendasta onboarding is a project. A SeldonFrame client workspace generates from one conversation in about 3 minutes.",
      },
      {
        title: "No 12-month contract",
        body: "SeldonFrame is month-to-month, cancel anytime — the free build-first flow is the trial.",
      },
    ],
    whenTheyWin:
      "Choose Vendasta if your agency's model is reselling a wide catalog of third-party digital products and you value its prospecting-report sales motion.",
    faq: [
      {
        q: "Can I run all my clients under my brand like Vendasta?",
        a: "Yes — per-client workspaces, a branded client portal and custom domains are included, and you can deploy an agent template to every client in one click.",
      },
      {
        q: "Is there a contract?",
        a: "No — $29/mo flat, month-to-month, cancel anytime.",
      },
    ],
  },
  {
    slug: "goodcall",
    name: "Goodcall",
    category: "AI phone agent",
    oneLiner:
      "Goodcall is a no-code AI phone agent for small businesses that answers FAQs and takes appointments, billed per unique monthly caller.",
    heroSub:
      "An answered call should become a booked job in a real system. SeldonFrame pairs the receptionist with the website, CRM and calendar it books into — $29/mo flat, no per-caller caps.",
    intro: [
      "Most people looking for a Goodcall alternative hit the same wall: the unique-caller caps. Plans run $79–$249/mo per agent with 100–500 unique callers included, overage bills at $0.50 per caller, and the most-cited product limitation is conversational depth — single-turn FAQs work, multi-step conversations struggle. And the agent stands alone: no CRM behind it, no website, no owned booking calendar.",
      "That's not to say Goodcall isn't impressive — the per-caller model (with unlimited minutes) is genuinely predictable for repeat-caller businesses, setup is fast, and the Google Area 120 heritage shows in reliability. For a single-location shop that just needs the phone picked up, it's a tidy tool. But picking up is step one; qualifying, booking and tracking the job is where revenue happens.",
    ],
    them: {
      bestFor: "Single-location SMBs that need calls answered simply",
      pricingModel: "$79–$249/mo per agent; 100–500 unique callers included, $0.50/caller overage",
      aiReceptionist: "Yes — phone only",
      frontOffice: "None — no CRM, website or owned booking calendar",
      whitelabel: "No published agency/whitelabel program",
      aiCosts: "Bundled (unlimited minutes), metered by unique callers",
      resale: "No",
    },
    switchReasons: [
      {
        title: "No caller-count anxiety",
        body: "Goodcall's caps make a busy month expensive ($0.50 per extra caller). SeldonFrame has no per-caller meter — usage runs on your own keys at provider cost.",
      },
      {
        title: "Multi-step conversations that close",
        body: "The receptionist qualifies the lead, checks real availability and books the appointment — a multi-turn job Goodcall's single-turn strength doesn't cover.",
      },
      {
        title: "The call lands in a CRM you own",
        body: "Every call, lead and booking is recorded in the workspace CRM with the customer's history — not just a notification.",
      },
      {
        title: "SMS and chat on the same brain",
        body: "Missed-call text-back, website chat and SMS follow-ups come standard — the phone agent is one surface of the same agent.",
      },
    ],
    whenTheyWin:
      "Choose Goodcall if you're a single-location business with heavy repeat-caller volume and simple FAQ needs — the per-caller pricing model fits that shape well.",
    faq: [
      {
        q: "Does SeldonFrame charge per caller or per minute?",
        a: "Neither — the platform is $29/mo flat. Calls run through your own Twilio number at carrier rates and your own AI key at provider cost.",
      },
      {
        q: "Can it handle booking, not just answering?",
        a: "Yes — booking is native: the agent reads real availability from the workspace calendar and books directly into it, with confirmations over SMS/email.",
      },
    ],
  },
];

export function getCompetitor(slug: string): Competitor {
  const hit = COMPETITORS.find((c) => c.slug === slug);
  if (!hit) throw new Error(`Unknown competitor slug: ${slug}`);
  return hit;
}

/** Title/description used by every /alternative-to-<slug> page's metadata. */
export function alternativePageMeta(slug: string): { title: string; description: string; canonical: string } {
  const c = getCompetitor(slug);
  return {
    title: `Best ${c.name} Alternative for Agencies & Builders (${LAST_UPDATED}) — SeldonFrame`,
    description: `${c.name} vs SeldonFrame: honest comparison of pricing and features. ${c.heroSub}`,
    canonical: `/alternative-to-${c.slug}`,
  };
}
