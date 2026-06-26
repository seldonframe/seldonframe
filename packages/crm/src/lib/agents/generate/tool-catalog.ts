// Agent Loop — L5 Self-Improving Generator — Task 1: the bindable tool catalog.
//
// When an operator describes an agent in plain English ("post a weekly highlight
// to Instagram and Facebook", "log every lead into a Google Sheet"), the
// generator needs to suggest the EXTERNAL tools that sentence implies and bind
// them onto the agent's blueprint. This module is the pure source of truth for
// that: a small, intentional catalog of the tools an agent can actually be bound
// to, plus a keyword matcher that turns a sentence into the subset it implies.
//
// Each catalog entry maps 1:1 onto a real, WIRED connector so a match produces a
// VALID `blueprint.connectors` entry (see lib/agents/mcp/connectors.ts) — never
// an invented slug or kind:
//
//   • connectorKind "vetted"   → a connector SeldonFrame ships (the endpoint is
//                                baked into VETTED_CONNECTORS, the operator only
//                                supplies a bearer key). Postiz (social) is the
//                                only vetted, agent-useful entry; its binding is
//                                { kind:"vetted", id:"postiz", serviceName:"postiz",
//                                  enabledTools:[…] }.
//   • connectorKind "composio" → a per-workspace MANAGED Composio session. The
//                                binding carries NO endpoint/secret — just the
//                                enabled toolkit slug(s) + the per-tool allowlist:
//                                { kind:"composio", enabledToolkits:[slug],
//                                  enabledTools:[…] }. `toolkitSlug` here is the
//                                REAL Composio slug from the curated catalog
//                                (lib/integrations/composio/catalog.ts).
//
// Only toolkits that the real Composio catalog (COMPOSIO_TOOLKITS) actually
// exposes AND are useful to an agent are included: gmail, googlecalendar,
// googledrive, slack, notion. (Sheets is NOT a separate catalog toolkit — see
// note below.) Postiz is added from VETTED_CONNECTORS.
//
// PURE — no SDK / network / clock / env / "use server". Never throws. Safe from a
// Server Component, action, route handler, the runtime, or a test.

/**
 * A bindable tool the generator can suggest from an operator's sentence. Maps
 * onto a real connector so it can be turned into a `blueprint.connectors` entry.
 */
export type ToolCatalogEntry = {
  /** Stable catalog id (matches the vetted connector id, or the Composio
   *  toolkit slug for managed toolkits). Used to dedupe matches. */
  id: string;
  /** The wired connector kind this entry binds as: "vetted" | "composio". A
   *  bound tool MUST produce a valid ConnectorBinding of this kind. */
  connectorKind: string;
  /** For composio entries: the REAL Composio toolkit slug (catalog.ts). Omitted
   *  for vetted connectors (their endpoint is baked into VETTED_CONNECTORS). */
  toolkitSlug?: string;
  /** Human label for the suggestion UI. */
  label: string;
  /** One-line description of what binding this tool gives the agent. */
  description: string;
  /** Lowercase trigger words/phrases in an operator's sentence that imply this
   *  tool. Matched whole-word-ish (see findToolsByKeywords). */
  keywords: string[];
};

// ─── the catalog ──────────────────────────────────────────────────────────────
//
// IMPORTANT — every entry is grounded in a REAL wired connector:
//   • postiz       → VETTED_CONNECTORS[id="postiz"]  (kind "vetted")
//   • googlesheets → COMPOSIO_TOOLKITS does NOT list "googlesheets" as its own
//     toolkit; Google Sheets actions live UNDER the googledrive toolkit's
//     managed session in this curated catalog. So a "Google Sheet" sentence
//     binds the `googledrive` toolkit (the closest REAL slug) — we surface it
//     under a sheet-friendly label/keywords. (Documented divergence from the
//     plan's example list, which named "googlesheets" speculatively.)
//   • googlecalendar / googledrive / gmail / slack / notion → the matching
//     COMPOSIO_TOOLKITS slugs (kind "composio").
//
// The slugs + kinds below were read from the real files, not invented:
//   - VETTED_CONNECTORS (lib/agents/mcp/connectors.ts): postiz, rube.
//   - COMPOSIO_TOOLKITS (lib/integrations/composio/catalog.ts): gmail,
//     googlecalendar, googledrive, slack, notion, hubspot, quickbooks, outlook.

/**
 * The bindable tool catalog (v1). Small + intentional — one entry per real,
 * agent-useful connector. Postiz (vetted) + the agent-useful Composio toolkits.
 */
export const TOOL_CATALOG: readonly ToolCatalogEntry[] = [
  {
    // Vetted connector — VETTED_CONNECTORS[id="postiz"]. Binds as
    // { kind:"vetted", id:"postiz", serviceName:"postiz", enabledTools:[…] }.
    id: "postiz",
    connectorKind: "vetted",
    label: "Postiz (social publishing)",
    description:
      "Multi-platform social publisher — draft, schedule, and publish posts to Instagram, Facebook, LinkedIn, X/Twitter, TikTok, and more via Postiz.",
    keywords: [
      "social",
      "social media",
      "instagram",
      "facebook",
      "linkedin",
      "x", // guarded in findToolsByKeywords so it never matches inside "fax" etc.
      "twitter",
      "tiktok",
      "post",
      "schedule post",
      "reels",
      "caption",
      "hashtag",
    ],
  },
  {
    // Composio managed toolkit — COMPOSIO_TOOLKITS[slug="googledrive"]. Google
    // Sheets actions are exposed under the Drive session in this curated
    // catalog, so a "log to a Google Sheet" sentence binds googledrive. Binds as
    // { kind:"composio", enabledToolkits:["googledrive"], enabledTools:[…] }.
    id: "googlesheets",
    connectorKind: "composio",
    toolkitSlug: "googledrive",
    label: "Google Sheets / Drive",
    description:
      "Read and write Google Sheets and files in Google Drive (e.g. log every lead into a spreadsheet).",
    keywords: [
      "google sheet",
      "google sheets",
      "googlesheets",
      "spreadsheet",
      "sheet",
      "google drive",
      "googledrive",
      "drive",
    ],
  },
  {
    // Composio managed toolkit — COMPOSIO_TOOLKITS[slug="googlecalendar"]. Binds
    // as { kind:"composio", enabledToolkits:["googlecalendar"], enabledTools:[…] }.
    id: "googlecalendar",
    connectorKind: "composio",
    toolkitSlug: "googlecalendar",
    label: "Google Calendar",
    description:
      "Create and look up events on the business's Google Calendar (real availability + booking).",
    keywords: [
      "google calendar",
      "googlecalendar",
      "calendar",
      "availability",
      "schedule a meeting",
      "book a meeting",
      "appointment",
    ],
  },
  {
    // Composio managed toolkit — COMPOSIO_TOOLKITS[slug="gmail"]. Binds as
    // { kind:"composio", enabledToolkits:["gmail"], enabledTools:[…] }.
    id: "gmail",
    connectorKind: "composio",
    toolkitSlug: "gmail",
    label: "Gmail",
    description: "Send and read email from the business's Gmail account.",
    keywords: ["gmail", "google mail"],
  },
  {
    // Composio managed toolkit — COMPOSIO_TOOLKITS[slug="notion"]. Binds as
    // { kind:"composio", enabledToolkits:["notion"], enabledTools:[…] }.
    id: "notion",
    connectorKind: "composio",
    toolkitSlug: "notion",
    label: "Notion",
    description:
      "Create pages and search/query databases in the business's Notion workspace.",
    keywords: ["notion"],
  },
  {
    // Composio managed toolkit — COMPOSIO_TOOLKITS[slug="slack"]. Binds as
    // { kind:"composio", enabledToolkits:["slack"], enabledTools:[…] }.
    id: "slack",
    connectorKind: "composio",
    toolkitSlug: "slack",
    label: "Slack",
    description:
      "Post messages and read channel history in the business's Slack workspace.",
    keywords: ["slack"],
  },
];

// ─── UI projection (one source of truth for the editor's chips) ───────────────
//
// The agent EDITOR's "Apps & tools" quick-chips and the generator's AUTHOR menu
// must offer the SAME set — otherwise the UI could show an app the generator
// can't wire, or hide one it can. Both derive from TOOL_CATALOG: the author menu
// via buildToolMenu() (author-llm.ts), the editor via this projection. This
// returns only the fields the chip UI needs — no `keywords` (a sentence-matcher
// concern the UI never touches) — so the client component stays decoupled from
// the matcher internals while sharing the single catalog.

/** The UI-facing shape of a catalog entry: what the editor's chip render + its
 *  binding toggle need, and nothing else. `toolkitSlug` is present for composio
 *  entries (the slug the chip toggles) and omitted for vetted entries (whose
 *  endpoint is baked in — their chip opens the add-connector flow instead). */
export type ToolCatalogUiEntry = {
  id: string;
  label: string;
  description: string;
  connectorKind: string;
  toolkitSlug?: string;
};

/**
 * Project TOOL_CATALOG to the UI-facing entries the editor's quick-chips render
 * from — same ids, same order, label/description/connectorKind/toolkitSlug
 * carried verbatim. The single source the editor maps over so the curated chips
 * always match what the generator can bind. Pure; never throws.
 */
export function toolCatalogForUi(): ToolCatalogUiEntry[] {
  return TOOL_CATALOG.map((e) => ({
    id: e.id,
    label: e.label,
    description: e.description,
    connectorKind: e.connectorKind,
    ...(e.toolkitSlug !== undefined ? { toolkitSlug: e.toolkitSlug } : {}),
  }));
}

// ─── keyword matcher ──────────────────────────────────────────────────────────

/** Escape a string for safe use inside a RegExp literal. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Does `text` (already lowercased) contain `keyword` as a whole word / phrase?
 *
 * Every keyword — single-word AND multi-word — is matched with `\b…\b` word
 * boundaries. That's what makes the short-keyword guard work: "x" never matches
 * inside "fax"/"box", "drive" never matches "driver", "post" never matches
 * "postcode". A multi-word phrase ("google sheet") keeps its inner space literal
 * and just brackets the ends, so it can't match a substring of a larger word.
 *
 * Uses a fresh, non-global RegExp per call (no shared lastIndex state). Never
 * throws — any odd keyword is regex-escaped first.
 */
function containsKeyword(text: string, keyword: string): boolean {
  const kw = keyword.toLowerCase().trim();
  if (!kw) return false;
  // Always use word boundaries. For a multi-word phrase the inner spaces still
  // match literally; \b on the ends prevents partial-word matches. `\b` is a
  // zero-width assertion at a word-char/non-word-char edge, so it correctly
  // brackets keywords that start/end with a letter or digit.
  const re = new RegExp(`\\b${escapeRegExp(kw)}\\b`, "i");
  return re.test(text);
}

/**
 * Return the catalog entries an operator's sentence implies, deduped by id and
 * in catalog order. Lowercases the input, matches any keyword (whole-word-ish so
 * a short keyword like "x" never trips inside another word), and never throws —
 * a non-string or empty sentence yields `[]`.
 *
 * Example: "post a weekly highlight to Instagram and Facebook" → [postiz] (one
 * entry, even though three of its keywords — post/instagram/facebook — matched).
 */
export function findToolsByKeywords(sentence: string): ToolCatalogEntry[] {
  const text = (typeof sentence === "string" ? sentence : "").toLowerCase();
  if (!text.trim()) return [];

  const out: ToolCatalogEntry[] = [];
  const seen = new Set<string>();

  for (const entry of TOOL_CATALOG) {
    if (seen.has(entry.id)) continue;
    const hit = entry.keywords.some((kw) => containsKeyword(text, kw));
    if (hit) {
      seen.add(entry.id);
      out.push(entry);
    }
  }

  return out;
}
