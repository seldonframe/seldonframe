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
  "AI receptionist that answers calls, SMS and web chat — and books real jobs into a real calendar and CRM",
  "The whole front office included: multi-page website, CRM, booking, intake forms, review automation",
  "$29/mo flat with unlimited workspaces — BYOK means AI and telephony run at raw provider cost",
  "Whitelabel built in: branded client portal, per-client workspaces, custom domains, one-click multi-client deploy",
  "Build it free before you sign up — paste a URL, get the working workspace in ~3 minutes",
  "Open core and portable — your agents are plain editable skill files, your data lives in your workspace",
];
export const SF_CONS: string[] = [
  "No funnel-builder or email-campaign suite — it's a front office, not a marketing automation platform",
  "Bring-your-own-key setup (Claude/ChatGPT/Gemini + optional Twilio) takes a few minutes",
  "Newer platform — smaller template ecosystem and community than decade-old incumbents",
  "No native mobile app yet (the dashboard is mobile-responsive)",
];

/** The generic how-to-switch ladder; step 2 is per-competitor (switchNote). */
export const SWITCH_STEPS: { title: string; body: string }[] = [
  {
    title: "Build the replacement free (3 minutes)",
    body: "Paste the business's website into seldonframe.com — SeldonFrame extracts services, FAQs and business facts and generates the workspace: site, CRM, booking calendar, intake and the AI agent. No account needed until you claim it.",
  },
  {
    title: "Bring what matters over",
    body: "", // filled per-competitor via switchNote
  },
  {
    title: "Connect your keys and number",
    body: "Add your AI key (Claude, ChatGPT or Gemini — ~30 seconds) and, for phone, connect your Twilio number so calls and missed-call text-back run at carrier cost.",
  },
  {
    title: "Test the agent, then go live",
    body: "Every agent ships with auto-evals; talk to it, watch it book into the calendar, then publish. Point your domain when the site's ready.",
  },
  {
    title: "Run both in parallel for a week",
    body: "Keep the old tool alive while SeldonFrame answers the phones. Cancel when the CRM shows the bookings landing — cancel-anytime on both sides means zero risk.",
  },
];

export const EXTRAS: Record<string, CompetitorExtras> = {
  gohighlevel: {
    pros: [
      "Broadest agency toolbox anywhere: funnels, email/SMS campaigns, courses, pipelines",
      "True SaaS-mode white-labeling on the $497/mo plan",
      "Huge template/snapshot ecosystem and community",
      "Month-to-month, no long-term contract",
    ],
    cons: [
      "AI Employee is a $50–$97/mo per-location add-on, with per-minute voice usage on top",
      "2–4 week learning curve reported before the platform earns its keep",
      "Usage meters (SMS, email, voice) stack per client as you grow",
      "No bring-your-own-key — AI runs through GHL's wallet at GHL's rates",
    ],
    chooseThem: [
      "Your core deliverable is funnels and email-campaign automation",
      "You want the biggest template/snapshot ecosystem to buy pre-built assets from",
      "You're already trained on it and the stacked costs pencil out at your client count",
    ],
    chooseSf: [
      "You sell the AI front office — answered calls, booked jobs — not funnels",
      "You want per-client costs that don't stack ($29 flat, unlimited workspaces, BYOK)",
      "You want a new client live in 3 minutes, not after a snapshot setup project",
      "You want whitelabel without the $497/mo SaaS-mode gate",
    ],
    switchNote:
      "Export your contacts from GoHighLevel (Contacts → Export CSV) and re-import them; your Twilio number can point at SeldonFrame the moment you're ready to switch call handling.",
  },
  vapi: {
    pros: [
      "Component-level control over the whole voice stack (STT/LLM/TTS choice)",
      "BYO-API-key option removes markup on model costs",
      "Large developer community and ecosystem",
      "SOC 2 / HIPAA / PCI options for enterprise builds",
    ],
    cons: [
      "Real-world cost ~$0.25–$0.33/min — 5–6× the advertised $0.05 hosting fee",
      "Most real implementations require actual coding despite the no-code framing",
      "Support and documentation complaints; agents breaking after platform updates",
      "Voice-only — no CRM, website, booking calendar or client dashboard",
    ],
    chooseThem: [
      "You're an engineering team building a custom voice product",
      "You need component-level control (custom STT/TTS pipelines, custom orchestration)",
      "You have developers on staff to own setup and maintenance",
    ],
    chooseSf: [
      "You want the working receptionist without the engineering project",
      "Your deliverable includes the CRM, website and calendar the agent books into",
      "You want flat, legible per-client economics instead of stacked per-minute components",
      "You need a whitelabel layer to hand clients — Vapi has none",
    ],
    switchNote:
      "Your prompts and call flows translate directly: paste your Vapi assistant's system prompt into the agent's skill file, and point your Twilio number at SeldonFrame when you're ready.",
  },
  "retell-ai": {
    pros: [
      "Transparent, itemized pay-as-you-go pricing with free credit to start",
      "Deep configurability for technical teams",
      "20 free concurrent calls included",
      "Certified-partner program for referrals",
    ],
    cons: [
      "Per-minute add-ons stack: knowledge base, guardrails, PII removal, QA each bill separately",
      "No native whitelabel dashboard — a third-party wrapper industry exists to fill the gap",
      "API-first: no vertical templates, every client is an integration project",
      "Voice/chat only — no CRM, website or booking system",
    ],
    chooseThem: [
      "You're a developer who values itemized infrastructure pricing",
      "You're building your own product on voice rails, not delivering client front offices",
      "You want granular control of every pipeline component",
    ],
    chooseSf: [
      "You'd otherwise be buying Retell PLUS a wrapper PLUS a CRM PLUS a calendar",
      "You want new clients live from a template in minutes",
      "You want the whitelabel client portal natively, not from a third party",
      "You want costs that don't meter per minute per feature",
    ],
    switchNote:
      "Bring your agent's system prompt and knowledge-base docs — they drop into the SeldonFrame agent's skill and knowledge; your telephony number re-points in one setting.",
  },
  synthflow: {
    pros: [
      "Genuinely no-code with useful vertical templates",
      "Productized agency motion: sub-accounts, client pricing controls",
      "Bundled per-minute pricing is simpler than raw component math",
      "Managed or BYO-Twilio telephony",
    ],
    cons: [
      "Whitelabel is listed at $2,000/mo (or ~$30k/yr enterprise contracts)",
      "Per-minute costs stack (engine + LLM + telephony) — busy clients are hard to quote",
      "Cost is the #1 complaint theme in public reviews",
      "Voice-only — the CRM, site and calendar live elsewhere",
    ],
    chooseThem: [
      "You want a mature template library for pure phone agents",
      "Your clients' CRM/calendar stack is settled and staying",
      "You can absorb the whitelabel add-on price at your scale",
    ],
    chooseSf: [
      "You want the whitelabel agency layer at $29, not $2,000",
      "You want the receptionist to book into a system the client owns",
      "You want raw-cost AI/telephony (BYOK) instead of stacked per-minute pricing",
      "You want the site + CRM + booking generated with the agent, not assembled around it",
    ],
    switchNote:
      "Recreate your Synthflow flows as plain-language skills (most receptionist flows collapse to: greet, qualify, check availability, book, take message) and re-point your Twilio number.",
  },
  chatbase: {
    pros: [
      "Fastest setup for a train-on-your-data support chatbot",
      "Strong content ingestion and a broad integration list",
      "Category-defining ecosystem with lots of tutorials",
      "Reasonable entry price for low-volume FAQ bots",
    ],
    cons: [
      "Credit cliffs: $120/mo jumps to $400/mo with nothing between; $40/1,000 overage",
      "Chat-only — no phone answering, no SMS receptionist",
      "Booking and CRM writes require custom-action projects",
      "Branding removal costs $1,188/yr below Enterprise",
    ],
    chooseThem: [
      "You need a pure documentation/support chatbot on a content site",
      "Message volume is modest and predictable",
      "Chat deflection — not booked revenue — is the goal",
    ],
    chooseSf: [
      "Your clients lose money on unanswered PHONES, not unanswered FAQs",
      "You want the bot to actually book jobs into a real calendar and CRM",
      "You want no message credits to outgrow — your key, provider cost",
      "You want whitelabel without an enterprise contract",
    ],
    switchNote:
      "Point SeldonFrame at the same website you trained Chatbase on — the agent grounds itself on the same content, and the site/CRM/booking generate alongside it.",
  },
  botpress: {
    pros: [
      "Open-source core — real extensibility and self-hosting",
      "Developer-friendly for custom logic and multi-bot orchestration",
      "May 2026 pricing update bundled AI spend and unlimited bots",
      "Generous free tier (100 conversations/mo)",
    ],
    cons: [
      "Requires real engineering to implement and maintain",
      "History of cost stacking (subscription + AI spend + channel fees)",
      "Chat-first: a turnkey phone receptionist isn't the product",
      "No native agency resale program",
    ],
    chooseThem: [
      "You have engineers and need code-level extensibility",
      "You want to self-host the conversational layer",
      "You're building a custom conversational product, not client front offices",
    ],
    chooseSf: [
      "You want the deployed outcome, not the rails to build it",
      "Phones matter: voice-first receptionist with SMS and chat on one brain",
      "You deploy per client in one click instead of per-bot studio work",
      "You want one flat bill instead of three meters",
    ],
    switchNote:
      "Your knowledge bases and intents map onto the agent's knowledge + skills; most Botpress front-office bots collapse into SeldonFrame's generated receptionist plus a few FAQ entries.",
  },
  "stammer-ai": {
    pros: [
      "Purpose-built agency resale: unlimited client resale, agencies keep the markup",
      "Both chat AND voice agents natively",
      "Real white-label dashboard at a small-agency price ($197/mo)",
      "0% revenue share on what agencies charge",
    ],
    cons: [
      "Agent-only: no CRM, website or booking calendar — you still stitch a stack per client",
      "Usage fees (~$0.11–$0.17/min voice; per-message chat) stack on the subscription",
      "No HIPAA path — regulated verticals are out",
      "Closed platform; reported struggles with complex queries",
    ],
    chooseThem: [
      "Agents-as-a-product is your entire offer",
      "Your clients' CRM/site/calendar stack is settled and staying",
      "You want a mature whitelabel chat-agent dashboard today",
    ],
    chooseSf: [
      "You'd rather sell the whole front office ($300–800/mo retail) than a chatbot subscription",
      "You want the agent writing to a CRM and calendar the client owns",
      "You want BYOK margins instead of platform usage rates",
      "$29 flat vs $197 + usage changes your per-client math",
    ],
    switchNote:
      "Recreate each client agent from its prompt + FAQ (SeldonFrame generates most of it from the client's website), and re-point any embedded chat widgets to the new embed snippet.",
  },
  podium: {
    pros: [
      "Category leader in review generation and business texting",
      "AI Employee is a real, native product",
      "Broad channel coverage under one login",
      "Established brand trust with SMBs",
    ],
    cons: [
      "Quote-only pricing; reported real bills $400–$1,200/mo multi-location",
      "AI Employee is a $99–$399/mo add-on on an already-expensive base",
      "Switchers report using ~20% of what they pay for",
      "Reported cancellation friction and support complaints",
    ],
    chooseThem: [
      "You're a multi-location brand whose growth engine is review volume at scale",
      "Centralized team texting across locations is the daily workflow",
      "Budget isn't the constraint",
    ],
    chooseSf: [
      "You want public, flat pricing you can try before any sales call",
      "You need the receptionist + site + CRM + booking, not a modules bundle",
      "Review requests are included, not the headline product",
      "You're an agency — Podium won't whitelabel for you",
    ],
    switchNote:
      "Export your contacts from Podium and import them; your review-request flow recreates as the built-in review agent firing after completed jobs.",
  },
  vendasta: {
    pros: [
      "Deep white-label marketplace of resellable products",
      "Mature multi-location/sub-account portal",
      "Snapshot prospecting reports are a real sales weapon",
      "Serious platform investment in AI (voice receptionist shipping)",
    ],
    cons: [
      "Minimum-spend pricing ($99–$999/mo) — the sticker isn't the real cost",
      "12-month contracts on the tiers agencies actually need",
      "Onboarding reported at 4–8 weeks",
      "AI Voice Receptionist gated to the ~$999/mo Premium minimum, minutes capped",
    ],
    chooseThem: [
      "Your model is reselling a broad catalog of third-party digital products",
      "You lean on snapshot reports for outbound prospecting",
      "You're big enough that the minimum spend is a rounding error",
    ],
    chooseSf: [
      "You want the AI receptionist as the core product, not a top-tier perk",
      "You want month-to-month flat pricing with no minimum spend",
      "You want clients live in minutes, not a 4–8 week onboarding",
      "You want unlimited client workspaces included at $29",
    ],
    switchNote:
      "Your client list imports as contacts; each client workspace regenerates from their website in ~3 minutes — no marketplace product mapping required.",
  },
  goodcall: {
    pros: [
      "Predictable per-caller pricing with unlimited minutes",
      "Truly no-code, fast to launch",
      "Google Area 120 heritage — solid reliability story",
      "Fair fit for simple, repeat-caller businesses",
    ],
    cons: [
      "Unique-caller caps (100–500/mo) with $0.50/caller overage",
      "Single-turn strength — multi-step conversations struggle",
      "No CRM, website or owned booking calendar",
      "No published agency/whitelabel program",
    ],
    chooseThem: [
      "You're a single location with heavy repeat-caller volume",
      "Your calls are simple FAQs, not multi-step booking conversations",
      "Per-caller pricing fits your traffic shape",
    ],
    chooseSf: [
      "You want multi-turn conversations that end in a booked job",
      "You want every call logged in a CRM you own, with follow-up automation",
      "You want SMS text-back and web chat on the same brain",
      "You're an agency — Goodcall has no whitelabel motion",
    ],
    switchNote:
      "Bring your FAQ answers (they paste into the agent's knowledge) and re-point your number; booking flows come built-in instead of configured.",
  },
  voiceflow: {
    pros: [
      "One of the best visual builders for complex, branching conversations",
      "Real multi-channel (voice + chat) with concurrent call handling",
      "Fine-grained control for technical conversation designers",
      "Credible enterprise deployments",
    ],
    cons: [
      "Seats ($60–$150/mo each) + credits + telephony stack three ways",
      "No mid-cycle credit top-ups — bots stop responding at the ceiling",
      "Steep learning curve; conversation design is real work per agent",
      "No CRM/site/booking and no formal whitelabel tier",
    ],
    chooseThem: [
      "Conversation design IS your product (complex branching experiences)",
      "You have dedicated conversation designers on the team",
      "You need enterprise-grade orchestration control",
    ],
    chooseSf: [
      "You want working receptionists generated, not designed node-by-node",
      "You want no per-seat fees and no credit ceilings",
      "You want the business system (CRM/site/booking) with the agent",
      "You want per-client whitelabel deployment in one click",
    ],
    switchNote:
      "Most front-office Voiceflow canvases collapse to SeldonFrame's generated receptionist skill; copy any custom FAQ/knowledge blocks straight into the agent's knowledge.",
  },
  lindy: {
    pros: [
      "Genuinely versatile 'AI employee' for internal workflows",
      "Big template/use-case library",
      "Multi-step task capability across many tools",
      "Fast to experiment with",
    ],
    cons: [
      "No free tier; credit burn varies 1–10× by task complexity",
      "No agency, whitelabel or reseller model at all",
      "Voice is a workflow bolt-on with latency to match",
      "Not built for deterministic, must-run-correctly client flows",
    ],
    chooseThem: [
      "You're automating YOUR OWN inbox, research and scheduling",
      "You want one flexible tool for many small internal tasks",
      "Nobody else will ever see or depend on the automation",
    ],
    chooseSf: [
      "You deliver client-facing systems, not internal automations",
      "You need a real phone receptionist, voice-native",
      "You want flat costs you can price client retainers on",
      "You want whitelabel client workspaces from day one",
    ],
    switchNote:
      "Keep Lindy for your inbox if you like it — bring the client-facing jobs (answering, qualifying, booking, review requests) to SeldonFrame where they're products.",
  },
  durable: {
    pros: [
      "Site live in ~30 seconds — real low-friction magic",
      "Usable free tier and transparent pricing",
      "Website + light CRM + invoicing bundled cheap",
      "Good enough web presence for a solo operator",
    ],
    cons: [
      "No AI voice/phone answering at all",
      "Template-alike output with limited differentiation",
      "Reported domain-transfer friction",
      "No agency whitelabel; top plan caps at 5 businesses",
    ],
    chooseThem: [
      "You just need a cheap simple website this week",
      "You're a solo operator with no call-answering need",
      "Invoicing + a contact list is enough back office",
    ],
    chooseSf: [
      "Your missed calls cost more than your missing website",
      "You want the site + receptionist + CRM + booking as one system",
      "You're an agency running many client sites under your brand",
      "You want the generated site grounded in the client's real services and reviews",
    ],
    switchNote:
      "Paste your Durable site's URL — SeldonFrame rebuilds the workspace from its content in ~3 minutes; move the domain over when it looks right.",
  },
  "my-ai-front-desk": {
    pros: [
      "Cheapest entry point in the category ($20/mo)",
      "Broadened bundle: voice + chat + SMS + email drafts",
      "Simple credit-based overage model",
      "5-minute self-serve setup, cancel anytime",
    ],
    cons: [
      "200 voice minutes on the $99 plan ≈ 40 calls before overages (~$0.25/min-equivalent)",
      "Partner/agency tier has no published pricing",
      "No real CRM, website or owned booking calendar — Zapier is the glue",
      "Mid-flight rebrand has left pricing info inconsistent across the web",
    ],
    chooseThem: [
      "You want the cheapest possible receptionist bolt-on",
      "Your call volume is genuinely tiny",
      "You already run your business in Zapier",
    ],
    chooseSf: [
      "You want minutes at carrier cost on your own Twilio, not metered credits",
      "You want the front office behind the receptionist — site, CRM, booking",
      "You're an agency and need public, modelable platform pricing",
      "You want review automation and speed-to-lead on the same rails",
    ],
    switchNote:
      "Re-point your business number to your Twilio + SeldonFrame, and paste your greeting/FAQ into the agent's skill — the credit meter stays behind.",
  },
  "smith-ai": {
    pros: [
      "Human-in-the-loop quality on complex, sensitive calls",
      "Polished, North-America-based receptionists",
      "Strong reputation with law firms and professional services",
      "Handles genuinely messy intake a pure AI shouldn't improvise",
    ],
    cons: [
      "Pricing is quote-gated (the pricing page is a sales form)",
      "Per-call billing scales linearly with volume — growth raises the bill",
      "A service, not a platform: nothing to whitelabel or build on",
      "Your CRM/calendar of record still lives elsewhere",
    ],
    chooseThem: [
      "High-stakes intake (legal, sensitive matters) needs a trained human",
      "Call volume is low and per-call pricing pencils out",
      "You want to outsource the function entirely, not own a system",
    ],
    chooseSf: [
      "You want every call answered instantly, 24/7, for a flat fee",
      "You want calls to END in a booked job inside your own CRM",
      "Volume growth shouldn't grow the receptionist bill",
      "You're an agency — you can resell SeldonFrame; you can't resell Smith.ai",
    ],
    switchNote:
      "Run SeldonFrame as the first line (instant answer + booking) and keep a human service for escalations if you need one — the agent takes structured messages and notifies you instantly either way.",
  },
  activecampaign: {
    pros: [
      "Best-in-class automation-builder depth for segmented email sequences",
      "Strong deliverability reputation",
      "900+ integrations across the marketing stack",
      "Genuinely powerful for list-based nurture campaigns",
    ],
    cons: [
      "Per-contact pricing climbs steeply with list size (~$15–$145/mo @1k contacts, annual)",
      "No phone or SMS receptionist — email/CRM only",
      "No white-label layer for agencies",
      "Inactive/unsubscribed contacts often still count toward the bill",
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
      "Export your ActiveCampaign contacts to CSV and import them; recreate your top nurture sequences as SeldonFrame's event-triggered follow-ups (new lead, missed call, completed booking).",
  },
  hubspot: {
    pros: [
      "Category-leading CRM depth, reporting and enterprise polish",
      "Scales further than almost anything else for complex B2B pipelines",
      "Free CRM tier is genuinely usable to start",
      "Breeze AI assists with content and deal insights",
    ],
    cons: [
      "Roughly 40x price cliff from Starter ($15/seat) to Pro (~$800/mo + $3,000 onboarding)",
      "AI features are credit-metered on top of seat pricing",
      "No white-label layer at any price",
      "SMS and voice both require third-party add-ons",
    ],
    chooseThem: [
      "You're a funded B2B team needing enterprise pipeline reporting",
      "You need deep marketing attribution modeling",
      "Budget supports the Pro/Enterprise tiers and onboarding fee",
    ],
    chooseSf: [
      "You need a phone-answering agent, not just a smarter CRM",
      "You want SMS and voice included, not bolted-on add-ons",
      "You want to skip the 40x pricing cliff and mandatory onboarding fee",
      "You're an agency and need whitelabel client workspaces",
    ],
    switchNote:
      "Export your HubSpot contacts and deals to CSV and import them; SeldonFrame's agent takes over answering and booking while your Breeze-generated content stays in place.",
  },
  clickfunnels: {
    pros: [
      "Converting templates built for fast solo launches",
      "Strong Brunson ecosystem of courses and community",
      "Purpose-built checkout and upsell flows for digital offers",
      "Established playbooks for offer-sellers",
    ],
    cons: [
      "Contact caps at every tier (10k on Launch, rising but still capped on higher tiers)",
      "No phone, SMS or chat answering at all",
      "Thin CRM — built for capturing leads, not running a business",
      "No white-label or agency reseller model",
    ],
    chooseThem: [
      "You're selling a single digital offer through a converting funnel",
      "You want the Brunson-ecosystem templates and community",
      "Funnel conversion, not phone answering, is your growth lever",
    ],
    chooseSf: [
      "Your leads call in as often as they click through",
      "You want no contact caps to upgrade past",
      "You need a real CRM and booking calendar behind the funnel",
      "You're an agency needing whitelabel client delivery",
    ],
    switchNote:
      "Keep any funnel pages that convert well, and point their booking/contact forms at your new SeldonFrame workspace so leads land in a CRM with an AI agent following up.",
  },
  keap: {
    pros: [
      "Mature automation engine built over nearly two decades",
      "Native invoicing and payments integration",
      "Strong onboarding culture and support reputation",
      "Deep CRM tagging and pipeline customization",
    ],
    cons: [
      "Starts at $299/mo for just 2 users and 1,500 contacts — roughly 3x GHL's entry price",
      "$39 per additional user, plus a paid implementation package",
      "No AI receptionist or phone/SMS answering",
      "Post-Thryv-acquisition roadmap uncertainty as features fold into Thryv",
    ],
    chooseThem: [
      "You have years of mature Keap automations already built",
      "Invoicing and payments integration is central to your workflow",
      "The acquisition-era changes don't concern your use case",
    ],
    chooseSf: [
      "You want a third of Keap's entry price with no per-user fee",
      "You need an AI receptionist Keap doesn't offer",
      "You want a website and AI-driven booking, not just CRM and invoicing",
      "You want a platform on a stable, undivided roadmap",
    ],
    switchNote:
      "Export your Keap contacts to CSV and import them; run both platforms in parallel for a week while the AI receptionist takes over call handling, then cancel Keap.",
  },
  linktree: {
    pros: [
      "60-second setup with genuine creator mind-share",
      "Usable free tier",
      "Fastest way to consolidate social links to one page",
      "Simple, familiar to any audience",
    ],
    cons: [
      "One page of links — no CRM, booking, automation or business system",
      "9–12% commission on sales below the $35/mo Premium tier",
      "No phone, SMS or chat capability at all",
      "A rented touchpoint, not an owned business asset",
    ],
    chooseThem: [
      "You're a creator who only needs one bio link",
      "Your content and social profiles are the whole business",
      "You have no need for a CRM, booking or phone answering",
    ],
    chooseSf: [
      "You need a real multi-page website, not a link page",
      "You want an AI receptionist that answers calls and books jobs",
      "You don't want a sales commission on what you sell",
      "You want a CRM and calendar behind every lead that clicks through",
    ],
    switchNote:
      "Point your social bio link at your new SeldonFrame website once it's live — the generated site includes its own service pages, booking and contact options in place of the link list.",
  },
  kartra: {
    pros: [
      "Deep course/membership/video tooling for creator businesses",
      "Built-in affiliate management",
      "Native helpdesk alongside checkout",
      "All-in-one for a coach or course seller's exact needs",
    ],
    cons: [
      "Contact caps at every tier — Essentials caps at just 500 contacts",
      "No phone, SMS or chat AI agent",
      "No white-label or sub-account model for agencies",
      "No local-SMB tooling — not built for service businesses",
    ],
    chooseThem: [
      "You're a creator or coach selling courses or memberships",
      "You want built-in affiliate management and a helpdesk",
      "Video/membership hosting is core to your offer",
    ],
    chooseSf: [
      "You're a service business, not a course seller",
      "You want no contact cap to outgrow",
      "You need an AI receptionist Kartra doesn't offer",
      "You're an agency needing whitelabel client workspaces",
    ],
    switchNote:
      "Export your Kartra contacts to CSV and import them; SeldonFrame's booking calendar replaces any client-scheduling workflows you'd built around Kartra's checkout pages.",
  },
  sharpspring: {
    pros: [
      "Unlimited users on a flat agency plan",
      "VisitorID website tracking, ahead of its time",
      "Deep agency heritage and workflow familiarity",
      "Established integrations for agencies already on it",
    ],
    cons: [
      "Pricing is quote-gated — commonly cited at ~$449/mo per 1,000 contacts",
      "Reported to be in maintenance mode post-Constant-Contact acquisition",
      "No phone, SMS or chat AI receptionist",
      "No local-SMB front-office stack — no website, booking or intake tools",
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
      "Export your SharpSpring contacts to CSV and import them; recreate any VisitorID-triggered workflows as SeldonFrame's event-triggered agent follow-ups where equivalent.",
  },
  klaviyo: {
    pros: [
      "Best-in-class ecommerce data model and Shopify-native depth",
      "Strong deliverability for high-volume senders",
      "Deep cart-recovery and lifecycle-email flows",
      "Purpose-built for online retail marketing",
    ],
    cons: [
      "Per-profile pricing (~$30–45/mo @1k, ~$130/mo @10k) including suppressed profiles unless pruned",
      "SMS usage billed on top of profile pricing",
      "No phone, voice or chat receptionist at all",
      "No agency/white-label model, no funnels, site or booking calendar",
    ],
    chooseThem: [
      "You're running an ecommerce or Shopify brand",
      "Cart-recovery and lifecycle email/SMS are core to your revenue",
      "Purchase-data-driven segmentation is what you need",
    ],
    chooseSf: [
      "You're a local service business, not an online store",
      "You want flat $29/mo, not per-profile scaling with suppressed contacts counted",
      "You need a phone-answering AI receptionist, which Klaviyo doesn't have",
      "You want a website and booking calendar included, not assumed elsewhere",
    ],
    switchNote:
      "Klaviyo profiles don't map to service-business contacts one-to-one — start fresh by pasting your website into SeldonFrame, then import any existing customer list as CSV.",
  },
  zoho: {
    pros: [
      "Extreme value and breadth across 45+ apps",
      "Deep CRM field-level customization",
      "Zia AI adds predictive features inside workflows",
      "Strong per-dollar value for configurable businesses",
    ],
    cons: [
      "Assembly required — 45+ apps to configure and connect yourself",
      "Per-user, per-edition pricing multiplies with team size",
      "No white-label layer for agencies",
      "Weak native local-SMB front-office tools (booking, receptionist)",
    ],
    chooseThem: [
      "You want maximum CRM customization and app breadth per dollar",
      "You have time to configure a suite around your exact workflow",
      "Your team is large enough that per-user value pencils out",
    ],
    chooseSf: [
      "You want a working system today, not 45 apps to assemble",
      "You want flat $29/mo, not per-user, per-edition pricing",
      "You need an AI receptionist Zia doesn't provide",
      "You're an agency needing whitelabel client workspaces",
    ],
    switchNote:
      "Export your Zoho CRM contacts to CSV and import them; SeldonFrame's generated workspace replaces the assembly of separate Zoho apps for site, booking and receptionist functions.",
  },
  salesforce: {
    pros: [
      "Unmatched brand trust, compliance posture and customization depth",
      "AppExchange ecosystem for near-limitless extension",
      "Agentforce AI agent platform at enterprise scale",
      "Built for large, complex sales organizations",
    ],
    cons: [
      "Per-user pricing escalates fast — Pro Suite $100/user, Agentforce editions to $550/user",
      "Real admin overhead even at entry tiers",
      "No white-label layer for agencies",
      "Thin native marketing/funnel/SMS tooling for local SMBs",
    ],
    chooseThem: [
      "You're running a large, complex sales organization",
      "You need enterprise compliance and the AppExchange ecosystem",
      "You have admin resources to configure and maintain it",
    ],
    chooseSf: [
      "You don't have (or want) a dedicated CRM admin",
      "You want flat $29/mo instead of per-user enterprise editions",
      "You want a receptionist ready immediately, not a custom Agentforce build",
      "You're an agency needing whitelabel client workspaces",
    ],
    switchNote:
      "Export your Salesforce contacts and opportunities to CSV and import them; SeldonFrame's generated receptionist replaces the need for a custom Agentforce agent build.",
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
  { a: "gohighlevel", b: "vendasta", angle: "The two agency-platform incumbents: GoHighLevel's all-in-one toolbox vs Vendasta's resellable product marketplace — both gate the AI receptionist behind add-ons or top tiers." },
  { a: "vapi", b: "retell-ai", angle: "The two developer voice-API rivals: Vapi's maximum flexibility vs Retell's itemized transparency — both leave you building the CRM, calendar and whitelabel layer yourself." },
  { a: "synthflow", b: "vapi", angle: "No-code templates vs developer API: Synthflow ships faster, Vapi bends further — neither includes the business system the agent books into." },
  { a: "synthflow", b: "retell-ai", angle: "Synthflow's productized (but $2,000/mo) whitelabel vs Retell's wrapper-it-yourself economy — agencies pay the agency tax either way." },
  { a: "chatbase", b: "botpress", angle: "The no-code chatbot leader vs the open-source power tool: setup speed vs extensibility — both are chat-first and neither answers a phone." },
  { a: "chatbase", b: "voiceflow", angle: "Train-on-your-data simplicity vs conversation-design control — and two different flavors of credit-metered pricing." },
  { a: "voiceflow", b: "botpress", angle: "The two builder's-builders: visual conversation design vs open-source orchestration — both need real technical investment per agent." },
  { a: "podium", b: "goodcall", angle: "Quote-gated breadth vs per-caller simplicity for SMB phones — opposite pricing philosophies, same missing front office." },
  { a: "stammer-ai", b: "synthflow", angle: "The two whitelabel agent plays: Stammer's $197 agency dashboard vs Synthflow's $2,000 whitelabel add-on — chat-first vs voice-first." },
  { a: "smith-ai", b: "goodcall", angle: "Human-hybrid service vs pure-AI product for answering SMB phones — per-call vs per-caller billing." },
  { a: "gohighlevel", b: "activecampaign", angle: "Full agency toolbox vs automation-first email specialist — GHL stacks per-location AI fees, ActiveCampaign has no phone or SMS layer at all." },
  { a: "gohighlevel", b: "hubspot", angle: "Mid-market agency platform vs enterprise CRM — GHL's AI Employee add-on vs HubSpot's 40x Starter-to-Pro cliff, neither ships a flat-priced AI receptionist." },
  { a: "gohighlevel", b: "clickfunnels", angle: "Full front office vs pure funnel builder — GHL at least has a CRM and calendar; ClickFunnels caps contacts and has no phone or SMS at all." },
  { a: "gohighlevel", b: "keap", angle: "GHL's usage-metered AI add-on vs Keap's 3x-higher flat entry price — both charge extra for automation depth neither pairs with a native AI receptionist." },
  { a: "gohighlevel", b: "linktree", angle: "A full agency platform vs a single link page — different categories entirely, but neither includes a phone-answering AI agent out of the box." },
  { a: "gohighlevel", b: "kartra", angle: "Agency toolbox vs creator all-in-one — GHL sells to agencies serving local businesses, Kartra sells to coaches selling courses; neither answers a phone." },
  { a: "gohighlevel", b: "sharpspring", angle: "An actively developed agency platform vs one reported in maintenance mode post-acquisition — GHL costs more but is still shipping." },
  { a: "gohighlevel", b: "klaviyo", angle: "Local-business agency platform vs ecommerce email/SMS specialist — GHL serves service businesses, Klaviyo assumes a Shopify cart, and neither has a native voice receptionist." },
  { a: "gohighlevel", b: "zoho", angle: "Turnkey agency toolbox vs 45-app value suite you assemble yourself — GHL costs more upfront, Zoho costs more in setup time." },
  { a: "gohighlevel", b: "salesforce", angle: "Mid-market agency platform vs enterprise CRM standard — GHL undercuts Salesforce's per-user pricing but neither ships a flat-fee AI receptionist without an add-on or custom build." },
];

export function vsSlug(pair: VsPair): string {
  return `${pair.a}-vs-${pair.b}`;
}

export function getVsPair(slug: string): { pair: VsPair; a: Competitor; b: Competitor } {
  const pair = VS_PAIRS.find((p) => vsSlug(p) === slug);
  if (!pair) throw new Error(`Unknown vs pair: ${slug}`);
  return { pair, a: getCompetitor(pair.a), b: getCompetitor(pair.b) };
}
