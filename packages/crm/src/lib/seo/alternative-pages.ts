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
  /** The competitor's canonical public pricing page — cited on every page that
   *  shows their price, so readers (and LLMs) can verify it themselves.
   *  Researched 2026-07-08; see docs/superpowers/specs/2026-07-08-competitor-pricing-facts.md. */
  pricingSourceUrl: string;
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
  pricingModel: "From $29/mo flat — unlimited workspaces (agency whitelabel from $99/mo)",
  aiReceptionist: "Native — AI receptionist answers, qualifies & books across voice, SMS & web chat",
  frontOffice: "Included — multi-page website, CRM, booking calendar, intake forms, review requests in every workspace",
  whitelabel: "Included — whitelabel client portal, per-client workspaces, custom domains, one-click multi-client deploy",
  aiCosts: "BYOK — bring your own AI (and Twilio) keys and pay providers at raw cost, zero markup",
  resale: "Built in — publish agents to the marketplace or rent them via MCP (5% marketplace fee)",
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
    a: "Because you use your own keys. Your agents run on your own AI key (Claude, ChatGPT or Gemini) and, for phone, your own Twilio account. You pay the providers at raw cost. SeldonFrame never marks up tokens or minutes. You pay for the platform, not a meter.",
  },
  {
    q: "Do you take a cut of what I charge my clients?",
    a: "SeldonFrame works like Shopify: $29/mo flat, plus 2% on sales made through SeldonFrame checkout, plus 5% when you sell agents on the SeldonFrame marketplace. Client retainers you bill outside SeldonFrame cost nothing extra.",
  },
  {
    q: "How fast can I see it working?",
    a: "Paste in a business's website (or just describe it in a sentence). SeldonFrame builds the whole workspace — site, CRM, booking, intake, and the AI agent — in about 3 minutes. It's free, and you don't need to sign up first.",
  },
];

export const COMPETITORS: Competitor[] = [
  {
    slug: "gohighlevel",
    name: "GoHighLevel",
    category: "agency platform",
    pricingSourceUrl: "https://www.gohighlevel.com/pricing",
    oneLiner:
      "GoHighLevel is an all-in-one white-label CRM and marketing-automation platform. Agencies use it to run funnels, email/SMS, and pipelines for local-business clients.",
    heroSub:
      "Stop paying extra fees for AI that's just an add-on. SeldonFrame gives every client a complete AI front office — receptionist, website, CRM, booking — for $29/mo flat, on your own AI keys.",
    intro: [
      "Most people looking for a GoHighLevel alternative hit the same wall: the AI isn't the platform, it's an add-on. Plans run $97–$497/mo. The AI Employee costs another $50–$97/mo per location. Outbound Voice AI is still billed per minute on top. Users say it takes 2–4 weeks to learn before the platform earns its keep. The costs are real, and they add up — for every single client.",
      "That said, GoHighLevel is impressive. It's the most complete agency toolbox ever built, with funnels, email, courses, a huge template library, and true white-label reselling. If your business is funnels and email campaigns, it's hard to beat. But if your clients just need an AI that answers the phone, qualifies the lead, and books the job into a real calendar and CRM, you're buying a whole toolbox to get one receptionist.",
    ],
    them: {
      bestFor: "Agencies running funnels, email/SMS campaigns & pipelines",
      pricingModel: "$97–$497/mo + AI Employee $50–$97/mo per location + metered voice, SMS & email usage",
      aiReceptionist: "Add-on (AI Employee), priced per location, with per-minute voice usage on top",
      frontOffice: "Yes — broad suite (funnels, CRM, calendars), but takes weeks to learn",
      whitelabel: "Yes — SaaS mode on the $497/mo plan",
      aiCosts: "Runs through GoHighLevel's own billing at their rates — you can't bring your own key",
      resale: "Yes — resell the platform under SaaS mode",
    },
    switchReasons: [
      {
        title: "AI is an add-on, not the platform",
        body: "The AI Employee costs $50–$97/mo per location on top of your $97–$497 base plan. Outbound Voice AI still bills per minute. On SeldonFrame, the AI receptionist IS the product — included in the flat $29/mo.",
      },
      {
        title: "Costs pile up per client",
        body: "Every location you add brings its own AI fees and usage bills, so your margin shrinks as you grow. SeldonFrame is unlimited workspaces on one flat subscription. AI usage runs on your own keys at raw cost.",
      },
      {
        title: "Weeks to learn vs one conversation",
        body: "Users say it takes 2–4 weeks to get comfortable with GoHighLevel, and months to master it. A SeldonFrame workspace — site, CRM, booking, agent — comes from one conversation in about 3 minutes.",
      },
      {
        title: "No option to bring your own key",
        body: "GoHighLevel bills AI through its own system at its own rates. SeldonFrame lets you bring your own key — Claude, ChatGPT, or Gemini — plus your own Twilio account. You pay provider cost, in the open.",
      },
    ],
    whenTheyWin:
      "Choose GoHighLevel if your agency's main job is funnels, email marketing, and complex campaign automation. Its breadth and template library there are genuinely unmatched.",
    faq: [
      {
        q: "Is SeldonFrame a full GoHighLevel replacement?",
        a: "For the AI-front-office job — answering calls and chats, qualifying leads, booking jobs, and tracking them in a CRM on a client-branded site — yes, at a fraction of the stacked cost. For deep funnel-building and email campaign tools, GoHighLevel still does more.",
      },
      {
        q: "Can I white-label SeldonFrame for my clients like GHL's SaaS mode?",
        a: "Yes. Client workspaces, a branded client portal, and custom domains are all included at $29/mo — not locked behind a $497/mo tier.",
      },
    ],
  },
  {
    slug: "vapi",
    name: "Vapi",
    category: "voice AI API",
    pricingSourceUrl: "https://vapi.ai/pricing",
    oneLiner:
      "Vapi is a developer-first API platform for building custom voice AI agents. You assemble and host your own voice stack.",
    heroSub:
      "Skip the engineering project. SeldonFrame ships a working receptionist — plus the website, CRM, and booking calendar it books into — from one conversation, for $29/mo flat on your own keys.",
    intro: [
      "Most people looking for a Vapi alternative hit the same wall: the advertised $0.05/min is only Vapi's hosting fee. Real-world cost lands around $0.25–$0.33/min once you add speech-to-text, the LLM, text-to-speech, and telephony. And despite the no-code framing, most real setups still need actual coding to build and maintain. HIPAA alone costs $2,000/mo extra. After all that, you still have no CRM, no calendar, and no client dashboard — just a voice agent that needs a whole business system built around it.",
      "That said, Vapi is impressive. For engineering teams who want full control over every piece of a custom voice stack, it's one of the most flexible platforms out there, with a bring-your-own-API-key option and a big developer community. But agencies putting receptionists in front of local businesses don't need a voice stack. They need the whole front office.",
    ],
    them: {
      bestFor: "Engineering teams building custom voice stacks",
      pricingModel: "$0.05/min hosting + STT/LLM/TTS/telephony pass-through (~$0.25–$0.33/min real-world); HIPAA $2,000/mo",
      aiReceptionist: "Voice agents only — you design, wire together and maintain them via API",
      frontOffice: "None — no CRM, website or booking calendar; you build the system around the agent",
      whitelabel: "None — no agency dashboard or client management",
      aiCosts: "You can bring your own API key, but every other piece still bills per minute",
      resale: "No native reseller program",
    },
    switchReasons: [
      {
        title: "The $0.05/min isn't the real price",
        body: "Add speech-to-text, the LLM, text-to-speech, and telephony, and real calls commonly land at 5–6× the advertised hosting fee. SeldonFrame runs on your own AI and Twilio keys at raw provider cost — no per-minute platform fee.",
      },
      {
        title: "It's an engineering project",
        body: "Vapi is an API. Someone has to design the agent, wire up the tools, host the logic, and fix it when an update breaks it. SeldonFrame builds a working receptionist just from a description of the business.",
      },
      {
        title: "A voice agent isn't a front office",
        body: "After you build the Vapi agent, you still need the CRM, the booking calendar, the website, and the client's dashboard. SeldonFrame includes all of it in every workspace — the agent books real jobs into a real calendar.",
      },
      {
        title: "Nothing to hand your clients",
        body: "Vapi has no whitelabel layer or client workspaces. SeldonFrame gives every client a branded portal your agency runs.",
      },
    ],
    whenTheyWin:
      "Choose Vapi if you're an engineering team building a genuinely custom voice product and want full control over every piece of the stack.",
    faq: [
      {
        q: "Does SeldonFrame do real phone calls like Vapi?",
        a: "Yes. The AI receptionist answers real phone calls, plus SMS and web chat, and books straight into the workspace calendar and CRM. Connect your own Twilio number and you pay carrier rates, not marked-up platform minutes.",
      },
      {
        q: "I already built agents on Vapi — why switch?",
        a: "If what you're delivering to clients is a working receptionist plus the business system behind it, SeldonFrame replaces the agent AND the CRM/calendar/website you'd otherwise stitch together yourself — all in one $29/mo platform you can whitelabel.",
      },
    ],
  },
  {
    slug: "retell-ai",
    name: "Retell AI",
    category: "voice AI API",
    pricingSourceUrl: "https://www.retellai.com/pricing",
    oneLiner:
      "Retell AI is developer infrastructure for building voice and chat AI agents. It's priced per minute, built from separate pieces you assemble yourself.",
    heroSub:
      "A whole industry of 'white-label Retell wrappers' exists because agencies need what Retell doesn't ship. SeldonFrame ships it: whitelabel client workspaces, CRM, booking, and the receptionist — $29/mo flat.",
    intro: [
      "Most people looking for a Retell AI alternative hit the same wall: it's excellent infrastructure with nothing built around it. Calls run $0.07–$0.31/min all-in, and the extras add up — knowledge base, denoising, guardrails, PII removal, and QA each bill per minute on top. There's no built-in whitelabel dashboard, no CRM, and no client management. A whole industry of third-party 'Retell wrapper' products exists just to bolt on the agency layer Retell doesn't ship.",
      "That said, Retell is impressive. Its pricing is refreshingly clear and itemized, it starts free with no contract, and technical teams love how deeply you can configure each piece. If you're building your own voice product on solid rails, it's a strong choice. But if you're an agency, buying infrastructure plus a wrapper plus a CRM plus a calendar to deliver one receptionist is the long way around.",
    ],
    them: {
      bestFor: "Developers building custom voice/chat agents on API rails",
      pricingModel: "$0.07–$0.31/min all-in, plus per-minute add-ons (KB, guardrails, PII, QA) and monthly fees per number",
      aiReceptionist: "Voice + chat agents via API — you build the receptionist yourself",
      frontOffice: "None — no CRM, website or booking calendar",
      whitelabel: "None built-in — third-party wrapper products fill the gap",
      aiCosts: "Billed per minute, per component",
      resale: "Certified-partner referrals, but no built-in whitelabel product",
    },
    switchReasons: [
      {
        title: "The wrapper industry is the tell",
        body: "Several third-party products exist just to add branding, client portals, and billing on top of Retell. SeldonFrame includes the whitelabel layer — client workspaces, branded portal, custom domains — out of the box.",
      },
      {
        title: "Per-minute pieces add up",
        body: "Infrastructure, TTS, LLM, telephony, knowledge base, guardrails, QA — each billed separately. SeldonFrame's flat $29/mo plus your own keys at raw cost makes per-client costs easy to predict.",
      },
      {
        title: "The agent has nowhere to put the job",
        body: "A Retell agent can take a call, but the CRM record, the calendar slot, and the client's website are your problem. SeldonFrame's receptionist books into the workspace's own calendar and CRM out of the box.",
      },
      {
        title: "Templates beat blank APIs for agency speed",
        body: "Every new client on Retell means a new integration project. On SeldonFrame it's one conversation — the workspace, site, and agent are built in about 3 minutes.",
      },
    ],
    whenTheyWin:
      "Choose Retell if you're a developer building your own voice product and want clear, itemized infrastructure pricing with deep configurability.",
    faq: [
      {
        q: "Is SeldonFrame's voice quality comparable?",
        a: "SeldonFrame's receptionist runs on modern realtime voice models, with a deterministic tool bridge for the parts that must never be improvised — checking availability, booking, taking messages. That's what keeps it from making up appointments.",
      },
      {
        q: "Can I still customize agent behavior deeply?",
        a: "Yes. Every agent is built from editable skills (plain-language playbooks), tools, guardrails, and knowledge. Each client deployment can change the greeting, voice, script, and business info without touching the template.",
      },
    ],
  },
  {
    slug: "synthflow",
    name: "Synthflow AI",
    category: "no-code voice AI",
    pricingSourceUrl: "https://synthflow.ai/pricing",
    oneLiner:
      "Synthflow AI is a no-code voice-agent builder for phone receptionists and appointment booking.",
    heroSub:
      "Whitelabel shouldn't cost $2,000/mo. SeldonFrame includes the whitelabel agency layer — plus the website, CRM, and booking system behind every agent — for $29/mo flat.",
    intro: [
      "Most people looking for a Synthflow alternative hit the same wall: the agency story has a steep price tag. The white-label dashboard, custom domain, and reseller toolkit are listed as a $2,000/month add-on (or bundled into enterprise contracts starting around $30k/year). Per-minute costs stack too — base engine, LLM, and telephony — so a busy client's bill is hard to predict. Cost is the single most common complaint in public reviews.",
      "That said, Synthflow is impressive. It's genuinely no-code, ships useful templates for specific industries, and — unlike most voice platforms — actually built out the agency side with sub-accounts and client pricing controls. But it's still just a voice agent: no website, no CRM, no booking system underneath. You pay voice-platform prices and still have to build the rest of the client's front office somewhere else.",
    ],
    them: {
      bestFor: "Non-technical teams launching phone agents from templates",
      pricingModel: "Usage-based from ~$0.08–$0.09/min + LLM & telephony add-ons; whitelabel listed at $2,000/mo or enterprise contracts from ~$30k/yr",
      aiReceptionist: "Yes — no-code voice agents with booking flows",
      frontOffice: "None — voice agent only; CRM, website and calendar live elsewhere",
      whitelabel: "Yes, but as a $2,000/mo add-on or enterprise bundle",
      aiCosts: "Per-minute, with engine/LLM/telephony pieces stacking",
      resale: "Yes — via the (paid) whitelabel program",
    },
    switchReasons: [
      {
        title: "Whitelabel at $29, not $2,000",
        body: "SeldonFrame's agency layer — client workspaces, branded portal, one-click multi-client deploy — is part of the flat $29/mo plan. It's not a four-figure add-on.",
      },
      {
        title: "Costs you can actually predict",
        body: "Per-minute pricing that shifts with model and telephony choice makes quoting clients a guessing game. Bring your own key and your AI and Twilio costs are raw provider rates you can see and cap.",
      },
      {
        title: "The agent comes with its business system",
        body: "Synthflow books appointments into someone else's calendar stack. SeldonFrame's receptionist books into the client's own workspace — calendar, CRM, website, and intake all included.",
      },
      {
        title: "One conversation replaces flow-building",
        body: "Describe the business and SeldonFrame builds the agent AND the workspace around it in about 3 minutes — no drag-and-drop flow building for each client.",
      },
    ],
    whenTheyWin:
      "Choose Synthflow if you want a mature template library for pure phone agents and your clients already have their CRM and calendar sorted out.",
    faq: [
      {
        q: "Does SeldonFrame have vertical templates like Synthflow?",
        a: "Yes. An agent library covers the common local-business jobs — receptionist, speed-to-lead, review requests, and more. Each one deploys per client, and you can change the greeting, voice, and script for each.",
      },
      {
        q: "What do voice minutes cost on SeldonFrame?",
        a: "You connect your own Twilio number and AI key, so calls cost whatever the providers charge. SeldonFrame doesn't meter or mark up minutes on the $29/mo plan.",
      },
    ],
  },
  {
    slug: "chatbase",
    name: "Chatbase",
    category: "AI chatbot builder",
    pricingSourceUrl: "https://www.chatbase.co/pricing",
    oneLiner:
      "Chatbase is a no-code platform for building AI chatbots trained on your own data and putting them on a website.",
    heroSub:
      "A chatbot that can't answer the phone or book the job is only half a receptionist. SeldonFrame's agent handles calls, SMS, and chat — and books into a real calendar and CRM — for $29/mo flat, no message credits.",
    intro: [
      "Most people looking for a Chatbase alternative hit the same wall: credits. Plans jump from $120/mo (4,000 credits) straight to $400/mo (15,000 credits) with nothing in between. Overages cost $40 per 1,000. Credits burn faster on better models. Removing the Chatbase branding costs $1,188/yr unless you're on Enterprise. And after all that, the bot only chats — it doesn't answer phones, doesn't write to a CRM, and can't book a real appointment unless you wire up custom actions yourself.",
      "That said, Chatbase is impressive. It basically created the train-a-bot-on-your-data category, setup is genuinely fast, and it connects to a lot of other tools. For a support-FAQ widget on a content site, it's a fine tool. But local service businesses don't lose money on unanswered FAQs — they lose it on unanswered phones and jobs that never got booked.",
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
        body: "Chatbase can't answer the phone. SeldonFrame's receptionist handles voice, SMS, and web chat with the same brain — and missed-call text-back turns a missed ring into a booked job.",
      },
      {
        title: "No credit cliffs",
        body: "The jump from $120 to $400 and per-credit overages make growth expensive. SeldonFrame is $29/mo flat, with AI usage on your own key at provider cost.",
      },
      {
        title: "The bot can actually book",
        body: "On Chatbase, booking and writing to a CRM are custom-action projects you build yourself. SeldonFrame's agent books into the workspace calendar and logs the lead in the CRM automatically — that's the whole point of it.",
      },
      {
        title: "Whitelabel isn't an enterprise privilege",
        body: "Client workspaces, your branding, and custom domains are included at $29/mo — not locked behind a custom Enterprise contract or a $1,188/yr branding fee.",
      },
    ],
    whenTheyWin:
      "Choose Chatbase if you need a pure documentation or support chatbot on a content-heavy site and message volume is modest.",
    faq: [
      {
        q: "Can SeldonFrame's chatbot train on my client's website like Chatbase?",
        a: "Yes. Paste in the business's URL and SeldonFrame pulls out services, FAQs, and business facts to ground the agent — and builds the workspace site from that same information.",
      },
      {
        q: "Is there a message limit?",
        a: "SeldonFrame doesn't sell message credits. Conversations run on your own AI key at provider cost, so there's no platform limit to outgrow.",
      },
    ],
  },
  {
    slug: "botpress",
    name: "Botpress",
    category: "agent platform",
    pricingSourceUrl: "https://botpress.com/pricing",
    oneLiner:
      "Botpress is an open-source-rooted, developer-focused platform for building and running AI chatbots and agents.",
    heroSub:
      "Powerful rails, but you're the builder, the host, and the integrator. SeldonFrame ships the finished front office — agent, website, CRM, booking — from one conversation, for $29/mo flat.",
    intro: [
      "Most people looking for a Botpress alternative hit the same wall: it takes real engineering to get value out of it. AI usage historically billed at raw provider rates on top of the $89–$495/mo subscription. Channel fees (WhatsApp, Twilio) billed separately and could add up to more than the platform itself. Advanced multi-bot setups meant digging through sample projects to figure things out. The May 2026 pricing update simplified some of this, but the platform still assumes a developer is running the show.",
      "That said, Botpress is impressive. The open-source core is a real advantage, self-hosting is possible, and for teams with engineers it's one of the most extensible agent platforms out there. But an agency putting receptionists in front of plumbers and med-spas doesn't want an extensible platform. It wants a finished result.",
    ],
    them: {
      bestFor: "Developer teams building custom bots with code-level control",
      pricingModel: "Free tier, then $89–$495/mo + AI spend; channel fees historically billed separately",
      aiReceptionist: "Chat-first; voice needs to be built separately — no ready-made phone receptionist",
      frontOffice: "None — bot infrastructure only",
      whitelabel: "Branding removal on paid plans; no full agency resale program",
      aiCosts: "AI spend bundled per plan (post-May-2026); previously billed on top at raw provider rates",
      resale: "No native agency reseller motion",
    },
    switchReasons: [
      {
        title: "A finished result, not raw infrastructure",
        body: "Botpress gives you rails to build on. SeldonFrame builds the working agent AND the business system it runs on — site, CRM, booking — just from a description of the client.",
      },
      {
        title: "No engineer needed per client",
        body: "Advanced Botpress setups mean custom build work and upkeep for each bot. SeldonFrame deploys per client in one click from a template, with per-client customization built in.",
      },
      {
        title: "Phones, not just chat widgets",
        body: "Local businesses win or lose on answered calls. SeldonFrame's receptionist is voice-first, with SMS and chat on the same brain — nothing to wire up yourself.",
      },
      {
        title: "Flat, easy-to-read pricing",
        body: "Subscription plus AI spend plus channel fees is three separate bills. SeldonFrame is one flat $29/mo, with usage on your own keys at provider cost.",
      },
    ],
    whenTheyWin:
      "Choose Botpress if you have engineers and need code-level control, or want to self-host a custom conversational product.",
    faq: [
      {
        q: "Is SeldonFrame open too?",
        a: "SeldonFrame is open-source at its core, and everything you build is portable. Your agents are defined in plain, editable skill files, your data lives in your workspace, and bringing your own key means the AI relationship is yours.",
      },
      {
        q: "Can I still customize deeply without code?",
        a: "Yes. Agents are built from six pieces — surface, skill, tools, knowledge, guardrails, voice — that you edit in plain language. Developers can go deeper through the MCP/API layer.",
      },
    ],
  },
  {
    slug: "stammer-ai",
    name: "Stammer.ai",
    category: "whitelabel agent platform",
    pricingSourceUrl: "https://www.stammer.ai/pricing",
    oneLiner:
      "Stammer.ai is a white-label AI chat and voice agent platform. Agencies use it to resell agents under their own brand.",
    heroSub:
      "Stammer sells you the agent — you still have to stitch together the CRM, website, and calendar for each client. SeldonFrame is the whole whitelabel front office in one $29/mo platform.",
    intro: [
      "Most people looking for a Stammer.ai alternative hit the same wall: the agent is only one piece of what you need to deliver. The $197/mo agency tier covers whitelabel chat and voice agents, but there's no CRM, no website builder, and no booking calendar behind them. So every client still means connecting Stammer to a separate stack yourself. Usage fees (roughly $0.11–$0.17/min for voice, plus per-message chat) stack on top of the subscription, and regulated industries are out — there's no HIPAA option.",
      "That said, Stammer is impressive. It took agency reselling seriously before almost anyone else: unlimited client resale, agencies keep their full markup, and a real white-label dashboard at a price small agencies can afford. If agents are your whole offer, it works well. But agencies win local clients by delivering results — answered calls, booked jobs, a working site — not just a chatbot subscription.",
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
        title: "Sell the front office, not just a chatbot",
        body: "With SeldonFrame, each client gets a branded website, CRM, booking calendar, intake, and the agent — one deliverable worth $300–800/mo retail, from one platform.",
      },
      {
        title: "No usage fees eating your margin",
        body: "Stammer bills per message and per minute on top of the subscription. SeldonFrame runs on your own keys at raw provider cost, so you control your own margin.",
      },
      {
        title: "The agent books real jobs",
        body: "SeldonFrame's receptionist writes straight to the client's own calendar and CRM — no separate integration project between the agent and the rest of the business.",
      },
      {
        title: "$29 flat vs $197 plus usage",
        body: "The whole whitelabel platform — unlimited client workspaces included — costs less than a sixth of the comparable Stammer tier, before usage fees.",
      },
    ],
    whenTheyWin:
      "Choose Stammer if your offer is strictly agents-as-a-product and your clients' CRM, site, and calendar are already settled and staying put.",
    faq: [
      {
        q: "Does SeldonFrame let me resell like Stammer does?",
        a: "Yes. Deploy agents (and whole front offices) to unlimited client workspaces under your own brand, charge what you like, and keep it — there's no cut taken on client work you sell yourself.",
      },
      {
        q: "Can I deploy one agent to many clients?",
        a: "Yes. Templates deploy per client in one click, and each one can have its own greeting, voice, script, and business info without touching the original template.",
      },
    ],
  },
  {
    slug: "podium",
    name: "Podium",
    category: "SMB messaging & reviews",
    pricingSourceUrl: "https://www.podium.com/pricing",
    oneLiner:
      "Podium is a messaging, reviews, and AI-employee platform for local businesses, sold through a sales-quote process.",
    heroSub:
      "Skip the quote call and the $400+/mo starting price. SeldonFrame gives a local business the AI receptionist, website, CRM, and booking system for $29/mo flat — try it free before you sign up.",
    intro: [
      "Most people looking for a Podium alternative hit the same wall: nobody will tell you the price. The pricing page just leads to a sales call. Third-party breakdowns consistently report ~$399–$599/mo base plans, an AI Employee add-on running $99–$399/mo, plus $50/mo per extra location — with real multi-location bills landing $800–$1,200/mo. People who switch away often say they were paying for far more platform than they used.",
      "That said, Podium is impressive. It earned its name as the leader in review generation and business texting, and the AI Employee is a real, genuine product. For a multi-location business that lives on review volume, it's a credible choice. But most local service businesses just need calls answered and jobs booked — and $29 versus $500 a month buys a lot of room to spare.",
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
        title: "A clear $29 price vs a sales call",
        body: "Podium makes you talk to sales to learn the price, and real-world bills run $400–$1,200/mo. SeldonFrame's pricing is public, flat, and cancel-anytime.",
      },
      {
        title: "Pay for what you use",
        body: "People who switch away from Podium often say they only used a fraction of what they paid for. SeldonFrame's core — receptionist, site, CRM, booking, reviews — is one coherent system, not a bundle of separate modules.",
      },
      {
        title: "Reviews are included, not the whole product",
        body: "SeldonFrame's review-request agent fires automatically after a job is done — Podium's headline feature, built into the flat plan.",
      },
      {
        title: "Built for your agency too",
        body: "Podium sells to one business at a time. SeldonFrame lets an agency run the same system, whitelabeled, for every client it serves.",
      },
    ],
    whenTheyWin:
      "Choose Podium if you're a multi-location brand whose growth engine is review volume and centralized texting at scale, with the budget to match.",
    faq: [
      {
        q: "Does SeldonFrame do review requests like Podium?",
        a: "Yes. A review-request agent fires after a booking is completed and asks happy customers for a Google review, over the same SMS and email rails.",
      },
      {
        q: "Can I try it without talking to sales?",
        a: "Yes. Paste in your website and SeldonFrame builds your workspace free in about 3 minutes, before you ever create an account.",
      },
    ],
  },
  {
    slug: "vendasta",
    name: "Vendasta",
    category: "agency platform",
    pricingSourceUrl: "https://www.vendasta.com/pricing/",
    oneLiner:
      "Vendasta is a white-label platform and product marketplace. Agencies use it to resell digital services to local-business clients.",
    heroSub:
      "No minimum spend, no 12-month contract, no $999 tier just for the AI receptionist. SeldonFrame is the whitelabel AI front office for $29/mo flat.",
    intro: [
      "Most people looking for a Vendasta alternative hit the same wall: the sticker price isn't the real price. Plans are minimum-spend commitments ($99–$999/mo), not flat fees. The tiers most agencies need come with 12-month contracts. Onboarding reportedly takes 4–8 weeks. And the AI Voice Receptionist only comes with the Premium tier (a $999/mo minimum), with capped minutes. Agencies report real costs running well above the advertised starting price once seats and reports get added.",
      "That said, Vendasta is impressive. The white-label product marketplace runs deep, the multi-location portal is mature, and the prospecting reports are genuinely good sales tools. For agencies whose whole model is reselling a wide catalog of digital products, it fits well. But if what your clients actually want in 2026 is an AI that answers their phone and books their jobs, it shouldn't sit behind a $999/mo minimum.",
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
        body: "Vendasta's pricing is a spend commitment you have to fill, and real bills run above the sticker price. SeldonFrame is a flat subscription with unlimited client workspaces.",
      },
      {
        title: "AI receptionist for everyone, not just the top tier",
        body: "Vendasta locks voice AI behind its ~$999/mo Premium minimum. On SeldonFrame it's the core product, at $29.",
      },
      {
        title: "Live in minutes, not 4–8 weeks",
        body: "Vendasta onboarding is a whole project. A SeldonFrame client workspace is built from one conversation in about 3 minutes.",
      },
      {
        title: "No 12-month contract",
        body: "SeldonFrame is month-to-month, cancel anytime — the free build-first flow IS the trial.",
      },
    ],
    whenTheyWin:
      "Choose Vendasta if your agency's model is reselling a wide catalog of third-party digital products and you value its prospecting-report sales tools.",
    faq: [
      {
        q: "Can I run all my clients under my brand like Vendasta?",
        a: "Yes. Per-client workspaces, a branded client portal, and custom domains are all included, and you can deploy an agent template to every client in one click.",
      },
      {
        q: "Is there a contract?",
        a: "No. $29/mo flat, month-to-month, cancel anytime.",
      },
    ],
  },
  {
    slug: "goodcall",
    name: "Goodcall",
    category: "AI phone agent",
    pricingSourceUrl: "https://www.goodcall.com/pricing",
    oneLiner:
      "Goodcall is a no-code AI phone agent for small businesses. It answers FAQs and takes appointments, billed per unique monthly caller.",
    heroSub:
      "An answered call should turn into a booked job in a real system. SeldonFrame pairs the receptionist with the website, CRM, and calendar it books into — $29/mo flat, no per-caller caps.",
    intro: [
      "Most people looking for a Goodcall alternative hit the same wall: caller caps. Plans are listed at $79/$129/$249 per month per agent (about 15% cheaper billed annually), with 100–500 unique callers included, and overages cost $0.50 per caller. The most common complaint is conversational depth — simple FAQs work fine, but multi-step conversations struggle. And the agent stands alone: no CRM behind it, no website, no booking calendar it owns.",
      "That said, Goodcall is impressive. The per-caller pricing (with unlimited minutes) is genuinely predictable for businesses with repeat callers, setup is fast, and it comes from Google's Area 120 incubator, which shows in how reliable it is. For a single-location shop that just needs the phone picked up, it's a tidy tool. But picking up is only step one — qualifying, booking, and tracking the job is where the revenue actually happens.",
    ],
    them: {
      bestFor: "Single-location SMBs that need calls answered simply",
      pricingModel: "Listed at $79/$129/$249 per agent/mo (~15% off annual); 100–500 unique callers included, $0.50/caller overage",
      aiReceptionist: "Yes — phone only",
      frontOffice: "None — no CRM, website or owned booking calendar",
      whitelabel: "No published agency/whitelabel program",
      aiCosts: "Bundled (unlimited minutes), metered by unique callers",
      resale: "No",
    },
    switchReasons: [
      {
        title: "No worrying about caller counts",
        body: "Goodcall's caps make a busy month expensive ($0.50 per extra caller). SeldonFrame has no per-caller limit — usage runs on your own keys at provider cost.",
      },
      {
        title: "Multi-step conversations that close",
        body: "The receptionist qualifies the lead, checks real availability, and books the appointment — a multi-step job that goes beyond Goodcall's single-turn strength.",
      },
      {
        title: "The call lands in a CRM you own",
        body: "Every call, lead, and booking is recorded in the workspace CRM with the customer's history — not just a notification.",
      },
      {
        title: "SMS and chat on the same brain",
        body: "Missed-call text-back, website chat, and SMS follow-ups all come standard. The phone agent is just one surface of the same agent.",
      },
    ],
    whenTheyWin:
      "Choose Goodcall if you're a single-location business with lots of repeat callers and simple FAQ needs — the per-caller pricing fits that shape well.",
    faq: [
      {
        q: "Does SeldonFrame charge per caller or per minute?",
        a: "Neither. The platform is $29/mo flat. Calls run through your own Twilio number at carrier rates, and your own AI key at provider cost.",
      },
      {
        q: "Can it handle booking, not just answering?",
        a: "Yes, booking is built in. The agent reads real availability from the workspace calendar and books directly into it, with confirmations over SMS and email.",
      },
    ],
  },
  {
    slug: "voiceflow",
    name: "Voiceflow",
    category: "conversation-design platform",
    pricingSourceUrl: "https://www.voiceflow.com/pricing",
    oneLiner:
      "Voiceflow is a visual conversation-design platform. Technical teams use it to build and run voice and chat AI agents.",
    heroSub:
      "Skip the flow-diagram project and the per-seat credit math. SeldonFrame builds the working agent — and the website, CRM, and booking system behind it — from one conversation, for $29/mo flat.",
    intro: [
      "Most people looking for a Voiceflow alternative hit the same wall: costs pile up in three places at once. Editor seats run $60–$150/mo each, credits burn on top of that, and telephony bills separately. When your credits run out mid-cycle, there's no way to top up — your bots simply stop responding until the next cycle starts. Reviewers consistently call it the most expensive option at low volume, and the flow builder itself takes real design work for every agent.",
      "That said, Voiceflow is impressive. For teams designing genuinely complex, branching conversations, the visual builder is one of the best around, with real multi-channel support and the ability to handle calls at the same time. But an agency putting receptionists in front of local businesses doesn't need a conversation-design tool — it needs a working front office for each client.",
    ],
    them: {
      bestFor: "Technical teams designing complex conversational flows",
      pricingModel: "Free sandbox; ~$60–$150/mo per editor + credits; no mid-cycle top-ups (bots stop at the ceiling); enterprise contracts run far higher",
      aiReceptionist: "Voice + chat agents you design flow-by-flow",
      frontOffice: "None — no CRM, website or booking calendar",
      whitelabel: "No formal agency/whitelabel pricing tier",
      aiCosts: "Credit-metered per interaction, on top of seats",
      resale: "Informal — no productized reseller program",
    },
    switchReasons: [
      {
        title: "Bots that never stop mid-month",
        body: "Voiceflow credits can't be topped up mid-cycle — hit the ceiling and your agents go quiet. SeldonFrame runs on your own AI key at provider cost, so there's no platform limit to run out of.",
      },
      {
        title: "No per-seat tax on your team",
        body: "Every Voiceflow editor costs $50–$150/mo. SeldonFrame is $29/mo flat for the whole platform — your whole team, unlimited client workspaces.",
      },
      {
        title: "One conversation replaces the flow diagram",
        body: "Describe the business and SeldonFrame builds the agent, grounded in the client's real services and FAQs — no canvas, no wiring nodes together, no design backlog.",
      },
      {
        title: "The agent ships with its business system",
        body: "A Voiceflow agent still needs a CRM, calendar, and site built around it. SeldonFrame includes all three in every workspace, and the agent books real jobs into them.",
      },
    ],
    whenTheyWin:
      "Choose Voiceflow if you're a product team designing a complex, custom conversation experience and conversation design IS the product.",
    faq: [
      {
        q: "Can SeldonFrame handle complex conversation logic like Voiceflow?",
        a: "SeldonFrame agents are built from editable plain-language skills, plus deterministic tools for the parts that must never be improvised — checking availability, booking, taking messages. Most front-office jobs need reliable execution, not branching flow charts, and the parts that must be exact are code, not prompts.",
      },
      {
        q: "Do I pay per seat?",
        a: "No. $29/mo flat covers the platform. There are no per-editor fees.",
      },
    ],
  },
  {
    slug: "lindy",
    name: "Lindy",
    category: "AI employee builder",
    pricingSourceUrl: "https://www.lindy.ai/pricing",
    oneLiner:
      "Lindy is a general-purpose AI agent builder for automating internal work like email triage, research, and scheduling.",
    heroSub:
      "Lindy automates your inbox. SeldonFrame runs your clients' front office — receptionist, website, CRM, and booking — whitelabeled, for $29/mo flat.",
    intro: [
      "Most people looking for a Lindy alternative hit the same wall: it's built for your own internal work, not for delivering to clients. There's no free tier. Plans run $49.99–$199.99/mo on credits that burn unpredictably — a simple step costs 1 credit, but email parsing or web research can cost 5–10. And there's no agency, whitelabel, or reseller model at all. Voice is just a bolt-on step inside a workflow, with the delay to match.",
      "That said, Lindy is impressive. As a personal 'AI employee' for your own work, it's genuinely versatile, with a big template library and real multi-step ability. But you can't hand a Lindy to a plumbing company as their branded receptionist, and you can't run twenty clients on it.",
    ],
    them: {
      bestFor: "Individuals & teams automating their own internal workflows",
      pricingModel: "No free tier; $49.99–$199.99/mo credit-based, task-dependent burn + $10/1,000 top-ups",
      aiReceptionist: "Voice is a bolt-on step inside a workflow, not a phone receptionist product",
      frontOffice: "None — no CRM, website or booking calendar",
      whitelabel: "None — no agency or reseller model",
      aiCosts: "Credit-metered, varies 1–10 credits per step",
      resale: "No",
    },
    switchReasons: [
      {
        title: "Built for clients, not just your own inbox",
        body: "SeldonFrame is a delivery platform: every client gets a branded workspace with the agent, site, CRM, and calendar — something you can sell, not just use yourself.",
      },
      {
        title: "Costs you can predict",
        body: "Lindy's per-task credit burn changes with how complex the task is, which makes pricing clients a guessing game. SeldonFrame is $29/mo flat, plus your own keys at provider cost.",
      },
      {
        title: "A real phone receptionist",
        body: "Voice-native answering with reliable booking beats a voice step bolted onto a workflow — the receptionist is the product, not one step in a chain.",
      },
      {
        title: "Whitelabel from day one",
        body: "Client portal, custom domains, per-client workspaces — the agency features Lindy simply doesn't have.",
      },
    ],
    whenTheyWin:
      "Choose Lindy if you want an AI employee for your OWN work — inbox triage, research, internal scheduling — rather than a platform to deliver client-facing systems.",
    faq: [
      {
        q: "Can SeldonFrame automate internal tasks too?",
        a: "SeldonFrame agents fire on business events — a new lead, a missed call, a completed job — and handle follow-ups, review requests, and speed-to-lead automatically. It's front-office automation, purpose-built, rather than general workflow automation.",
      },
      {
        q: "Is there a free way to try it?",
        a: "Yes. Paste in a business's website and SeldonFrame builds the full workspace free in about 3 minutes, before you sign up.",
      },
    ],
  },
  {
    slug: "durable",
    name: "Durable",
    category: "AI website builder",
    pricingSourceUrl: "https://durable.com/pricing",
    oneLiner:
      "Durable is an AI website builder with a light CRM and invoicing, aimed at solo operators who want a fast, cheap site.",
    heroSub:
      "A website that can't answer the phone is just a brochure. SeldonFrame pairs the AI-built site with an AI receptionist, CRM, and booking calendar — $29/mo flat, unlimited workspaces.",
    intro: [
      "Most people looking for a Durable alternative hit the same wall: the site goes up in 30 seconds, and then the phone rings and nothing answers it. There's no AI voice at all — \"AI\" here means a chat widget and written content — the output looks a lot like every other Durable site, users report friction moving their domain over, and the top plan caps at 5 businesses with no whitelabel option. That means agencies can't run a real client roster on it.",
      "That said, Durable is impressive. It made instant websites real, the free tier is genuinely usable, and the pricing is refreshingly clear. For a solo operator who just needs a web presence this week, it's a fine choice. But local service businesses don't lose jobs to a missing website nearly as often as they lose them to a missed call.",
    ],
    them: {
      bestFor: "Solo operators who need a cheap site fast",
      pricingModel: "Free tier; ~$22–$95/mo; top plan capped at 5 businesses",
      aiReceptionist: "None — AI chat widget and content generation only, no phone answering",
      frontOffice: "Partial — site + light CRM + invoicing; no real booking calendar behind an agent",
      whitelabel: "None — not built for agencies",
      aiCosts: "Bundled, capped by plan (messages/images per month)",
      resale: "No",
    },
    switchReasons: [
      {
        title: "The site answers its own phone",
        body: "SeldonFrame builds the multi-page site AND the AI receptionist behind it — calls answered, leads qualified, jobs booked into a real calendar.",
      },
      {
        title: "Built for a client roster, not 5 businesses",
        body: "Durable's top plan caps at 5 businesses with no whitelabel option. SeldonFrame gives you unlimited client workspaces with a branded agency portal at $29/mo.",
      },
      {
        title: "A CRM that closes the loop",
        body: "Every call, chat, form fill, and booking lands in the workspace CRM with automatic follow-ups — not just a contact list bolted onto a site builder.",
      },
      {
        title: "Sites grounded in the real business",
        body: "Paste in the business's existing website, or just describe it — SeldonFrame pulls out services, reviews, and FAQs so the site (and the agent) speak to the client's actual business.",
      },
    ],
    whenTheyWin:
      "Choose Durable if you're a solo operator who only needs a simple website and invoicing this week, with no need for phone answering or client management.",
    faq: [
      {
        q: "Does SeldonFrame generate multi-page sites like Durable?",
        a: "Yes. A full multi-page service site — services, service areas, reviews, booking, intake — built from one conversation or a pasted URL, with a dark/light theme and custom domains.",
      },
      {
        q: "Can I move my existing Durable site over?",
        a: "Paste in its URL. SeldonFrame pulls out the services, copy, and business facts and rebuilds the workspace around them in about 3 minutes. You point the domain over when you're ready.",
      },
    ],
  },
  {
    slug: "my-ai-front-desk",
    name: "My AI Front Desk",
    category: "AI receptionist",
    pricingSourceUrl: "https://www.myaifrontdesk.com/pricing",
    oneLiner:
      "My AI Front Desk (rebranding to Frontdesk) is an AI receptionist for phone, SMS, and chat, aimed at small local businesses.",
    heroSub:
      "200 minutes a month is about 40 calls. SeldonFrame gives you the receptionist on your own Twilio at carrier cost — plus the website, CRM, and booking system — for $29/mo flat.",
    intro: [
      "Most people looking for a My AI Front Desk alternative hit the same wall: the minutes run out fast, and the agency pricing is a black box. The $99/mo plan includes 200 voice minutes — roughly 40 five-minute calls — before overage charges of about $0.25/minute kick in. The Partner/agency tier has no published pricing at all. And a mid-flight rebrand (to \"Frontdesk\") has left different pricing pages online contradicting each other, which doesn't help confidence.",
      "That said, My AI Front Desk is impressive. The $20 entry point is genuinely easy to reach, setup takes minutes, and it has grown beyond pure voice into chat, SMS, and email drafts. It's closer to a real front office than the pure voice-API players. But 'closer' still means no real CRM, no website, no booking calendar it owns — and Zapier holding it all together.",
    ],
    them: {
      bestFor: "Single-location SMBs wanting a cheap receptionist add-on",
      pricingModel: "$20/mo basic (no voice); $99/mo with 200 voice min, then ~$0.25/min-equivalent credit overage; agency tier unpublished",
      aiReceptionist: "Yes — voice, SMS and chat",
      frontOffice: "Light — automations + Zapier; no real CRM, website or owned booking calendar",
      whitelabel: "Partner/Enterprise tier exists but pricing is not public",
      aiCosts: "Credit-metered overages once plan minutes run out",
      resale: "Via the opaque Partner tier",
    },
    switchReasons: [
      {
        title: "No worrying about running out of minutes",
        body: "SeldonFrame doesn't sell minutes. Connect your own Twilio number and calls cost carrier rates, with your own AI key at provider cost. A busy month is just a good month, not a surprise bill.",
      },
      {
        title: "The whole front office, not just a receptionist add-on",
        body: "Website, CRM, booking calendar, intake, and review automation all come with the agent — the receptionist writes into a system you actually own.",
      },
      {
        title: "Agency pricing you can actually plan around",
        body: "Their Partner tier is quote-only. SeldonFrame's agency pricing is public: $29/mo flat, unlimited client workspaces, whitelabel included.",
      },
      {
        title: "A stable platform, not a rebrand in progress",
        body: "Agents grounded in a real registry, an open core, and portable data — the platform story is stable and easy to check for yourself.",
      },
    ],
    whenTheyWin:
      "Choose My AI Front Desk if you're a single location that wants the cheapest possible receptionist add-on and already lives happily in Zapier.",
    faq: [
      {
        q: "What do calls actually cost on SeldonFrame?",
        a: "Carrier rates on your own Twilio number, plus your own AI key at provider cost. SeldonFrame doesn't meter or mark up minutes on the $29/mo plan.",
      },
      {
        q: "Does SeldonFrame do missed-call text-back too?",
        a: "Yes. A missed call triggers an instant SMS follow-up, and the same agent that answers the phone continues the conversation.",
      },
    ],
  },
  {
    slug: "smith-ai",
    name: "Smith.ai",
    category: "receptionist service",
    pricingSourceUrl: "https://smith.ai/pricing/ai-receptionist",
    oneLiner:
      "Smith.ai is a North-America-based receptionist service that combines AI with human receptionists, billed per call.",
    heroSub:
      "A service bills you per call, forever. SeldonFrame is a platform you (or your agency) own — AI receptionist, website, CRM, and booking for $29/mo flat, on your own keys.",
    intro: [
      "Most people looking for a Smith.ai alternative hit the same wall: per-call pricing and a quote gate. The public pricing page is now just a lead-capture form — no numbers until you talk to sales. And per-call billing, which users describe as a \"success tax,\" means your receptionist bill grows right along with your call volume, forever. It's also a service, not a platform: there's nothing to whitelabel, nothing to build on, and the CRM of record belongs to someone else.",
      "That said, Smith.ai is impressive. The human-in-the-loop model delivers genuinely polished conversations, and for high-stakes professional services — law firms especially — a human voice on complex intake is worth paying for. But most local service businesses need every call answered instantly and booked into their own system — a job AI now does 24/7 for one flat platform fee.",
    ],
    them: {
      bestFor: "Professional services wanting human-quality call handling",
      pricingModel: "Quote-gated (pricing page is a sales form); per-call billing that scales with volume",
      aiReceptionist: "Yes — AI + human hybrid, as a managed service",
      frontOffice: "None — answers calls and hands off; your CRM/calendar live elsewhere",
      whitelabel: "None — it's a consumed service, not a platform",
      aiCosts: "Bundled into per-call pricing",
      resale: "No",
    },
    switchReasons: [
      {
        title: "Flat platform fee vs per-call forever",
        body: "Per-call billing punishes growth — more calls means a bigger bill. SeldonFrame is $29/mo flat, with calls at carrier and provider cost on your own keys.",
      },
      {
        title: "Own the system, not just the answer",
        body: "Every Smith.ai call ends by handing off to tools you still had to buy separately. SeldonFrame's receptionist books straight into the workspace's own calendar and CRM.",
      },
      {
        title: "24/7 without staffing math",
        body: "AI answers instantly at 2am, during storms, on holidays — no extra charge for after-hours coverage.",
      },
      {
        title: "An agency can resell it",
        body: "Smith.ai is something you consume. SeldonFrame is something you can deliver — whitelabeled, per client, with your own margin.",
      },
    ],
    whenTheyWin:
      "Choose Smith.ai if complex, high-stakes intake — legal matters, sensitive callers — genuinely needs a trained human on the line, and per-call pricing fits your call volume.",
    faq: [
      {
        q: "Is an AI receptionist as good as Smith.ai's humans?",
        a: "For the core front-office job — answer, qualify, check real availability, book, take a message — SeldonFrame's agent runs the same way every time and never misses a call. For genuinely sensitive human conversations, we'd honestly point you to a human service; many businesses run AI-first with a human backup for escalations.",
      },
      {
        q: "Can the agent take messages like a receptionist service?",
        a: "Yes. When a caller needs a human, the agent takes down a structured message and notifies the operator right away by SMS or email, logged against the contact in the CRM.",
      },
    ],
  },
  {
    slug: "activecampaign",
    name: "ActiveCampaign",
    category: "email automation & CRM",
    pricingSourceUrl: "https://www.activecampaign.com/pricing",
    oneLiner:
      "ActiveCampaign is an automation-first email marketing platform with a light CRM layer, priced per contact.",
    heroSub:
      "Stop watching your bill climb with your list size. SeldonFrame gives a local business the AI receptionist, website, CRM, and booking system for $29/mo flat, on your own keys — not per contact.",
    intro: [
      "Most people looking for an ActiveCampaign alternative hit the same wall: per-contact pricing. Plans run roughly $15–$145/mo at just 1,000 contacts (billed annually, and the exact number depends on a configurator), and the bill climbs fast as your list grows — inactive and unsubscribed contacts often still count toward it. There's no white-label option for agencies, and nothing that answers a phone, texts back a missed call, or books a job into a calendar. ActiveCampaign automates email; it doesn't run the front office.",
      "That said, ActiveCampaign is impressive. Its automation depth, deliverability reputation, and 900+ integrations are genuinely best-in-class for email marketers. If your business lives and dies on segmented email sequences, it's hard to beat. But most local service businesses lose more revenue to an unanswered phone than an unopened newsletter.",
    ],
    them: {
      bestFor: "Email marketers running deep automated sequences",
      pricingModel: "~$15–$145/mo at 1,000 contacts (annual, configurator-gated); climbs with list size",
      aiReceptionist: "None — Active Intelligence AI assists with content/predictions, not phone or SMS answering",
      frontOffice: "None — email/CRM only; no website builder, booking calendar or intake forms",
      whitelabel: "None — not built for agency resale",
      aiCosts: "Bundled into per-contact plan tiers",
      resale: "No native reseller program",
    },
    switchReasons: [
      {
        title: "Flat $29, not per-contact math",
        body: "ActiveCampaign's bill grows with your list, often counting contacts you'll never email again. SeldonFrame is $29/mo flat with unlimited workspaces, no matter how many contacts you have.",
      },
      {
        title: "Answers phones, not just inboxes",
        body: "ActiveCampaign has no phone or SMS receptionist. SeldonFrame's agent answers calls, texts back missed ones, and chats on the website — the same brain across every channel.",
      },
      {
        title: "The whole front office, not just email",
        body: "SeldonFrame includes a website, booking calendar, intake forms, and CRM alongside the agent. ActiveCampaign assumes you already have all of that somewhere else.",
      },
      {
        title: "Whitelabel for agencies",
        body: "ActiveCampaign has no agency resale model. SeldonFrame includes a branded client portal and per-client workspaces at $29/mo.",
      },
    ],
    whenTheyWin:
      "Choose ActiveCampaign if segmented, deeply automated email marketing is your core deliverable and you need its depth with 900+ integrations.",
    faq: [
      {
        q: "Does SeldonFrame replace ActiveCampaign's email automation?",
        a: "SeldonFrame handles front-office jobs — speed-to-lead follow-ups, review requests, appointment reminders — over SMS and email, triggered by real events like a new lead, a missed call, or a completed booking. It's not a general-purpose email-campaign builder for newsletters and broadcast sequences.",
      },
      {
        q: "Will my costs grow with my contact list on SeldonFrame?",
        a: "No. $29/mo is flat no matter how many contacts you have. AI usage runs on your own key at provider cost, so growth doesn't drive up your platform bill.",
      },
    ],
  },
  {
    slug: "hubspot",
    name: "HubSpot",
    category: "enterprise CRM",
    pricingSourceUrl: "https://www.hubspot.com/pricing/marketing",
    oneLiner:
      "HubSpot is a premium all-in-one CRM and marketing platform that scales from a free tier to enterprise contracts.",
    heroSub:
      "Skip the 40x price jump between Starter and Pro. SeldonFrame gives every client the AI receptionist, website, CRM, and booking system for $29/mo flat, with no mandatory onboarding fee.",
    intro: [
      "Most people looking for a HubSpot alternative hit the same wall: the jump from entry-level to real use is brutal. Marketing Starter runs $15/seat/mo, but Professional jumps to roughly $800/mo plus a mandatory $3,000 onboarding fee, and Enterprise runs $3,600/mo — roughly a 40x jump between the tier that gets you started and the tier that does real marketing automation. AI features are billed on credits on top of that, and there's no white-label option at any price. SMS and voice both need third-party add-ons.",
      "That said, HubSpot is impressive. Its CRM depth, reporting, and enterprise polish are genuinely best-in-class, and for a funded B2B sales team managing complex pipelines, it scales further than almost anything else. But local service businesses don't need enterprise pipeline reporting. They need their phone answered and the job booked.",
    ],
    them: {
      bestFor: "Funded B2B sales & marketing teams needing enterprise CRM depth",
      pricingModel: "Free CRM; Marketing Starter $15/seat/mo; Pro ~$800/mo + $3,000 onboarding; Enterprise $3,600/mo",
      aiReceptionist: "None — HubSpot Breeze AI assists with content, insights and chat, not phone answering",
      frontOffice: "Partial — CRM and reporting are deep; SMS/voice need add-ons, no native booking-into-front-office flow",
      whitelabel: "None — not an agency resale platform",
      aiCosts: "Credit-metered on top of seat pricing",
      resale: "No native agency reseller program",
    },
    switchReasons: [
      {
        title: "No 40x pricing jump",
        body: "HubSpot's jump from Starter to Pro is roughly $15/seat to $800/mo plus $3,000 for onboarding. SeldonFrame is $29/mo flat — no onboarding fee, no per-seat multiplier.",
      },
      {
        title: "A phone-answering agent, not just a smarter CRM",
        body: "Breeze AI helps write content and summarize deals. SeldonFrame's agent answers calls, qualifies leads, and books jobs directly — the phone is the product, not a nice-to-have feature.",
      },
      {
        title: "SMS and voice included, not bolted on",
        body: "HubSpot needs third-party integrations for SMS and voice. SeldonFrame's receptionist handles voice, SMS, and chat on your own Twilio and AI keys at raw cost.",
      },
      {
        title: "Whitelabel for agencies serving local clients",
        body: "HubSpot has no agency resale model. SeldonFrame gives every client a branded workspace under your agency's own domain.",
      },
    ],
    whenTheyWin:
      "Choose HubSpot if you're a funded B2B team that needs enterprise-grade pipeline reporting, marketing attribution, and CRM customization, and the budget to match.",
    faq: [
      {
        q: "Is SeldonFrame a HubSpot replacement for enterprise sales teams?",
        a: "No. HubSpot's enterprise reporting, attribution modeling, and pipeline customization go deeper than SeldonFrame is built for. SeldonFrame is purpose-built for the local-service front office: an agent that answers, qualifies, and books, with the CRM, site, and calendar behind it.",
      },
      {
        q: "Does SeldonFrame have a free tier like HubSpot's free CRM?",
        a: "SeldonFrame lets you build the full workspace — site, CRM, booking, agent — free in about 3 minutes, before you ever create an account. The $29/mo subscription starts when you claim it and go live.",
      },
    ],
  },
  {
    slug: "clickfunnels",
    name: "ClickFunnels",
    category: "funnel builder",
    pricingSourceUrl: "https://www.clickfunnels.com/pricing",
    oneLiner:
      "ClickFunnels is a funnel-building platform for offer-sellers, built around ready-made sales pages and checkout flows.",
    heroSub:
      "A funnel converts a click — it doesn't answer a phone. SeldonFrame pairs the front office with an AI receptionist that answers, qualifies, and books, for $29/mo flat with no contact caps.",
    intro: [
      "Most people looking for a ClickFunnels alternative hit the same wall: contact caps and a missing back office. Launch runs $97/mo (10,000 contacts), Scale $197/mo, Optimize $297/mo — every tier caps how many contacts you can have, so growth means an upgrade. There's no white-label or agency option, the CRM is thin, and there's no built-in SMS or voice. If a lead calls instead of clicking, ClickFunnels has nothing for that.",
      "That said, ClickFunnels is impressive. Its converting templates, fast solo-launch workflow, and the Brunson ecosystem of courses and community are genuinely valuable for a single offer-seller. But local service businesses aren't selling a digital offer through a funnel — they're answering calls and booking jobs, and that calls for a different tool.",
    ],
    them: {
      bestFor: "Solo offer-sellers building sales funnels and digital products",
      pricingModel: "Launch $97/mo (10k contacts) / Scale $197/mo / Optimize $297/mo — contact caps every tier",
      aiReceptionist: "None — no phone, SMS or chat answering",
      frontOffice: "Partial — funnels and checkout pages; weak CRM, no booking calendar or intake forms",
      whitelabel: "None — no agency or reseller model",
      aiCosts: "Not applicable — no native AI agent",
      resale: "No",
    },
    switchReasons: [
      {
        title: "No contact caps to run into",
        body: "Every ClickFunnels tier caps how many contacts you can have. SeldonFrame is $29/mo flat with unlimited workspaces — growth doesn't force a plan change.",
      },
      {
        title: "Answers the phone a funnel can't",
        body: "ClickFunnels has no phone or SMS layer at all. SeldonFrame's receptionist answers calls, texts back missed ones, and books directly into a real calendar.",
      },
      {
        title: "A real CRM and booking system, not just a funnel",
        body: "SeldonFrame includes a full CRM, booking calendar, and intake forms. ClickFunnels' CRM is thin by comparison — built for capturing leads, not running the business behind them.",
      },
      {
        title: "Whitelabel for agencies",
        body: "ClickFunnels has no agency resale model. SeldonFrame gives every client a branded workspace at $29/mo.",
      },
    ],
    whenTheyWin:
      "Choose ClickFunnels if you're a solo operator selling a single digital offer through a converting funnel, and want the Brunson-ecosystem templates and community around it.",
    faq: [
      {
        q: "Can SeldonFrame build landing pages like ClickFunnels?",
        a: "SeldonFrame builds a full multi-page service website, not a single-offer sales funnel. It's grounded in the business's real services, FAQs, and reviews, with booking and intake built in.",
      },
      {
        q: "Does SeldonFrame have contact caps like ClickFunnels?",
        a: "No. $29/mo is flat no matter how many contacts or how big your list is.",
      },
    ],
  },
  {
    slug: "keap",
    name: "Keap",
    category: "SMB CRM & automation",
    pricingSourceUrl: "https://keap.com/pricing",
    oneLiner:
      "Keap (owned by Thryv since October 2024) is a veteran small-business CRM and automation platform with invoicing and payments.",
    heroSub:
      "Skip the 3x-GHL entry price for a platform in the middle of an acquisition. SeldonFrame gives every client an AI receptionist, website, CRM, and booking system for $29/mo flat.",
    intro: [
      "Most people looking for a Keap alternative hit the same wall: the price and the timing. Plans start from $299/mo ($249 annual) for just 2 users and 1,500 contacts, plus $39 per extra user and a paid setup package to get going — roughly 3x GoHighLevel's entry price for a narrower set of features. Keap was bought by Thryv in October 2024, and its features are gradually folding into the Thryv product line, which leaves its future roadmap unclear. There's no white-label option and no AI receptionist.",
      "That said, Keap is impressive. Its automation maturity, invoicing and payments tools, and onboarding support have built real loyalty over nearly two decades. If you're already deep in Keap and the acquisition-era changes don't bother you, switching costs may outweigh the savings. But for a business that just needs its phone answered and jobs booked, $299/mo plus per-user fees is a lot of platform for one job.",
    ],
    them: {
      bestFor: "Established SMBs with mature Keap automations already built",
      pricingModel: "From $299/mo ($249 annual, 2 users, 1,500 contacts) + $39/user + paid implementation",
      aiReceptionist: "None — no phone, SMS or chat AI agent",
      frontOffice: "Partial — CRM, invoicing and payments; no website builder, no AI-driven booking",
      whitelabel: "None — not built for agency resale",
      aiCosts: "Not applicable — no native AI agent",
      resale: "No",
    },
    switchReasons: [
      {
        title: "A third of the entry price",
        body: "Keap starts at $299/mo for 2 users. SeldonFrame is $29/mo flat, unlimited use — no per-user fee, no paid setup package required.",
      },
      {
        title: "An AI receptionist Keap doesn't have",
        body: "Keap has no phone or chat AI. SeldonFrame's agent answers calls, qualifies leads, and books jobs into a real calendar automatically.",
      },
      {
        title: "A website and booking calendar included",
        body: "Keap is CRM and automation only. SeldonFrame adds a built multi-page website, booking calendar, and intake forms in the same workspace.",
      },
      {
        title: "A platform on a stable, single roadmap",
        body: "Keap's post-acquisition roadmap is slowly being absorbed into Thryv. SeldonFrame's roadmap is just the AI front office, undivided.",
      },
    ],
    whenTheyWin:
      "Choose Keap if you have years of automations, invoicing, and payment workflows already built there and the acquisition-era changes don't affect your use case.",
    faq: [
      {
        q: "Does SeldonFrame do invoicing and payments like Keap?",
        a: "SeldonFrame's core is the front office — receptionist, website, CRM, booking, and intake. Payments run through Stripe where configured; deep invoicing tools aren't the product's focus the way they are for Keap.",
      },
      {
        q: "Is switching from Keap disruptive?",
        a: "Export your Keap contacts to CSV and import them into SeldonFrame. Run both in parallel for a week while the new AI receptionist takes over call handling, then cancel Keap once you're confident.",
      },
    ],
  },
  {
    slug: "linktree",
    name: "Linktree",
    category: "link-in-bio",
    pricingSourceUrl: "https://linktr.ee/s/pricing/",
    oneLiner:
      "Linktree is a link-in-bio tool that turns one profile link into a page of links — not a business platform.",
    heroSub:
      "A link-in-bio page can't answer a phone or take a booking. SeldonFrame gives a local business a real website, AI receptionist, CRM, and booking calendar for $29/mo flat.",
    intro: [
      "Most people looking for a Linktree alternative hit the same wall: it's one page of links, not a business. The free tier is genuinely usable, but paid tiers run $8–$35/mo, and 0% sales commission only applies on the Premium tier — below that, Linktree takes a 9–12% cut of anything sold through it. There's no CRM, no booking calendar, no automation, and nothing that answers a phone call or a text. It's a rented touchpoint pointing traffic somewhere else, not a system that runs the business.",
      "That said, Linktree is impressive. The 60-second setup and the mind-share it built with creators are real, and for a creator who just needs one clean link to their content, it's still the fastest way to get one. But a local service business needs more than a link. It needs its calls answered and its jobs booked.",
    ],
    them: {
      bestFor: "Creators and individuals who need one bio link, not a business system",
      pricingModel: "Free / $8 / $15 / $35/mo — 0% sales commission only on the $35 Premium tier, 9–12% below it",
      aiReceptionist: "None — link page only, no phone, SMS or chat",
      frontOffice: "None — no website, CRM, booking calendar or intake forms",
      whitelabel: "None — not built for agencies or client resale",
      aiCosts: "Not applicable — no native AI agent",
      resale: "No — and a sales commission applies below Premium",
    },
    switchReasons: [
      {
        title: "A real website, not a link page",
        body: "SeldonFrame builds a full multi-page service site — services, booking, reviews, contact — not a single page of outbound links.",
      },
      {
        title: "An AI receptionist Linktree can't offer",
        body: "Linktree has no phone, SMS, or chat ability. SeldonFrame's agent answers calls, qualifies leads, and books jobs automatically.",
      },
      {
        title: "No commission on what you sell",
        body: "Linktree takes 9–12% of sales below its $35 Premium tier. SeldonFrame charges $29/mo flat — nothing extra on bookings you close yourself.",
      },
      {
        title: "A CRM and calendar behind the link",
        body: "Every lead that clicks through lands in a real CRM with a real booking calendar — not just a log of clicks.",
      },
    ],
    whenTheyWin:
      "Choose Linktree if you're a creator who only needs one link bringing together your social profiles and content, with no need for a CRM, booking, or phone answering.",
    faq: [
      {
        q: "Can SeldonFrame replace my Linktree bio link?",
        a: "Yes. SeldonFrame builds a full website with its own links, services, and booking page. You can still point your social bio at it the same way you'd point it at a Linktree page.",
      },
      {
        q: "Does SeldonFrame take a commission on sales like Linktree's lower tiers?",
        a: "No. $29/mo is flat. SeldonFrame charges 2% only on sales made through SeldonFrame checkout, and nothing on business you close yourself.",
      },
    ],
  },
  {
    slug: "kartra",
    name: "Kartra",
    category: "creator all-in-one",
    pricingSourceUrl: "https://kartra.com/pricing/",
    oneLiner:
      "Kartra is an all-in-one platform for creators and coaches selling courses, memberships, and video content, with contact-capped tiers.",
    heroSub:
      "500 contacts on the entry tier isn't a real local-business CRM. SeldonFrame gives every client an AI receptionist, website, CRM, and booking system for $29/mo flat, with no contact caps.",
    intro: [
      "Most people looking for a Kartra alternative hit the same wall: contact caps everywhere. Essentials runs $59/mo but caps at just 500 contacts, Starter $119/mo, Growth $229/mo, Pro $549/mo — every tier has a ceiling that forces an upgrade as your list grows. There's no white-label or sub-account option for agencies, and no phone or local-business tools at all. Kartra is built for selling courses and memberships, not answering calls and booking jobs.",
      "That said, Kartra is impressive. Its course, membership, video, and affiliate tools and built-in helpdesk are genuinely deep for a creator-economy business. If you're selling a course with an affiliate program, it's a strong fit. But local service businesses don't sell memberships. They answer phones and book jobs, and a 500-contact cap won't survive a busy month.",
    ],
    them: {
      bestFor: "Creators/coaches selling courses, memberships and video content",
      pricingModel: "Essentials $59/mo (500 contacts) / Starter $119 / Growth $229 / Pro $549 — contact caps every tier",
      aiReceptionist: "None — no phone, SMS or chat AI agent",
      frontOffice: "Partial — course/membership/checkout pages and a helpdesk; no phone answering or client-service booking calendar",
      whitelabel: "None — no agency or sub-account model",
      aiCosts: "Not applicable — no native AI agent",
      resale: "No native agency reseller program",
    },
    switchReasons: [
      {
        title: "No contact cap to outgrow",
        body: "Kartra's Essentials tier caps at 500 contacts. SeldonFrame is $29/mo flat, unlimited contacts, unlimited workspaces.",
      },
      {
        title: "An AI receptionist for a phone Kartra ignores",
        body: "Kartra has no phone or SMS layer. SeldonFrame's agent answers calls, qualifies leads, and books real jobs into a calendar.",
      },
      {
        title: "Built for service businesses, not just course sales",
        body: "SeldonFrame's booking calendar, intake forms, and CRM are built for scheduling client work, not just selling a membership.",
      },
      {
        title: "Whitelabel for agencies",
        body: "Kartra has no agency resale model. SeldonFrame includes a branded client portal and per-client workspaces at $29/mo.",
      },
    ],
    whenTheyWin:
      "Choose Kartra if you're a creator or coach selling courses, memberships, or video content and want built-in affiliate management and a helpdesk alongside checkout.",
    faq: [
      {
        q: "Does SeldonFrame sell courses or memberships like Kartra?",
        a: "No. SeldonFrame is built for local service businesses: an AI receptionist plus the website, CRM, and booking calendar behind it. It doesn't include course-hosting or membership-site tools.",
      },
      {
        q: "Will I hit a contact cap on SeldonFrame like Kartra's tiers?",
        a: "No. $29/mo is flat with no contact cap, at any tier.",
      },
    ],
  },
  {
    slug: "sharpspring",
    name: "SharpSpring (Constant Contact)",
    category: "agency marketing automation",
    pricingSourceUrl: "https://www.constantcontact.com/pricing/lead-gen-crm",
    oneLiner:
      "SharpSpring is an agency-focused marketing automation platform, now operating under Constant Contact and reported to be in maintenance mode after the acquisition.",
    heroSub:
      "A platform in maintenance mode with quote-gated pricing is a place to migrate FROM, not to. SeldonFrame gives every client an AI receptionist, website, CRM, and booking system for $29/mo flat, publicly priced.",
    intro: [
      "Most people looking for a SharpSpring alternative hit the same wall: nobody publishes the price, and the brand's future is unclear. Pricing is quote-gated — the number commonly cited by agencies is around $449/mo per 1,000 contacts, but SharpSpring won't confirm it publicly. Since the Constant Contact acquisition, the brand has been reported as being phased toward retirement, with little visible product investment, and there's no local-business toolkit at all — no phone answering, no booking system, no intake forms.",
      "That said, SharpSpring is impressive. Unlimited users on a flat agency plan and VisitorID website tracking were genuinely ahead of their time, and its agency roots run deep. But a platform being wound down under its acquirer isn't where you want to build a client's front office for the next five years.",
    ],
    them: {
      bestFor: "Agencies with legacy SharpSpring accounts and VisitorID workflows",
      pricingModel: "Quote-gated — commonly cited at ~$449/mo per 1,000 contacts",
      aiReceptionist: "None — no phone, SMS or chat AI agent",
      frontOffice: "None — marketing automation and CRM only; no website builder, booking calendar or intake forms",
      whitelabel: "Yes — unlimited users on the agency plan",
      aiCosts: "Not applicable — no native AI agent",
      resale: "Limited — agency reselling exists but the platform's future is uncertain post-acquisition",
    },
    switchReasons: [
      {
        title: "A published price, not a sales call",
        body: "SharpSpring won't tell you the price until you talk to sales. SeldonFrame's price is public: $29/mo flat.",
      },
      {
        title: "An AI receptionist SharpSpring never built",
        body: "SharpSpring has no phone or SMS answering. SeldonFrame's agent answers calls, qualifies leads, and books jobs into a real calendar.",
      },
      {
        title: "A platform investing forward, not winding down",
        body: "SharpSpring is reported to be in maintenance mode after its acquisition. SeldonFrame's roadmap is the AI front office, and it's actively shipping.",
      },
      {
        title: "The whole front office in one workspace",
        body: "Website, CRM, booking calendar, and intake forms all come with the agent — not marketing automation alone.",
      },
    ],
    whenTheyWin:
      "Choose SharpSpring if you have a mature agency book already running on it and VisitorID tracking is load-bearing for your current workflows.",
    faq: [
      {
        q: "Why isn't SharpSpring's price listed anywhere?",
        a: "SharpSpring pricing is quote-gated — agencies commonly report being quoted around $449/mo per 1,000 contacts, but the vendor doesn't publish a number. SeldonFrame's $29/mo flat price is public everywhere.",
      },
      {
        q: "Is SharpSpring being discontinued?",
        a: "SharpSpring operates under Constant Contact following its acquisition, and is widely reported to be in maintenance mode with limited new investment. Worth confirming directly with the vendor before building new workflows on it.",
      },
    ],
  },
  {
    slug: "klaviyo",
    name: "Klaviyo",
    category: "ecommerce email & SMS",
    pricingSourceUrl: "https://www.klaviyo.com/pricing",
    oneLiner:
      "Klaviyo is an ecommerce-focused email and SMS marketing platform with a B2C CRM layer, priced per profile.",
    heroSub:
      "Klaviyo is built for ecommerce carts, not service-business phones. SeldonFrame gives a local business the AI receptionist, website, CRM, and booking system for $29/mo flat.",
    intro: [
      "Most people looking for a Klaviyo alternative for a local service business hit the same wall: it's priced and built for ecommerce. The free plan covers 250 profiles; paid plans run roughly $30–45/mo at 1,000 profiles, climbing to around $130/mo at 10,000. Profile counts include suppressed and unsubscribed contacts unless you actively remove them, and SMS usage is billed on top. There's no agency or white-label option, no funnels, no website builder, and no booking calendar. Klaviyo assumes you're running a Shopify store, not a plumber's phone line.",
      "That said, Klaviyo is impressive. Its ecommerce data model, Shopify-native depth, and deliverability are genuinely best-in-class for online retail. If your business is a Shopify store living on abandoned-cart flows, it's a strong choice. But local service businesses don't have shopping carts. They have phones that ring and jobs that need booking.",
    ],
    them: {
      bestFor: "Ecommerce/Shopify brands running email + SMS lifecycle marketing",
      pricingModel: "Free to 250 profiles; ~$30–45/mo @1k profiles, ~$130/mo @10k; SMS usage on top",
      aiReceptionist: "None — no phone, voice or chat receptionist",
      frontOffice: "None — email/SMS and B2C CRM only; no website, booking calendar or intake forms",
      whitelabel: "None — not built for agency resale",
      aiCosts: "Not applicable — no native AI agent",
      resale: "No",
    },
    switchReasons: [
      {
        title: "Built for phones, not shopping carts",
        body: "Klaviyo has no phone or voice ability at all. SeldonFrame's AI receptionist answers calls, qualifies leads, and books jobs — the job a local business actually needs done.",
      },
      {
        title: "Flat $29, not per-profile scaling",
        body: "Klaviyo bills per profile, including suppressed contacts you have to actively remove. SeldonFrame is $29/mo flat no matter how many contacts you have.",
      },
      {
        title: "A website and booking calendar included",
        body: "Klaviyo assumes you already have a Shopify store. SeldonFrame builds the whole front office — site, CRM, booking, intake — from a conversation.",
      },
      {
        title: "Whitelabel for agencies",
        body: "Klaviyo has no agency resale model. SeldonFrame includes branded client workspaces at $29/mo.",
      },
    ],
    whenTheyWin:
      "Choose Klaviyo if you're running an ecommerce or Shopify brand and need deep cart-recovery, lifecycle email, and SMS flows tied to purchase data.",
    faq: [
      {
        q: "Can SeldonFrame do abandoned-cart email like Klaviyo?",
        a: "No. SeldonFrame isn't an ecommerce marketing platform. It's built for the local-service front office: an AI receptionist plus the site, CRM, and booking calendar behind it — not cart-recovery flows for online stores.",
      },
      {
        q: "Does SeldonFrame charge per contact like Klaviyo?",
        a: "No. $29/mo is flat no matter how many contacts are in your CRM.",
      },
    ],
  },
  {
    slug: "zoho",
    name: "Zoho",
    category: "value CRM suite",
    pricingSourceUrl: "https://www.zoho.com/crm/zohocrm-pricing.html",
    oneLiner:
      "Zoho is a value-priced CRM and 45-app business suite, sold per user across gated editions.",
    heroSub:
      "45 apps to piece together is a project, not a front office. SeldonFrame gives every client a working AI receptionist, website, CRM, and booking system for $29/mo flat — nothing to assemble.",
    intro: [
      "Most people looking for a Zoho alternative for a local service business hit the same wall: you have to assemble it yourself. CRM Standard runs $20/user/mo ($14 annual), climbing to $40/user for Enterprise. Zoho One — the bundle that actually covers what a business needs — is listed at ~$37–45/user/mo across 45+ apps you have to set up and connect yourself. There's no white-label option, and nothing purpose-built for a local business's front office: no AI receptionist, no booking-calendar-plus-agent flow, and weak native marketing tools.",
      "That said, Zoho is impressive. The value and breadth are real, the CRM customization is deep, and Zia AI adds genuinely useful predictive features. For a business willing to spend the time configuring a 45-app suite around its exact workflow, it's an enormous amount of platform per dollar. But most local service businesses don't want to assemble a suite. They want the phone answered and the job booked, today.",
    ],
    them: {
      bestFor: "Businesses willing to configure a broad, per-user app suite around their workflow",
      pricingModel: "CRM Standard $20/user/mo ($14 annual) → Enterprise $40/user; Zoho One listed at ~$37–45/user/mo",
      aiReceptionist: "None — Zia AI assists inside CRM workflows, not phone or SMS answering",
      frontOffice: "Partial — deep CRM customization; website/booking/marketing require separate Zoho apps and setup",
      whitelabel: "None — not built for agency resale",
      aiCosts: "Bundled into per-user, per-edition pricing",
      resale: "No native agency reseller program",
    },
    switchReasons: [
      {
        title: "Nothing to assemble",
        body: "Zoho One is 45+ apps you have to set up and connect yourself. SeldonFrame builds a working front office — site, CRM, booking, agent — from one conversation.",
      },
      {
        title: "Flat $29, not per-user, per-edition math",
        body: "Zoho's pricing multiplies by users and edition. SeldonFrame is $29/mo flat no matter your team size.",
      },
      {
        title: "An AI receptionist Zia doesn't provide",
        body: "Zia assists inside CRM workflows. SeldonFrame's agent actually answers the phone, qualifies the lead, and books the job.",
      },
      {
        title: "Whitelabel for agencies",
        body: "Zoho has no agency resale model. SeldonFrame includes branded client workspaces at $29/mo.",
      },
    ],
    whenTheyWin:
      "Choose Zoho if you want maximum CRM customization and app breadth per dollar, and have the time to configure a suite around your exact workflow.",
    faq: [
      {
        q: "Is SeldonFrame as customizable as Zoho's CRM?",
        a: "SeldonFrame's CRM is purpose-built for the local-service front-office job — contacts, deals, bookings, review automation — rather than a general-purpose, deeply configurable CRM. If you need Zoho-level customization across 45 apps, Zoho goes further. If you need a working system today, SeldonFrame builds one.",
      },
      {
        q: "Does Zia AI compare to SeldonFrame's agent?",
        a: "No. Zia is a CRM copilot for your team. SeldonFrame's agent is customer-facing: it answers calls, SMS, and chat, qualifies leads, and books jobs directly.",
      },
    ],
  },
  {
    slug: "salesforce",
    name: "Salesforce",
    category: "enterprise CRM",
    pricingSourceUrl: "https://www.salesforce.com/small-business/pricing/",
    oneLiner:
      "Salesforce is the enterprise CRM standard, now also selling to small businesses through Starter and Pro Suite editions.",
    heroSub:
      "Enterprise CRM admin overhead doesn't fit a local service business. SeldonFrame gives every client an AI receptionist, website, CRM, and booking system for $29/mo flat, no admin required.",
    intro: [
      "Most people looking for a Salesforce alternative for a local service business hit the same wall: it's built for enterprise, and it shows even in the cheaper editions. Starter runs $25/user/mo, Pro Suite $100/user/mo, and Agentforce editions are listed at up to $550/user/mo — with extra add-ons and real admin work needed just to set up and maintain even the entry tiers. There's no white-label option, thin native marketing, funnel, and SMS tools for local businesses, and per-user pricing that hurts a small team.",
      "That said, Salesforce is impressive. Its brand trust, compliance standing, near-limitless customization through AppExchange, and its Agentforce AI agent platform are genuinely unmatched at enterprise scale. If you're building for a large, complex sales org, nothing goes further. But a local service business doesn't need an admin-managed enterprise CRM. It needs its phone answered and its jobs booked, this week.",
    ],
    them: {
      bestFor: "Large, complex sales organizations needing enterprise CRM depth",
      pricingModel: "Starter $25/user/mo; Pro Suite $100/user/mo; Agentforce editions listed at up to $550/user",
      aiReceptionist: "None natively for phone/SMS — Agentforce builds custom AI agents at enterprise pricing and complexity",
      frontOffice: "Partial — deep CRM and reporting; marketing/funnel/SMS need add-ons; no native booking-into-front-office flow",
      whitelabel: "None — not built for agency resale",
      aiCosts: "Agentforce priced per-user on top of CRM editions",
      resale: "No native agency reseller program",
    },
    switchReasons: [
      {
        title: "No admin overhead",
        body: "Salesforce needs setup and often a dedicated admin even at entry tiers. SeldonFrame builds a working front office from one conversation — no admin required.",
      },
      {
        title: "Flat $29, not per-user enterprise editions",
        body: "Salesforce pricing climbs per user, per edition, with Agentforce add-ons on top. SeldonFrame is $29/mo flat.",
      },
      {
        title: "A receptionist built in, not a custom Agentforce build",
        body: "Building a phone-answering agent on Agentforce is an enterprise project. SeldonFrame's receptionist is already built and ready to answer calls right away.",
      },
      {
        title: "Whitelabel for agencies",
        body: "Salesforce has no agency resale model. SeldonFrame includes branded client workspaces at $29/mo.",
      },
    ],
    whenTheyWin:
      "Choose Salesforce if you're running a large, complex sales organization that needs enterprise compliance, deep customization, and the AppExchange ecosystem.",
    faq: [
      {
        q: "Is SeldonFrame's agent comparable to Salesforce Agentforce?",
        a: "Agentforce is a platform for building custom AI agents inside Salesforce's enterprise CRM, at enterprise pricing and complexity. SeldonFrame ships a working AI receptionist — voice, SMS, and chat, booking into a real calendar — built from a conversation, purpose-built for local service businesses rather than assembled for enterprise sales orgs.",
      },
      {
        q: "Do I need an admin to run SeldonFrame like Salesforce?",
        a: "No. SeldonFrame is built and configured from natural language, with no dedicated admin role or certification needed to run it.",
      },
    ],
  },
  {
    slug: "claude-projects",
    name: "Claude Projects",
    category: "DIY workflow",
    pricingSourceUrl: "https://www.anthropic.com/pricing",
    oneLiner:
      "Claude Projects is Anthropic's persistent-workspace feature — standing instructions plus a knowledge base that load into every conversation, which many agencies hand-build once per client.",
    heroSub:
      "One hand-built Claude Project per client is the DIY version of an AI front office. SeldonFrame generates the brief, the knowledge base and the retrieval tests — and attaches the website, CRM, booking calendar and receptionist that actually do the work — per client, automatically, at $29/mo flat.",
    intro: [
      "Most agencies who run client work through Claude Projects hit the same wall: everything the setup guides prescribe — write the standing brief, curate tight 1–3 page knowledge docs, test retrieval, review quarterly — is manual labor, repeated per client, forever. Conversations inside a project don't share history with each other, the output is chat text you still have to carry into other tools by hand, nothing answers the client's phone or books a job while you sleep, and the whole thing lives inside YOUR Claude account — there's nothing a client can log into, nothing to whitelabel, and a per-person subscription that doesn't scale into a book of business.",
      "That's not to say Claude Projects isn't excellent — for your OWN context-rich work (research, writing, strategy) it's the best manual setup there is, and the discipline it teaches (standing briefs, tight grounded knowledge, testing retrieval before trusting it) is exactly the right philosophy. SeldonFrame's honest pitch is that it automates that same philosophy per client and attaches the business system: the Soul is the standing brief, the grounded FAQ/services are the tight docs, and auto-evals are 'test retrieval before you trust it' made mechanical.",
    ],
    them: {
      bestFor: "Individuals running their own context-rich Claude workflows",
      pricingModel: "Claude Pro ~$20/mo or Max from ~$100/mo per person; free plan caps at 5 projects without custom instructions",
      aiReceptionist: "None — you chat with Claude yourself; nothing answers your clients' calls or website visitors",
      frontOffice: "None — no website, CRM or booking; outputs are chat messages you copy into other tools",
      whitelabel: "None — projects live in your Claude account; clients can't log in",
      aiCosts: "Flat per-person subscription with usage limits",
      resale: "No",
    },
    switchReasons: [
      {
        title: "The brief writes itself",
        body: "Paste the client's website and SeldonFrame generates what your Project setup guide told you to hand-write: the standing brief (the Soul), the tight grounded knowledge, the scope — and keeps it current instead of drifting until the quarterly review.",
      },
      {
        title: "Retrieval testing is automated",
        body: "The guides say 'test that Claude can actually retrieve each document before trusting it.' SeldonFrame runs that as auto-evals on every agent, every publish — the never-lies gate, not a five-minute manual ritual per client.",
      },
      {
        title: "Chat can't answer the phone",
        body: "A Project produces text when you show up to ask. SeldonFrame's agents execute: they answer calls and webchat, qualify the lead, check real availability, and book the job into the client's own calendar and CRM — 24/7, without you in the loop.",
      },
      {
        title: "Clients get a login; you get a book of business",
        body: "Projects are trapped in your personal account. SeldonFrame gives every client a whitelabeled sub-account and portal under your brand — the difference between a workflow you run and a product you sell.",
      },
    ],
    whenTheyWin:
      "Keep Claude Projects for your OWN thinking, research and writing — it's the best manual setup there is for single-player context work (we use it too). The switch point is the moment the work belongs to a client.",
    faq: [
      {
        q: "Is SeldonFrame built on Claude Projects?",
        a: "No — SeldonFrame is its own platform. But it's BYOK, so your agents can run on your own Claude API key, and it's MCP-native, so you can build and manage workspaces from Claude itself. The philosophy — tight grounded context, tested before trusted — is the same; SeldonFrame automates it per client.",
      },
      {
        q: "Can I keep using Claude Projects alongside SeldonFrame?",
        a: "Yes, and many builders do: draft strategy and copy in your own Projects, then deploy the client-facing system — site, receptionist, CRM, booking — on SeldonFrame, where the client can actually log in and the agent actually executes.",
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
