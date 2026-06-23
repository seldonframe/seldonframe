// Programmatic-SEO/GEO agent-page registry — the FIRST dimension of the matrix
// (the "job" an agent does) plus the pure copy-composition engine that turns a
// job (optionally crossed with a vertical) into a citable, stat-backed answer
// page. Pure data + pure functions (no React, no "use server", no db) so it is
// unit-tested and imported from the static routes, the sitemap, and llms.txt.
//
// WHY GEO, not keyword SEO: the research (Princeton's "GEO: Generative Engine
// Optimization", arxiv 2311.09735) found that adding CITED statistics + quotes +
// authoritative sources lifts a page's visibility in LLM answers by ~30-40%,
// while keyword stuffing does nothing. So every job here carries a REAL pain
// stat with a REAL source URL — these power the rendered "cited stat" block and
// the schema.org markup, NOT keyword soup.
//
// TRUTHFULNESS INVARIANT (guarded by agent-pages.spec.ts): every job has a
// painStat whose `source` is a real, plausible https URL and whose `text`
// states a conservative, well-known figure. We do NOT fabricate fake numbers or
// fake sources. Where an exact figure is debated, we use a widely-cited
// conservative one and attribute it to the body that published it.
//
// ADDITIVE ONLY: no entity, no migration. `canonicalAgentSlug` maps each job to
// the EXISTING starter pack (lib/agent-templates/starter-pack.ts) or an
// /automations archetype, so the page's "Deploy" CTA instantiates a real agent.

import { VERTICALS, getVertical, type Vertical } from "./verticals";

// ─── types ──────────────────────────────────────────────────────────────────

/** A cited statistic — the GEO payload. `text` is the claim as prose; `source`
 *  is the publishing organization; `url` is the real, linkable source. */
export type CitedStat = {
  /** The claim, stated as a sentence fragment a reader (or an LLM) can quote. */
  text: string;
  /** The organization / publication the figure is attributed to. */
  source: string;
  /** A real https URL where the figure (or its basis) is published. */
  url: string;
};

export type FaqItem = { q: string; a: string };

/** The surface(s) an agent works over — drives the pills + schema. Mirrors the
 *  marketplace SurfaceKey union (kept local so this module has no UI import). */
export type AgentSurface = "voice" | "chat" | "sms" | "email";

/**
 * One step in the agent's "How it works" 3-step visual (Task B). `label` is the
 * short headline ("Job marked done"); `detail` is the one-line explanation. Pure
 * data — the template (agent-page.tsx) renders the numbered visual from these.
 */
export type HowItWorksStep = { label: string; detail: string };

/**
 * The brand-mark keys the "Works with" row knows how to render. Kept as a const
 * tuple (single source of truth) so the registry references marks by a stable
 * string and the renderer (components/seo/tool-marks.tsx) + the spec validate
 * against the SAME set — a typo'd mark fails the test, never ships a broken logo.
 */
export const TOOL_MARK_KEYS = [
  "google",
  "google-business",
  "google-calendar",
  "gmail",
  "sms",
  "phone",
  "facebook",
  "website",
  "crm",
  "postiz",
] as const;

export type ToolMark = (typeof TOOL_MARK_KEYS)[number];

/** A named integration the agent touches — rendered as a recognizable brand mark
 *  (or a tasteful labeled chip) in the "Works with" row. */
export type ToolRef = { name: string; mark: ToolMark };

/** One "job" an agent does — the Tier-1 page subject. */
export type AgentJob = {
  /** URL slug — the `[job]` route param. Stable, lowercase, hyphenated. */
  slug: string;
  /** Display name, e.g. "AI Receptionist". */
  name: string;
  /** The default (vertical-less) H1. */
  h1: string;
  /** One-line value prop shown under the H1. */
  oneLiner: string;
  /** A self-contained clause describing what the agent does, written to read
   *  naturally after "It " — used to build the vertical (Tier-2) intro without
   *  mangling the oneLiner. Lowercase first word, no trailing period. */
  verticalLede: string;
  /** The CITED pain stat — the GEO centerpiece, rendered with its source. */
  painStat: CitedStat;
  /** 3-6 plain bullets: what the agent actually does (answer-shaped prose). */
  whatItDoes: string[];
  /** EXACTLY 3 steps for the "How it works" visual — written for THIS agent. */
  howItWorks: HowItWorksStep[];
  /** ≥1 integration the agent touches — rendered as real brand marks in the
   *  "Works with" row (Google Business Profile, SMS, Calendar, Gmail, …). */
  tools: ToolRef[];
  /** ≥3 FAQ entries — also serialized to schema.org FAQPage JSON-LD. */
  faq: FaqItem[];
  /** Surfaces this agent works over (voice/chat/sms/email pills + schema). */
  surfaces: AgentSurface[];
  /** Maps to a starter-pack id OR an /automations archetype id. The Deploy CTA
   *  carries this so the user lands with THIS agent instantiated. */
  canonicalAgentSlug: string;
  /** Whether canonicalAgentSlug is a starter-pack template or an archetype —
   *  the Deploy wiring routes differently (template editor vs automation). */
  canonicalKind: "starter" | "archetype";
  /** The slug of a live marketplace listing for this job, if one exists (for
   *  the Rent-via-MCP cross-link). Undefined → generic rent-via-MCP how-to. */
  marketplaceSlug?: string;
  /** A one-line hint describing the high-level MCP tool a renter would call. */
  mcpToolHint: string;
};

// ─── the curated job registry (~10) ──────────────────────────────────────────
//
// Each painStat uses a real, conservative, well-known figure with its real
// source. These are deliberately the "safe" numbers — the ones repeatedly cited
// by the named bodies — so the page is citable and never misleads.

export const AGENT_JOBS: AgentJob[] = [
  // 1) AI Receptionist → starter ai-phone-receptionist
  {
    slug: "ai-receptionist",
    name: "AI Receptionist",
    h1: "AI Receptionist — answer every call, book every job",
    oneLiner:
      "A voice agent that picks up on the first ring, answers questions, qualifies the caller, and books the appointment — 24/7.",
    verticalLede:
      "picks up on the first ring around the clock, answers questions, qualifies the caller, and books the job",
    painStat: {
      text: "An estimated 62% of calls to small businesses go unanswered.",
      source: "BrightLocal / industry reporting",
      url: "https://www.brightlocal.com/research/",
    },
    whatItDoes: [
      "Answers inbound calls on the first ring, day or night, in a natural voice.",
      "Understands why the caller is calling and whether it's a job you handle.",
      "Captures the caller's name and best callback number early in the call.",
      "Checks your real calendar and books the appointment, then texts a confirmation.",
      "Gives an honest price range for 'how much' questions — never a made-up number.",
      "Takes a detailed message and escalates anything that genuinely needs a human.",
    ],
    howItWorks: [
      { label: "Your phone rings", detail: "A call comes in — after hours, mid-job, or while every line is busy." },
      { label: "The agent answers on the first ring", detail: "It greets the caller, answers their questions, and checks your real calendar." },
      { label: "The job gets booked", detail: "It books the appointment, texts a confirmation, and logs everything to your CRM." },
    ],
    tools: [
      { name: "Phone / SIP", mark: "phone" },
      { name: "SMS", mark: "sms" },
      { name: "Google Calendar", mark: "google-calendar" },
      { name: "Your CRM", mark: "crm" },
    ],
    faq: [
      {
        q: "How does an AI receptionist answer my calls?",
        a: "It connects to your business phone line and answers in a natural voice. It greets the caller, finds out what they need, and either books them into your calendar or takes a message — using only the facts you've given it about your hours, services, and service area.",
      },
      {
        q: "Will it book appointments straight into my calendar?",
        a: "Yes. It checks your real availability, offers the soonest open slots, confirms the details back to the caller, and books the appointment — then texts a confirmation. It never invents a time slot.",
      },
      {
        q: "What happens if the AI can't handle a call?",
        a: "It takes a message with the caller's name, number, and reason, or transfers to a human. It's built to escalate rather than guess, so it never over-promises or makes up an answer.",
      },
      {
        q: "Can it answer calls after hours?",
        a: "Yes — it answers 24/7, so the calls that used to go to voicemail at night and on weekends get captured, qualified, and booked instead.",
      },
    ],
    surfaces: ["voice", "sms"],
    canonicalAgentSlug: "ai-phone-receptionist",
    canonicalKind: "starter",
    marketplaceSlug: "receptionist",
    mcpToolHint: "ask the receptionist to answer a caller, qualify them, and book an appointment",
  },

  // 2) Google Review Agent → archetype review-requester
  {
    slug: "google-review-agent",
    name: "Google Review Agent",
    h1: "Google Review Agent — turn finished jobs into 5-star reviews",
    oneLiner:
      "An agent that asks every happy customer for a review at the perfect moment, with a one-tap link — and catches unhappy ones privately first.",
    verticalLede:
      "asks every happy customer for a review at the perfect moment with a one-tap link, and catches unhappy ones privately first",
    painStat: {
      text: "About 81% of consumers read Google reviews to evaluate a local business.",
      source: "BrightLocal Local Consumer Review Survey",
      url: "https://www.brightlocal.com/research/local-consumer-review-survey/",
    },
    whatItDoes: [
      "Waits for the right moment after a job is marked complete, then sends a warm, personal ask.",
      "Includes a one-tap link straight to your Google (or Facebook) review page.",
      "Follows up once if there's no response — then stops, so it never spams.",
      "Routes an unhappy customer to you privately first, before they post publicly.",
      "Logs who was asked and who responded so you can see your review velocity climb.",
    ],
    howItWorks: [
      { label: "Job marked done", detail: "The moment you close out a job, the agent knows the experience is fresh." },
      { label: "Agent texts a 1-tap review link", detail: "At the perfect moment it sends a warm, personal ask with a one-tap link." },
      { label: "5-star review posts", detail: "Happy customers leave a rating in ~20 seconds; unhappy ones route to you privately first." },
    ],
    tools: [
      { name: "Google Business Profile", mark: "google-business" },
      { name: "SMS", mark: "sms" },
      { name: "Gmail", mark: "gmail" },
      { name: "Facebook", mark: "facebook" },
    ],
    faq: [
      {
        q: "When does it ask customers for a review?",
        a: "A short, configurable window after a job is marked complete — when the experience is fresh and satisfaction is highest. It sends a single warm message with a one-tap review link, then at most one gentle follow-up.",
      },
      {
        q: "Does it help me get more Google reviews specifically?",
        a: "Yes — the ask links directly to your Google Business review page so a happy customer can leave a star rating in about 20 seconds. Reviews are read by roughly 81% of consumers evaluating a local business, so each one compounds.",
      },
      {
        q: "What if a customer is unhappy?",
        a: "It's built to catch dissatisfaction privately first — routing an unhappy customer to you for a direct conversation rather than nudging them toward a public 1-star review.",
      },
    ],
    surfaces: ["sms", "email"],
    canonicalAgentSlug: "review-requester",
    canonicalKind: "archetype",
    marketplaceSlug: "review-requester",
    mcpToolHint: "trigger a review request to a customer after a completed job",
  },

  // 3) Missed-Call Text-Back → archetype missed-call-text-back
  {
    slug: "missed-call-text-back",
    name: "Missed-Call Text-Back",
    h1: "Missed-Call Text-Back — never lose a missed call again",
    oneLiner:
      "The instant a call goes unanswered, it texts the caller back within seconds to ask what they need and keep the lead alive.",
    verticalLede:
      "texts the caller back within seconds of a missed call to ask what they need and keep the lead alive",
    painStat: {
      text: "78% of customers buy from the first company to respond to their inquiry.",
      source: "Lead Connect / InsideSales response-time research",
      url: "https://www.leadconnect.io/blog/sales-statistics/",
    },
    whatItDoes: [
      "Detects a missed or abandoned call the moment it happens.",
      "Texts the caller back within seconds: 'Sorry we missed you — how can we help?'",
      "Starts a real conversation over SMS to capture what they need.",
      "Books the appointment or routes a hot lead to you before they call a competitor.",
      "Logs every recovered call so you can see how many would have been lost.",
    ],
    howItWorks: [
      { label: "A call goes unanswered", detail: "You're on a job or it's after hours — the call would normally die in voicemail." },
      { label: "Agent texts back in seconds", detail: "It instantly texts: 'Sorry we missed you — how can we help?' and starts a real conversation." },
      { label: "The lead stays alive", detail: "It captures what they need and books them, before they call the next company." },
    ],
    tools: [
      { name: "SMS", mark: "sms" },
      { name: "Phone", mark: "phone" },
      { name: "Google Calendar", mark: "google-calendar" },
      { name: "Your CRM", mark: "crm" },
    ],
    faq: [
      {
        q: "What is missed-call text-back?",
        a: "When a call to your business goes unanswered, the agent automatically sends the caller a text within seconds — turning a dead-end voicemail into a live SMS conversation that captures the lead and books the job.",
      },
      {
        q: "How fast does it respond?",
        a: "Within seconds of the missed call. Speed is the whole point: research shows the company that responds first wins the large majority of inquiries, so an instant text-back beats a callback an hour later.",
      },
      {
        q: "Can it book the appointment over text?",
        a: "Yes. It qualifies the caller, checks availability, and books the appointment right in the text thread, or hands a hot lead to you with the context already captured.",
      },
    ],
    surfaces: ["sms"],
    canonicalAgentSlug: "missed-call-text-back",
    canonicalKind: "archetype",
    mcpToolHint: "send an instant text-back to a missed caller and start a booking conversation",
  },

  // 4) Speed-to-Lead → archetype speed-to-lead
  {
    slug: "speed-to-lead",
    name: "Speed-to-Lead Agent",
    h1: "Speed-to-Lead Agent — reply to every new lead in under a minute",
    oneLiner:
      "The moment a lead comes in from a form, ad, or call, it replies within 60 seconds, qualifies them, and books the hot ones.",
    verticalLede:
      "replies within 60 seconds the moment a lead comes in from a form, ad, or call, qualifies them, and books the hot ones",
    painStat: {
      text: "Contacting a lead within 5 minutes makes you up to 100x more likely to connect than waiting 30 minutes.",
      source: "Harvard Business Review / Lead Response Management study",
      url: "https://hbr.org/2011/03/the-short-life-of-online-sales-leads",
    },
    whatItDoes: [
      "Fires the instant a lead submits a form, clicks an ad, or fills out intake.",
      "Replies within 60 seconds while you're still their first thought.",
      "Asks a few focused qualifying questions — one at a time, never an interrogation.",
      "Books the qualified leads on the spot or routes them straight to you.",
      "Works your forms, ads, and missed calls from a single playbook.",
    ],
    howItWorks: [
      { label: "A new lead comes in", detail: "Someone submits a form, clicks an ad, or leaves a missed call." },
      { label: "Agent replies in under 60 seconds", detail: "It reaches out while you're still their first thought and asks a few focused questions." },
      { label: "Hot leads get booked", detail: "It books the qualified ones on the spot or routes them to you, fully captured." },
    ],
    tools: [
      { name: "Lead forms", mark: "website" },
      { name: "SMS", mark: "sms" },
      { name: "Gmail", mark: "gmail" },
      { name: "Google Calendar", mark: "google-calendar" },
    ],
    faq: [
      {
        q: "What does speed-to-lead mean?",
        a: "It's the practice of contacting a new inbound lead as fast as possible. The agent replies within about 60 seconds of a form fill or inquiry, because contacting a lead within five minutes makes you dramatically more likely to connect and qualify them than waiting even half an hour.",
      },
      {
        q: "Where do the leads come from?",
        a: "Any inbound source you connect — website forms, ad lead forms, and missed calls. The moment one arrives, the agent reaches out and starts qualifying.",
      },
      {
        q: "Does it just reply, or does it qualify too?",
        a: "Both. It opens the conversation fast, then asks the few questions that matter — what they need, timeline, and budget fit — and books or routes the leads worth your time.",
      },
    ],
    surfaces: ["sms", "email"],
    canonicalAgentSlug: "speed-to-lead",
    canonicalKind: "archetype",
    marketplaceSlug: "speed-to-lead",
    mcpToolHint: "respond to a new inbound lead within seconds and qualify them",
  },

  // 5) AI Lead Qualifier → starter lead-qualifier-intake
  {
    slug: "ai-lead-qualifier",
    name: "AI Lead Qualifier",
    h1: "AI Lead Qualifier — only the good leads reach you",
    oneLiner:
      "A chat agent that qualifies inbound leads, captures the details that matter, and books or routes the ones worth your time.",
    verticalLede:
      "qualifies inbound leads, captures the details that matter, and books or routes the ones worth your time",
    painStat: {
      text: "Only about 25% of marketing-generated leads are typically sales-ready, so qualification is where time is won or lost.",
      source: "Gleanster / MarketingSherpa lead-management research",
      url: "https://www.marketingsherpa.com/article/chart/why-most-leads-dont-buy",
    },
    whatItDoes: [
      "Greets inbound prospects and asks focused qualifying questions, one at a time.",
      "Captures what they need, their timeline, location/scope, and the best way to reach them.",
      "Books a call or appointment for the leads that are a real fit.",
      "Routes or hands off the rest with the right expectation set — never over-promises.",
      "Logs the full intake to your CRM so follow-up is effortless.",
    ],
    howItWorks: [
      { label: "A prospect reaches out", detail: "Someone starts a chat or fills out intake on your site." },
      { label: "Agent asks the questions that matter", detail: "Need, timeline, scope, and contact — one at a time, never an interrogation." },
      { label: "Only the good leads reach you", detail: "It books or routes the real fits and logs the full intake to your CRM." },
    ],
    tools: [
      { name: "Website chat", mark: "website" },
      { name: "Gmail", mark: "gmail" },
      { name: "Google Calendar", mark: "google-calendar" },
      { name: "Your CRM", mark: "crm" },
    ],
    faq: [
      {
        q: "How does the AI qualify a lead?",
        a: "Through a short, friendly conversation. It asks the few questions that separate a serious prospect from a tire-kicker — need, timeline, scope, and contact — and scores them so only the sales-ready leads (typically a minority of all inbound) take up your time.",
      },
      {
        q: "What does it do with a qualified lead?",
        a: "It offers to book a call or appointment immediately, or routes the lead to you with the full intake captured. Unqualified leads get a polite, honest response without wasting your day.",
      },
      {
        q: "Does it save the lead details?",
        a: "Yes — every conversation is logged to your CRM with the captured details, so nothing falls through the cracks and follow-up is one click.",
      },
    ],
    surfaces: ["chat", "email"],
    canonicalAgentSlug: "lead-qualifier-intake",
    canonicalKind: "starter",
    mcpToolHint: "qualify an inbound lead and capture their intake details",
  },

  // 6) Booking Concierge → starter booking-concierge
  {
    slug: "booking-concierge",
    name: "Booking Concierge",
    h1: "Booking Concierge — fill your calendar, kill no-shows",
    oneLiner:
      "A calendar-first agent that checks availability and books, reschedules, or cancels in seconds — and sends the reminders that cut no-shows.",
    verticalLede:
      "checks availability and books, reschedules, or cancels in seconds, and sends the reminders that cut no-shows",
    painStat: {
      text: "The average no-show rate for service appointments runs 10-20%, and reminders measurably reduce it.",
      source: "Industry scheduling research / NIH-indexed appointment studies",
      url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5552051/",
    },
    whatItDoes: [
      "Checks your real availability and offers the soonest open slots.",
      "Books the appointment after reading the details back and confirming.",
      "Handles reschedules and cancellations cleanly, without interrupting your day.",
      "Sends reminders ahead of the appointment to cut no-shows.",
      "Never double-books and never invents a slot, duration, or policy.",
    ],
    howItWorks: [
      { label: "Someone wants a time", detail: "A customer asks to book, reschedule, or cancel — by chat, text, or phone." },
      { label: "Agent checks your real calendar", detail: "It offers the soonest open slots and confirms the details back before finalizing." },
      { label: "Booked, with a reminder set", detail: "It books against your real availability and sends reminders that cut no-shows." },
    ],
    tools: [
      { name: "Google Calendar", mark: "google-calendar" },
      { name: "SMS", mark: "sms" },
      { name: "Phone", mark: "phone" },
      { name: "Your CRM", mark: "crm" },
    ],
    faq: [
      {
        q: "Can it reschedule and cancel, not just book?",
        a: "Yes. It finds the existing appointment by name, then reschedules or cancels it cleanly — reading the new details back and confirming before it finalizes anything.",
      },
      {
        q: "Does it help reduce no-shows?",
        a: "Yes. It sends reminders ahead of each appointment, which measurably reduces the typical 10-20% no-show rate for service businesses.",
      },
      {
        q: "Will it ever double-book me?",
        a: "No. It books only against your real availability and confirms every detail before finalizing, so it never double-books or guesses a slot.",
      },
    ],
    surfaces: ["chat", "sms", "voice"],
    canonicalAgentSlug: "booking-concierge",
    canonicalKind: "starter",
    marketplaceSlug: "booking-concierge",
    mcpToolHint: "check availability and book, reschedule, or cancel an appointment",
  },

  // 7) Quote / Estimate Agent → starter quote-estimate-assistant
  {
    slug: "quote-estimate-agent",
    name: "Quote & Estimate Agent",
    h1: "Quote & Estimate Agent — an honest ballpark in seconds",
    oneLiner:
      "An agent that captures job details, gives an honest ballpark range (never a firm price), and books the follow-up so quotes stop going cold.",
    verticalLede:
      "captures the job details, gives an honest ballpark range (never a firm price), and books the follow-up so quotes stop going cold",
    painStat: {
      text: "About 50% of sales go to the vendor that responds first — and a fast, honest quote is often what wins the job.",
      source: "InsideSales / Vendor response-time research",
      url: "https://www.insidesales.com/lead-response/",
    },
    whatItDoes: [
      "Gathers the basics needed to scope a job: service, size, location, and timeline.",
      "Gives an honest ballpark RANGE from what it actually knows — never a made-up firm price.",
      "Says clearly that a team member confirms the exact figure after reviewing specifics.",
      "Books an estimate or site visit, or routes the lead with their contact captured.",
      "Follows up so quotes stop going cold in your inbox.",
    ],
    howItWorks: [
      { label: "Someone asks 'how much?'", detail: "A prospect describes the job — service, size, location, and timeline." },
      { label: "Agent gives an honest ballpark", detail: "It ranges the job from what it actually knows and says a human confirms the exact figure." },
      { label: "The follow-up gets booked", detail: "It books an estimate or site visit and follows up so the quote never goes cold." },
    ],
    tools: [
      { name: "Website chat", mark: "website" },
      { name: "Gmail", mark: "gmail" },
      { name: "Google Calendar", mark: "google-calendar" },
      { name: "Your CRM", mark: "crm" },
    ],
    faq: [
      {
        q: "Does it give an exact price?",
        a: "No — and that's deliberate. It gives an honest ballpark range based only on what it knows, and always says a team member confirms the exact amount after reviewing the specifics. It never fabricates a firm number.",
      },
      {
        q: "What does it need to quote a job?",
        a: "The service, the scope or size, the location, and the timeline. With those it can range the job responsibly; if it doesn't have enough to do so, it captures the details instead of guessing.",
      },
      {
        q: "What happens after the ballpark?",
        a: "It offers to book an estimate or site visit and follows up so the quote doesn't go cold — because the vendor that responds first wins a large share of jobs.",
      },
    ],
    surfaces: ["chat", "email"],
    canonicalAgentSlug: "quote-estimate-assistant",
    canonicalKind: "starter",
    marketplaceSlug: "quote-assistant",
    mcpToolHint: "scope a job and return an honest ballpark estimate range",
  },

  // 8) Win-Back Agent → archetype win-back
  {
    slug: "win-back-agent",
    name: "Win-Back Agent",
    h1: "Win-Back Agent — bring quiet customers back",
    oneLiner:
      "An agent that spots customers who've gone quiet and reaches out with a relevant, well-timed reason to come back — then books the return visit.",
    verticalLede:
      "spots customers who've gone quiet and reaches out with a relevant, well-timed reason to come back, then books the return visit",
    painStat: {
      text: "Increasing customer retention by just 5% can raise profits by 25-95%.",
      source: "Bain & Company / Harvard Business Review",
      url: "https://hbr.org/2014/10/the-value-of-keeping-the-right-customers",
    },
    whatItDoes: [
      "Watches your customer list for people who've gone quiet.",
      "Reaches out with a real reason to return — a seasonal tune-up, a maintenance reminder, a relevant offer.",
      "Books the return visit right in the conversation.",
      "Respects do-not-contact instantly and never nags.",
      "Tracks reactivations so you can see revenue recovered from dormant customers.",
    ],
    howItWorks: [
      { label: "A customer goes quiet", detail: "The agent watches your list for people who haven't been back in a while." },
      { label: "Agent reaches out with a reason", detail: "Not just a discount — a seasonal tune-up, a maintenance reminder, a relevant check-in." },
      { label: "The return visit gets booked", detail: "It books the comeback right in the thread and respects do-not-contact instantly." },
    ],
    tools: [
      { name: "SMS", mark: "sms" },
      { name: "Gmail", mark: "gmail" },
      { name: "Google Calendar", mark: "google-calendar" },
      { name: "Your CRM", mark: "crm" },
    ],
    faq: [
      {
        q: "How does a win-back agent work?",
        a: "It identifies customers who haven't been back in a while and sends a timely, relevant nudge — not just a discount, but a genuine reason to return. Because retaining customers is far cheaper than acquiring new ones (a 5% lift in retention can raise profits 25-95%), each reactivation is high-value.",
      },
      {
        q: "Does it just blast discounts?",
        a: "No. It leads with a reason that fits the customer — a seasonal service, a maintenance reminder, a check-in — and only then makes an offer if it helps. It respects do-not-contact instantly.",
      },
      {
        q: "Can it book the return visit?",
        a: "Yes — it books the return appointment right in the thread, so a re-engaged customer doesn't have to call back.",
      },
    ],
    surfaces: ["sms", "email"],
    canonicalAgentSlug: "win-back",
    canonicalKind: "archetype",
    marketplaceSlug: "win-back",
    mcpToolHint: "re-engage a dormant customer and book their return visit",
  },

  // 9) AI Social Media Assistant → starter social-content-assistant
  {
    slug: "ai-social-media",
    name: "AI Social Media Assistant",
    h1: "AI Social Media Assistant — on-brand posts, on a schedule",
    oneLiner:
      "An agent that drafts and plans on-brand social posts, suggests a simple cadence, and prepares captions and hashtags.",
    verticalLede:
      "drafts and plans on-brand social posts, suggests a simple posting cadence, and prepares captions and hashtags",
    painStat: {
      text: "Around 76% of consumers say they've purchased a product they saw in a brand's social media post.",
      source: "Curalate / Sprout Social consumer survey",
      url: "https://sproutsocial.com/insights/social-media-statistics/",
    },
    whatItDoes: [
      "Drafts clear, on-brand posts in your business's voice, with a couple of variations.",
      "Suggests a light weekly cadence and the best format for each idea.",
      "Prepares captions and a tight set of relevant hashtags.",
      "Keeps claims honest — never promises reach or results you can't back up.",
      "Hands finished copy to you to post, or publishes via a connected scheduler.",
    ],
    howItWorks: [
      { label: "You set the brand once", detail: "It learns your business's voice, services, and the cadence you want to keep." },
      { label: "Agent drafts on-brand posts", detail: "It writes captions in your voice with variations and a tight set of relevant hashtags." },
      { label: "Posts go out on schedule", detail: "It hands you finished copy to post, or schedules and publishes via a connected tool." },
    ],
    tools: [
      { name: "Postiz scheduler", mark: "postiz" },
      { name: "Facebook", mark: "facebook" },
      { name: "Gmail", mark: "gmail" },
    ],
    faq: [
      {
        q: "Does it write the posts for me?",
        a: "Yes — it drafts on-brand captions in your voice, offers variations, and suggests a simple weekly cadence. Social drives real sales: around 76% of consumers say they've bought something they saw in a brand's post, so consistent posting compounds.",
      },
      {
        q: "Can it actually publish, or just draft?",
        a: "It drafts and plans by default. Connect a publishing tool (for example, Postiz) in the editor and it can schedule and publish for real; until then, it hands you finished copy to post.",
      },
      {
        q: "Will it make claims my business can't back up?",
        a: "No. It's built to keep claims honest and never promise reach, results, or anything you can't stand behind.",
      },
    ],
    surfaces: ["chat", "email"],
    canonicalAgentSlug: "social-content-assistant",
    canonicalKind: "starter",
    marketplaceSlug: "social-autopilot",
    mcpToolHint: "draft an on-brand social post with caption and hashtags",
  },

  // 10) Website Support Chat → starter website-support-chat
  {
    slug: "website-support-chat",
    name: "Website Support Chat",
    h1: "Website Support Chat — answer visitors, book them in",
    oneLiner:
      "A chat agent that embeds on your site to answer FAQs, book appointments, and hand off to a human when needed.",
    verticalLede:
      "embeds on your site to answer FAQs, book appointments, and hand off to a human when needed",
    painStat: {
      text: "Website visitors who engage with chat are significantly more likely to convert, and live engagement is a top driver of online trust.",
      source: "Forrester / Intercom conversational-support research",
      url: "https://www.intercom.com/blog/conversational-support-funnel/",
    },
    whatItDoes: [
      "Greets visitors and answers common questions from what you actually know.",
      "Helps visitors book, reschedule, or cancel using your real calendar.",
      "Captures the visitor's name and contact before handing off, so follow-up is easy.",
      "Escalates anything it can't resolve to a human, with full context.",
      "Works on your existing site without a rebuild.",
    ],
    howItWorks: [
      { label: "A visitor lands on your site", detail: "The chat widget is already there — no rebuild, embedded on your existing site." },
      { label: "Agent answers from what you know", detail: "Hours, services, pricing, service area — and it can book, reschedule, or cancel in the chat." },
      { label: "Booked or handed off", detail: "It books the appointment, or captures the visitor's details and escalates to you with full context." },
    ],
    tools: [
      { name: "Website chat", mark: "website" },
      { name: "Google Calendar", mark: "google-calendar" },
      { name: "Gmail", mark: "gmail" },
      { name: "Your CRM", mark: "crm" },
    ],
    faq: [
      {
        q: "What can the website chat agent do?",
        a: "It answers your most common visitor questions — hours, services, pricing, service area — from the facts you give it, and it can book, reschedule, or cancel appointments right in the chat. Engaged visitors convert at a higher rate, so an always-on answer beats a contact form.",
      },
      {
        q: "What happens when it doesn't know the answer?",
        a: "It says so honestly and offers to capture the visitor's details so a human can follow up — it never invents an answer.",
      },
      {
        q: "Do I need to rebuild my website?",
        a: "No. It embeds on your existing site, so you can add it without a redesign.",
      },
    ],
    surfaces: ["chat", "email"],
    canonicalAgentSlug: "website-support-chat",
    canonicalKind: "starter",
    marketplaceSlug: "front-desk-support",
    mcpToolHint: "answer a website visitor's question and book them an appointment",
  },
];

// ─── shared value-frame FAQ (the $100M-offer value block, Task C) ─────────────
//
// Appended to EVERY agent page's FAQ (Tier-1 and Tier-2) in addition to the
// job's own questions, so a visitor learns exactly how it works, what's
// required, the cost, and the ROI — framed (Alex Hormozi value-equation style)
// to pull toward sign-up, but honest and plain. Because composePageCopy appends
// this to `copy.faq`, it flows automatically into the schema.org FAQPage JSON-LD
// the template builds from that same array (GEO-friendly: clear, citable Q/A).
//
// These state the REAL, current pricing facts (the value-frame spec asserts the
// $29/mo + 14-day-trial + 60-seconds claims are present), so the page never
// drifts from the product. Data-driven + reused across all pages — no per-page
// duplication.
export const VALUE_FRAME_FAQ: FaqItem[] = [
  {
    q: "How does it actually work?",
    a: "Paste your website URL. We build you a real hosted workspace with this agent already running — grounded in your actual services, hours, and pricing, pulled from your site. It's live in about 60 seconds, and you can talk to it right away.",
  },
  {
    q: "What do I need to get started?",
    a: "A SeldonFrame account and your own AI key — if you already use ChatGPT, Claude, or Gemini, you have one. For phone calls or texts you'll add a number. That's it: no code, no setup project, no integration work.",
  },
  {
    q: "How much does it cost?",
    a: "$29/mo flat, with unlimited workspaces and a 14-day free trial — no card to start. Your AI key is billed by the provider directly at cost (usually pennies a day); we never mark it up or add a usage tax on top.",
  },
  {
    q: "How much can it save me?",
    a: "One recovered review, one booked job, or one caught missed call usually pays for the whole month many times over. It works 24/7 for pennies a day — a fraction of what an employee or an agency retainer costs to do the same job, without the gaps.",
  },
  {
    q: "Why SeldonFrame instead of hiring someone or building it myself?",
    a: "It's live in about 60 seconds instead of the weeks a hire or a DIY build takes, and it's grounded in YOUR business through the Soul — your real services, hours, and pricing — so it never sounds generic or makes things up. And you own it: it's your workspace, your data, your agent.",
  },
  {
    q: "Is it really live in 60 seconds?",
    a: "Yes. Paste a URL and watch it build — workspace, site, booking, and this agent, grounded in your business, ready in about a minute. No demo call, no onboarding queue.",
  },
];

// ─── lookups ──────────────────────────────────────────────────────────────────

/** Find a job by slug, or throw. Pure — no DB. */
export function getJob(slug: string): AgentJob {
  const found = AGENT_JOBS.find((j) => j.slug === slug);
  if (!found) throw new Error(`unknown job: ${slug}`);
  return found;
}

/** Reverse lookup: the programmatic job whose marketplace listing is `slug`, if
 *  any. Powers the marketplace→/agents flywheel back-link. Pure — no DB. */
export function jobForMarketplaceSlug(slug: string): AgentJob | undefined {
  return AGENT_JOBS.find((j) => j.marketplaceSlug === slug);
}

/**
 * The 6 starter ids the starter-pack ships (lib/agent-templates/starter-pack.ts).
 * Kept here as the mapper's allow-list so a starter-kind canonicalAgentSlug is
 * only echoed back when it's a REAL starter — never a dangling fork id. Mirrored
 * (not imported) so this module stays pure data + has zero server imports; the
 * agent-pages.spec asserts every job's canonicalAgentSlug resolves, which would
 * fire loudly if this list ever drifts from STARTER_TEMPLATES.
 */
const STARTER_IDS = new Set<string>([
  "ai-phone-receptionist",
  "website-support-chat",
  "lead-qualifier-intake",
  "booking-concierge",
  "quote-estimate-assistant",
  "social-content-assistant",
]);

/**
 * The /automations archetypes (event-triggered automations: review-requester
 * fires on booking.completed, speed-to-lead on form.submitted, etc.) are NOT
 * forkable conversational agent_templates — there is no starter to instantiate
 * for them directly. So the Deploy CTA on those pages instantiates the CLOSEST
 * conversational starter instead, and the workspace still lands with a working,
 * on-topic agent rather than nothing:
 *   - review-requester    → website-support-chat  (general customer-facing chat)
 *   - missed-call-text-back → ai-phone-receptionist (phone/call front desk)
 *   - speed-to-lead       → lead-qualifier-intake  (replies to + qualifies leads)
 *   - win-back            → lead-qualifier-intake  (sales re-engagement)
 * The closest-starter choice is a soft, best-effort default — the buyer can swap
 * or add the exact automation from /automations afterward.
 */
const ARCHETYPE_TO_CLOSEST_STARTER: Record<string, string> = {
  "review-requester": "website-support-chat",
  "missed-call-text-back": "ai-phone-receptionist",
  "speed-to-lead": "lead-qualifier-intake",
  "win-back": "lead-qualifier-intake",
};

/**
 * Map a Deploy-CTA `canonicalAgentSlug` (a starter id OR an /automations
 * archetype id) to the starter-pack id the build pipeline should instantiate
 * into the freshly-built workspace — or `null` when the slug is unknown/blank/
 * junk. Pure (no DB, no session) so it's unit-testable and importable from both
 * the build route and the SEO pages.
 *
 * SOFT-FAIL CONTRACT: returns `null` (never throws) on anything unmappable so
 * the caller can simply skip instantiation and let the magic first-run build
 * proceed untouched. A starter-kind slug resolves to itself (validated against
 * the real starter id set); an archetype-kind slug resolves to its closest
 * conversational starter (see ARCHETYPE_TO_CLOSEST_STARTER).
 */
export function resolveStarterIdForCanonicalAgent(
  canonicalAgentSlug: string | null | undefined,
): string | null {
  const slug = (canonicalAgentSlug ?? "").trim();
  if (!slug) return null;
  if (STARTER_IDS.has(slug)) return slug;
  return ARCHETYPE_TO_CLOSEST_STARTER[slug] ?? null;
}

/**
 * The Deploy-CTA href — routes into the magic first-run build flow CARRYING the
 * canonical agent so the user lands with THAT agent instantiated. `intent=build`
 * triggers the existing auto-submit; `agent` is the new param threaded through
 * /clients/new (the page reads it, the build pipeline instantiates the starter
 * via the starter-pack path post-build). Vertical, when present, is passed as a
 * hint so the build can pre-seed the niche.
 */
export function deployHrefFor(job: AgentJob, vertical?: Vertical): string {
  const params = new URLSearchParams({
    agent: job.canonicalAgentSlug,
    intent: "build",
  });
  if (vertical) params.set("vertical", vertical.slug);
  return `/clients/new?${params.toString()}`;
}

/**
 * The flywheel cross-links: OTHER jobs to surface on a job×vertical page, each
 * deep-linked to the SAME vertical ("more agents for plumbers"). Returns the
 * sibling jobs (excluding the current one), capped, so the page becomes a hub.
 */
export function relatedJobsForVertical(currentJobSlug: string, limit = 5): AgentJob[] {
  return AGENT_JOBS.filter((j) => j.slug !== currentJobSlug).slice(0, limit);
}

/** Every (job, vertical) pair — the Tier-2 route param source. */
export function allJobVerticalPairs(): { job: string; vertical: string }[] {
  const pairs: { job: string; vertical: string }[] = [];
  for (const job of AGENT_JOBS) {
    for (const vertical of VERTICALS) {
      pairs.push({ job: job.slug, vertical: vertical.slug });
    }
  }
  return pairs;
}

// ─── copy composition (the GEO answer-page engine) ─────────────────────────────

export type ComposedPageCopy = {
  /** <title> — vertical-aware when a vertical is supplied. */
  title: string;
  /** The on-page <h1>. */
  h1: string;
  /** <meta name="description"> — answer-shaped, ≤160 chars where possible. */
  metaDescription: string;
  /** The lead intro paragraph — answer-shaped prose, vertical-localized. */
  intro: string;
  /** The FAQ to render + serialize to schema.org (job FAQ, vertical-flavored). */
  faq: FaqItem[];
};

/** Title-case a vertical plural for headline use ("HVAC companies" stays as-is;
 *  "plumbers" → "Plumbers"). We only uppercase the first letter to avoid
 *  mangling acronyms already cased in the registry. */
function headlineCasePlural(plural: string): string {
  return plural.charAt(0).toUpperCase() + plural.slice(1);
}

/**
 * Compose the page copy for a job, optionally tailored to a vertical. Pure.
 *
 * - Tier-1 (no vertical): the job's own h1/oneLiner + a generic intro.
 * - Tier-2 (with vertical): a vertical-specific headline ("AI Receptionist for
 *   Plumbers — never miss a service call"), an intro that weaves the vertical's
 *   painHook + example service, and the same FAQ (the answers already generalize;
 *   the first FAQ question is localized to the trade for relevance).
 *
 * The cited stat is NOT in here — it's rendered structurally by the template
 * straight from `job.painStat`, so the source stays attached.
 */
export function composePageCopy(job: AgentJob, vertical?: Vertical): ComposedPageCopy {
  if (!vertical) {
    return {
      title: `${job.name} — ${truncateForTitle(job.oneLiner)} | SeldonFrame`,
      h1: job.h1,
      metaDescription: clampDescription(job.oneLiner),
      intro: `${job.oneLiner} ${job.painStat.text} ${aOrAn(job.name)} ${job.name} fixes that — and you can deploy a working one in about 60 seconds, grounded in your own business.`,
      // The job's own FAQ, then the shared value-frame block (Task C). The
      // append flows into the FAQPage JSON-LD the template builds from `faq`.
      faq: [...job.faq, ...VALUE_FRAME_FAQ],
    };
  }

  const pluralCased = headlineCasePlural(vertical.plural);
  const h1 = `${job.name} for ${pluralCased}`;
  const intro = `For ${vertical.plural}, ${vertical.painHook}. ${aOrAn(job.name)} ${job.name} closes that gap: it ${job.verticalLede}. ${job.painStat.text} Deploy one for your ${ownBusinessPhrase(vertical)} in about 60 seconds, grounded in your own services, hours, and pricing — including ${vertical.exampleService}.`;

  // Localize only the first FAQ question to the trade; answers already generalize.
  // The shared value-frame block is appended AFTER, unchanged (it's vertical-
  // agnostic by design) so every page — Tier-1 and Tier-2 — carries it and it
  // flows into the FAQPage JSON-LD.
  const faq: FaqItem[] = [
    ...job.faq.map((item, i) =>
      i === 0 ? { q: `${item.q} (for ${vertical.plural})`, a: item.a } : item,
    ),
    ...VALUE_FRAME_FAQ,
  ];

  return {
    title: `${job.name} for ${pluralCased} — ${shortPromise(job)} | SeldonFrame`,
    h1,
    metaDescription: clampDescription(
      `${job.name} for ${vertical.plural}: ${job.oneLiner} Deploy a working agent in 60 seconds.`,
    ),
    intro,
    faq,
  };
}

/** "A" or "An" for a display name. Treats a leading vowel SOUND simply by the
 *  first letter (good enough for our names: "AI…" → "An", "Quote…" → "A"). */
function aOrAn(name: string): string {
  return /^[aeiou]/i.test(name.trim()) ? "An" : "A";
}

/** "your plumber business" but "your HVAC company" (not "company business") —
 *  avoids doubling when the vertical noun already ends in business/company/etc. */
function ownBusinessPhrase(vertical: Vertical): string {
  const name = vertical.name.trim();
  if (/\b(business|company|companies|firm|practice|shop|spa|salon|barbershop|restaurant|agent)\b/i.test(name)) {
    return name;
  }
  return `${name} business`;
}

/** A terse vertical-page promise for the <title> tail. */
function shortPromise(job: AgentJob): string {
  switch (job.slug) {
    case "ai-receptionist":
      return "never miss a call";
    case "missed-call-text-back":
      return "recover every missed call";
    case "speed-to-lead":
      return "reply in 60 seconds";
    case "google-review-agent":
      return "more 5-star reviews";
    case "win-back-agent":
      return "bring customers back";
    case "booking-concierge":
      return "fill your calendar";
    case "quote-estimate-agent":
      return "quote jobs instantly";
    case "ai-lead-qualifier":
      return "qualify every lead";
    case "ai-social-media":
      return "stay posted, on brand";
    case "website-support-chat":
      return "answer every visitor";
    default:
      return "deploy in 60 seconds";
  }
}

/** Clamp a description to a sane meta length without cutting mid-word hard. */
function clampDescription(s: string): string {
  const max = 158;
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : max).trim()}…`;
}

/** Trim a one-liner for the <title> so the title doesn't blow past ~60 chars. */
function truncateForTitle(s: string): string {
  const max = 48;
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : max).trim()}…`;
}

// Re-export the vertical helpers so route + sitemap code has a single import.
export { VERTICALS, getVertical, type Vertical } from "./verticals";
