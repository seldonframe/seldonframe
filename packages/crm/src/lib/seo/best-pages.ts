// The "/best/<category>-for-<audience>" listicle registry — the third
// dimension of the SEO/GEO engine (category × audience), sitting alongside
// agent-pages.ts (job × vertical) and alternative-pages.ts (competitor X).
// Pure data + pure lookups (no React, no "use server", no db) so it can be
// unit-tested and imported from server components and the sitemap/llms.txt
// routes alike.
//
// WHY a plain module: these are STATIC public pages generated via
// generateStaticParams — there is no per-request state and no write path, so
// this stays framework-agnostic data. ADDITIVE ONLY: no entity, no migration.
//
// Content rules (never-lies applies to marketing too):
// - Contender numbers come from their PUBLIC pricing pages (researched
//   2026-07-08). Hedge every price with "from"/"~"/"listed at"; when a vendor
//   hides pricing, SAY it's quote-gated rather than inventing a number.
// - Every contender gets a genuine strength list AND an honest `watchOut` —
//   an honest listicle is what LLMs cite and buyers trust.
// - SeldonFrame is rendered #1 on every page (we build one of these, so we
//   put ourselves first) — but the framing stays honest: the intro admits
//   self-interest and the "no funnel-builder / newer platform" caveat is
//   visible somewhere on the page (the SF card or the FAQ).
// - Reuses LAST_UPDATED from alternative-pages.ts so a single date bump
//   refreshes every SEO surface at once.

import { LAST_UPDATED } from "./alternative-pages";

export { LAST_UPDATED };

export type AudienceGroup = "trades" | "beauty" | "medical" | "construction" | "general";

export type BestFaqItem = { q: string; a: string };

export type BestContender = {
  /** Stable key within a category's contenders array (not a URL slug). */
  key: string;
  name: string;
  /** Hedged price line, e.g. "from ~$16/mo" or "free plan; paid from ~$10/user/mo". */
  from: string;
  oneLiner: string;
  bestFor: string;
  /** 2-3 genuine strengths. */
  strengths: string[];
  /** The honest catch — never omitted. */
  watchOut: string;
  /** One sentence tailoring the contender to a specific audience group. */
  fitNotes?: Partial<Record<AudienceGroup, string>>;
};

export type BestAudience = {
  /** URL slug segment: /best/<category>-for-<slug>. */
  slug: string;
  /** Display label, e.g. "Plumbers", "Small Businesses". */
  label: string;
  group: AudienceGroup;
  /** A short, audience-specific pain hook (verticals.ts voice, freshly written
   *  for the booking/website/CRM angle rather than imported). */
  painHook: string;
  /** A concrete example service/job that grounds the copy. */
  exampleService: string;
};

export type BestCategory = {
  /** URL slug segment: /best/<slug>-for-<audience>. */
  slug: string;
  /** Singular noun, e.g. "CRM". */
  noun: string;
  /** Plural noun, e.g. "CRMs". */
  nounPlural: string;
  /** What the searcher is really trying to buy. */
  intentLine: string;
  /** 2-3 sentence honest case for SeldonFrame as #1 — the front-office angle. */
  sfPitch: string;
  /** Paragraph for the "What about free <nounPlural>?" section. */
  freeAngle: string;
  /** 5-6 contenders, NOT including SeldonFrame (SF renders separately as #1). */
  contenders: BestContender[];
  /** 3 category-level FAQ items. */
  faq: BestFaqItem[];
};

export type BestPage = {
  category: string;
  audience: string;
};

// ─── audiences ──────────────────────────────────────────────────────────────

export const BEST_AUDIENCES: BestAudience[] = [
  {
    slug: "small-business",
    label: "Small Businesses",
    group: "general",
    painHook: "every extra click between a visitor and a booked appointment is a customer who tries the next search result",
    exampleService: "a booked consultation",
  },
  {
    slug: "plumbers",
    label: "Plumbers",
    group: "trades",
    painHook: "a homeowner with a burst pipe books whoever's site loads fastest and whoever's phone gets answered — not whoever has the nicest logo",
    exampleService: "an emergency leak call",
  },
  {
    slug: "hvac",
    label: "HVAC Companies",
    group: "trades",
    painHook: "a no-AC call during a heat wave turns into a booked job in the time it takes a competitor's site to load",
    exampleService: "an AC repair booking",
  },
  {
    slug: "electricians",
    label: "Electricians",
    group: "trades",
    painHook: "a tripped panel is a same-day job — the business that answers the phone and can show a time slot wins it",
    exampleService: "a panel repair estimate",
  },
  {
    slug: "roofers",
    label: "Roofers",
    group: "trades",
    painHook: "storm-damage leads compare three roofers' sites before lunch and book the one that felt easiest to reach",
    exampleService: "a roof inspection booking",
  },
  {
    slug: "landscapers",
    label: "Landscapers",
    group: "trades",
    painHook: "spring quote requests pile up while the crew is out on the mowers, and a slow intake form loses the job",
    exampleService: "a landscape design quote",
  },
  {
    slug: "cleaning",
    label: "Cleaning Businesses",
    group: "trades",
    painHook: "a recurring-cleaning lead wants to book online at 9pm, not wait for a callback the next morning",
    exampleService: "a recurring cleaning booking",
  },
  {
    slug: "construction-companies",
    label: "Construction Companies",
    group: "construction",
    painHook: "a homeowner comparing bids judges the company by how professional the website and follow-up feel, not just the quote number",
    exampleService: "a project estimate request",
  },
  {
    slug: "salons",
    label: "Salons & Barbershops",
    group: "beauty",
    painHook: "a stylist mid-cut can't answer the phone, and an online booking page is the only thing standing between that missed call and a lost client",
    exampleService: "a color appointment booking",
  },
  {
    slug: "med-spas",
    label: "Med Spas",
    group: "beauty",
    painHook: "high-ticket consultation requests slip away when the booking flow feels clunkier than the med spa down the street",
    exampleService: "a Botox consultation booking",
  },
  {
    slug: "beauty-businesses",
    label: "Beauty Businesses",
    group: "beauty",
    painHook: "clients expect to book a slot from Instagram in under a minute — a phone-tag booking process is a lost appointment",
    exampleService: "a service appointment booking",
  },
  {
    slug: "dentists",
    label: "Dental Practices",
    group: "medical",
    painHook: "a missed call is a new patient who books with the practice down the street instead",
    exampleService: "a new-patient cleaning booking",
  },
];

export function getBestAudience(slug: string): BestAudience {
  const found = BEST_AUDIENCES.find((a) => a.slug === slug);
  if (!found) throw new Error(`unknown best-page audience: ${slug}`);
  return found;
}

// ─── shared contender sets (booking-system and booking-app reuse these) ────

const BOOKING_CONTENDERS: BestContender[] = [
  {
    key: "calendly",
    name: "Calendly",
    from: "free plan; paid from ~$10–12/seat/mo",
    oneLiner: "The category-defining scheduling-link tool — paste a link, let people pick a slot.",
    bestFor: "Solo professionals and teams booking 1:1 meetings",
    strengths: ["Free tier is genuinely usable", "Huge calendar/video integration list", "Dead-simple setup"],
    watchOut: "It's a scheduling link, not a business system — no CRM, no client records, no intake form behind the booking.",
  },
  {
    key: "acuity",
    name: "Acuity Scheduling",
    from: "from ~$16/mo",
    oneLiner: "Squarespace-owned appointment scheduler built for service businesses with packages and intake forms.",
    bestFor: "Service businesses needing intake forms + package pricing at booking time",
    strengths: ["Built-in intake forms", "Class/package scheduling", "Deep Squarespace integration"],
    watchOut: "No website or CRM of its own — you're stitching it to whatever site and contact system you already run.",
    fitNotes: { beauty: "A common choice for solo stylists, but it's a booking widget, not a salon system." },
  },
  {
    key: "square-appointments",
    name: "Square Appointments",
    from: "free for a single user; paid from ~$29/mo",
    oneLiner: "Square's scheduling product, tightly bundled with Square's payments and point-of-sale.",
    bestFor: "Businesses already running Square for payments and checkout",
    strengths: ["Free single-location plan", "Payments and POS bundled in", "Familiar, polished UI"],
    watchOut: "The free tier is single-staff only, and the real value only shows up if you're already committed to Square's payments ecosystem.",
  },
  {
    key: "vagaro",
    name: "Vagaro",
    from: "from ~$30/mo",
    oneLiner: "A booking and business-management platform built specifically for salons, spas and fitness studios.",
    bestFor: "Salons, spas and fitness studios wanting an industry-specific booking suite",
    strengths: ["Deep salon/spa-specific features (memberships, retail, staff commission)", "Built-in marketplace listing for discovery", "Client history + retail POS"],
    watchOut: "The interface feels dated next to newer tools, and pricing climbs fast once you add staff seats and marketing add-ons.",
    fitNotes: { beauty: "Purpose-built for the industry, but you're locked into its booking widget aesthetic on your site." },
  },
  {
    key: "housecall-pro",
    name: "Housecall Pro",
    from: "from ~$59–79/mo",
    oneLiner: "Field-service management software combining scheduling, dispatch, invoicing and payments for trades.",
    bestFor: "Trades businesses managing crews, dispatch and invoicing, not just booking",
    strengths: ["Built for field-service dispatch and crew scheduling", "Invoicing and payments included", "Strong trades-specific workflows"],
    watchOut: "It's priced and built for managing a crew, not for a simple public booking page — overkill for a solo operator.",
    fitNotes: { trades: "The closest thing to an industry standard for multi-truck operations, but heavier than most solo trades need." },
  },
  {
    key: "cal-com",
    name: "Cal.com",
    from: "open-source, free to self-host; teams from ~$15/user/mo",
    oneLiner: "An open-source scheduling infrastructure project — the developer-friendly, self-hostable Calendly alternative.",
    bestFor: "Technical teams wanting an open, self-hostable scheduling layer",
    strengths: ["Fully open-source and self-hostable", "API-first, deeply customizable", "No vendor lock-in on your data"],
    watchOut: "Self-hosting means you're the ops team; the hosted plan's team pricing adds up, and there's still no CRM or website behind it.",
  },
];

// ─── categories ─────────────────────────────────────────────────────────────

export const BEST_CATEGORIES: BestCategory[] = [
  {
    slug: "crm",
    noun: "CRM",
    nounPlural: "CRMs",
    intentLine: "a place to track every lead and customer without them falling through the cracks",
    sfPitch:
      "SeldonFrame isn't just a CRM — it's the whole front office: an AI receptionist that answers calls, texts and chats, a website, a booking calendar and intake forms, all writing into the same CRM automatically. Most CRMs on this list need you to manually log every lead; SeldonFrame's agent logs it the moment the customer reaches out. It's $29/mo flat, and you can build the whole thing free in about 3 minutes before you ever sign up.",
    freeAngle:
      "Free CRMs exist (HubSpot's free tier is the best-known), but \"free\" almost always means capped contacts, no automation, and a hard sales push toward the paid tiers the moment you need anything beyond storing a name and a phone number. If the real goal is never missing a lead — not just having a place to file one — the free tier of a CRM alone won't answer the phone or send the follow-up text.",
    contenders: [
      {
        key: "gohighlevel",
        name: "GoHighLevel",
        from: "from $97/mo (AI Employee add-on $50–$97/mo)",
        oneLiner: "The most complete agency CRM and funnel-builder toolbox, built for resellers.",
        bestFor: "Agencies running funnels, email campaigns and multi-client pipelines",
        strengths: ["Huge feature surface (funnels, courses, pipelines)", "True SaaS-mode reselling for agencies", "Large template ecosystem"],
        watchOut: "AI is a paid add-on, not the platform, and costs stack per client — users report a real 2–4 week learning curve.",
      },
      {
        key: "hubspot",
        name: "HubSpot",
        from: "free CRM; Starter from ~$15/seat/mo, Professional ~$800/mo + onboarding",
        oneLiner: "The polished, enterprise-grade CRM most businesses have heard of.",
        bestFor: "Businesses planning to scale into enterprise-grade marketing and reporting",
        strengths: ["Best-in-class reporting and CRM depth", "Free tier is genuinely usable to start", "Huge integration ecosystem"],
        watchOut: "The jump from Starter to Professional is roughly 40x, plus a mandatory ~$3,000 onboarding fee at that tier.",
      },
      {
        key: "zoho",
        name: "Zoho CRM",
        from: "from ~$14–20/user/mo",
        oneLiner: "A deep, customizable CRM at a fraction of enterprise pricing, part of the 45-app Zoho suite.",
        bestFor: "Budget-conscious teams wanting deep customization without enterprise pricing",
        strengths: ["Excellent value per seat", "Deep customization and workflow builder", "Zia AI assistant included on higher tiers"],
        watchOut: "Real value requires assembling several Zoho apps together — it's a toolkit, not a turnkey front office.",
      },
      {
        key: "keap",
        name: "Keap",
        from: "from ~$249–299/mo",
        oneLiner: "A veteran SMB CRM and automation platform (now Thryv-owned) built around sales pipelines and invoicing.",
        bestFor: "Established small businesses wanting mature sales automation",
        strengths: ["Mature marketing automation", "Invoicing and payments built in", "Established onboarding/coaching culture"],
        watchOut: "Roughly 3x GoHighLevel's entry price, and its post-acquisition roadmap is folding features into Thryv over time.",
      },
      {
        key: "pipedrive",
        name: "Pipedrive",
        from: "from ~$14–24/user/mo",
        oneLiner: "A visual, sales-pipeline-first CRM built for teams that live in deal stages.",
        bestFor: "Sales-driven teams that want a clean, pipeline-first interface",
        strengths: ["Clean, deal-stage-focused UI", "Fast to learn for a sales team", "Solid mobile app"],
        watchOut: "It's a sales pipeline tool first — no website, booking calendar or receptionist behind it; AI features are add-ons.",
      },
      {
        key: "jobber",
        name: "Jobber",
        from: "from ~$39–69/mo",
        oneLiner: "Field-service management software with a CRM built specifically for home-service trades.",
        bestFor: "Trades businesses managing quotes, scheduling and invoicing for a crew",
        strengths: ["Built specifically for trades workflows", "Quoting, scheduling and invoicing in one place", "Client hub for customers to self-serve"],
        watchOut: "It's a job-management tool, not a lead-capture front office — no AI receptionist or website builder.",
        fitNotes: { trades: "The closest industry-specific alternative, but it assumes the lead already called you — it won't answer the phone." },
      },
    ],
    faq: [
      {
        q: "What's the difference between a CRM and a full front office?",
        a: "A CRM stores leads and customers once you've captured them. A front office also captures them — a website, an AI receptionist and a booking calendar that feed the CRM automatically, instead of relying on someone to type the lead in.",
      },
      {
        q: "Do I need a CRM if I already use spreadsheets?",
        a: "Once you're missing follow-ups or can't tell which lead is which, yes — a CRM's whole job is to make sure a lead never silently disappears, which spreadsheets don't enforce.",
      },
      {
        q: "Is a CRM enough to stop missing leads?",
        a: "Only if something is reliably putting leads into it. Most missed-lead problems happen before the CRM stage — an unanswered call or an abandoned form — which is why pairing the CRM with an AI receptionist closes the actual gap.",
      },
    ],
  },
  {
    slug: "website-builder",
    noun: "website builder",
    nounPlural: "website builders",
    intentLine: "a professional-looking site up fast, without hiring a developer",
    sfPitch:
      "SeldonFrame generates a full multi-page service website — services, service areas, reviews, booking — from a single conversation or a pasted URL, and unlike a plain website builder, it ships with an AI receptionist that answers the phone and chats on the site, a CRM that logs every visitor who reaches out, and a booking calendar the site connects to natively. $29/mo flat, and the site builds free in about 3 minutes before you sign up.",
    freeAngle:
      "Free website builders exist and are genuinely fine for a single static page — but \"free\" website builders reliably paywall the custom domain, strip SEO controls, and slap their own branding on the footer. None of them answer the phone or book the job; the site is the whole product, and everything after the visitor lands is still your problem.",
    contenders: [
      {
        key: "wix",
        name: "Wix",
        from: "from ~$17/mo",
        oneLiner: "The most widely used drag-and-drop website builder, with a huge app marketplace.",
        bestFor: "Businesses wanting full visual control over every pixel of their site",
        strengths: ["Massive template and app library", "Full drag-and-drop design freedom", "AI site-generation option (Wix ADI)"],
        watchOut: "Drag-and-drop freedom means design responsibility — a badly assembled Wix site looks like a badly assembled Wix site.",
      },
      {
        key: "squarespace",
        name: "Squarespace",
        from: "from ~$16–25/mo",
        oneLiner: "A design-forward website builder known for its clean, template-driven aesthetic.",
        bestFor: "Businesses that want a beautiful site fast without much customization",
        strengths: ["Consistently polished templates", "Good built-in blogging and e-commerce", "Owns Acuity, so scheduling pairs natively"],
        watchOut: "Customization beyond the template system is limited, and there's no CRM or lead-capture logic behind the site.",
      },
      {
        key: "durable",
        name: "Durable",
        from: "AI-generated draft is free; paid plans from ~$12/mo",
        oneLiner: "An AI website builder that generates a usable site from a prompt in under a minute.",
        bestFor: "Solo operators who need a web presence up this week",
        strengths: ["Genuinely fast AI generation", "Free tier is usable, not just a demo", "Light CRM and invoicing included"],
        watchOut: "No AI phone answering at all — \"AI\" here means a chat widget and content generation, and output can look template-alike.",
      },
      {
        key: "wordpress",
        name: "WordPress.com",
        from: "from ~$4–25/mo (self-hosted WordPress.org costs vary by host)",
        oneLiner: "The world's most widely used website platform, hosted or self-managed.",
        bestFor: "Content-heavy sites and users wanting the largest plugin ecosystem",
        strengths: ["Enormous plugin/theme ecosystem", "Full ownership if self-hosted", "Best-in-class for blog/content SEO"],
        watchOut: "Self-hosted WordPress means you (or a developer) own security, updates and hosting — real ongoing maintenance.",
      },
      {
        key: "godaddy",
        name: "GoDaddy Websites + Marketing",
        from: "from ~$10/mo",
        oneLiner: "GoDaddy's simple website builder, often bundled with domain registration.",
        bestFor: "Businesses that already bought their domain through GoDaddy",
        strengths: ["Cheapest entry point on this list", "Domain + site + email bundled", "Simple enough for a first-timer"],
        watchOut: "Design flexibility and feature depth are the most limited here — it's built for simplicity, not growth.",
      },
    ],
    faq: [
      {
        q: "Do I need a website builder or a full front office?",
        a: "A website builder gets you a page people can visit. A front office adds what happens after they land — an AI receptionist, a CRM, a booking calendar — so the visit turns into a booked job, not just a page view.",
      },
      {
        q: "Can an AI-generated website actually look professional?",
        a: "Yes, when it's grounded in the real business — services, reviews, actual copy — rather than generic filler text. Pasting an existing site or describing the business gives the generator real facts to work from instead of guessing.",
      },
      {
        q: "How fast can I get a real website live?",
        a: "The fastest AI builders (including SeldonFrame) generate a usable multi-page site in a few minutes; connecting a custom domain typically takes another few minutes once DNS propagates.",
      },
    ],
  },
  {
    slug: "booking-system",
    noun: "booking system",
    nounPlural: "booking systems",
    intentLine: "a way for customers to grab an open slot without a back-and-forth phone call",
    sfPitch:
      "SeldonFrame's booking calendar isn't a standalone widget — it's wired directly to the AI receptionist, so a caller, texter or website chatter can check real availability and book in the same conversation, no separate scheduling link required. It ships with the CRM and website in the same $29/mo flat platform, and you can build the whole thing free in about 3 minutes before you sign up.",
    freeAngle:
      "Free booking tools (Calendly's free tier, Square's single-user plan) are fine for a one-person calendar with light volume. What they don't do is answer the phone, qualify the caller, or log the booking into a customer record — the free tier gets you a link, not a system that captures a lead the moment they reach out on any channel.",
    contenders: BOOKING_CONTENDERS,
    faq: [
      {
        q: "What's the difference between a booking link and a booking system?",
        a: "A booking link (like a bare Calendly page) lets someone who already found you grab a slot. A booking system also captures the lead who calls or texts instead of clicking a link, and logs the booking against a customer record.",
      },
      {
        q: "Can customers book by phone, not just online?",
        a: "With a plain scheduling-link tool, no — someone still has to manually check the calendar and confirm. An AI receptionist wired to the same calendar can check real availability and book during the call itself.",
      },
      {
        q: "Do I need intake questions at booking time?",
        a: "For most service businesses, yes — capturing the job type, address or urgency at booking saves a callback later. Look for a system where the booking flow (or the agent taking the booking) asks those questions automatically.",
      },
    ],
  },
  {
    slug: "booking-app",
    noun: "booking app",
    nounPlural: "booking apps",
    intentLine: "a way to manage bookings from a phone, without being tied to a desktop",
    sfPitch:
      "SeldonFrame's workspace — booking calendar, CRM, the AI receptionist's conversation log — is fully usable from a phone browser, so you can confirm a booking, message a lead or check what the AI receptionist handled overnight without opening a laptop. It's included in the same $29/mo flat platform as the site and CRM, buildable free in about 3 minutes.",
    freeAngle:
      "Free booking apps (Calendly, Square Appointments' single-user tier) work fine as a mobile calendar. What they don't give you on your phone is the customer's history, the conversation that led to the booking, or a way to see what the AI receptionist already told the customer — mobile access to a bare calendar is still a bare calendar.",
    contenders: BOOKING_CONTENDERS,
    faq: [
      {
        q: "Can I run my whole booking calendar from my phone?",
        a: "Most modern booking tools have a usable mobile web view or app; the difference is whether that phone view also shows you the customer's history and the conversation that led to the booking, not just an empty time slot.",
      },
      {
        q: "Do booking apps send reminders automatically?",
        a: "Most do — confirmation and reminder texts/emails are table stakes across this category. The differentiator is whether the reminder comes from the same system that answered the original call or message.",
      },
      {
        q: "Is a mobile booking app enough for a one-person business?",
        a: "For a very low-volume solo operator, often yes. Once missed calls or after-hours messages start costing jobs, the gap isn't the app — it's needing something to answer while you're on a job site.",
      },
    ],
  },
  {
    slug: "ai-receptionist",
    noun: "AI receptionist",
    nounPlural: "AI receptionists",
    intentLine: "someone (or something) that answers every call, qualifies the lead and books the job — even after hours",
    sfPitch:
      "SeldonFrame's AI receptionist answers voice, SMS and web chat with the same brain, checks real availability and books directly into the workspace calendar, and logs every interaction in the CRM — all included at $29/mo flat, running on your own AI and Twilio keys at raw provider cost with no per-minute markup. Build it free in about 3 minutes before you sign up.",
    freeAngle:
      "There's no real free AI receptionist — every option on this list (including SeldonFrame) has some cost, because phone minutes and AI inference both cost money to run. The honest free-tier answer is SeldonFrame's build-before-you-pay flow: the whole workspace, including a working receptionist, builds and is testable free before you ever enter a card.",
    contenders: [
      {
        key: "ghl-ai-employee",
        name: "GoHighLevel AI Employee",
        from: "$50–$97/mo add-on + per-minute voice usage",
        oneLiner: "GoHighLevel's AI Employee add-on, layered onto its existing agency CRM/funnel platform.",
        bestFor: "Agencies already deep in GoHighLevel's funnel and CRM ecosystem",
        strengths: ["Integrates directly with GHL's CRM and pipelines", "Backed by GHL's large template ecosystem", "SaaS-mode reselling available"],
        watchOut: "It's an add-on bolted onto a $97–$497/mo base plan, with per-minute voice usage stacking on top of both.",
      },
      {
        key: "podium-ai",
        name: "Podium AI Employee",
        from: "quote-gated pricing (reported ~$399–$599/mo base + AI add-on)",
        oneLiner: "Podium's native AI employee, part of its messaging-and-reviews platform for local businesses.",
        bestFor: "Multi-location businesses already investing in Podium's reviews and messaging suite",
        strengths: ["Native AI product, not a bolt-on", "Deep review-generation feature set", "Established local-business brand"],
        watchOut: "No public pricing — you have to talk to sales, and third-party reports put real bills at $800–$1,200/mo for multi-location use.",
      },
      {
        key: "goodcall",
        name: "Goodcall",
        from: "from ~$59/mo per agent",
        oneLiner: "A no-code AI phone agent for small businesses, billed per unique monthly caller.",
        bestFor: "Single-location businesses with high repeat-caller volume and simple FAQs",
        strengths: ["Predictable per-caller pricing with unlimited minutes", "Fast, no-code setup", "Reliable for straightforward FAQ-style calls"],
        watchOut: "Caller-count overages cost $0.50 each, and reviewers note multi-step conversations are its weak point.",
      },
      {
        key: "smith-ai",
        name: "Smith.ai",
        from: "human-hybrid; from ~$97.50/mo per-call plans",
        oneLiner: "A North-America-based receptionist service blending AI with human receptionists, billed per call.",
        bestFor: "Professional services wanting a human voice on complex or sensitive calls",
        strengths: ["Genuinely polished human-in-the-loop conversations", "Good fit for high-stakes intake (legal, medical)", "24/7 coverage without staffing"],
        watchOut: "Per-call billing scales with your call volume forever, and the pricing page is a sales-contact form, not a price list.",
      },
      {
        key: "my-ai-front-desk",
        name: "My AI Front Desk",
        from: "from ~$20–99/mo, credit-metered",
        oneLiner: "A budget-friendly AI receptionist for phone, SMS and chat, aimed at single-location small businesses.",
        bestFor: "Single-location businesses wanting the cheapest possible receptionist add-on",
        strengths: ["Low entry price", "Covers voice, SMS and chat", "Fast to set up"],
        watchOut: "The $99/mo plan includes only ~200 voice minutes (about 40 calls) before credit overages kick in, and it's mid-rebrand to \"Frontdesk.\"",
      },
    ],
    faq: [
      {
        q: "Can an AI receptionist actually book appointments, not just take messages?",
        a: "The better ones can — the agent checks a real calendar's availability and books directly into it. The weaker ones just relay a message for a human to call back, which reintroduces the delay you were trying to remove.",
      },
      {
        q: "Does an AI receptionist sound robotic?",
        a: "Quality varies a lot by provider and by how the agent is built. Modern realtime voice models paired with a deterministic tool layer for booking (so the AI never improvises an appointment time) sound natural while staying reliable on the parts that must be exact.",
      },
      {
        q: "What happens if the AI receptionist can't handle a call?",
        a: "A well-built one takes a structured message and immediately notifies the business owner by text or email, logged against the caller in the CRM — the same as a good human receptionist would.",
      },
    ],
  },
  {
    slug: "intake-form-builder",
    noun: "intake form builder",
    nounPlural: "intake form builders",
    intentLine: "a form that captures the right details from a new lead before the first call, without scaring them off with too many fields",
    sfPitch:
      "SeldonFrame ships Formbricks-native intake forms in every workspace, and — unlike a standalone form tool — submissions land directly in the CRM as a contact record, can trigger the AI receptionist to follow up automatically, and connect straight into the booking flow. Included at $29/mo flat, buildable free in about 3 minutes.",
    freeAngle:
      "Google Forms is genuinely free and bare-bones-functional for capturing a name and a message. What it (and most free form tiers) won't do is turn that submission into a tracked lead with automatic follow-up — the form works, but everything after submit is manual.",
    contenders: [
      {
        key: "typeform",
        name: "Typeform",
        from: "from ~$25/mo",
        oneLiner: "A conversational, one-question-at-a-time form builder known for high completion rates.",
        bestFor: "Businesses wanting a polished, high-conversion form experience",
        strengths: ["Best-in-class conversational UX", "Strong logic/branching", "Wide integration list"],
        watchOut: "Response limits are tight on lower tiers, and there's no CRM behind it — submissions still need to be routed somewhere.",
      },
      {
        key: "jotform",
        name: "Jotform",
        from: "free plan; paid from ~$34/mo",
        oneLiner: "A broad, template-heavy form builder with a genuinely usable free tier.",
        bestFor: "Businesses wanting a huge template library without paying up front",
        strengths: ["Usable free tier", "Enormous template library", "Built-in payment collection"],
        watchOut: "The interface feels cluttered next to newer tools, and free-tier submissions and storage are capped.",
      },
      {
        key: "google-forms",
        name: "Google Forms",
        from: "free",
        oneLiner: "Google's completely free, no-frills form builder.",
        bestFor: "Anyone who just needs a simple free form with zero setup",
        strengths: ["Completely free", "Zero learning curve", "Native Google Sheets export"],
        watchOut: "Bare-bones design, no branching logic to speak of, and definitely no CRM or automated follow-up behind it.",
      },
      {
        key: "gravity-forms",
        name: "Gravity Forms",
        from: "from ~$59/yr",
        oneLiner: "The most widely used premium WordPress form plugin.",
        bestFor: "WordPress sites wanting deep form-to-workflow automation",
        strengths: ["Deep WordPress/plugin integration", "Powerful conditional logic", "One-time-ish annual pricing, not per-seat"],
        watchOut: "Requires a WordPress site to run on, and setup is developer-friendlier than plug-and-play.",
      },
      {
        key: "formstack",
        name: "Formstack",
        from: "from ~$50/mo",
        oneLiner: "An enterprise-leaning form and workflow-automation platform.",
        bestFor: "Larger teams needing forms tied into approval workflows and documents",
        strengths: ["Strong workflow/approval automation", "Document generation add-ons", "HIPAA-ready plans available"],
        watchOut: "Priced and built for larger operations — overkill and expensive for a single intake form.",
      },
    ],
    faq: [
      {
        q: "What makes an intake form good for lead capture, not just data collection?",
        a: "The submission has to go somewhere useful automatically — a CRM record, a follow-up trigger, a notification to the owner — rather than sitting in an inbox or spreadsheet waiting to be manually processed.",
      },
      {
        q: "How many fields should an intake form have?",
        a: "As few as will still let you act on the lead — name, contact info, and the one or two details specific to the job. Every extra field measurably lowers completion rates.",
      },
      {
        q: "Can a form replace answering the phone?",
        a: "No — a form only captures leads who are willing to fill one out. Callers and texters who want a faster answer still need something (or someone) picking up in real time.",
      },
    ],
  },
];

export function getBestCategory(slug: string): BestCategory {
  const found = BEST_CATEGORIES.find((c) => c.slug === slug);
  if (!found) throw new Error(`unknown best-page category: ${slug}`);
  return found;
}

// ─── curated combos ─────────────────────────────────────────────────────────

export const BEST_PAGES: BestPage[] = [
  // Max's exact-match YouTube targets.
  { category: "crm", audience: "small-business" },
  { category: "website-builder", audience: "small-business" },
  { category: "website-builder", audience: "construction-companies" },
  { category: "booking-system", audience: "small-business" },
  { category: "booking-app", audience: "small-business" },
  { category: "booking-system", audience: "beauty-businesses" },
  { category: "ai-receptionist", audience: "small-business" },
  { category: "crm", audience: "plumbers" },
  { category: "booking-system", audience: "med-spas" },
  { category: "website-builder", audience: "hvac" },

  // Rest of the curated matrix.
  { category: "crm", audience: "hvac" },
  { category: "crm", audience: "electricians" },
  { category: "crm", audience: "roofers" },
  { category: "crm", audience: "landscapers" },
  { category: "crm", audience: "cleaning" },
  { category: "crm", audience: "construction-companies" },
  { category: "crm", audience: "salons" },
  { category: "crm", audience: "dentists" },

  { category: "website-builder", audience: "plumbers" },
  { category: "website-builder", audience: "electricians" },
  { category: "website-builder", audience: "roofers" },
  { category: "website-builder", audience: "landscapers" },
  { category: "website-builder", audience: "cleaning" },
  { category: "website-builder", audience: "salons" },
  { category: "website-builder", audience: "med-spas" },
  { category: "website-builder", audience: "dentists" },

  { category: "booking-system", audience: "salons" },
  { category: "booking-system", audience: "dentists" },
  { category: "booking-system", audience: "cleaning" },

  { category: "ai-receptionist", audience: "plumbers" },
  { category: "ai-receptionist", audience: "hvac" },
  { category: "ai-receptionist", audience: "med-spas" },
  { category: "ai-receptionist", audience: "dentists" },
  { category: "ai-receptionist", audience: "salons" },

  { category: "intake-form-builder", audience: "small-business" },
  { category: "intake-form-builder", audience: "construction-companies" },
  { category: "intake-form-builder", audience: "med-spas" },
];

/** URL slug for a category+audience combo: `<category>-for-<audience>`. */
export function bestSlug({ category, audience }: BestPage): string {
  return `${category}-for-${audience}`;
}

/** Resolve a `/best/<slug>` URL slug back to its category + audience objects. Throws on unknown. */
export function getBestPage(slug: string): { page: BestPage; category: BestCategory; audience: BestAudience } {
  const page = BEST_PAGES.find((p) => bestSlug(p) === slug);
  if (!page) throw new Error(`unknown best-page slug: ${slug}`);
  return { page, category: getBestCategory(page.category), audience: getBestAudience(page.audience) };
}

/** Every valid `/best/<slug>` URL slug, for generateStaticParams + sitemap. */
export function allBestSlugs(): string[] {
  return BEST_PAGES.map(bestSlug);
}

/** Lowercase a noun/label for mid-sentence use WITHOUT mangling acronyms:
 *  "HVAC Companies" → "HVAC companies", "CRMs" stays "CRMs", "Med Spas" → "med spas". */
export function midSentence(s: string): string {
  return s
    .split(" ")
    .map((w) => (/^[A-Z0-9]{2,}s?$/.test(w) ? w : w.toLowerCase()))
    .join(" ");
}
