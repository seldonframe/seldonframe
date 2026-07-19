// packages/crm/src/lib/web-onboarding/extraction-prompt.ts
//
// 2026-05-16 FIX — Vercel logs showed every URL extraction failing with
// `parse_failed` and previews like:
//   "I'll fetch the homepage to extract business facts. Let me start..."
//   "I'll help you extract business facts from <url> to create a SeldonFrame workspace..."
//
// Root cause: we were reusing EXTRACTION_INSTRUCTIONS from
// lib/soul-compiler/url-extraction-instructions.ts which was written for
// the Claude Code MCP path. It references MCP-specific tools (`WebFetch`,
// `create_workspace_v2`, `persist_block`, `recommended_blocks`) and is
// structured as a multi-step playbook with operator dialog. On the
// Anthropic API path the model has no MCP tools — it followed the
// playbook conversationally and never output bare JSON, so the parser
// always rejected the response.
//
// This file now defines a SEPARATE prompt purpose-built for the
// web-onboarding SSE flow:
//   - Single-shot fetch + extract (no operator dialog, no follow-up calls)
//   - HARD constraint: response must be exactly one JSON object, nothing else
//   - Same REQUIRED_FIELDS_SCHEMA shape so downstream parser + createFullWorkspace
//     work without changes
//
// The MCP path keeps the original verbose playbook untouched at
// lib/soul-compiler/url-extraction-instructions.ts — Claude Code needs
// the multi-step instructions because it orchestrates the workflow.
// Two paths, two prompts, one schema.

// Re-export REQUIRED_FIELDS_SCHEMA only (the JSON Schema is path-agnostic).
export { REQUIRED_FIELDS_SCHEMA } from "@/lib/soul-compiler/url-extraction-instructions";

/**
 * Strict JSON-only extraction prompt for the web-onboarding API path.
 * Output contract: exactly one JSON object matching ExtractedBusinessFacts.
 * No prose, no markdown fences, no follow-up questions, no tool calls
 * beyond web_fetch.
 *
 * Templating: caller appends "URL to extract: <url>" to the message — the
 * URL travels in the user message body so Anthropic's web_fetch tool
 * allowlist accepts it (per docs, web_fetch can only fetch URLs that
 * appeared in the conversation context).
 */
export const EXTRACTION_INSTRUCTIONS = `You are a data extractor. Your only job is to fetch a website and return ONE JSON object describing the business. NO conversation. NO explanation. NO markdown fences. NO preamble.

You have access to the web_fetch tool. Use it to read the URL provided in the user message. If the homepage doesn't contain all REQUIRED fields below, you may fetch up to 2 additional pages (priority order: /about, /services, /contact). HARD LIMIT: 3 total web_fetch calls.

After fetching, output ONE JSON object with these fields:

REQUIRED (must all be non-null, must be confidently extracted from the page):
- business_name: string (the business's actual name)
- city: string (the primary city the business is in)
- state: string (2-letter code like "WA" or full name)
- phone: string (any format — "(206) 555-0100", "206.555.0100", etc.)
- services: string[] (at least 1 entry, plain English; e.g. ["AC repair", "Furnace install", "Duct cleaning"])
- business_description: string (1-2 sentence summary of what the business does and who they serve)

OPTIONAL (include the field if confidently extracted, omit or set to null otherwise):
- review_count: number (e.g. 412)
- review_rating: number (1-5, e.g. 4.8)
- certifications: string[] (e.g. ["licensed", "bonded", "insured", "BBB A+"])
- trust_signals: string[] (e.g. ["family-owned since 1998", "satisfaction guaranteed"])
- emergency_service: boolean (true if site mentions 24/7, after-hours, emergency)
- same_day: boolean (true if site mentions same-day service)
- service_area: string[] (cities mentioned, e.g. ["Seattle", "Bellevue", "Tacoma"])
- email: string (if a contact email is on the page)
- address: string (full street address if present)
- weekly_hours: object | null (see format below)
- testimonials: array | null

For weekly_hours, use this EXACT shape only if hours are clearly visible:
{
  "monday": { "enabled": true, "start": "09:00", "end": "17:00" },
  "tuesday": { "enabled": true, "start": "09:00", "end": "17:00" },
  "wednesday": { "enabled": true, "start": "09:00", "end": "17:00" },
  "thursday": { "enabled": true, "start": "09:00", "end": "17:00" },
  "friday": { "enabled": true, "start": "09:00", "end": "17:00" },
  "saturday": { "enabled": false, "start": "00:00", "end": "00:00" },
  "sunday": { "enabled": false, "start": "00:00", "end": "00:00" }
}
- All 7 day keys must be present.
- Times are 24-hour HH:MM strings.
- enabled: false = closed (start/end can be any valid placeholder).
- Convert "9 AM - 5 PM" → "09:00" / "17:00". "7:30 AM - 5 PM" → "07:30" / "17:00".
- "Open 24 hours" → enabled: true, start: "00:00", end: "23:59".
- If hours appear but you cannot parse them confidently, omit the weekly_hours field entirely. Do NOT invent hours.

If the URL is unreachable, anti-bot challenged, or returns no meaningful content after up to 3 fetches, output EXACTLY:
{"_error": "fetch_failed"}

ABSOLUTE OUTPUT RULES:
1. Your ENTIRE response must be exactly one JSON object and nothing else.
2. NO text before the opening { — not "Here's the JSON:", not "I'll fetch...", nothing.
3. NO text after the closing } — no commentary, no follow-up questions.
4. NO markdown code fences. NO triple-backticks. Raw JSON only.
5. NEVER invent data. If a REQUIRED field can't be confidently extracted, the entire extraction fails — output {"_error": "fetch_failed"} instead of guessing.
6. Do NOT ask the user for missing fields. Do NOT explain your reasoning. Do NOT describe what you fetched.`;

/**
 * 2026-05-16 PROVIDER-AGNOSTIC PROMPT for the MD-input extraction pipeline.
 *
 * The old EXTRACTION_INSTRUCTIONS prompt above is Anthropic-specific —
 * it tells the model to use `web_fetch` (a Claude-only server tool) and
 * assumes the model fetches the URL itself. This new prompt feeds the
 * model a pre-fetched MD document as input and asks ONLY for extraction.
 * No tools. No fetching. One job.
 *
 * This shape works identically across Claude / GPT / Gemini / Llama. To
 * swap providers, only the SDK wrapper in markdown-extractor.ts changes —
 * the prompt is the durable "skill" that survives model upgrades.
 *
 * The caller appends:
 *   "URL: <url>\n\nPage content (Markdown):\n<md>"
 * after this instruction block.
 */
export const EXTRACTION_INSTRUCTIONS_MD = `You are a JSON-only business-fact extractor. The user message contains a website's content as Markdown. Return EXACTLY ONE JSON object describing the business.

REQUIRED (must all be non-null, must be confidently extracted from the Markdown):
- business_name: string (the business's actual name)
- city: string (the primary city the business is in)
- state: string (2-letter code like "WA" or full name)
- phone: string (any format — "(206) 555-0100", "206.555.0100", etc.)
- services: string[] (at least 1 entry, plain English; e.g. ["AC repair", "Furnace install", "Duct cleaning"])
- business_description: string (1-2 sentence summary of what the business does and who they serve)

OPTIONAL (include the field if confidently extracted, omit otherwise):
- review_count: number (e.g. 412)
- review_rating: number (1-5, e.g. 4.8)
- certifications: string[] (e.g. ["licensed", "bonded", "insured", "BBB A+"])
- trust_signals: string[] (e.g. ["family-owned since 1998", "satisfaction guaranteed"])
- emergency_service: boolean (true if Markdown mentions 24/7, after-hours, emergency)
- same_day: boolean (true if Markdown mentions same-day service)
- service_area: string[] (cities mentioned, e.g. ["Seattle", "Bellevue", "Tacoma"])
- email: string (if a contact email is in the Markdown)
- address: string (full street address if present)
- weekly_hours: object (see format below)
- testimonials: array (see format below)

- photos: array of { src: <absolute URL>, alt: <string>, section: "hero"|"services"|"gallery"|"testimonial"|"about"|"other" }
  Extract every image URL you find in the markdown. The markdown uses ![alt](url) syntax — every match is a candidate. For each:
    * src: the URL (must start with http or https)
    * alt: the alt text from the markdown (may be empty string)
    * section: your best guess of which page section the image appeared in based on its context in the markdown. Use "other" if unsure.
  Include up to 12 photos. Skip favicons, logos under 200x200 (if dimensions known), and tracking pixels. If no photos found, omit the field entirely.

- faq: array of { question: <string>, answer: <string> }
  Extract every visible FAQ / question-answer pair from the markdown. Common signals: the words "Frequently Asked Questions" or "FAQ" near a list of bold/heading-style questions followed by paragraph answers. Up to 8 items. If no FAQ section exists on the site, omit the field entirely (don't synthesize).

- services_detailed: array of { name: <string>, description: <string> }
  For each service you list in 'services', also try to extract a 1-2 sentence description from the markdown if the site provides one. Names should match the 'services' array exactly. If no descriptions are available on the site, omit the field entirely.

For weekly_hours, use this EXACT shape only if hours are clearly visible:
{
  "monday": { "enabled": true, "start": "09:00", "end": "17:00" },
  "tuesday": { "enabled": true, "start": "09:00", "end": "17:00" },
  "wednesday": { "enabled": true, "start": "09:00", "end": "17:00" },
  "thursday": { "enabled": true, "start": "09:00", "end": "17:00" },
  "friday": { "enabled": true, "start": "09:00", "end": "17:00" },
  "saturday": { "enabled": false, "start": "00:00", "end": "00:00" },
  "sunday": { "enabled": false, "start": "00:00", "end": "00:00" }
}
- All 7 day keys must be present.
- Times are 24-hour HH:MM strings.
- enabled: false = closed (start/end can be any valid placeholder).
- Convert "9 AM - 5 PM" -> "09:00" / "17:00". "7:30 AM - 5 PM" -> "07:30" / "17:00".
- "Open 24 hours" -> enabled: true, start: "00:00", end: "23:59".
- If hours appear but you cannot parse them confidently, omit the weekly_hours field entirely. Do NOT invent hours.

For testimonials, use this shape:
[{ "quote": "...", "name": "...", "role": "...", "company": "...", "rating": 5 }]
Only "quote" is required per testimonial; other fields are optional.

ABSOLUTE OUTPUT RULES:
1. Your ENTIRE response is exactly one JSON object. No preamble, no markdown code fences, no commentary.
2. NO text before the opening { — not "Here's the JSON:", not "I extracted...", nothing.
3. NO text after the closing } — no follow-up questions, no explanation.
4. NEVER invent. If a REQUIRED field is not clearly in the Markdown, output {"_error": "extraction_failed"} and nothing else.
5. NO conversation. NO reasoning out loud.`;

/**
 * TypeScript shape mirroring REQUIRED_FIELDS_SCHEMA. Maps field-for-field
 * to CreateFullWorkspaceInput in lib/workspace/create-full.ts — no adapter
 * layer needed downstream.
 */
export type ExtractedBusinessFacts = {
  // Required
  business_name: string;
  city: string;
  state: string;
  phone: string;
  services: string[];
  business_description: string;
  // Optional enrichment
  review_count?: number | null;
  review_rating?: number | null;
  certifications?: string[] | null;
  trust_signals?: string[] | null;
  emergency_service?: boolean | null;
  same_day?: boolean | null;
  service_area?: string[] | null;
  // Optional contact channels
  email?: string | null;
  address?: string | null;
  // Optional weekly hours (existing format from create-full.ts:86)
  weekly_hours?: Partial<Record<
    "sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday",
    { enabled: boolean; start: string; end: string }
  >> | null;
  // Optional testimonials
  testimonials?: Array<{
    quote: string;
    name?: string | null;
    role?: string | null;
    company?: string | null;
    rating?: number | null;
  }> | null;

  // 2026-05-22 — extraction enrichment (Phase U). All OPTIONAL — present
  // only when the URL extraction found them on the original site. The
  // paste path always emits null/undefined for these. The R1 payload
  // generator prefers these over synthesis when present.

  /** 2026-07-13 — the business's own logo, harvested from the source page
   *  HTML (an <img> wordmark, else apple-touch-icon/favicon). URL path only;
   *  the paste path leaves this undefined. Rendered in the R1 nav/footer. */
  logo?: string | null;

  photos?: Array<{
    /** Absolute URL. */
    src: string;
    /** Alt text from the original site (if any). */
    alt?: string | null;
    /** Original section context. LLM's best guess. */
    section?: "hero" | "services" | "gallery" | "testimonial" | "about" | "other" | null;
  }> | null;

  faq?: Array<{
    question: string;
    answer: string;
  }> | null;

  // Richer services — name + optional description harvested from the site.
  // The existing `services: string[]` field STAYS for backward compatibility;
  // this new field is a richer view that the R generator prefers when present.
  services_detailed?: Array<{
    name: string;
    description?: string | null;
  }> | null;
};
