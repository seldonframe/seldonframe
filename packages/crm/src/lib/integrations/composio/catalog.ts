// The curated Composio toolkit catalog (v1). These are the apps a SeldonFrame
// workspace can connect via managed OAuth ("Connect Gmail" etc.). All 8 are
// Composio-managed-auth toolkits, so the operator never registers an OAuth app —
// Composio owns each toolkit's consent screen.
//
// PURE — no SDK / network import, so it's safe in any runtime (the /integrations
// page imports it for the static grid; the adapter filters live connections to
// it). The logo URLs point at Composio's public logo CDN (verified 200/SVG for
// every slug here). `primaryTrigger` is the toolkit's canonical inbound-event
// trigger slug used to wire archetype agents (Phase 4); it's null when there is
// no single obvious primary or the slug isn't pinned here — the live source of
// truth for available triggers is always Composio's trigger list.

/** A catalog toolkit entry. `slug` is the Composio toolkit slug (lowercase). */
export type ComposioToolkitInfo = {
  /** Composio toolkit slug (e.g. "gmail"). The id used in every SDK call. */
  slug: string;
  /** Human label for the UI. */
  label: string;
  /** Public logo URL (Composio CDN), or null. */
  logo: string | null;
  /** Canonical inbound-event trigger slug for archetype wiring, or null. */
  primaryTrigger: string | null;
};

/** Composio's public logo CDN — `https://logos.composio.dev/api/<slug>` returns
 *  an SVG for each toolkit slug (verified for all 8 below). */
function logoFor(slug: string): string {
  return `https://logos.composio.dev/api/${slug}`;
}

/**
 * The 8 curated, managed-auth toolkits. Order is the display order in the
 * /integrations grid. Keep this list small + intentional — adding a toolkit is
 * a single entry here (the grid + the connection filter read this list).
 */
export const COMPOSIO_TOOLKITS: readonly ComposioToolkitInfo[] = [
  {
    slug: "gmail",
    label: "Gmail",
    logo: logoFor("gmail"),
    // Canonical Gmail "new message" trigger (pinned in the plan + Composio docs).
    primaryTrigger: "GMAIL_NEW_GMAIL_MESSAGE",
  },
  {
    slug: "googlecalendar",
    label: "Google Calendar",
    logo: logoFor("googlecalendar"),
    // Calendar event triggers exist (GOOGLECALENDAR_*) but the exact primary
    // slug is resolved live from Composio rather than pinned here.
    primaryTrigger: null,
  },
  {
    slug: "googledrive",
    label: "Google Drive",
    logo: logoFor("googledrive"),
    primaryTrigger: null,
  },
  {
    slug: "slack",
    label: "Slack",
    logo: logoFor("slack"),
    primaryTrigger: null,
  },
  {
    slug: "notion",
    label: "Notion",
    logo: logoFor("notion"),
    primaryTrigger: null,
  },
  {
    slug: "hubspot",
    label: "HubSpot",
    logo: logoFor("hubspot"),
    primaryTrigger: null,
  },
  {
    slug: "quickbooks",
    label: "QuickBooks",
    logo: logoFor("quickbooks"),
    primaryTrigger: null,
  },
  {
    slug: "outlook",
    label: "Outlook",
    logo: logoFor("outlook"),
    primaryTrigger: null,
  },
] as const;

/** The bare slug list (handy for `composio.create(orgId, { toolkits })`). */
export const COMPOSIO_TOOLKIT_SLUGS: readonly string[] = COMPOSIO_TOOLKITS.map(
  (t) => t.slug,
);

/**
 * A curated default tool allowlist per toolkit. Composio tool slugs follow the
 * `{TOOLKIT}_{ACTION}` convention (verified — Composio glossary). The agent
 * runtime wraps EXACTLY the binding's `enabledTools` by name (no live discovery
 * in the binding path), so when a builder enables a toolkit in Studio we seed a
 * small, sensible set of the most useful actions for that app. This is
 * intentionally conservative (a handful per toolkit) and can be widened later by
 * live discovery; the operator can also trim it in the picker.
 *
 * Slugs are the well-known Composio action tools for each toolkit. Unknown/typo'd
 * slugs are simply inert at runtime (resolveComposioBinding wraps by name; a name
 * the MCP server doesn't expose just yields a tool the model can call that errors
 * — so we keep this list to documented actions).
 */
const DEFAULT_TOOLS_BY_TOOLKIT: Record<string, readonly string[]> = {
  gmail: ["GMAIL_SEND_EMAIL", "GMAIL_FETCH_EMAILS", "GMAIL_CREATE_EMAIL_DRAFT"],
  googlecalendar: [
    "GOOGLECALENDAR_CREATE_EVENT",
    // Free/busy lookup for the pluggable booking backend (availability). The
    // exact slug is confirmed against the live Composio catalog in T12; if it
    // differs, the booking adapter fails soft to native availability.
    "GOOGLECALENDAR_FIND_FREE_SLOTS",
    "GOOGLECALENDAR_FIND_EVENT",
    "GOOGLECALENDAR_LIST_EVENTS",
  ],
  googledrive: [
    "GOOGLEDRIVE_FIND_FILE",
    "GOOGLEDRIVE_CREATE_FILE",
    "GOOGLEDRIVE_DOWNLOAD_FILE",
  ],
  slack: ["SLACK_SEND_MESSAGE", "SLACK_LIST_CHANNELS", "SLACK_FETCH_CONVERSATION_HISTORY"],
  notion: ["NOTION_CREATE_PAGE", "NOTION_SEARCH", "NOTION_QUERY_DATABASE"],
  hubspot: [
    "HUBSPOT_CREATE_CONTACT",
    "HUBSPOT_SEARCH_CONTACTS",
    "HUBSPOT_CREATE_DEAL",
  ],
  quickbooks: [
    "QUICKBOOKS_CREATE_INVOICE",
    "QUICKBOOKS_CREATE_CUSTOMER",
    "QUICKBOOKS_LIST_INVOICES",
  ],
  outlook: [
    "OUTLOOK_SEND_EMAIL",
    "OUTLOOK_LIST_MESSAGES",
    "OUTLOOK_CALENDAR_CREATE_EVENT",
    // Free/busy lookup (booking backend availability) — live-confirmed in T12.
    "OUTLOOK_CALENDAR_GET_SCHEDULE",
  ],
};

/**
 * The default tool allowlist for a set of enabled toolkits — the union of each
 * toolkit's curated default actions (catalog toolkits only; unknown slugs
 * ignored). De-duplicated, order-stable. Used when a builder enables Composio
 * apps for an agent in Studio.
 */
export function defaultToolsForToolkits(toolkits: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const slug of toolkits) {
    const norm = slug.trim().toLowerCase();
    const tools = DEFAULT_TOOLS_BY_TOOLKIT[norm];
    if (!tools) continue;
    for (const t of tools) {
      if (seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

const TOOLKIT_BY_SLUG = new Map<string, ComposioToolkitInfo>(
  COMPOSIO_TOOLKITS.map((t) => [t.slug, t]),
);

/** Look up a catalog toolkit by slug (case-insensitive), or undefined. */
export function getComposioToolkit(slug: string): ComposioToolkitInfo | undefined {
  return TOOLKIT_BY_SLUG.get(slug.trim().toLowerCase());
}

/** True if the slug is one of the curated catalog toolkits. */
export function isCatalogToolkit(slug: string): boolean {
  return TOOLKIT_BY_SLUG.has(slug.trim().toLowerCase());
}
