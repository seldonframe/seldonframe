// packages/crm/src/lib/soul-compiler/url-extraction-instructions.ts
//
// 2026-05-14 — Verbatim "playbook" returned by GET /api/v1/workspace/extract-instructions.
// The MCP tool `create_workspace_from_url` proxies this payload through to Claude in CC.
// Claude reads the instructions, runs WebFetch itself, extracts the structured fields
// matching REQUIRED_FIELDS_SCHEMA, dialogues with the operator for any missing required
// field, then calls create_full_workspace (the atomic R1-multipage path). See spec
// docs/superpowers/specs/2026-05-14-pull-firecrawl-out-of-backend-design.md.

export const EXTRACTION_INSTRUCTIONS = `You are extracting business facts from a website to create a SeldonFrame workspace.

URL: {url_echo}

Step 1 — Fetch homepage.
  Use the WebFetch tool to read {url_echo}. Look for: business name, services
  offered, phone, city/state, business description, hours, emergency/same-day,
  certifications, service area.

Step 2 — Decide if sub-pages are needed.
  If the homepage has all the REQUIRED fields below, skip to Step 3.
  Otherwise, fetch up to 2 of these in this priority order (only if they exist
  as links on the homepage): /about, /services, /contact, /pricing.
  HARD LIMIT: 3 total WebFetch calls. Stop fetching after that even if
  fields are still missing.

Step 2.5 — Extract weekly_hours specifically.
  Hours are commonly in headers, footers, sidebars, contact pages, or
  Google Business listing embeds. The shape MUST be:
    {
      "monday": { "enabled": true, "start": "09:00", "end": "17:00" },
      "tuesday": { "enabled": true, "start": "09:00", "end": "17:00" },
      ...all 7 days using full lowercase day names...
      "saturday": { "enabled": false, "start": "00:00", "end": "00:00" },
      "sunday": { "enabled": false, "start": "00:00", "end": "00:00" }
    }
  - Times MUST be 24-hour HH:MM strings (e.g. "07:30", "17:00", "23:59").
  - \`enabled: false\` means closed that day; start/end can be any valid placeholders.
  - Convert "9 AM - 5 PM" → "09:00" / "17:00". Convert "7:30 AM - 5 PM" → "07:30" / "17:00".
  - "Open 24 hours" → enabled: true, start: "00:00", end: "23:59".
  - If hours appear but you cannot parse cleanly, leave weekly_hours as null — the
    backend will default to Mon-Fri 9-5 and the chatbot will disclaim them as assumed.
  - Do NOT invent hours. Only extract what's actually on the page.

Step 3 — Reason and extract.
  Produce a JSON object matching the schema below. Use confident extractions
  only; do not invent. If a REQUIRED field can't be determined from what you
  fetched, leave it as null.

Step 4 — Fill the gaps with operator dialog.
  For every REQUIRED field that's still null, ask the operator ONE targeted
  question per missing field, in the simplest form. Examples:
    - "What's the business phone number?"
    - "What city is the business based in?"
  Don't ask for fields you already extracted with high confidence.

Step 5 — Create the workspace.
  Once every REQUIRED field is non-null, call create_full_workspace with the
  full object. ONE atomic call builds everything: the workspace, the
  production multi-page website (landing + per-service detail pages — the
  same engine the SeldonFrame dashboard uses), booking page, intake form,
  CRM, and a draft chatbot. Then call finalize_workspace({ workspace_id,
  email }) to mint the admin link and send the welcome email. No block
  iteration is needed on this flow.

Failure modes:
  - WebFetch returns empty/error: try the next priority page. If all 3 fetches
    fail or return empty, tell the operator "I can't read the site — can you
    paste a description of the business?" and route to description-based flow.
  - WebFetch returns a Cloudflare/anti-bot challenge page (signs: "Just a
    moment...", "Verifying you are human", < 500 chars of meaningful content):
    same as empty — fall back to the operator-description dialog.
  - JS-only SPA (HTML shell with no content): same — fall back to dialog.

Do NOT:
  - Pre-validate URLs (no HEAD requests, no probes — just WebFetch).
  - Fetch more than 3 pages.
  - Fabricate any field. If unsure, ask.
  - Call create_workspace_v2 / get_block_skill / persist_block from this flow.
    The atomic create_full_workspace call IS the whole build — it generates
    the multi-page site server-side; block iteration would only overwrite it
    with lower-fidelity copy.
`;

export const REQUIRED_FIELDS_SCHEMA = {
  type: "object",
  required: [
    "business_name",
    "city",
    "state",
    "phone",
    "services",
    "business_description",
  ],
  properties: {
    business_name: { type: "string", minLength: 1 },
    city: { type: "string", minLength: 1 },
    state: {
      type: "string",
      minLength: 1,
      description: "2-letter or full name",
    },
    phone: { type: "string", minLength: 1 },
    services: {
      type: "array",
      items: { type: "string" },
      minItems: 1,
    },
    business_description: { type: "string", minLength: 1 },
    review_count: { type: ["number", "null"] },
    review_rating: { type: ["number", "null"] },
    certifications: { type: ["array", "null"], items: { type: "string" } },
    trust_signals: { type: ["array", "null"], items: { type: "string" } },
    emergency_service: { type: ["boolean", "null"] },
    same_day: { type: ["boolean", "null"] },
    service_area: { type: ["array", "null"], items: { type: "string" } },
    email: { type: ["string", "null"] },
    address: { type: ["string", "null"] },
    weekly_hours: { type: ["object", "null"] },
    testimonials: { type: ["array", "null"] },
    // 2026-05-22 — Phase U enrichment fields (all optional)
    photos: {
      type: ["array", "null"],
      items: {
        type: "object",
        required: ["src"],
        properties: {
          src: { type: "string", minLength: 1 },
          alt: { type: ["string", "null"] },
          section: {
            type: ["string", "null"],
            enum: ["hero", "services", "gallery", "testimonial", "about", "other", null],
          },
        },
      },
    },
    faq: {
      type: ["array", "null"],
      items: {
        type: "object",
        required: ["question", "answer"],
        properties: {
          question: { type: "string", minLength: 1 },
          answer: { type: "string", minLength: 1 },
        },
      },
    },
    services_detailed: {
      type: ["array", "null"],
      items: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", minLength: 1 },
          description: { type: ["string", "null"] },
        },
      },
    },
  },
} as const;

export type RequiredFieldsSchema = typeof REQUIRED_FIELDS_SCHEMA;
