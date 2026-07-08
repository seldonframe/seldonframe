// Per-competitor EXTRAS for the /alternative-to-* pages — pros/cons, the
// "who should use which" reasons, and the switch note — plus the shared
// SF pros/cons, the how-to-switch steps, the CTA hrefs, and the curated
// /compare/<a>-vs-<b> pairs. Split from alternative-pages.ts to keep the core
// registry (already shipped) stable; ALWAYS update both files together when a
// competitor's facts change. Facts researched 2026-07-07 from live pricing
// pages; same honesty rules as the core registry.

import { getCompetitor, type Competitor } from "@/lib/seo/alternative-pages";

export const START_HREF = "/signup";
/** SeldonFrame-branded 15-min demo booking (bookings template row on the
 *  seldonframe workspace — see the booking_slug='default' template). */
export const DEMO_HREF = "https://app.seldonframe.com/book/seldonframes-workspace-7798/default";

export type CompetitorExtras = {
  /** Competitor pros/cons for the two-card section (honest, sourced). */
  pros: string[];
  cons: string[];
  /** "Who should use <them>" — 3 numbered reasons. */
  chooseThem: string[];
  /** "Who should use SeldonFrame instead" — 4 numbered reasons. */
  chooseSf: string[];
  /** Competitor-specific line inside the how-to-switch steps. */
  switchNote: string;
};

/** SeldonFrame's own pros/cons — identical on every page, honest. */
export const SF_PROS: string[] = [
  "An AI receptionist that answers calls, SMS, and web chat — and books real jobs into a real calendar and CRM",
  "The whole front office included: multi-page website, CRM, booking, intake forms, review automation",
  "$29/mo flat with unlimited workspaces — bring your own key and AI and phone service run at raw provider cost",
  "Whitelabel built in: branded client portal, per-client workspaces, custom domains, one-click multi-client deploy",
  "Build it free before you sign up — paste a URL, get a working workspace in about 3 minutes",
  "Open core and portable — your agents are plain, editable skill files, and your data lives in your workspace",
];
export const SF_CONS: string[] = [
  "No funnel-builder or email-campaign suite — it's a front office, not a marketing automation platform",
  "You bring your own key (Claude, ChatGPT, or Gemini, plus optional Twilio) — setup takes a few minutes",
  "Newer platform — a smaller template library and community than decade-old incumbents",
  "No native mobile app yet (the dashboard works fine on a phone browser)",
];

/** The generic how-to-switch ladder; step 2 is per-competitor (switchNote). */
export const SWITCH_STEPS: { title: string; body: string }[] = [
  {
    title: "Build the replacement free (3 minutes)",
    body: "Paste the business's website into seldonframe.com. SeldonFrame pulls out services, FAQs, and business facts and builds the workspace: site, CRM, booking calendar, intake, and the AI agent. No account needed until you claim it.",
  },
  {
    title: "Bring what matters over",
    body: "", // filled per-competitor via switchNote
  },
  {
    title: "Connect your keys and number",
    body: "Add your AI key (Claude, ChatGPT, or Gemini — about 30 seconds) and, for phone, connect your Twilio number so calls and missed-call text-back run at carrier cost.",
  },
  {
    title: "Test the agent, then go live",
    body: "Every agent ships with automatic tests. Talk to it, watch it book into the calendar, then publish. Point your domain over when the site's ready.",
  },
  {
    title: "Run both in parallel for a week",
    body: "Keep the old tool running while SeldonFrame answers the phones. Cancel it once the CRM shows the bookings landing — cancel-anytime on both sides means zero risk.",
  },
];

export const EXTRAS: Record<string, CompetitorExtras> = {
  gohighlevel: {
    pros: [
      "The broadest agency toolbox anywhere: funnels, email/SMS campaigns, courses, pipelines",
      "True white-label reselling on the $497/mo plan",
      "A huge library of templates and a big community",
      "Month-to-month, no long-term contract",
    ],
    cons: [
      "AI Employee is a $50–$97/mo per-location add-on, with per-minute voice usage on top of that",
      "Users say it takes 2–4 weeks to learn before the platform earns its keep",
      "Usage fees (SMS, email, voice) add up per client as you grow",
      "No option to bring your own key — AI runs through GHL's own billing at GHL's rates",
    ],
    chooseThem: [
      "Your core deliverable is funnels and email-campaign automation",
      "You want the biggest template library to buy pre-built assets from",
      "You're already trained on it and the stacked costs still work out at your client count",
    ],
    chooseSf: [
      "You sell the AI front office — answered calls, booked jobs — not funnels",
      "You want per-client costs that don't stack ($29 flat, unlimited workspaces, bring your own key)",
      "You want a new client live in 3 minutes, not after a setup project",
      "You want whitelabel without the $497/mo gate",
    ],
    switchNote:
      "Export your contacts from GoHighLevel (Contacts → Export CSV) and re-import them. Your Twilio number can point at SeldonFrame the moment you're ready to switch call handling.",
  },
  vapi: {
    pros: [
      "Full control over every piece of the voice stack (choice of STT/LLM/TTS)",
      "The bring-your-own-API-key option removes markup on model costs",
      "A large developer community and ecosystem",
      "SOC 2, HIPAA, and PCI options for enterprise builds",
    ],
    cons: [
      "Real-world cost is ~$0.25–$0.33/min — 5–6× the advertised $0.05 hosting fee",
      "Most real setups need actual coding despite the no-code framing",
      "Complaints about support and docs, plus agents breaking after platform updates",
      "Voice-only — no CRM, website, booking calendar, or client dashboard",
    ],
    chooseThem: [
      "You're an engineering team building a custom voice product",
      "You need full control over each piece (custom STT/TTS pipelines, custom orchestration)",
      "You have developers on staff to own setup and maintenance",
    ],
    chooseSf: [
      "You want a working receptionist without the engineering project",
      "Your deliverable needs to include the CRM, website, and calendar the agent books into",
      "You want flat, easy-to-read per-client costs instead of stacked per-minute pieces",
      "You need a whitelabel layer to hand to clients — Vapi has none",
    ],
    switchNote:
      "Your prompts and call flows carry over directly: paste your Vapi assistant's system prompt into the agent's skill file, and point your Twilio number at SeldonFrame when you're ready.",
  },
  "retell-ai": {
    pros: [
      "Clear, itemized pay-as-you-go pricing with free credit to start",
      "Deep configurability for technical teams",
      "20 free concurrent calls included",
      "Certified-partner program for referrals",
    ],
    cons: [
      "Per-minute add-ons stack: knowledge base, guardrails, PII removal, and QA each bill separately",
      "No built-in whitelabel dashboard — a third-party wrapper industry exists to fill the gap",
      "API-first: no ready-made templates, every client is an integration project",
      "Voice/chat only — no CRM, website, or booking system",
    ],
    chooseThem: [
      "You're a developer who values itemized infrastructure pricing",
      "You're building your own product on voice rails, not delivering client front offices",
      "You want fine-grained control of every piece of the pipeline",
    ],
    chooseSf: [
      "You'd otherwise be buying Retell PLUS a wrapper PLUS a CRM PLUS a calendar",
      "You want new clients live from a template in minutes",
      "You want the whitelabel client portal built in, not from a third party",
      "You want costs that don't bill per minute per feature",
    ],
    switchNote:
      "Bring your agent's system prompt and knowledge-base docs — they drop straight into the SeldonFrame agent's skill and knowledge. Your phone number re-points in one setting.",
  },
  synthflow: {
    pros: [
      "Genuinely no-code, with useful templates for specific industries",
      "A real agency setup: sub-accounts, client pricing controls",
      "Bundled per-minute pricing is simpler than raw component math",
      "Managed or bring-your-own-Twilio telephony",
    ],
    cons: [
      "Whitelabel is listed at $2,000/mo (or ~$30k/yr enterprise contracts)",
      "Per-minute costs stack (engine + LLM + telephony) — hard to quote for busy clients",
      "Cost is the #1 complaint in public reviews",
      "Voice-only — the CRM, site, and calendar live elsewhere",
    ],
    chooseThem: [
      "You want a mature template library for pure phone agents",
      "Your clients' CRM and calendar are settled and staying put",
      "You can absorb the whitelabel add-on price at your scale",
    ],
    chooseSf: [
      "You want the whitelabel agency layer at $29, not $2,000",
      "You want the receptionist to book into a system the client actually owns",
      "You want raw-cost AI and telephony (bring your own key) instead of stacked per-minute pricing",
      "You want the site, CRM, and booking built alongside the agent, not assembled around it",
    ],
    switchNote:
      "Recreate your Synthflow flows as plain-language skills (most receptionist flows come down to: greet, qualify, check availability, book, take message) and re-point your Twilio number.",
  },
  chatbase: {
    pros: [
      "The fastest setup for a train-on-your-data support chatbot",
      "Strong content ingestion and a long list of integrations",
      "A category-defining product with lots of tutorials",
      "A reasonable entry price for low-volume FAQ bots",
    ],
    cons: [
      "Credit cliffs: $120/mo jumps to $400/mo with nothing in between; $40/1,000 overage",
      "Chat-only — no phone answering, no SMS receptionist",
      "Booking and CRM writes require you to build custom actions yourself",
      "Removing the branding costs $1,188/yr below Enterprise",
    ],
    chooseThem: [
      "You need a pure documentation or support chatbot on a content site",
      "Message volume is modest and predictable",
      "Deflecting chats — not booking revenue — is the goal",
    ],
    chooseSf: [
      "Your clients lose money on unanswered PHONES, not unanswered FAQs",
      "You want the bot to actually book jobs into a real calendar and CRM",
      "You don't want message credits to outgrow — your key, provider cost",
      "You want whitelabel without an enterprise contract",
    ],
    switchNote:
      "Point SeldonFrame at the same website you trained Chatbase on. The agent grounds itself on the same content, and the site, CRM, and booking build alongside it.",
  },
  botpress: {
    pros: [
      "An open-source core — real extensibility and self-hosting",
      "Developer-friendly for custom logic and running multiple bots",
      "The May 2026 pricing update bundled AI spend and unlimited bots",
      "A generous free tier (100 conversations/mo)",
    ],
    cons: [
      "Needs real engineering to set up and maintain",
      "A history of costs stacking (subscription plus AI spend plus channel fees)",
      "Chat-first — a ready-made phone receptionist isn't the product",
      "No built-in agency resale program",
    ],
    chooseThem: [
      "You have engineers and need code-level control",
      "You want to self-host the conversational layer",
      "You're building a custom conversational product, not client front offices",
    ],
    chooseSf: [
      "You want the finished result, not the rails to build it yourself",
      "Phones matter: a voice-first receptionist with SMS and chat on one brain",
      "You deploy per client in one click instead of custom build work per bot",
      "You want one flat bill instead of three separate ones",
    ],
    switchNote:
      "Your knowledge bases and intents map onto the agent's knowledge and skills. Most Botpress front-office bots come down to SeldonFrame's built-in receptionist plus a few FAQ entries.",
  },
  "stammer-ai": {
    pros: [
      "Purpose-built for agency resale: unlimited client resale, agencies keep the markup",
      "Both chat AND voice agents, built in",
      "A real white-label dashboard at a price small agencies can afford ($197/mo)",
      "No cut taken on what agencies charge",
    ],
    cons: [
      "Agent-only: no CRM, website, or booking calendar — you still build a stack per client",
      "Usage fees (~$0.11–$0.17/min voice; per-message chat) stack on top of the subscription",
      "No HIPAA option — regulated industries are out",
      "A closed platform; some reports of struggling with complex queries",
    ],
    chooseThem: [
      "Agents-as-a-product is your entire offer",
      "Your clients' CRM, site, and calendar are settled and staying put",
      "You want a mature whitelabel chat-agent dashboard today",
    ],
    chooseSf: [
      "You'd rather sell the whole front office ($300–800/mo retail) than a chatbot subscription",
      "You want the agent writing to a CRM and calendar the client actually owns",
      "You want your own margins instead of platform usage rates",
      "$29 flat vs $197 plus usage changes your per-client math",
    ],
    switchNote:
      "Recreate each client agent from its prompt and FAQ (SeldonFrame builds most of it from the client's website), and re-point any embedded chat widgets to the new embed snippet.",
  },
  podium: {
    pros: [
      "The category leader in review generation and business texting",
      "AI Employee is a real, genuine product",
      "Broad channel coverage under one login",
      "Established brand trust with small and mid-size businesses",
    ],
    cons: [
      "Quote-only pricing; real reported bills run $400–$1,200/mo for multi-location businesses",
      "AI Employee is a $99–$399/mo add-on on an already-expensive base",
      "People who switch away say they used only about 20% of what they paid for",
      "Reports of trouble cancelling and support complaints",
    ],
    chooseThem: [
      "You're a multi-location brand whose growth engine is review volume at scale",
      "Centralized team texting across locations is the daily workflow",
      "Budget isn't the constraint",
    ],
    chooseSf: [
      "You want public, flat pricing you can try before any sales call",
      "You need the receptionist plus site plus CRM plus booking, not a bundle of modules",
      "Review requests are included, not the whole product",
      "You're an agency — Podium won't whitelabel for you",
    ],
    switchNote:
      "Export your contacts from Podium and import them. Your review-request flow recreates as the built-in review agent, firing after completed jobs.",
  },
  vendasta: {
    pros: [
      "A deep white-label marketplace of resellable products",
      "A mature multi-location and sub-account portal",
      "Prospecting reports are a real sales tool",
      "Serious platform investment in AI (a voice receptionist is shipping)",
    ],
    cons: [
      "Minimum-spend pricing ($99–$999/mo) — the sticker isn't the real cost",
      "12-month contracts on the tiers agencies actually need",
      "Onboarding reportedly takes 4–8 weeks",
      "The AI Voice Receptionist only comes with the ~$999/mo Premium minimum, and minutes are capped",
    ],
    chooseThem: [
      "Your model is reselling a broad catalog of third-party digital products",
      "You lean on prospecting reports for outbound sales",
      "You're big enough that the minimum spend is a rounding error",
    ],
    chooseSf: [
      "You want the AI receptionist as the core product, not a top-tier perk",
      "You want month-to-month flat pricing with no minimum spend",
      "You want clients live in minutes, not a 4–8 week onboarding",
      "You want unlimited client workspaces included at $29",
    ],
    switchNote:
      "Your client list imports as contacts. Each client workspace rebuilds from their website in about 3 minutes — no marketplace product mapping needed.",
  },
  goodcall: {
    pros: [
      "Predictable per-caller pricing with unlimited minutes",
      "Genuinely no-code and fast to launch",
      "Comes from Google's Area 120 incubator — a solid reliability story",
      "A fair fit for simple, repeat-caller businesses",
    ],
    cons: [
      "Listed at $79/$129/$249 per agent/mo with unique-caller caps (100–500/mo) and $0.50/caller overage",
      "Good at single-turn questions — multi-step conversations struggle",
      "No CRM, website, or booking calendar it owns",
      "No published agency or whitelabel program",
    ],
    chooseThem: [
      "You're a single location with lots of repeat callers",
      "Your calls are simple FAQs, not multi-step booking conversations",
      "Per-caller pricing fits how your traffic works",
    ],
    chooseSf: [
      "You want multi-step conversations that end in a booked job",
      "You want every call logged in a CRM you own, with automatic follow-ups",
      "You want SMS text-back and web chat on the same brain",
      "You're an agency — Goodcall has no whitelabel option",
    ],
    switchNote:
      "Bring your FAQ answers (they paste straight into the agent's knowledge) and re-point your number. Booking flows come built in instead of needing to be configured.",
  },
  voiceflow: {
    pros: [
      "One of the best visual builders for complex, branching conversations",
      "Real multi-channel support (voice plus chat), handling calls at the same time",
      "Fine-grained control for technical conversation designers",
      "Credible enterprise deployments",
    ],
    cons: [
      "Seats ($60–$150/mo each) plus credits plus telephony — three separate bills",
      "No mid-cycle credit top-ups — bots stop responding once you hit the ceiling",
      "A steep learning curve; conversation design is real work for every agent",
      "No CRM, site, or booking, and no formal whitelabel tier",
    ],
    chooseThem: [
      "Conversation design IS your product (complex branching experiences)",
      "You have dedicated conversation designers on the team",
      "You need enterprise-grade control over orchestration",
    ],
    chooseSf: [
      "You want working receptionists built for you, not designed node-by-node",
      "You want no per-seat fees and no credit ceilings",
      "You want the business system (CRM, site, booking) with the agent",
      "You want per-client whitelabel deployment in one click",
    ],
    switchNote:
      "Most front-office Voiceflow canvases come down to SeldonFrame's built-in receptionist skill. Copy any custom FAQ or knowledge blocks straight into the agent's knowledge.",
  },
  lindy: {
    pros: [
      "A genuinely versatile 'AI employee' for internal work",
      "A big library of templates and use cases",
      "Multi-step task ability across many tools",
      "Fast to experiment with",
    ],
    cons: [
      "No free tier; credit burn varies 1–10× depending on task complexity",
      "No agency, whitelabel, or reseller model at all",
      "Voice is a bolt-on inside a workflow, with the delay to match",
      "Not built for the kind of client flows that must run correctly every time",
    ],
    chooseThem: [
      "You're automating YOUR OWN inbox, research, and scheduling",
      "You want one flexible tool for many small internal tasks",
      "Nobody else will ever see or depend on the automation",
    ],
    chooseSf: [
      "You deliver client-facing systems, not internal automations",
      "You need a real, voice-native phone receptionist",
      "You want flat costs you can build client retainers around",
      "You want whitelabel client workspaces from day one",
    ],
    switchNote:
      "Keep Lindy for your inbox if you like it. Bring the client-facing jobs — answering, qualifying, booking, review requests — to SeldonFrame, where they're actual products.",
  },
  durable: {
    pros: [
      "A site live in about 30 seconds — real, low-friction magic",
      "A usable free tier and clear pricing",
      "Website plus light CRM plus invoicing, bundled cheap",
      "A good enough web presence for a solo operator",
    ],
    cons: [
      "No AI voice or phone answering at all",
      "Sites tend to look alike, with limited differentiation",
      "Reports of friction moving your domain over",
      "No agency whitelabel; top plan caps at 5 businesses",
    ],
    chooseThem: [
      "You just need a cheap, simple website this week",
      "You're a solo operator with no need for call answering",
      "Invoicing plus a contact list is enough of a back office for you",
    ],
    chooseSf: [
      "Your missed calls cost more than your missing website",
      "You want the site, receptionist, CRM, and booking as one system",
      "You're an agency running many client sites under your brand",
      "You want the site grounded in the client's real services and reviews",
    ],
    switchNote:
      "Paste in your Durable site's URL. SeldonFrame rebuilds the workspace from its content in about 3 minutes. Move the domain over once it looks right.",
  },
  "my-ai-front-desk": {
    pros: [
      "The cheapest entry point in the category ($20/mo)",
      "A broader bundle: voice, chat, SMS, and email drafts",
      "A simple credit-based overage model",
      "5-minute self-serve setup, cancel anytime",
    ],
    cons: [
      "200 voice minutes on the $99 plan is about 40 calls before overages kick in (~$0.25/min-equivalent)",
      "Partner/agency tier has no published pricing",
      "No real CRM, website, or booking calendar it owns — Zapier holds it together",
      "A mid-flight rebrand has left pricing info inconsistent across the web",
    ],
    chooseThem: [
      "You want the cheapest possible receptionist add-on",
      "Your call volume is genuinely tiny",
      "You already run your business in Zapier",
    ],
    chooseSf: [
      "You want minutes at carrier cost on your own Twilio, not metered credits",
      "You want the front office behind the receptionist — site, CRM, booking",
      "You're an agency and need public, plannable platform pricing",
      "You want review automation and speed-to-lead on the same rails",
    ],
    switchNote:
      "Re-point your business number to your Twilio plus SeldonFrame, and paste your greeting and FAQ into the agent's skill. The credit meter stays behind.",
  },
  "smith-ai": {
    pros: [
      "Human-in-the-loop quality on complex, sensitive calls",
      "Polished, North-America-based receptionists",
      "A strong reputation with law firms and professional services",
      "Handles genuinely messy intake that shouldn't be left to a pure AI",
    ],
    cons: [
      "Pricing is quote-gated (the pricing page is a sales form)",
      "Per-call billing grows right along with volume — more calls, bigger bill",
      "A service, not a platform: nothing to whitelabel or build on",
      "Your CRM and calendar of record still live somewhere else",
    ],
    chooseThem: [
      "High-stakes intake (legal, sensitive matters) genuinely needs a trained human",
      "Call volume is low and per-call pricing works out for you",
      "You want to outsource the function entirely, not own a system",
    ],
    chooseSf: [
      "You want every call answered instantly, 24/7, for a flat fee",
      "You want calls to END in a booked job inside your own CRM",
      "Volume growth shouldn't grow the receptionist bill",
      "You're an agency — you can resell SeldonFrame; you can't resell Smith.ai",
    ],
    switchNote:
      "Run SeldonFrame as the first line — instant answer plus booking — and keep a human service for escalations if you need one. The agent takes structured messages and notifies you instantly either way.",
  },
  activecampaign: {
    pros: [
      "Best-in-class automation depth for segmented email sequences",
      "A strong deliverability reputation",
      "900+ integrations across the marketing stack",
      "Genuinely powerful for list-based nurture campaigns",
    ],
    cons: [
      "Per-contact pricing climbs steeply with list size (~$15–$145/mo at 1,000 contacts, annual)",
      "No phone or SMS receptionist — email and CRM only",
      "No white-label option for agencies",
      "Inactive and unsubscribed contacts often still count toward the bill",
    ],
    chooseThem: [
      "Segmented email automation is your core deliverable",
      "You need deep integration with 900+ marketing tools",
      "Your business runs on newsletter and broadcast sequences",
    ],
    chooseSf: [
      "Your clients lose money on unanswered phones, not unopened emails",
      "You want flat $29/mo pricing that doesn't grow with your contact list",
      "You want the whole front office — site, CRM, booking — not just email",
      "You need whitelabel for agency resale, which ActiveCampaign doesn't offer",
    ],
    switchNote:
      "Export your ActiveCampaign contacts to CSV and import them. Recreate your top nurture sequences as SeldonFrame's event-triggered follow-ups (new lead, missed call, completed booking).",
  },
  hubspot: {
    pros: [
      "Category-leading CRM depth, reporting, and enterprise polish",
      "Scales further than almost anything else for complex B2B pipelines",
      "The free CRM tier is genuinely usable to start",
      "Breeze AI helps with content and deal insights",
    ],
    cons: [
      "Roughly a 40x price jump from Starter ($15/seat) to Pro (~$800/mo plus $3,000 onboarding)",
      "AI features are billed on credits on top of seat pricing",
      "No white-label option at any price",
      "SMS and voice both need third-party add-ons",
    ],
    chooseThem: [
      "You're a funded B2B team needing enterprise pipeline reporting",
      "You need deep marketing attribution modeling",
      "Your budget supports the Pro/Enterprise tiers and the onboarding fee",
    ],
    chooseSf: [
      "You need a phone-answering agent, not just a smarter CRM",
      "You want SMS and voice included, not bolted-on add-ons",
      "You want to skip the 40x pricing jump and the mandatory onboarding fee",
      "You're an agency and need whitelabel client workspaces",
    ],
    switchNote:
      "Export your HubSpot contacts and deals to CSV and import them. SeldonFrame's agent takes over answering and booking while your Breeze-generated content stays in place.",
  },
  clickfunnels: {
    pros: [
      "Converting templates built for fast solo launches",
      "A strong Brunson ecosystem of courses and community",
      "Purpose-built checkout and upsell flows for digital offers",
      "Established playbooks for offer-sellers",
    ],
    cons: [
      "Contact caps at every tier (10k on Launch, rising but still capped on higher tiers)",
      "No phone, SMS, or chat answering at all",
      "A thin CRM — built for capturing leads, not running a business",
      "No white-label or agency reseller model",
    ],
    chooseThem: [
      "You're selling a single digital offer through a converting funnel",
      "You want the Brunson-ecosystem templates and community",
      "Funnel conversion, not phone answering, is your growth lever",
    ],
    chooseSf: [
      "Your leads call in as often as they click through",
      "You want no contact caps to run into",
      "You need a real CRM and booking calendar behind the funnel",
      "You're an agency needing whitelabel client delivery",
    ],
    switchNote:
      "Keep any funnel pages that convert well, and point their booking and contact forms at your new SeldonFrame workspace so leads land in a CRM with an AI agent following up.",
  },
  keap: {
    pros: [
      "A mature automation engine built over nearly two decades",
      "Native invoicing and payments",
      "A strong onboarding culture and support reputation",
      "Deep CRM tagging and pipeline customization",
    ],
    cons: [
      "Starts at $299/mo for just 2 users and 1,500 contacts — roughly 3x GHL's entry price",
      "$39 per extra user, plus a paid setup package",
      "No AI receptionist or phone/SMS answering",
      "Roadmap uncertainty as features fold into Thryv after the acquisition",
    ],
    chooseThem: [
      "You have years of mature Keap automations already built",
      "Invoicing and payments are central to your workflow",
      "The acquisition-era changes don't concern your use case",
    ],
    chooseSf: [
      "You want a third of Keap's entry price with no per-user fee",
      "You need an AI receptionist Keap doesn't offer",
      "You want a website and AI-driven booking, not just CRM and invoicing",
      "You want a platform on a stable, undivided roadmap",
    ],
    switchNote:
      "Export your Keap contacts to CSV and import them. Run both platforms in parallel for a week while the AI receptionist takes over call handling, then cancel Keap.",
  },
  linktree: {
    pros: [
      "A 60-second setup with genuine mind-share among creators",
      "A usable free tier",
      "The fastest way to bring social links together on one page",
      "Simple, familiar to any audience",
    ],
    cons: [
      "One page of links — no CRM, booking, automation, or business system",
      "A 9–12% commission on sales below the $35/mo Premium tier",
      "No phone, SMS, or chat ability at all",
      "A rented touchpoint, not a business asset you own",
    ],
    chooseThem: [
      "You're a creator who only needs one bio link",
      "Your content and social profiles are the whole business",
      "You have no need for a CRM, booking, or phone answering",
    ],
    chooseSf: [
      "You need a real multi-page website, not a link page",
      "You want an AI receptionist that answers calls and books jobs",
      "You don't want a sales commission on what you sell",
      "You want a CRM and calendar behind every lead that clicks through",
    ],
    switchNote:
      "Point your social bio link at your new SeldonFrame website once it's live. The site includes its own service pages, booking, and contact options in place of the link list.",
  },
  kartra: {
    pros: [
      "Deep course, membership, and video tools for creator businesses",
      "Built-in affiliate management",
      "A native helpdesk alongside checkout",
      "All-in-one for a coach or course seller's exact needs",
    ],
    cons: [
      "Contact caps at every tier — Essentials caps at just 500 contacts",
      "No phone, SMS, or chat AI agent",
      "No white-label or sub-account option for agencies",
      "No local-business tools — not built for service businesses",
    ],
    chooseThem: [
      "You're a creator or coach selling courses or memberships",
      "You want built-in affiliate management and a helpdesk",
      "Video or membership hosting is core to your offer",
    ],
    chooseSf: [
      "You're a service business, not a course seller",
      "You want no contact cap to outgrow",
      "You need an AI receptionist Kartra doesn't offer",
      "You're an agency needing whitelabel client workspaces",
    ],
    switchNote:
      "Export your Kartra contacts to CSV and import them. SeldonFrame's booking calendar replaces any client-scheduling workflows you'd built around Kartra's checkout pages.",
  },
  sharpspring: {
    pros: [
      "Unlimited users on a flat agency plan",
      "VisitorID website tracking, ahead of its time",
      "Deep agency roots and workflow familiarity",
      "Established integrations for agencies already on it",
    ],
    cons: [
      "Pricing is quote-gated — commonly cited at ~$449/mo per 1,000 contacts",
      "Reported to be in maintenance mode since the Constant Contact acquisition",
      "No phone, SMS, or chat AI receptionist",
      "No local-business front-office tools — no website, booking, or intake",
    ],
    chooseThem: [
      "You have a mature agency book already running on SharpSpring",
      "VisitorID tracking is load-bearing for your current workflows",
      "You're comfortable with a platform in maintenance mode",
    ],
    chooseSf: [
      "You want public pricing, not a quote-gated sales call",
      "You want an AI receptionist SharpSpring never built",
      "You want a platform investing forward, not winding down",
      "You want the whole front office, not marketing automation alone",
    ],
    switchNote:
      "Export your SharpSpring contacts to CSV and import them. Recreate any VisitorID-triggered workflows as SeldonFrame's event-triggered agent follow-ups where there's an equivalent.",
  },
  klaviyo: {
    pros: [
      "Best-in-class ecommerce data model and deep Shopify integration",
      "Strong deliverability for high-volume senders",
      "Deep cart-recovery and lifecycle-email flows",
      "Purpose-built for online retail marketing",
    ],
    cons: [
      "Per-profile pricing (~$30–45/mo at 1,000, ~$130/mo at 10,000) that counts suppressed profiles unless you prune them",
      "SMS usage billed on top of profile pricing",
      "No phone, voice, or chat receptionist at all",
      "No agency or white-label model, no funnels, site, or booking calendar",
    ],
    chooseThem: [
      "You're running an ecommerce or Shopify brand",
      "Cart-recovery and lifecycle email/SMS are core to your revenue",
      "Purchase-data-driven segmentation is what you need",
    ],
    chooseSf: [
      "You're a local service business, not an online store",
      "You want flat $29/mo, not per-profile scaling that counts suppressed contacts",
      "You need a phone-answering AI receptionist, which Klaviyo doesn't have",
      "You want a website and booking calendar included, not assumed to exist elsewhere",
    ],
    switchNote:
      "Klaviyo profiles don't map one-to-one to service-business contacts — start fresh by pasting your website into SeldonFrame, then import any existing customer list as a CSV.",
  },
  zoho: {
    pros: [
      "Extreme value and breadth across 45+ apps",
      "Deep, field-level CRM customization",
      "Zia AI adds useful predictive features inside workflows",
      "Strong per-dollar value for businesses willing to configure it",
    ],
    cons: [
      "Assembly required — 45+ apps you have to set up and connect yourself",
      "Per-user, per-edition pricing multiplies with team size",
      "No white-label option for agencies",
      "Weak native local-business front-office tools (booking, receptionist)",
    ],
    chooseThem: [
      "You want maximum CRM customization and app breadth per dollar",
      "You have time to configure a suite around your exact workflow",
      "Your team is large enough that the per-user cost still works out",
    ],
    chooseSf: [
      "You want a working system today, not 45 apps to assemble",
      "You want flat $29/mo, not per-user, per-edition pricing",
      "You need an AI receptionist Zia doesn't provide",
      "You're an agency needing whitelabel client workspaces",
    ],
    switchNote:
      "Export your Zoho CRM contacts to CSV and import them. SeldonFrame's workspace replaces the assembly of separate Zoho apps for site, booking, and receptionist functions.",
  },
  salesforce: {
    pros: [
      "Unmatched brand trust, compliance standing, and customization depth",
      "The AppExchange ecosystem for near-limitless extension",
      "The Agentforce AI agent platform at enterprise scale",
      "Built for large, complex sales organizations",
    ],
    cons: [
      "Per-user pricing climbs fast — Pro Suite $100/user, Agentforce editions up to $550/user",
      "Real admin work needed even at entry tiers",
      "No white-label option for agencies",
      "Thin native marketing, funnel, and SMS tools for local businesses",
    ],
    chooseThem: [
      "You're running a large, complex sales organization",
      "You need enterprise compliance and the AppExchange ecosystem",
      "You have admin resources to set it up and maintain it",
    ],
    chooseSf: [
      "You don't have (or want) a dedicated CRM admin",
      "You want flat $29/mo instead of per-user enterprise editions",
      "You want a receptionist ready immediately, not a custom Agentforce build",
      "You're an agency needing whitelabel client workspaces",
    ],
    switchNote:
      "Export your Salesforce contacts and opportunities to CSV and import them. SeldonFrame's built-in receptionist replaces the need for a custom Agentforce agent build.",
  },
  "claude-projects": {
    pros: [
      "Persistent instructions + knowledge that load into every conversation — no re-briefing",
      "Teaches exactly the right discipline: standing briefs, tight 1–3 page docs, retrieval testing",
      "Available on every Claude plan, with desktop Cowork adding scoped memory and scheduled tasks",
      "Unbeatable for your own research, writing and strategy work",
    ],
    cons: [
      "One manual setup AND ongoing maintenance per client — the labor scales linearly with your client book",
      "Conversations inside a project don't share history with each other",
      "Nothing executes: no calls answered, no jobs booked, no CRM written — output is chat text you carry by hand",
      "No client access, no whitelabel — everything lives in your personal Claude account",
      "Retrieval dilution management (which docs, how tight) is entirely on you",
    ],
    chooseThem: [
      "The work is YOUR OWN thinking — research, writing, strategy, code review",
      "You want a single-player second brain, not a client-facing system",
      "You already live in claude.ai daily and the output's final home is a document",
    ],
    chooseSf: [
      "The work belongs to a CLIENT — they need a site, an answered phone, booked jobs, a CRM",
      "You want the brief + knowledge base generated from the client's website and kept current automatically",
      "You need clients to log in under your brand (whitelabel sub-accounts, portal)",
      "You want the agent to EXECUTE — answer, qualify, book — not just draft text when you show up",
    ],
    switchNote:
      "Paste each client's website — SeldonFrame builds what your Project brief described (the Soul is the standing brief; grounded FAQ/services are the tight docs) and auto-tests retrieval on every publish. Keep your personal Projects for your own thinking; move the client-facing work to a system the client can live in.",
  },
};

export function getExtras(slug: string): CompetitorExtras {
  const hit = EXTRAS[slug];
  if (!hit) throw new Error(`Missing extras for competitor slug: ${slug}`);
  return hit;
}

// ─── /compare/<a>-vs-<b> — curated high-intent pairs ─────────────────────────

export type VsPair = {
  a: string; // competitor slug
  b: string; // competitor slug
  /** One sentence naming the real trade-off between the two. */
  angle: string;
};

export const VS_PAIRS: VsPair[] = [
  { a: "gohighlevel", b: "vendasta", angle: "The two big agency platforms: GoHighLevel's all-in-one toolbox vs Vendasta's resellable product marketplace — both put the AI receptionist behind add-ons or top tiers." },
  { a: "vapi", b: "retell-ai", angle: "The two developer voice-API rivals: Vapi's maximum flexibility vs Retell's clear, itemized pricing — both still leave you building the CRM, calendar, and whitelabel layer yourself." },
  { a: "synthflow", b: "vapi", angle: "No-code templates vs a developer API: Synthflow ships faster, Vapi bends further — neither includes the business system the agent books into." },
  { a: "synthflow", b: "retell-ai", angle: "Synthflow's built-out (but $2,000/mo) whitelabel vs Retell's wrapper-it-yourself approach — agencies pay the agency tax either way." },
  { a: "chatbase", b: "botpress", angle: "The no-code chatbot leader vs the open-source power tool: setup speed vs how deeply you can customize it — both are chat-first and neither answers a phone." },
  { a: "chatbase", b: "voiceflow", angle: "Train-on-your-data simplicity vs conversation-design control — and two different flavors of credit-metered pricing." },
  { a: "voiceflow", b: "botpress", angle: "The two builder's-builders: visual conversation design vs open-source orchestration — both need real technical work per agent." },
  { a: "podium", b: "goodcall", angle: "Quote-gated breadth vs per-caller simplicity for SMB phones — opposite pricing approaches, same missing front office." },
  { a: "stammer-ai", b: "synthflow", angle: "The two whitelabel agent plays: Stammer's $197 agency dashboard vs Synthflow's $2,000 whitelabel add-on — chat-first vs voice-first." },
  { a: "smith-ai", b: "goodcall", angle: "Human-hybrid service vs pure-AI product for answering SMB phones — per-call vs per-caller billing." },
  { a: "gohighlevel", b: "activecampaign", angle: "Full agency toolbox vs automation-first email specialist — GHL stacks per-location AI fees, ActiveCampaign has no phone or SMS layer at all." },
  { a: "gohighlevel", b: "hubspot", angle: "Mid-market agency platform vs enterprise CRM — GHL's AI Employee add-on vs HubSpot's 40x jump from Starter to Pro, neither ships a flat-priced AI receptionist." },
  { a: "gohighlevel", b: "clickfunnels", angle: "Full front office vs pure funnel builder — GHL at least has a CRM and calendar; ClickFunnels caps contacts and has no phone or SMS at all." },
  { a: "gohighlevel", b: "keap", angle: "GHL's usage-metered AI add-on vs Keap's 3x-higher flat entry price — both charge extra for automation depth, and neither pairs it with a native AI receptionist." },
  { a: "gohighlevel", b: "linktree", angle: "A full agency platform vs a single link page — different categories entirely, but neither includes a phone-answering AI agent out of the box." },
  { a: "gohighlevel", b: "kartra", angle: "Agency toolbox vs creator all-in-one — GHL sells to agencies serving local businesses, Kartra sells to coaches selling courses; neither answers a phone." },
  { a: "gohighlevel", b: "sharpspring", angle: "An actively developed agency platform vs one reported in maintenance mode after its acquisition — GHL costs more but is still shipping." },
  { a: "gohighlevel", b: "klaviyo", angle: "Local-business agency platform vs ecommerce email/SMS specialist — GHL serves service businesses, Klaviyo assumes a Shopify cart, and neither has a native voice receptionist." },
  { a: "gohighlevel", b: "zoho", angle: "A ready-to-go agency toolbox vs a 45-app value suite you assemble yourself — GHL costs more upfront, Zoho costs more in setup time." },
  { a: "gohighlevel", b: "salesforce", angle: "Mid-market agency platform vs enterprise CRM standard — GHL undercuts Salesforce's per-user pricing but neither ships a flat-fee AI receptionist without an add-on or custom build." },
  { a: "hubspot", b: "salesforce", angle: "The two enterprise CRM standards: HubSpot's polish vs Salesforce's customization depth — both cost real money to reach, and neither ships a flat-fee AI receptionist." },
  { a: "hubspot", b: "activecampaign", angle: "Enterprise CRM vs email-automation specialist — HubSpot's 40x Starter-to-Pro jump vs ActiveCampaign's per-contact climb; neither answers a phone." },
  { a: "activecampaign", b: "klaviyo", angle: "Two per-contact email platforms for different audiences: ActiveCampaign's B2B automation depth vs Klaviyo's ecommerce data model — neither has a voice receptionist." },
  { a: "clickfunnels", b: "kartra", angle: "The two funnel-and-checkout all-in-ones: ClickFunnels' converting templates vs Kartra's course/membership breadth — both cap contacts and neither answers a phone." },
  { a: "zoho", b: "hubspot", angle: "Value CRM suite vs premium CRM standard — Zoho costs far less per seat but takes real setup time; HubSpot costs far more but is more ready to go out of the box." },
  { a: "keap", b: "activecampaign", angle: "Established SMB CRM-and-invoicing vs deep email-automation — Keap's flat per-user price vs ActiveCampaign's per-contact climb, and neither has an AI receptionist." },
  { a: "salesforce", b: "zoho", angle: "Enterprise CRM standard vs budget-friendly value suite — Salesforce goes further at a much higher per-user cost; Zoho gets close for a fraction of the price with more setup work." },
  { a: "hubspot", b: "clickfunnels", angle: "Enterprise CRM vs solo-operator funnel builder — completely different budgets and audiences, but neither ships a native phone or SMS receptionist." },
  { a: "klaviyo", b: "hubspot", angle: "Ecommerce email/SMS specialist vs general-purpose enterprise CRM — Klaviyo assumes a Shopify cart, HubSpot assumes a sales team; neither answers a phone." },
  { a: "kartra", b: "gohighlevel", angle: "Creator all-in-one vs agency toolbox — Kartra sells courses and memberships, GoHighLevel sells to agencies serving local businesses; neither has a native AI receptionist in the base plan." },
];

export function vsSlug(pair: VsPair): string {
  return `${pair.a}-vs-${pair.b}`;
}

export function getVsPair(slug: string): { pair: VsPair; a: Competitor; b: Competitor } {
  const pair = VS_PAIRS.find((p) => vsSlug(p) === slug);
  if (!pair) throw new Error(`Unknown vs pair: ${slug}`);
  return { pair, a: getCompetitor(pair.a), b: getCompetitor(pair.b) };
}
