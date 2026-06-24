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
