// The "[Competitor] pricing" registry — one entry per competitor, driving the
// /<slug>-pricing SEO pages (components/seo/pricing-page.tsx). Same additive,
// pure-data pattern as alternative-pages.ts: no DB, static HTML.
//
// Content rules (never-lies applies to pricing pages most of all):
// - Every number traces back to docs/superpowers/specs/2026-07-08-competitor-pricing-facts.md
//   (researched + fetched 2026-07-08). That file tags each fact ✅ (fetched live),
//   🔶 (hedged — geo/JS/quote-gated, third-party sourced), or ❌ (quote-gated,
//   only publicly-reported numbers exist).
// - 🔶 and ❌ facts are hedged in prose here with "listed at ~", "reported",
//   "third-party sources say" — never stated as a bare fact.
// - Quote-gated competitors (quoteGated: true) say so plainly in bottomLine —
//   "talk to sales" / "contact sales", not an invented number.
// - Update `verified` per-entry only when re-checking that competitor's page;
//   PRICING-level LAST_UPDATED tracks the whole registry's last full pass.

export const LAST_UPDATED = "July 2026";

export type PricingPlan = {
  name: string;
  price: string;
  whoFor: string;
  limits: string[];
};

export type PricingStack = {
  label: string;
  detail: string;
};

export type CompetitorPricing = {
  /** URL slug: /<slug>-pricing — MUST match a slug in lib/seo/alternative-pages.ts */
  slug: string;
  pricingUrl: string;
  /** e.g. "July 2026" — when this competitor's numbers were last checked. */
  verified: string;
  quoteGated: boolean;
  freeTier?: string;
  annualNote?: string;
  plans: PricingPlan[];
  /** The add-ons/meters that stack on top of the sticker price — the money section. */
  stacks: PricingStack[];
  /** 2-3 short sentences, grade-6 language: what you'll REALLY pay. */
  bottomLine: string;
};

export const PRICING: CompetitorPricing[] = [
  {
    slug: "gohighlevel",
    pricingUrl: "https://www.gohighlevel.com/pricing",
    verified: "July 2026",
    quoteGated: false,
    freeTier: "None — 14-day free trial",
    annualNote: "Pay 10 months upfront and get 2 months free (about $970/$2,970/$4,970 per year).",
    plans: [
      { name: "Starter", price: "$97/mo", whoFor: "Solo marketers & small agencies", limits: ["3 sub-accounts", "Unlimited contacts & users"] },
      { name: "Unlimited", price: "$297/mo", whoFor: "Growing agencies", limits: ["Unlimited sub-accounts", "Phone/email rebilled at cost", "Basic API"] },
      { name: "Agency Pro (SaaS)", price: "$497/mo", whoFor: "Agencies going SaaS-mode", limits: ["SaaS mode", "Rebill clients with markup", "Advanced API"] },
      { name: "Enterprise", price: "Custom — talk to sales", whoFor: "Large agencies", limits: ["Negotiated terms"] },
    ],
    stacks: [
      { label: "AI Employee add-on", detail: "$50/mo per sub-account on Starter-level plans, or $97/mo per sub-account on the Unlimited plan — the AI receptionist isn't included in the base price." },
      { label: "Telephony & email usage", detail: "SMS, voice minutes, and email (Twilio/Mailgun) are rebilled at cost on top of every plan — a busy client adds up fast." },
    ],
    bottomLine:
      "GoHighLevel's sticker price is $97 to $497 a month, but the AI receptionist costs another $50–$97 per client on top of that. Add metered phone and email usage and a real multi-client agency bill climbs well past the plan price.",
  },
  {
    slug: "activecampaign",
    pricingUrl: "https://www.activecampaign.com/pricing",
    verified: "July 2026",
    quoteGated: false,
    freeTier: "None — 14-day free trial",
    annualNote: "Prices shown are billed annually at 1,000 contacts; monthly billing runs higher, and the price climbs automatically as your contact list grows.",
    plans: [
      { name: "Starter", price: "listed at ~$15/mo (annual, 1,000 contacts)", whoFor: "Beginners doing personalized email", limits: ["1 user", "5 actions per automation"] },
      { name: "Plus", price: "listed at ~$49/mo (annual, 1,000 contacts)", whoFor: "SMBs adding automation", limits: ["1 user", "Unlimited automation actions"] },
      { name: "Pro", price: "listed at ~$79/mo (annual, 1,000 contacts)", whoFor: "Teams needing orchestration", limits: ["3 users", "Advanced segmentation"] },
      { name: "Enterprise", price: "listed at ~$145/mo (annual, 1,000 contacts)", whoFor: "Scaled email programs", limits: ["5 users", "SSO, dedicated team"] },
    ],
    stacks: [
      { label: "Contact-count scaling", detail: "The whole pricing table is a matrix keyed to how many contacts you have — the number above is only the 1,000-contact starting point, and it rises every time your list grows." },
      { label: "SMS, WhatsApp & AI add-ons", detail: "SMS, WhatsApp, transactional email, AI Activities, and the Enhanced CRM (Pipelines, Sales Engagement) are all separate add-ons on top of the base plan." },
    ],
    bottomLine:
      "ActiveCampaign's price depends entirely on how many contacts you have, and the exact dollar figure is hidden behind an on-page configurator — reported figures put a 1,000-contact Starter plan at roughly $15 to $19 a month. There's no phone or SMS receptionist at any tier.",
  },
  {
    slug: "hubspot",
    pricingUrl: "https://www.hubspot.com/pricing/marketing",
    verified: "July 2026",
    quoteGated: false,
    freeTier: "Yes — free tools, up to 2 users, with HubSpot branding",
    annualNote: "Starter is about 25% cheaper billed annually ($15/seat vs $20/seat monthly); Pro and Enterprise are quoted as annual commitments.",
    plans: [
      { name: "Free Tools", price: "$0", whoFor: "Trying HubSpot", limits: ["Up to 2 users", "HubSpot branding"] },
      { name: "Marketing Hub Starter", price: "$15/mo per seat (annual; $20 monthly)", whoFor: "Small teams starting email/forms", limits: ["1,000 marketing contacts"] },
      { name: "Marketing Hub Professional", price: "starts at $800/mo (3 core seats)", whoFor: "Real marketing teams", limits: ["2,000 marketing contacts", "Plus a required $3,000 one-time onboarding fee"] },
      { name: "Marketing Hub Enterprise", price: "starts at $3,600/mo (5 core seats)", whoFor: "Large orgs", limits: ["10,000 marketing contacts", "Plus a required $7,000 one-time onboarding fee"] },
    ],
    stacks: [
      { label: "Onboarding fees (required)", detail: "Professional adds a mandatory $3,000 one-time onboarding fee; Enterprise adds $7,000 — these aren't optional, and they're on top of the monthly price." },
      { label: "Extra seats & contacts", detail: "Extra seats cost $45/mo (Pro) or $75/mo (Enterprise); extra marketing contacts beyond your tier are sold in blocks. SMS is a separate add-on too." },
    ],
    bottomLine:
      "HubSpot's Free tier is genuinely free, but the jump to Professional is steep — $800 a month plus a required $3,000 setup fee before you've added a single extra seat. There's no phone or SMS receptionist built in at any tier.",
  },
  {
    slug: "clickfunnels",
    pricingUrl: "https://www.clickfunnels.com/pricing",
    verified: "July 2026",
    quoteGated: false,
    freeTier: "None — 14-day free trial + 30-day money-back guarantee",
    annualNote: "Annual billing saves roughly 16% (about $194–$594/year per tier).",
    plans: [
      { name: "Launch", price: "$97/mo ($81/mo annual)", whoFor: "Solopreneurs launching funnels", limits: ["10K contacts", "50K emails/mo", "1 workspace, 2 team members"] },
      { name: "Scale", price: "$197/mo ($164/mo annual)", whoFor: "Growing businesses", limits: ["75K contacts", "300K emails/mo", "5 workspaces, 5 members"] },
      { name: "Optimize", price: "$297/mo ($248/mo annual)", whoFor: "Bigger teams", limits: ["150K contacts", "750K emails/mo", "10 workspaces, 10 members"] },
      { name: "Dominate", price: "$5,997/yr (annual only)", whoFor: "High-volume operators", limits: ["400K contacts", "1.2M emails/mo", "20 workspaces, VIP support"] },
    ],
    stacks: [
      { label: "Contact & email caps", detail: "No add-on meters are advertised — the practical way ClickFunnels charges you more is contact and email-volume caps that force an upgrade once you outgrow them." },
    ],
    bottomLine:
      "ClickFunnels is refreshingly meter-free — what you see on the pricing page is what you pay, no transaction fees. The catch is contact and email caps: outgrow them and the only path is the next tier up.",
  },
  {
    slug: "keap",
    pricingUrl: "https://keap.com/pricing",
    verified: "July 2026",
    quoteGated: true,
    freeTier: "None — 14-day free trial",
    annualNote: "Billed annually works out to about $249/mo effective, versus $299/mo on the monthly plan (~17% off).",
    plans: [
      { name: "Keap (single plan, contact-tiered)", price: "from $299/mo ($249/mo effective, billed annually)", whoFor: "SMBs wanting CRM + automation", limits: ["2 user licenses included", "Price scales with contact count via a configurator"] },
    ],
    stacks: [
      { label: "Extra users", detail: "$39/month per additional user beyond the 2 included." },
      { label: "Required implementation/onboarding", detail: "Setup and onboarding services are required and priced separately — not shown on the pricing page, quote-gated through sales." },
      { label: "Text marketing tiers", detail: "500 messages/100 minutes are included, then pricing climbs by volume tier — reported from $24/mo up to $279/mo." },
    ],
    bottomLine:
      "Keap's $299 sticker price already excludes required setup services, which are quote-gated and priced separately by sales. Add a few extra users at $39 each and text-marketing volume, and the real monthly bill runs well past the advertised number.",
  },
  {
    slug: "linktree",
    pricingUrl: "https://linktr.ee/s/pricing/",
    verified: "July 2026",
    quoteGated: false,
    freeTier: "Yes — Free forever plan (unlimited links, basic analytics, Linktree branding)",
    annualNote: "Annual billing saves roughly 30–37% (e.g. Pro $15 to $12/mo, Premium $35 to $24/mo).",
    plans: [
      { name: "Free", price: "$0", whoFor: "Anyone starting a link-in-bio", limits: ["Unlimited links", "Linktree branding", "12% seller fee on digital-product sales"] },
      { name: "Starter", price: "listed at ~$8/mo (~$5/mo annual)", whoFor: "Creators wanting scheduling/customization", limits: ["Link scheduling, more icons", "9% seller fee"] },
      { name: "Pro", price: "listed at ~$15/mo (~$12/mo annual)", whoFor: "Creators monetizing", limits: ["Advanced analytics, monetization tools", "9% seller fee"] },
      { name: "Premium", price: "listed at ~$35/mo (~$24/mo annual)", whoFor: "Brands/power sellers", limits: ["Full analytics, commerce", "0% seller fee"] },
    ],
    stacks: [
      { label: "Seller/commission fee — the real meter", detail: "Linktree takes a cut of every digital-product sale made through it: 12% on Free, 9% on Starter and Pro, dropping to 0% only on the $35/mo Premium plan." },
    ],
    bottomLine:
      "Linktree's subscription price is small, but if you sell anything through it, the commission is the real cost — as high as 12% of every sale unless you're on the top $35/mo Premium plan. It's a link page, not a CRM or booking system.",
  },
  {
    slug: "kartra",
    pricingUrl: "https://kartra.com/pricing/",
    verified: "July 2026",
    quoteGated: false,
    freeTier: "None — 14-day free trial + 30-day money-back guarantee",
    annualNote: "Save up to 22% billed annually.",
    plans: [
      { name: "Essentials", price: "$59/mo ($52/mo annual)", whoFor: "Solo funnel builders", limits: ["500 contacts", "10K emails/mo", "1 product", "5% transaction fee"] },
      { name: "Starter", price: "$119/mo ($99/mo annual)", whoFor: "Small businesses", limits: ["2,500 contacts", "Unlimited emails/pages/products", "0% transaction fee"] },
      { name: "Growth", price: "$229/mo ($189/mo annual)", whoFor: "Scaling businesses", limits: ["12,500 contacts", "3 domains", "Automations, affiliates, helpdesk"] },
      { name: "Professional", price: "$549/mo ($429/mo annual)", whoFor: "High-volume marketers", limits: ["25,000 contacts", "5 domains", "Real-time funnel analytics"] },
    ],
    stacks: [
      { label: "Transaction fee (Essentials only)", detail: "The entry-level $59/mo plan takes a 5% cut of every transaction — upgrading to Starter ($119/mo) removes it entirely." },
      { label: "Contact caps", detail: "No bolt-on add-ons beyond the transaction fee — the real lever is contact caps that force an upgrade as your list grows." },
    ],
    bottomLine:
      "Kartra's numbers are rock-solid and public: $59 to $549 a month. The one hidden cost is the 5% transaction fee on the cheapest Essentials plan — pay $60 more a month on Starter and that fee disappears.",
  },
  {
    slug: "sharpspring",
    pricingUrl: "https://www.constantcontact.com/pricing/lead-gen-crm",
    verified: "July 2026",
    quoteGated: true,
    freeTier: "None",
    plans: [
      { name: "Lead Gen & CRM (all tiers)", price: "quote-gated — contact sales", whoFor: "Agencies with an existing SharpSpring book", limits: ["Historically anchored around $449/mo at 1,000 contacts (unverified for 2026)"] },
    ],
    stacks: [
      { label: "Onboarding fee", detail: "Historically around $1,999 and mandatory — unverified for the current product, but reported as a standard part of getting started." },
      { label: "Contact-tier scaling", detail: "Price reportedly scales by contact-count tier, same as most marketing-automation platforms in this category." },
    ],
    bottomLine:
      "SharpSpring's pricing page is quote-gated and reviewers report the product may no longer be sold separately from Constant Contact's main suite — treat any number here as historical, not current. If you're on it today, budget for a sales call, not a self-serve checkout.",
  },
  {
    slug: "klaviyo",
    pricingUrl: "https://www.klaviyo.com/pricing",
    verified: "July 2026",
    quoteGated: false,
    freeTier: "Yes — 250 active profiles, 500 email sends/mo, 150 SMS credits/mo",
    plans: [
      { name: "Free", price: "$0", whoFor: "New stores", limits: ["250 active profiles", "500 email sends/mo", "150 SMS credits/mo"] },
      { name: "Email", price: "from $20/mo (251–500 profiles), reported ~$100/mo at 5k, ~$400/mo at 25k", whoFor: "Ecommerce email marketing", limits: ["Sends scale with profile tier"] },
      { name: "Email + SMS", price: "from $35/mo (500 profiles + 1,250 SMS credits)", whoFor: "Stores adding SMS", limits: ["Two-way SMS, SMS automations"] },
      { name: "Enterprise", price: "Custom — talk to sales", whoFor: "High-volume profile counts", limits: ["Negotiated terms"] },
    ],
    stacks: [
      { label: "Active-profile growth", detail: "The price bumps automatically as your active-profile count grows — there's no flat ceiling." },
      { label: "SMS credit overages", detail: "SMS beyond your plan's allotment runs roughly $0.01–$0.015 per US message (MMS costs more), priced per country." },
    ],
    bottomLine:
      "Klaviyo's free tier is real and useful for a new store, but the price is a moving target after that — it climbs automatically with your contact list, and SMS is billed separately on top. There's no phone receptionist or CRM-with-booking here at all.",
  },
  {
    slug: "zoho",
    pricingUrl: "https://www.zoho.com/crm/zohocrm-pricing.html",
    verified: "July 2026",
    quoteGated: false,
    freeTier: "Yes — up to 3 users",
    annualNote: "Save up to 34% per the live page banner; monthly billing runs roughly 20–34% higher than the annual per-user prices below.",
    plans: [
      { name: "Free", price: "$0", whoFor: "Micro-teams", limits: ["Max 3 users"] },
      { name: "Standard", price: "listed at ~$14/user/mo annual (~$20 monthly)", whoFor: "Small sales teams", limits: ["Scoring rules, custom dashboards"] },
      { name: "Professional", price: "listed at ~$23/user/mo annual (~$35 monthly)", whoFor: "Growing teams", limits: ["Blueprints, inventory, Zia AI included"] },
      { name: "Enterprise", price: "listed at ~$40/user/mo annual (~$50 monthly)", whoFor: "Mature sales orgs", limits: ["CommandCenter, sandbox"] },
      { name: "Ultimate", price: "listed at ~$52/user/mo annual (~$65 monthly)", whoFor: "Analytics-heavy orgs", limits: ["Enhanced BI, highest limits"] },
    ],
    stacks: [
      { label: "Per-user multiplication", detail: "Every tier is priced per user per month — the bill multiplies directly with team size, and the live page geo-serves prices in local currency so figures here are hedged from third-party USD sources." },
      { label: "Paid support & lighter seats", detail: "Paid support plans and lighter team-user licenses are sold separately through the Zoho Store; the Zoho CRM Plus bundle (~$57/user/mo) is the everything-suite alternative." },
    ],
    bottomLine:
      "Zoho's per-seat prices look cheap at the low end, but they're geo-served in local currency and multiply with every user you add — a 5-person Professional team lands closer to $175/mo, not the $23 headline number. No native phone receptionist or booking calendar.",
  },
  {
    slug: "salesforce",
    pricingUrl: "https://www.salesforce.com/small-business/pricing/",
    verified: "July 2026",
    quoteGated: true,
    freeTier: "Starter Suite has a 30-day free trial; a Foundations free tier exists for existing customers",
    annualNote: "Pro Suite and above are annual-commit by default; Starter Suite is the only edition billed monthly.",
    plans: [
      { name: "Starter Suite", price: "$25/user/mo", whoFor: "SMBs starting CRM (sales+service+email in one)", limits: ["The only edition with monthly billing", "Simplified setup"] },
      { name: "Pro Suite", price: "$100/user/mo (billed annually)", whoFor: "SMBs outgrowing Starter", limits: ["Lead scoring, AppExchange access"] },
      { name: "Enterprise & above", price: "$165–$330/user/mo, mostly sales-negotiated", whoFor: "Large complex orgs", limits: ["Agentforce 1 editions available"] },
    ],
    stacks: [
      { label: "Agentforce / AI usage", detail: "Conversational AI is usage-priced through Flex Credits — historically reported around $2 per conversation, unverified for 2026 and worth confirming before quoting." },
      { label: "Separate SKUs for everything else", detail: "CPQ, Marketing Cloud, and extra sandboxes are all separate line items; integration and implementation costs typically dwarf the license fee itself." },
    ],
    bottomLine:
      "Salesforce's Starter Suite at $25/user is genuinely affordable, but almost everything past it — Pro Suite and up — is annual-commit and effectively quote-gated. AI usage bills separately, and implementation costs usually cost more than the software.",
  },
  {
    slug: "vapi",
    pricingUrl: "https://vapi.ai/pricing",
    verified: "July 2026",
    quoteGated: false,
    freeTier: "60+ minutes included to start; no ongoing free tier",
    plans: [
      { name: "Build (self-serve, usage-based)", price: "no platform fee — pay per use", whoFor: "Developers building voice agents", limits: ["10 concurrent lines included", "14-day call data retention"] },
      { name: "Scale (annual contract)", price: "custom — talk to sales", whoFor: "Production/enterprise deployments", limits: ["Custom concurrency & retention", "SOC 2/HIPAA/PCI, SSO/RBAC"] },
    ],
    stacks: [
      { label: "Vapi hosting fee", detail: "$0.05/min — but this is only the platform's own cut." },
      { label: "Model, voice & telephony pass-through", detail: "Speech-to-text, the LLM, text-to-speech, and telephony are passed through at cost (free only if you bring your own API keys) — real-world all-in cost is reported around $0.10–$0.30/min depending on the stack, not shown on the pricing page." },
      { label: "Extra concurrency, SMS, compliance add-ons", detail: "Extra concurrency runs $10 per line/month beyond 10; SMS/chat is $0.005/msg; HIPAA compliance is $2,000/mo and Zero Data Retention is $1,000/mo." },
    ],
    bottomLine:
      "The advertised $0.05/min is only Vapi's hosting fee — the model, voice, and telephony providers bill separately, and a real call commonly costs 2–6x that headline number. HIPAA compliance alone adds $2,000 a month.",
  },
  {
    slug: "retell-ai",
    pricingUrl: "https://www.retellai.com/pricing",
    verified: "July 2026",
    quoteGated: false,
    freeTier: "$10 free credits (about 60 minutes)",
    plans: [
      { name: "Pay-as-you-go", price: "$0.07–$0.31/min all-in for voice; $0.002+/msg for chat", whoFor: "Teams building AI phone agents", limits: ["$10 free credits", "20 free concurrent calls", "No commitment"] },
      { name: "Enterprise", price: "Custom — talk to sales", whoFor: "High volume", limits: ["Dedicated server, 24/7 support, SSO"] },
    ],
    stacks: [
      { label: "Per-minute components stack", detail: "Voice infrastructure ($0.055/min) + TTS ($0.015–$0.040/min depending on provider) + LLM ($0.045–$0.16/min depending on model) + telephony ($0.015/min) all bill separately and add up per call." },
      { label: "Feature add-ons", detail: "Knowledge Base adds $0.005/min, PII removal $0.01/min, guardrails $0.005/min; phone numbers are $2/mo and extra concurrency is $8/mo per line beyond 20." },
    ],
    bottomLine:
      "Retell's pricing is refreshingly itemized, but every piece — voice engine, TTS, LLM, telephony, and each feature you turn on — bills separately per minute, so the real all-in rate depends entirely on which model and add-ons you pick.",
  },
  {
    slug: "synthflow",
    pricingUrl: "https://synthflow.ai/pricing",
    verified: "July 2026",
    quoteGated: true,
    freeTier: "Trial minutes historically offered; unverified currently",
    plans: [
      { name: "Enterprise (the only tier the live page shows)", price: "starting at reportedly ~$30,000/yr, custom-scoped", whoFor: "Contact-center-scale voice AI", limits: ["Custom concurrency, SIP trunking, MSA/DPA"] },
      { name: "Self-serve (reported, not on the live page)", price: "reported pay-as-you-go from ~$0.08–$0.09/min", whoFor: "Smaller teams", limits: ["Enterprise volume rates reportedly down to ~$0.07/min"] },
    ],
    stacks: [
      { label: "Whitelabel add-on", detail: "The white-label dashboard, custom domain, and reseller toolkit are reported at $2,000/month on top of the base plan, or bundled into enterprise contracts." },
      { label: "Per-minute engine, LLM & telephony", detail: "Base engine, LLM, and telephony costs stack per minute, on top of whatever plan you're on." },
    ],
    bottomLine:
      "Synthflow's pricing model changed to enterprise-first — the public page now only shows custom, ~$30,000/year contracts. Older self-serve per-minute rates and the $2,000/mo whitelabel add-on still circulate in third-party sources but aren't verifiable on the live page — treat all numbers here as reported, not confirmed.",
  },
  {
    slug: "chatbase",
    pricingUrl: "https://www.chatbase.co/pricing",
    verified: "July 2026",
    quoteGated: false,
    freeTier: "Yes — 50 message credits/mo, 1 agent, agents deleted after 14 days inactivity",
    annualNote: "Prices shown are annual billing (20% off); monthly list price runs about 25% higher.",
    plans: [
      { name: "Free", price: "$0", whoFor: "Kicking the tires", limits: ["50 message credits/mo", "1 agent", "1MB training data"] },
      { name: "Hobby", price: "$32/mo (annual; ~$40 monthly)", whoFor: "Solo builders", limits: ["500 credits/mo", "10MB training", "2 seats"] },
      { name: "Standard", price: "$120/mo (annual; ~$150 monthly)", whoFor: "SMB support teams", limits: ["4,000 credits/mo", "20MB", "Voice/telephony + API"] },
      { name: "Pro", price: "$400/mo (annual; ~$500 monthly)", whoFor: "Larger support orgs", limits: ["15,000 credits/mo", "40MB", "5 seats"] },
    ],
    stacks: [
      { label: "Credit overages", detail: "Extra message credits cost $40 per 1,000 (auto-recharge) once you exceed your plan's allotment — better AI models burn credits faster." },
      { label: "Extra agents & branding removal", detail: "Extra AI agents cost $300 per agent per year; removing Chatbase branding costs $1,188/year on every tier below Enterprise." },
    ],
    bottomLine:
      "Chatbase jumps from $120/mo straight to $400/mo with no plan in between, and overages cost $40 per 1,000 credits on top. Removing the Chatbase branding is another $1,188 a year unless you're on Enterprise.",
  },
  {
    slug: "botpress",
    pricingUrl: "https://botpress.com/pricing",
    verified: "July 2026",
    quoteGated: true,
    freeTier: "Yes — free pay-as-you-go tier with 500 incoming messages/mo and a $5 monthly AI credit",
    annualNote: "Quoted Plus/Team prices are annual-plan rates — month-to-month billing costs more.",
    plans: [
      { name: "Pay-as-you-go", price: "Free", whoFor: "Builders starting out", limits: ["500 incoming messages/mo", "1 seat", "$5 monthly AI credit"] },
      { name: "Plus", price: "listed at ~$79/mo (annual)", whoFor: "Small production bots", limits: ["Branding removed, RBAC, knowledge base", "Unlimited bots (May 2026 update)"] },
      { name: "Team", price: "listed at ~$446/mo (annual; some sources say ~$495)", whoFor: "Teams collaborating", limits: ["More seats/conversations, chat support"] },
      { name: "Enterprise", price: "Custom — talk to sales", whoFor: "Compliance-heavy orgs", limits: ["SSO, SLA, dedicated AM"] },
    ],
    stacks: [
      { label: "AI spend beyond the bundled credit", detail: "LLM token usage beyond the plan's bundled AI credit is passed through and billed on top." },
      { label: "Conversation blocks", detail: "Extra conversations are purchased in blocks, each including a proportional AI quota — the practical meter beyond the free tier." },
    ],
    bottomLine:
      "Botpress's exact Plus and Team prices conflict across sources ($79 vs $89–150/mo; $446 vs $495/mo), and the live pricing page returned an error during our check — quote it as 'from about $79/mo' and verify in-browser before trusting a number.",
  },
  {
    slug: "stammer-ai",
    pricingUrl: "https://www.stammer.ai/pricing",
    verified: "July 2026",
    quoteGated: true,
    freeTier: "None — 14-day free trial",
    plans: [
      { name: "Agency", price: "$197/month", whoFor: "Agencies white-labeling AI agents", limits: ["20+ chat agents, 20+ voice agents", "Sell to unlimited clients", "White-label dashboard + API"] },
      { name: "Full SaaS Mode", price: "$497/month", whoFor: "Agencies running it as their own SaaS", limits: ["100+ chat/voice agents", "Custom AI functions", "1-on-1 onboarding"] },
      { name: "Enterprise", price: "Custom — talk to sales", whoFor: "1,000+ chat / 250+ voice agents", limits: ["SSO, self-hosting"] },
    ],
    stacks: [
      { label: "Per-message & per-minute AI costs", detail: "Chat costs roughly $0.001–$0.03+ per message by model, and voice runs $0.11/min (GPT-4.1-nano) to $0.16/min (GPT-4.1) — both bill on top of the subscription." },
      { label: "Extra agents & knowledge base", detail: "Extra chat agents cost $10/mo, extra voice agents $5/mo, and an extra 1M-character knowledge base is $5/mo." },
    ],
    bottomLine:
      "Stammer's $197/mo Agency tier looks affordable for a whitelabel platform, but per-message and per-minute AI usage stacks on top of every conversation — a busy agency's real bill depends heavily on volume, not just the subscription.",
  },
  {
    slug: "podium",
    pricingUrl: "https://www.podium.com/pricing",
    verified: "July 2026",
    quoteGated: true,
    freeTier: "None",
    plans: [
      { name: "Core (reported, third-party)", price: "reported ~$399/mo — unverified against Podium directly", whoFor: "Single-location SMBs", limits: ["Quote-gated — the pricing page is a sales form"] },
      { name: "Pro (reported, third-party)", price: "reported ~$599/mo — unverified against Podium directly", whoFor: "Growing SMBs", limits: ["Quote-gated"] },
      { name: "Signature", price: "Custom — talk to sales", whoFor: "Multi-location brands", limits: ["Negotiated terms"] },
    ],
    stacks: [
      { label: "AI Employee add-on", detail: "Reported at roughly $99+/mo on top of the base plan." },
      { label: "Extra locations", detail: "Reported at about $50/mo per extra location — real multi-location bills are reported running $800–$1,200/mo total." },
    ],
    bottomLine:
      "Podium's pricing page has no numbers on it at all — you have to talk to sales. Third-party reports put a single location around $400 to $600 a month before the AI add-on, and real multi-location bills reportedly run $800–$1,200/mo.",
  },
  {
    slug: "vendasta",
    pricingUrl: "https://www.vendasta.com/pricing/",
    verified: "July 2026",
    quoteGated: true,
    freeTier: "A free tier historically existed for the platform — not shown on the pricing page as of July 2026",
    plans: [
      { name: "Starter", price: "$99/mo minimum", whoFor: "Solopreneurs/startup agencies", limits: ["1 team seat", "10 snapshot reports/mo", "No long-term contract"] },
      { name: "Professional", price: "$499/mo minimum", whoFor: "Established agencies", limits: ["5 seats", "25 snapshots/mo", "1-year contract"] },
      { name: "Premium", price: "$999/mo minimum", whoFor: "Multi-location/medium agencies", limits: ["10 seats", "50 snapshots/mo", "1-year contract"] },
      { name: "Custom Enterprise", price: "Custom — talk to sales", whoFor: "Large agencies", limits: ["Negotiated terms"] },
    ],
    stacks: [
      { label: "It's a minimum spend, not a flat fee", detail: "Every plan is a monthly spend commitment, not a flat price — you're expected to fill it with wholesale marketplace product purchases, and $1 spent on select products offsets $1 of the subscription fee." },
      { label: "The AI Voice Receptionist is gated to the top tier", detail: "It only comes with the ~$999/mo Premium minimum, and minutes are capped even there." },
    ],
    bottomLine:
      "Vendasta's sticker prices ($99/$499/$999) are minimum spend commitments, not flat fees — you're expected to fill them with marketplace product purchases. The AI receptionist only shows up on the $999/mo tier, with capped minutes.",
  },
  {
    slug: "goodcall",
    pricingUrl: "https://www.goodcall.com/pricing",
    verified: "July 2026",
    quoteGated: true,
    freeTier: "Free trial (no permanent free tier)",
    annualNote: "Annual billing saves 15%.",
    plans: [
      { name: "Starter", price: "$79/mo per agent ($66/mo annual)", whoFor: "Single-location SMBs", limits: ["Unlimited minutes/tokens", "1 logic flow", "100 unique customers/mo"] },
      { name: "Growth", price: "$129/mo per agent ($108/mo annual)", whoFor: "Busier SMBs", limits: ["3 flows", "250 customers/mo"] },
      { name: "Scale", price: "$249/mo per agent ($208/mo annual)", whoFor: "Multi-team operations", limits: ["25 flows", "500 customers/mo", "Unlimited history"] },
      { name: "Enterprise", price: "Custom — talk to sales", whoFor: "Large operations", limits: ["Dedicated AM, custom API, SLA"] },
    ],
    stacks: [
      { label: "Per-caller overage — the only meter", detail: "$0.50 per additional unique customer beyond your monthly cap — minutes and AI tokens are unlimited and free, so this cap is the entire cost story." },
    ],
    bottomLine:
      "Goodcall's minutes are genuinely unlimited — the whole meter is unique callers per month, capped at 100 to 500 depending on tier, with a $0.50 overage per extra caller. A busy month can get expensive fast if you're near the cap.",
  },
  {
    slug: "voiceflow",
    pricingUrl: "https://www.voiceflow.com/pricing",
    verified: "July 2026",
    quoteGated: true,
    freeTier: "Yes — Free/Sandbox tier for prototyping",
    annualNote: "10% off the base subscription only (not seats) — reduced from 20% in April 2025.",
    plans: [
      { name: "Free/Sandbox", price: "$0", whoFor: "Prototyping", limits: ["Limited credits", "1-2 editors"] },
      { name: "Pro", price: "reported from ~$60/mo (10K credits) up to $120/mo (20K credits)", whoFor: "Startups launching an agent", limits: ["Includes some editor seats"] },
      { name: "Business", price: "reported ~$250/mo (50K credits) up to $1,000/mo (200K credits)", whoFor: "Production support automation", limits: ["Higher limits, more seats included"] },
      { name: "Enterprise", price: "Custom — talk to sales", whoFor: "Large orgs", limits: ["SSO, compliance, volume credits"] },
    ],
    stacks: [
      { label: "Per-editor seats — the real tax", detail: "Editor seats cost $50/mo each on both tiers, even on annual plans — a 5-editor team running 50K messages a month is reported to cost $450–$500/mo total." },
      { label: "No mid-cycle credit top-ups", detail: "Hit your credit ceiling and bots simply stop responding until the next billing cycle — there's no way to buy more mid-month." },
    ],
    bottomLine:
      "Voiceflow's numbers aren't published on the live pricing page at all — figures here come from third-party sources. The real cost driver is $50/mo per editor seat, and credits can't be topped up mid-cycle, so a busy month means your bots go silent.",
  },
  {
    slug: "lindy",
    pricingUrl: "https://www.lindy.ai/pricing",
    verified: "July 2026",
    quoteGated: true,
    freeTier: "None — 7-day free trial (full Plus tier, no card required)",
    plans: [
      { name: "Plus", price: "$49.99/month", whoFor: "Individuals automating email/calendar", limits: ["Standard usage", "Up to 2 inboxes"] },
      { name: "Pro", price: "$99.99/month", whoFor: "Power users", limits: ["3x Plus usage", "Up to 3 inboxes, computer use"] },
      { name: "Max", price: "$199.99/month", whoFor: "Heavy automation users", limits: ["7x Plus usage", "Up to 5 inboxes, computer use"] },
      { name: "Enterprise", price: "Custom — talk to sales", whoFor: "Teams", limits: ["SSO, SCIM, HIPAA, audit logs"] },
    ],
    stacks: [
      { label: "Task-dependent credit burn", detail: "Usage is metered in credits that vary 1–10x depending on task complexity — a simple step costs 1 credit, but email parsing or web research can cost 5–10. Absolute credit counts aren't published." },
      { label: "Credit top-ups", detail: "Extra credits cost $10 per 1,000 once you run out." },
    ],
    bottomLine:
      "Lindy has no free tier — just a 7-day trial. The bigger issue for budgeting is that credit burn varies 1–10x by task, so the same $49.99–$199.99 plan can run out very differently month to month depending on what you automate.",
  },
  {
    slug: "durable",
    pricingUrl: "https://durable.com/pricing",
    verified: "July 2026",
    quoteGated: false,
    freeTier: "Yes — durable.site subdomain, CRM to 10 customers, 5 AI images + 10 AI chat messages/mo",
    annualNote: "Save 15% billed annually.",
    plans: [
      { name: "Free", price: "$0", whoFor: "Testing an AI website", limits: ["durable.site subdomain", "CRM to 10 customers"] },
      { name: "Launch", price: "$25/mo ($22/mo annual)", whoFor: "Solo service businesses", limits: ["Custom domain", "Unlimited CRM contacts", "SEO tools"] },
      { name: "Grow", price: "$49/mo ($41/mo annual)", whoFor: "Growing service businesses", limits: ["Unlimited team members", "500 images/mo, unlimited chat"] },
    ],
    stacks: [
      { label: "AI usage caps", detail: "No bolt-on add-ons are published — the meter is AI image/chat usage caps per tier, and upgrading raises the cap rather than paying per use." },
    ],
    bottomLine:
      "Durable's pricing is genuinely simple and cheap ($0–$49/mo), with no hidden meters beyond AI usage caps. The trade-off is what's missing, not what it costs: there's no AI voice receptionist and no real booking calendar behind an agent.",
  },
  {
    slug: "my-ai-front-desk",
    pricingUrl: "https://www.myaifrontdesk.com/pricing",
    verified: "July 2026",
    quoteGated: true,
    freeTier: "None — 7-day free trial",
    annualNote: "Annual billing saves 20%.",
    plans: [
      { name: "Basic", price: "$20/mo ($16/mo annual)", whoFor: "Text-first front desk", limits: ["0 voice minutes", "10 chatbot convos + 40 SMS/mo", "1 seat"] },
      { name: "Business-in-a-Box", price: "$99/mo ($79/mo annual)", whoFor: "SMB AI receptionist", limits: ["200 voice min/mo", "100 chatbot convos, 400 SMS", "2 seats"] },
      { name: "Partner / Enterprise", price: "Custom — talk to sales", whoFor: "White-label resellers", limits: ["Volume pricing; resellers commonly retail $250–$500/mo per client"] },
    ],
    stacks: [
      { label: "Overage credits — the real meter", detail: "Voice overage runs about 25 credits/min, SMS 4 credits/msg, chatbot 5 credits/convo, with auto-reload at $10 per 1,000 credits — that works out to roughly $0.25/min for extra voice minutes." },
      { label: "200 minutes disappears fast", detail: "The $99/mo plan's 200 voice minutes is only about 40 five-minute calls before overage charges kick in." },
    ],
    bottomLine:
      "My AI Front Desk's $20 entry point is genuinely cheap, but the $99/mo receptionist plan only includes 200 voice minutes — about 40 calls — before you're paying roughly $0.25/min in overage credits. The Partner/agency tier has no published pricing at all.",
  },
  {
    slug: "smith-ai",
    pricingUrl: "https://smith.ai/pricing/ai-receptionist",
    verified: "July 2026",
    quoteGated: true,
    freeTier: "None",
    plans: [
      { name: "AI Receptionist", price: "reported from ~$95/mo (~50-60 calls) up to ~$800/mo across three tiers", whoFor: "SMBs wanting 24/7 AI answering", limits: ["Per-call effective rate reported ~$1.60–$1.90 in-tier"] },
      { name: "Virtual (human) Receptionist", price: "reported ~$292.50/mo (30 calls) up to ~$1,950/mo (300 calls)", whoFor: "Businesses wanting live agents", limits: ["Per-call rate reported ~$6.50–$9.75"] },
    ],
    stacks: [
      { label: "Per-call billing — the real cost driver", detail: "Both the AI and human plans bill by the call — reported overage runs about $2.40/call beyond your plan's included volume, so busier months cost proportionally more." },
      { label: "Custom AI training fee", detail: "Reported around $2,000, charged separately on monthly plans (bundled into annual plans for 2026)." },
    ],
    bottomLine:
      "Smith.ai's pricing pages hide numbers behind forms, so every figure here is third-party reported, not confirmed. The pattern is clear either way: it's a per-call service, so growth in call volume grows your bill proportionally — there's no flat platform fee.",
  },
];

export function getCompetitorPricing(slug: string): CompetitorPricing {
  const hit = PRICING.find((c) => c.slug === slug);
  if (!hit) throw new Error(`Unknown competitor pricing slug: ${slug}`);
  return hit;
}

export function allPricingSlugs(): string[] {
  return PRICING.map((c) => c.slug);
}
