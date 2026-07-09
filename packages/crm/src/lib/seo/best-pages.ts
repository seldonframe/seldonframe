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
  /** The vendor's own public pricing/product page — https only. Powers the
   *  per-contender "(source)" outbound link (citable-listicle spec §5). When a
   *  competitor also exists in competitor-pricing.ts, this MUST match that
   *  entry's pricingUrl verbatim (same-fact single-source-of-truth). */
  sourceUrl?: string;
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
  /** YouTube video ID to embed under the H1 intro (lite-youtube.tsx) — a seam
   *  only, never set until a real video exists for that combo. */
  videoId?: string;
  /** ISO 8601 upload date for the video, required alongside videoId before
   *  VideoObject JSON-LD is emitted (schema.org requires uploadDate). */
  videoUploadDate?: string;
};

// ─── audiences ──────────────────────────────────────────────────────────────

export const BEST_AUDIENCES: BestAudience[] = [
  {
    slug: "small-business",
    label: "Small Businesses",
    group: "general",
    painHook: "every extra click between a visitor and a booked appointment is a customer who goes back to search and picks someone else",
    exampleService: "a booked consultation",
  },
  {
    slug: "plumbers",
    label: "Plumbers",
    group: "trades",
    painHook: "a homeowner with a burst pipe books whoever answers the phone fastest and whoever's website loads fastest — not whoever has the nicest logo",
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
    painHook: "a tripped breaker panel is a same-day job — the business that answers the phone and shows an open time slot wins it",
    exampleService: "a panel repair estimate",
  },
  {
    slug: "roofers",
    label: "Roofers",
    group: "trades",
    painHook: "storm-damage leads check three roofers' websites before lunch and book with whoever felt easiest to reach",
    exampleService: "a roof inspection booking",
  },
  {
    slug: "landscapers",
    label: "Landscapers",
    group: "trades",
    painHook: "spring quote requests pile up while the crew is out on the mowers, and a slow form loses the job",
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
    painHook: "a homeowner comparing bids judges the company by how professional the website and follow-up feel, not just the price on the quote",
    exampleService: "a project estimate request",
  },
  {
    slug: "salons",
    label: "Salons & Barbershops",
    group: "beauty",
    painHook: "a stylist in the middle of a cut can't answer the phone, so an online booking page is the only thing standing between that missed call and a lost client",
    exampleService: "a color appointment booking",
  },
  {
    slug: "med-spas",
    label: "Med Spas",
    group: "beauty",
    painHook: "big-ticket consultation requests slip away when booking feels clunkier than the med spa down the street",
    exampleService: "a Botox consultation booking",
  },
  {
    slug: "beauty-businesses",
    label: "Beauty Businesses",
    group: "beauty",
    painHook: "clients expect to book a slot from Instagram in under a minute — playing phone tag loses the appointment",
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
    oneLiner: "The tool that made scheduling links popular — you share a link, people pick a free time slot.",
    bestFor: "Solo professionals and teams booking 1:1 meetings",
    strengths: ["Free plan actually works, not just a demo", "Connects to tons of calendars and video apps", "Very easy to set up"],
    watchOut: "It's just a scheduling link, not a full business system — no CRM, no customer records, no form before the booking.",
    sourceUrl: "https://calendly.com/pricing",
  },
  {
    key: "acuity",
    name: "Acuity Scheduling",
    from: "from ~$16/mo",
    oneLiner: "A scheduler owned by Squarespace, built for service businesses that need forms and package pricing.",
    bestFor: "Service businesses needing intake forms + package pricing at booking time",
    strengths: ["Forms built right into booking", "Handles classes and package deals", "Works closely with Squarespace"],
    watchOut: "It has no website or CRM of its own — you have to connect it to whatever site and contact system you already use.",
    fitNotes: { beauty: "A common choice for solo stylists, but it's just a booking box, not a full salon system." },
    sourceUrl: "https://acuityscheduling.com/pricing.php",
  },
  {
    key: "square-appointments",
    name: "Square Appointments",
    from: "free for a single user; paid from ~$29/mo",
    oneLiner: "Square's scheduling tool, tied closely to Square's payments and checkout.",
    bestFor: "Businesses already running Square for payments and checkout",
    strengths: ["Free plan for one location", "Payments and checkout built in", "Familiar, clean design"],
    watchOut: "The free plan only covers one staff member, and it's most useful if you already use Square for payments.",
    sourceUrl: "https://squareup.com/us/en/appointments/pricing",
  },
  {
    key: "vagaro",
    name: "Vagaro",
    from: "from ~$30/mo",
    oneLiner: "A booking and business-management tool made specifically for salons, spas and fitness studios.",
    bestFor: "Salons, spas and fitness studios wanting an industry-specific booking suite",
    strengths: ["Built for the industry (memberships, retail, staff pay)", "Listed in its own marketplace so new clients can find you", "Tracks client history and sells retail products at checkout"],
    watchOut: "The design feels older next to newer tools, and the price climbs fast once you add staff and marketing extras.",
    fitNotes: { beauty: "Made for this industry, but your booking box will always look like Vagaro's, not your own site." },
    sourceUrl: "https://www.vagaro.com/pro/pricing",
  },
  {
    key: "housecall-pro",
    name: "Housecall Pro",
    from: "from ~$59–79/mo",
    oneLiner: "Software for running a whole trades crew — scheduling, dispatch, invoices and payments in one place.",
    bestFor: "Trades businesses managing crews, dispatch and invoicing, not just booking",
    strengths: ["Built for sending crews out and tracking jobs", "Invoices and payments included", "Strong tools made for trades work"],
    watchOut: "It's priced and built for running a crew, not a simple public booking page — too much for a solo operator.",
    fitNotes: { trades: "About as close to a standard as it gets for multi-truck companies, but more than most solo trades need." },
    sourceUrl: "https://www.housecallpro.com/pricing/",
  },
  {
    key: "cal-com",
    name: "Cal.com",
    from: "open-source, free to self-host; teams from ~$15/user/mo",
    oneLiner: "A free, open-source scheduling tool — the tech-friendly alternative to Calendly you can run yourself.",
    bestFor: "Technical teams wanting an open, self-hostable scheduling layer",
    strengths: ["Completely open-source and self-hostable", "Built for developers to customize deeply", "You keep full control of your data"],
    watchOut: "Running it yourself means you're the tech support; the paid team plan adds up, and it still has no CRM or website.",
    sourceUrl: "https://cal.com/pricing",
  },
];

// ─── categories ─────────────────────────────────────────────────────────────

export const BEST_CATEGORIES: BestCategory[] = [
  {
    slug: "crm",
    noun: "CRM",
    nounPlural: "CRMs",
    intentLine: "a place to keep every lead and customer so nobody gets forgotten",
    sfPitch:
      "SeldonFrame is more than a CRM — a CRM is just a customer list. SeldonFrame is a whole front office: an AI receptionist that answers calls, texts and chats, a website, a booking calendar and forms, all writing into the same customer list on their own. Most CRMs on this list make you type in every lead by hand; SeldonFrame's agent adds it the moment the customer reaches out. It costs $29/mo flat, and you can build the whole thing free in about 3 minutes before you ever sign up.",
    freeAngle:
      "Free CRMs exist (HubSpot's free plan is the best-known one), but \"free\" almost always means a small cap on contacts, no automatic follow-up, and a push toward paid plans the moment you need more than storing a name and a phone number. The real goal is never missing a lead, not just having a place to write one down — a free CRM by itself still won't answer the phone or send the follow-up text.",
    contenders: [
      {
        key: "gohighlevel",
        name: "GoHighLevel",
        from: "from $97/mo (AI Employee add-on $50–$97/mo)",
        oneLiner: "A big toolbox for agencies — CRM plus a builder for marketing funnels, made to sell to other businesses.",
        bestFor: "Agencies running funnels, email campaigns and multi-client pipelines",
        strengths: ["A huge set of features (funnels, courses, pipelines)", "Agencies can resell it under their own brand", "A large library of ready-made templates"],
        watchOut: "The AI is a paid extra, not part of the base plan, and costs add up per client — people say it takes 2–4 weeks to really learn.",
        sourceUrl: "https://www.gohighlevel.com/pricing",
      },
      {
        key: "hubspot",
        name: "HubSpot",
        from: "free CRM; Starter from ~$15/seat/mo, Professional ~$800/mo + onboarding",
        oneLiner: "The well-known, polished CRM built for bigger companies.",
        bestFor: "Businesses planning to scale into enterprise-grade marketing and reporting",
        strengths: ["Some of the best reports and CRM detail around", "The free plan is actually usable to start", "Connects to a huge number of other tools"],
        watchOut: "Jumping from Starter to Professional costs about 40 times more, plus a required ~$3,000 setup fee at that level.",
        sourceUrl: "https://www.hubspot.com/pricing/marketing",
      },
      {
        key: "zoho",
        name: "Zoho CRM",
        from: "from ~$14–20/user/mo",
        oneLiner: "A deep, customizable CRM that costs far less than the big-company options, part of a 45-app suite.",
        bestFor: "Budget-conscious teams wanting deep customization without enterprise pricing",
        strengths: ["Great value for the price per seat", "Lets you customize a lot and build your own workflows", "Includes a Zia AI helper on higher plans"],
        watchOut: "To get the real value you have to combine several Zoho apps together — it's a toolkit, not a ready-to-go front office.",
        sourceUrl: "https://www.zoho.com/crm/zohocrm-pricing.html",
      },
      {
        key: "keap",
        name: "Keap",
        from: "from ~$249–299/mo",
        oneLiner: "A long-running small-business CRM (now owned by Thryv) built around sales pipelines and invoices.",
        bestFor: "Established small businesses wanting mature sales automation",
        strengths: ["Well-built marketing automation", "Invoices and payments built in", "A long history of onboarding and coaching customers"],
        watchOut: "It costs about 3 times more than GoHighLevel's starting price, and features are slowly being folded into Thryv over time.",
        sourceUrl: "https://keap.com/pricing",
      },
      {
        key: "pipedrive",
        name: "Pipedrive",
        from: "from ~$14–24/user/mo",
        oneLiner: "A CRM built around a visual sales pipeline, for teams that track deals stage by stage.",
        bestFor: "Sales-driven teams that want a clean, pipeline-first interface",
        strengths: ["A clean screen built around deal stages", "Quick for a sales team to learn", "A solid mobile app"],
        watchOut: "It's a sales pipeline tool first — no website, booking calendar or receptionist behind it; AI features cost extra.",
        sourceUrl: "https://www.pipedrive.com/en/pricing",
      },
      {
        key: "jobber",
        name: "Jobber",
        from: "from ~$39–69/mo",
        oneLiner: "Software for running home-service jobs, with a CRM built specifically for trades.",
        bestFor: "Trades businesses managing quotes, scheduling and invoicing for a crew",
        strengths: ["Built specifically for how trades work", "Quotes, scheduling and invoices all in one place", "A hub where customers can help themselves"],
        watchOut: "It's a job-management tool, not a lead-capture front office — no AI receptionist or website builder.",
        fitNotes: { trades: "The closest trades-specific option, but it assumes the lead already called you — it won't answer the phone." },
        sourceUrl: "https://www.getjobber.com/pricing/",
      },
    ],
    faq: [
      {
        q: "What's the difference between a CRM and a full front office?",
        a: "A CRM stores leads and customers once you already have them. A front office also captures them — a website, an AI receptionist and a booking calendar that feed the CRM by themselves, instead of someone typing each lead in by hand.",
      },
      {
        q: "Do I need a CRM if I already use spreadsheets?",
        a: "Once you start missing follow-ups or losing track of who's who, yes — a CRM's whole job is to make sure a lead never quietly disappears, which spreadsheets don't do on their own.",
      },
      {
        q: "Is a CRM enough to stop missing leads?",
        a: "Only if something is reliably putting leads into it. Most missed leads happen before the CRM stage — an unanswered call or an abandoned form — which is why pairing a CRM with an AI receptionist closes the real gap.",
      },
    ],
  },
  {
    slug: "website-builder",
    noun: "website builder",
    nounPlural: "website builders",
    intentLine: "a good-looking site up fast, without hiring a developer",
    sfPitch:
      "SeldonFrame builds a full, many-page service website — services, service areas, reviews, booking — from one conversation or a pasted web address. Unlike a plain website builder, it also comes with an AI receptionist that answers the phone and chats on the site, a CRM that logs every visitor who reaches out, and a booking calendar built right in. It's $29/mo flat, and the site builds free in about 3 minutes before you sign up.",
    freeAngle:
      "Free website builders exist and work fine for one simple page — but free plans usually make you pay to use your own web address, remove SEO controls, and stick their own branding on the bottom of your site. None of them answer the phone or book the job; the site is the whole product, and everything that happens after a visitor lands is still up to you.",
    contenders: [
      {
        key: "wix",
        name: "Wix",
        from: "from ~$17/mo",
        oneLiner: "The most-used drag-and-drop website builder, with a huge library of add-on apps.",
        bestFor: "Businesses wanting full visual control over every pixel of their site",
        strengths: ["A massive library of templates and apps", "Full freedom to drag and drop your own design", "An AI option that builds a starter site for you (Wix ADI)"],
        watchOut: "Drag-and-drop freedom means the design is on you — a badly put-together Wix site looks like a badly put-together Wix site.",
        sourceUrl: "https://www.wix.com/plans",
      },
      {
        key: "squarespace",
        name: "Squarespace",
        from: "from ~$16–25/mo",
        oneLiner: "A website builder known for clean, good-looking templates.",
        bestFor: "Businesses that want a beautiful site fast without much customization",
        strengths: ["Templates that consistently look polished", "Good built-in blog and online store tools", "Owns Acuity, so booking connects easily"],
        watchOut: "You can't customize much beyond the template system, and there's no CRM or lead-capture behind the site.",
        sourceUrl: "https://www.squarespace.com/pricing",
      },
      {
        key: "durable",
        name: "Durable",
        from: "AI-generated draft is free; paid plans from ~$12/mo",
        oneLiner: "An AI website builder that makes a usable site from a short prompt in under a minute.",
        bestFor: "Solo operators who need a web presence up this week",
        strengths: ["Genuinely fast to generate", "The free plan is usable, not just a demo", "Comes with a light CRM and invoicing"],
        watchOut: "It has no AI phone answering at all — \"AI\" here just means a chat box and written content, and sites can look similar to each other.",
        sourceUrl: "https://durable.com/pricing",
      },
      {
        key: "wordpress",
        name: "WordPress.com",
        from: "from ~$4–25/mo (self-hosted WordPress.org costs vary by host)",
        oneLiner: "The world's most-used website platform, either hosted for you or run on your own.",
        bestFor: "Content-heavy sites and users wanting the largest plugin ecosystem",
        strengths: ["A huge library of plugins and themes", "Full ownership if you host it yourself", "Some of the best tools for blog and content SEO"],
        watchOut: "Hosting WordPress yourself means you (or a developer) are in charge of security, updates and hosting — real ongoing work.",
        sourceUrl: "https://wordpress.com/pricing/",
      },
      {
        key: "godaddy",
        name: "GoDaddy Websites + Marketing",
        from: "from ~$10/mo",
        oneLiner: "GoDaddy's simple website builder, often sold together with your domain name.",
        bestFor: "Businesses that already bought their domain through GoDaddy",
        strengths: ["The cheapest starting price on this list", "Domain, site and email all bundled together", "Simple enough for a first-timer"],
        watchOut: "Design freedom and features are the most limited here — it's built for simplicity, not for growing later.",
        sourceUrl: "https://www.godaddy.com/websites/website-builder",
      },
    ],
    faq: [
      {
        q: "Do I need a website builder or a full front office?",
        a: "A website builder gets you a page people can visit. A front office also handles what happens after they land — an AI receptionist, a CRM, a booking calendar — so the visit turns into a booked job, not just a page view.",
      },
      {
        q: "Can an AI-generated website actually look professional?",
        a: "Yes, when it's built from facts about the real business — actual services, actual reviews, real copy — instead of generic filler text. Pasting an existing site or describing the business gives it real facts to build from instead of guessing.",
      },
      {
        q: "How fast can I get a real website live?",
        a: "The fastest AI builders (including SeldonFrame) make a usable, many-page site in a few minutes; connecting your own web address usually takes another few minutes once it updates.",
      },
    ],
  },
  {
    slug: "booking-system",
    noun: "booking system",
    nounPlural: "booking systems",
    intentLine: "a way for customers to grab an open time slot without a back-and-forth phone call",
    sfPitch:
      "SeldonFrame's booking calendar isn't a separate box bolted on — it's wired straight into the AI receptionist, so a caller, texter or website chatter can check real open times and book in the same conversation, no separate link needed. It comes with the CRM and website in the same $29/mo flat plan, and you can build the whole thing free in about 3 minutes before you sign up.",
    freeAngle:
      "Free booking tools (Calendly's free plan, Square's single-user plan) work fine for one person with a light schedule. What they don't do is answer the phone, ask the caller questions, or save the booking to a customer record — the free plan gets you a link, not a system that catches a lead the moment they reach out on any channel.",
    contenders: BOOKING_CONTENDERS,
    faq: [
      {
        q: "What's the difference between a booking link and a booking system?",
        a: "A booking link (like a bare Calendly page) lets someone who already found you grab a time slot. A booking system also catches the lead who calls or texts instead of clicking a link, and saves the booking to a customer record.",
      },
      {
        q: "Can customers book by phone, not just online?",
        a: "With a plain scheduling-link tool, no — someone still has to check the calendar by hand and confirm. An AI receptionist wired to the same calendar can check real open times and book it during the call itself.",
      },
      {
        q: "Do I need to ask questions at booking time?",
        a: "For most service businesses, yes — asking the job type, address or how urgent it is at booking time saves a callback later. Look for a system where the booking step (or the agent taking the booking) asks those questions on its own.",
      },
    ],
  },
  {
    slug: "booking-app",
    noun: "booking app",
    nounPlural: "booking apps",
    intentLine: "a way to manage bookings from a phone, without being stuck at a desktop",
    sfPitch:
      "SeldonFrame's workspace — booking calendar, CRM, and the AI receptionist's call log — works fully from a phone browser, so you can confirm a booking, message a lead or check what the AI receptionist handled overnight without opening a laptop. It's included in the same $29/mo flat plan as the site and CRM, and you can build it free in about 3 minutes.",
    freeAngle:
      "Free booking apps (Calendly, Square Appointments' single-user plan) work fine as a mobile calendar. What they don't show you on your phone is the customer's history, the conversation that led to the booking, or what the AI receptionist already told the customer — a mobile view of a bare calendar is still just a bare calendar.",
    contenders: BOOKING_CONTENDERS,
    faq: [
      {
        q: "Can I run my whole booking calendar from my phone?",
        a: "Most modern booking tools have a usable mobile view or app; the real difference is whether that phone view also shows the customer's history and the conversation that led to the booking, not just an empty time slot.",
      },
      {
        q: "Do booking apps send reminders automatically?",
        a: "Most do — confirmation and reminder texts or emails are standard across this category. What differs is whether the reminder comes from the same system that answered the original call or message.",
      },
      {
        q: "Is a mobile booking app enough for a one-person business?",
        a: "For a solo operator with very few bookings, often yes. Once missed calls or after-hours messages start costing jobs, the real gap isn't the app — it's needing something to answer while you're out on a job.",
      },
    ],
  },
  {
    slug: "ai-receptionist",
    noun: "AI receptionist",
    nounPlural: "AI receptionists",
    intentLine: "someone (or something) that answers every call, asks the right questions and books the job — even after hours",
    sfPitch:
      "SeldonFrame's AI receptionist answers phone calls, texts and website chat with the same brain, checks real open times and books straight into your calendar, and saves every conversation to the CRM. All of that is included at $29/mo flat, running on your own AI and phone-line keys at the real provider cost with no extra fee per minute. Build it free in about 3 minutes before you sign up.",
    freeAngle:
      "There's no truly free AI receptionist — every option on this list (SeldonFrame included) costs something, because phone minutes and AI thinking both cost real money to run. The honest free answer is SeldonFrame's build-before-you-pay setup: the whole workspace, including a working receptionist, builds and can be tested free before you ever enter a card.",
    contenders: [
      {
        key: "ghl-ai-employee",
        name: "GoHighLevel AI Employee",
        from: "$50–$97/mo add-on + per-minute voice usage",
        oneLiner: "GoHighLevel's AI receptionist add-on, layered onto its existing agency CRM and marketing platform.",
        bestFor: "Agencies already deep in GoHighLevel's funnel and CRM ecosystem",
        strengths: ["Connects directly to GHL's CRM and pipelines", "Backed by GHL's large library of templates", "Agencies can resell it under their own brand"],
        watchOut: "It's an extra bolted onto a $97–$497/mo base plan, with per-minute phone costs stacking on top of both.",
        sourceUrl: "https://www.gohighlevel.com/pricing",
      },
      {
        key: "podium-ai",
        name: "Podium AI Employee",
        from: "quote-gated pricing (reported ~$399–$599/mo base + AI add-on)",
        oneLiner: "Podium's built-in AI receptionist, part of its messaging-and-reviews platform for local businesses.",
        bestFor: "Multi-location businesses already investing in Podium's reviews and messaging suite",
        strengths: ["Built as its own AI product, not bolted on", "A deep set of review-generation tools", "A well-known name among local businesses"],
        watchOut: "There's no public price — you have to talk to sales, and outside reports put real bills at $800–$1,200/mo for multiple locations.",
        sourceUrl: "https://www.podium.com/pricing",
      },
      {
        key: "goodcall",
        name: "Goodcall",
        from: "from ~$59/mo per agent",
        oneLiner: "A no-code AI phone agent for small businesses, priced by how many different callers you get each month.",
        bestFor: "Single-location businesses with high repeat-caller volume and simple FAQs",
        strengths: ["Simple, predictable price with unlimited minutes", "Quick, no-code setup", "Reliable for simple, FAQ-style calls"],
        watchOut: "Going over your caller count costs $0.50 per extra caller, and reviewers say longer, multi-step conversations are its weak spot.",
        sourceUrl: "https://www.goodcall.com/pricing",
      },
      {
        key: "smith-ai",
        name: "Smith.ai",
        from: "human-hybrid; from ~$97.50/mo per-call plans",
        oneLiner: "A North-America-based receptionist service that mixes AI with real human receptionists, billed per call.",
        bestFor: "Professional services wanting a human voice on complex or sensitive calls",
        strengths: ["Genuinely smooth conversations with a human in the loop", "A good fit for sensitive calls (legal, medical)", "24/7 coverage without hiring staff"],
        watchOut: "The bill grows with your call volume forever, and the pricing page is just a contact-sales form, not a price list.",
        sourceUrl: "https://smith.ai/pricing/ai-receptionist",
      },
      {
        key: "my-ai-front-desk",
        name: "My AI Front Desk",
        from: "from ~$20–99/mo, credit-metered",
        oneLiner: "A budget-friendly AI receptionist for phone, text and chat, aimed at single-location small businesses.",
        bestFor: "Single-location businesses wanting the cheapest possible receptionist add-on",
        strengths: ["A low starting price", "Covers phone calls, texting and chat", "Quick to set up"],
        watchOut: "The $99/mo plan includes only about 200 voice minutes (roughly 40 calls) before you pay overage credits, and the brand is mid-rename to \"Frontdesk.\"",
        sourceUrl: "https://www.myaifrontdesk.com/pricing",
      },
    ],
    faq: [
      {
        q: "Can an AI receptionist actually book appointments, not just take messages?",
        a: "The better ones can — the agent checks a real calendar's open times and books straight into it. The weaker ones just pass along a message for a human to call back, which brings back the delay you were trying to remove.",
      },
      {
        q: "Does an AI receptionist sound robotic?",
        a: "Quality varies a lot by provider and how the agent is built. Modern realtime voice models paired with a strict, rule-based booking step (so the AI never makes up an appointment time) can sound natural while staying accurate on the parts that must be exact.",
      },
      {
        q: "What happens if the AI receptionist can't handle a call?",
        a: "A well-built one takes down a clear message and immediately tells the business owner by text or email, saved against the caller in the CRM — the same as a good human receptionist would do.",
      },
    ],
  },
  {
    slug: "intake-form-builder",
    noun: "intake form builder",
    nounPlural: "intake form builders",
    intentLine: "a form that grabs the right details from a new lead before the first call, without scaring them off with too many questions",
    sfPitch:
      "Every SeldonFrame workspace comes with a built-in intake form, and unlike a standalone form tool, each submission lands straight in the CRM as a contact, can trigger the AI receptionist to follow up on its own, and connects right into booking. Included at $29/mo flat, and you can build it free in about 3 minutes.",
    freeAngle:
      "Google Forms is genuinely free and works fine for grabbing a name and a message. What it (and most free form plans) won't do is turn that submission into a tracked lead with automatic follow-up — the form itself works, but everything after someone hits submit is on you.",
    contenders: [
      {
        key: "typeform",
        name: "Typeform",
        from: "from ~$25/mo",
        oneLiner: "A form builder that asks one question at a time, known for people actually finishing it.",
        bestFor: "Businesses wanting a polished, high-conversion form experience",
        strengths: ["Some of the smoothest form design around", "Strong branching logic", "Connects to a wide range of tools"],
        watchOut: "Response limits are tight on cheaper plans, and there's no CRM behind it — submissions still need somewhere to go.",
        sourceUrl: "https://www.typeform.com/pricing/",
      },
      {
        key: "jotform",
        name: "Jotform",
        from: "free plan; paid from ~$34/mo",
        oneLiner: "A broad form builder with tons of templates and a genuinely usable free plan.",
        bestFor: "Businesses wanting a huge template library without paying up front",
        strengths: ["A free plan that actually works", "A huge library of templates", "Built-in payment collection"],
        watchOut: "The screen feels cluttered next to newer tools, and the free plan caps submissions and storage.",
        sourceUrl: "https://www.jotform.com/pricing/",
      },
      {
        key: "google-forms",
        name: "Google Forms",
        from: "free",
        oneLiner: "Google's completely free, no-frills form builder.",
        bestFor: "Anyone who just needs a simple free form with zero setup",
        strengths: ["Completely free", "Nothing to learn", "Exports straight to Google Sheets"],
        watchOut: "Very basic design, almost no branching logic, and definitely no CRM or automatic follow-up behind it.",
        sourceUrl: "https://workspace.google.com/products/forms/",
      },
      {
        key: "gravity-forms",
        name: "Gravity Forms",
        from: "from ~$59/yr",
        oneLiner: "The most-used paid form plugin for WordPress sites.",
        bestFor: "WordPress sites wanting deep form-to-workflow automation",
        strengths: ["Works deeply with WordPress and its plugins", "Powerful conditional logic", "A yearly price instead of per-person pricing"],
        watchOut: "It needs a WordPress site to run on, and setup leans more toward developers than plug-and-play.",
        sourceUrl: "https://www.gravityforms.com/pricing/",
      },
      {
        key: "formstack",
        name: "Formstack",
        from: "from ~$50/mo",
        oneLiner: "A form and workflow-automation platform built more for bigger companies.",
        bestFor: "Larger teams needing forms tied into approval workflows and documents",
        strengths: ["Strong approval-workflow automation", "Add-ons that generate documents", "Plans built to meet HIPAA rules"],
        watchOut: "It's priced and built for bigger operations — too much, and too expensive, for a single intake form.",
        sourceUrl: "https://www.formstack.com/pricing",
      },
    ],
    faq: [
      {
        q: "What makes an intake form good for lead capture, not just data collection?",
        a: "The submission has to go somewhere useful on its own — a CRM record, an automatic follow-up, a notice to the owner — instead of sitting in an inbox or spreadsheet waiting for someone to notice it.",
      },
      {
        q: "How many fields should an intake form have?",
        a: "As few as you need to act on the lead — name, contact info, and the one or two details specific to the job. Every extra field measurably lowers how many people finish it.",
      },
      {
        q: "Can a form replace answering the phone?",
        a: "No — a form only catches leads who are willing to fill one out. Callers and texters who want a faster answer still need something (or someone) to pick up right away.",
      },
    ],
  },
  {
    slug: "ai-agent",
    noun: "AI agent",
    nounPlural: "AI agents",
    intentLine: "one AI worker that actually does the job — answers customers, books the work and updates records — instead of just chatting back",
    sfPitch:
      "SeldonFrame builds you an AI agent that works the whole front office: it answers on the phone, website chat, SMS and email with one brain, checks your real calendar and books the job, then writes every conversation back to the CRM. You describe the business in plain English and it's built in about 3 minutes, bound to your own tools and running on your own AI keys at cost — all at $29/mo flat. Most tools on this list do one channel or one job; this is the agent built for the gap between \"a customer reached out\" and \"someone followed up.\"",
    freeAngle:
      "There's no genuinely free AI agent that runs a front office — every option here (SeldonFrame included) has a real cost, because AI thinking and phone minutes both cost money to run. The honest free answer is SeldonFrame's build-before-you-pay flow: the whole workspace, agent included, builds and can be tested free before you ever enter a card. Sintra, Tidio and Zapier all have free or low tiers, but each caps usage tightly enough that a busy month pushes you onto a paid plan fast.",
    contenders: [
      {
        key: "sintra",
        name: "Sintra AI",
        from: "from ~$39/mo; the all-12 bundle is listed at ~$97/mo",
        oneLiner: "A pack of role-based AI \"employees\" — social, support, email, SEO, sales — that you chat with to knock out marketing and admin busywork.",
        bestFor: "Solo owners and micro-teams wanting a cheap, broad set of AI helpers for content and admin",
        strengths: ["A low entry price for a lot of surface area", "Twelve ready-made personas with templates", "A plain chat interface with no technical setup"],
        watchOut: "Every plan is capped at 250 credits a month, so heavy use hits the ceiling quickly, and the lowest monthly prices are teaser rates that need a long prepay commitment to unlock.",
        sourceUrl: "https://sintra.ai/pricing",
        fitNotes: {
          general: "Good for the marketing-and-admin side of a small business, but it won't answer your phone or book a job — it's an assistant, not a front-desk agent.",
        },
      },
      {
        key: "tidio-lyro",
        name: "Tidio (Lyro AI)",
        from: "free plan (50 one-time Lyro chats); the Lyro add-on is from ~$39/mo",
        oneLiner: "A live-chat and helpdesk tool whose \"Lyro\" AI agent auto-answers customer-service questions on your website.",
        bestFor: "Small e-commerce and service sites wanting affordable website chat plus a bolt-on AI for common questions",
        strengths: ["A real free tier to start on", "Fast website setup", "Lyro is conversation-metered, so light users pay little"],
        watchOut: "Lyro is a separate paid add-on on top of the base Tidio plan, the free conversations are a one-time allowance rather than monthly, and the conversation caps make costs climb with volume.",
        sourceUrl: "https://www.tidio.com/pricing/",
        fitNotes: {
          general: "Solid for website chat, but it lives on your site — it won't handle phone calls or push bookings into a calendar on its own.",
        },
      },
      {
        key: "zapier-agents",
        name: "Zapier Agents",
        from: "free tier; the Agents add-on is reported from ~$20/mo on top of a base Zapier plan (paid from ~$20/mo)",
        oneLiner: "AI agents that live inside Zapier and take actions across your 6,000+ connected apps to run multi-step workflows.",
        bestFor: "Owners and ops people already on Zapier who want agents that trigger real actions across their app stack",
        strengths: ["Unmatched breadth of app integrations", "Agents actually execute steps, not just chat", "Builds on familiar Zapier automation"],
        watchOut: "Pricing stacks an Agents add-on onto a base plan plus task-usage billing, so the true monthly cost is easy to underestimate, and the standalone Agents price isn't stated cleanly — confirm current terms before committing.",
        sourceUrl: "https://zapier.com/pricing",
      },
      {
        key: "intercom-fin",
        name: "Intercom Fin",
        from: "usage-based, from ~$0.99 per resolved conversation (50/mo minimum) + Intercom seats from ~$29/seat/mo",
        oneLiner: "An AI support agent that autonomously answers customer questions and resolves tickets across chat, email and help desk.",
        bestFor: "Support teams with real ticket volume — especially existing Intercom customers — wanting proven, outcome-priced deflection",
        strengths: ["You pay mainly for successful outcomes", "Strong published resolution rates (~40-50%)", "A mature, well-integrated support platform"],
        watchOut: "The bill scales directly with volume and can be hard to predict, an \"outcome\" is billed more broadly than a clean resolution, and you pay Intercom seat fees on top of the per-outcome cost.",
        sourceUrl: "https://fin.ai/pricing",
      },
      {
        key: "agentforce",
        name: "Salesforce Agentforce",
        from: "listed at ~$2 per conversation, or usage credits at ~$0.10/action; per-user editions run far higher — effectively quote-gated",
        oneLiner: "Salesforce's platform for building autonomous AI agents that act on your CRM data across sales, service and marketing.",
        bestFor: "Mid-market and enterprise teams already deep in Salesforce that want agents wired straight into their CRM",
        strengths: ["Deep native Salesforce CRM and data integration", "Several pricing models to fit different uses", "Enterprise-grade governance and scale"],
        watchOut: "It's genuinely enterprise software, not a small-business tool — pricing is split across three-plus models that can't all coexist in one org, so any real deployment needs a sales conversation and a big budget.",
        sourceUrl: "https://www.salesforce.com/agentforce/pricing/",
      },
    ],
    faq: [
      {
        q: "What's the difference between an AI agent and an AI chatbot?",
        a: "A chatbot answers questions; an agent takes actions. The line that matters for a small business is whether the tool can actually do the next step — check a real calendar and book the slot, create the CRM record, send the follow-up — or whether it just replies and leaves the doing to you.",
      },
      {
        q: "Do I need a technical person to set up an AI agent?",
        a: "Not with the small-business tools on this list — Sintra, Tidio and SeldonFrame are built for non-technical owners. The enterprise options (Agentforce, and the more advanced Zapier setups) reward someone comfortable wiring up data and actions.",
      },
      {
        q: "Will an AI agent's cost stay predictable?",
        a: "It depends on the pricing model. Usage-based tools (per resolution, per conversation, per minute, per action) can spike in a busy month, while flat-rate tools trade that risk for a fixed bill. If predictability matters, favor a flat price or set hard usage caps before you turn one loose.",
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
  { category: "ai-agent", audience: "small-business" },
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
