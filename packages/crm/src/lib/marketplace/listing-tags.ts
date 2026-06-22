// Agent marketplace — listing TAG conventions (pure, no DB, no React).
//
// marketplace_listings.tags is a free-form jsonb string[] that already carries
// RESERVED, prefixed tags the storefront parses but never renders raw:
//   surfaces:voice,sms   → which channels the agent works over
//   builder:Acme         → the builder's display name
// (see marketplace-data.ts surfacesFromTags / builderFromTags).
//
// Phase 3 (seller side) adds one more reserved prefix:
//   tmpl:<templateId>    → links a kind:'agent' listing back to its source
//                          Studio agent_templates row, since the listings table
//                          has no templateId column and we add no migration.
//
// These helpers keep the reserved tags separate from the seller's user-facing
// tags so: (a) a listing can be matched back to its template, and (b) the
// publish panel only ever shows/edits the user's own tags.

/** The reserved prefix that links a listing row to its source template. */
export const TEMPLATE_LINK_TAG_PREFIX = "tmpl:";

/** All reserved tag prefixes — anything starting with one of these is metadata,
 *  not a user-facing tag. */
export const RESERVED_TAG_PREFIXES = ["tmpl:", "surfaces:", "builder:"] as const;

function isReservedTag(tag: string): boolean {
  return RESERVED_TAG_PREFIXES.some((p) => tag.startsWith(p));
}

/** Normalize a user tag list: trim, drop empties, drop reserved-prefixed tags
 *  (a seller can't smuggle a reserved tag), de-dupe, cap length. */
export function normalizeUserTags(tags: readonly string[] | null | undefined): string[] {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = String(raw ?? "").trim();
    if (!t || isReservedTag(t)) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= 12) break;
  }
  return out;
}

/** Split a stored tags array into the template-link id (if present) + the
 *  user-facing tags (reserved tags removed). */
export function splitListingTags(tags: readonly string[] | null | undefined): {
  templateId: string | null;
  userTags: string[];
} {
  let templateId: string | null = null;
  const userTags: string[] = [];
  for (const raw of tags ?? []) {
    const t = String(raw ?? "").trim();
    if (!t) continue;
    if (t.startsWith(TEMPLATE_LINK_TAG_PREFIX)) {
      const id = t.slice(TEMPLATE_LINK_TAG_PREFIX.length).trim();
      if (id && !templateId) templateId = id;
      continue;
    }
    if (isReservedTag(t)) continue; // other reserved metadata — not user-facing
    userTags.push(t);
  }
  return { templateId, userTags };
}

/** Build the tags array to persist on a listing: the reserved template-link tag
 *  first, then the normalized user tags. */
export function buildListingTags(input: {
  templateId: string;
  userTags?: readonly string[] | null;
}): string[] {
  const link = `${TEMPLATE_LINK_TAG_PREFIX}${String(input.templateId).trim()}`;
  return [link, ...normalizeUserTags(input.userTags)];
}
