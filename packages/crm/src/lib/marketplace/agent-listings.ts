// Agent marketplace — the PURE engine (no "use server", no direct db).
//
// Mirrors export-soul.ts / install-soul.ts but for Studio agent_templates:
// a builder lists a template's blueprint as a marketplace_listings row
// (kind:'agent'); a buyer installs it by cloning that blueprint back into
// their OWN org as a fresh draft agent_templates row (run on the buyer's
// own BYOK — nothing here touches keys). It reuses the EXISTING
// marketplaceListings table + the soul purchase/install/Stripe/2% engine via
// the kind discriminator — there is no parallel commerce stack.
//
// Everything in this file is pure or DI'd so it unit-tests with no Postgres.
// The two "use server" actions live in actions.ts and are thin org-guard + db
// wiring over these helpers.

import type { marketplaceListings } from "@/db/schema/marketplace";
import type { AgentTemplate, NewAgentTemplate } from "@/db/schema/agent-templates";
import type { AgentTemplateType } from "@/lib/agent-templates/store";
import type { AgentBlueprint } from "@/db/schema/agents";

/** The marketplace_listings INSERT shape (derived from the table). */
type NewMarketplaceListing = typeof marketplaceListings.$inferInsert;

// ─── mapTemplateToAgentListing ───────────────────────────────────────────────

export type MapTemplateToListingOpts = {
  /** The builder's org — the listing creator (org-scoped, like soul listings). */
  creatorOrgId: string;
  /** Pre-resolved unique listing slug (the caller resolves uniqueness vs. the
   *  table; slug generation needs no DB but uniqueness does). */
  slug: string;
  /** Price in CENTS. 0 → free (install clones immediately, no Stripe). Mirrors
   *  marketplaceListings.price, which is an integer cents column. */
  priceCents: number;
  /** Storefront category (e.g. "home-services", "reviews"). */
  niche: string;
  /** Free-form tags (surface pills, search). */
  tags: string[];
  /** Optional buyer-facing blurb. Falls back to the template name so a row is
   *  never NULL-described in a list/card view. */
  description?: string;
};

/**
 * Map a Studio agent_templates row + listing opts onto a marketplace_listings
 * INSERT with kind:'agent'. Pure — no DB.
 *
 * The blueprint is carried verbatim into agentBlueprint (that is the thing the
 * buyer clones on install) and the template type into agentType. soulPackage is
 * NOT NULL on the table, so an agent listing gets an inert {} placeholder that
 * the agent path never reads — keeping the migration strictly additive and the
 * soul path untouched.
 */
export function mapTemplateToAgentListing(
  template: AgentTemplate,
  opts: MapTemplateToListingOpts,
): NewMarketplaceListing {
  const description = (opts.description ?? "").trim() || template.name;
  return {
    kind: "agent",
    creatorOrgId: opts.creatorOrgId,
    slug: opts.slug,
    name: template.name,
    description,
    niche: opts.niche,
    tags: opts.tags,
    price: opts.priceCents,
    agentType: template.type,
    agentBlueprint: template.blueprint,
    // Inert: agent listings have no soul. soul_package is NOT NULL on the
    // table, so satisfy it with an empty object the agent path never reads.
    soulPackage: {},
  };
}

// ─── buildInstalledAgentTemplate ─────────────────────────────────────────────

/** The subset of a kind:'agent' listing the install path needs to clone it. */
export type AgentListingForBuyer = {
  id: string;
  slug: string;
  name: string;
  kind: string;
  agentType: string | null;
  agentBlueprint: AgentBlueprint | null;
};

/** The agent_templates INSERT for the buyer, minus the slug (the install action
 *  resolves a per-buyer-unique slug against the DB). */
export type InstalledAgentTemplateArgs = Pick<
  NewAgentTemplate,
  "builderOrgId" | "name" | "type" | "blueprint" | "status"
>;

/**
 * Turn a kind:'agent' listing into the agent_templates INSERT args for the
 * BUYER's org. Pure — no DB.
 *
 * The buyer gets a fresh DRAFT template owned by THEIR org, carrying the
 * SELLER's blueprint (a defensive copy so editing the installed template can
 * never mutate the listing). We clone the blueprint directly rather than
 * routing through createAgentTemplate's default-blueprint seeding, which would
 * discard the seller's customization. The caller resolves the unique slug.
 */
export function buildInstalledAgentTemplate(
  listing: AgentListingForBuyer,
  buyerOrgId: string,
): InstalledAgentTemplateArgs {
  if (listing.kind !== "agent") {
    throw new Error("buildInstalledAgentTemplate: listing is not an agent listing");
  }
  if (!listing.agentBlueprint) {
    throw new Error("buildInstalledAgentTemplate: agent listing is missing its blueprint");
  }
  if (!listing.agentType) {
    throw new Error("buildInstalledAgentTemplate: agent listing is missing its type");
  }

  return {
    builderOrgId: buyerOrgId,
    name: listing.name,
    type: listing.agentType satisfies string as AgentTemplateType,
    // Structured-clone the blueprint so the installed template owns its own
    // copy (editing it must never reach back into the listing row).
    blueprint: structuredClone(listing.agentBlueprint),
    status: "draft",
  };
}

// ─── listMarketplaceAgents (DI db) ───────────────────────────────────────────

/** A published agent listing as rendered in the storefront grid. */
export type MarketplaceAgentRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  niche: string;
  tags: string[];
  price: number;
  agentType: string | null;
  installCount: number;
  rating: number;
  reviewCount: number;
  isFeatured: boolean;
  previewImageUrl: string | null;
};

export type ListMarketplaceAgentsFilters = {
  /** Exact-match category filter. */
  niche?: string;
  /** Free-text search across name + description (case-insensitive substring). */
  q?: string;
  /** When true, keep only featured listings. */
  featured?: boolean;
};

export type ListMarketplaceAgentsDeps = {
  /** Return all PUBLISHED kind='agent' listings (the WHERE lives in the dep so
   *  this stays unit-testable with a fake). */
  listPublishedAgents: () => Promise<MarketplaceAgentRow[]>;
};

/**
 * List published agent listings, filtered + sorted for the storefront. Pure
 * over an injected db dep so it tests with no Postgres. Sort: featured first,
 * then installCount desc (mirrors idx_marketplace_featured on the table).
 */
export async function listMarketplaceAgents(
  filters: ListMarketplaceAgentsFilters,
  deps: ListMarketplaceAgentsDeps,
): Promise<MarketplaceAgentRow[]> {
  const all = await deps.listPublishedAgents();

  let filtered = all;

  if (filters.niche) {
    filtered = filtered.filter((row) => row.niche === filters.niche);
  }

  if (filters.featured) {
    filtered = filtered.filter((row) => row.isFeatured);
  }

  if (filters.q) {
    const q = filters.q.toLowerCase();
    filtered = filtered.filter(
      (row) =>
        row.name.toLowerCase().includes(q) ||
        (row.description ?? "").toLowerCase().includes(q),
    );
  }

  return [...filtered].sort((a, b) => {
    // Featured first.
    if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
    // Then most-installed.
    return (b.installCount ?? 0) - (a.installCount ?? 0);
  });
}

// ─── default DB-backed dep (lazy — never imported in unit tests) ─────────────

/** The real published-agents query: published kind='agent' listings. Lazy
 *  imports so unit tests of listMarketplaceAgents never touch Postgres. */
function buildDefaultListAgentsDeps(): ListMarketplaceAgentsDeps {
  return {
    listPublishedAgents: async () => {
      const { db } = await import("@/db");
      const { marketplaceListings } = await import("@/db/schema/marketplace");
      const { and, eq } = await import("drizzle-orm");
      const rows = await db
        .select({
          id: marketplaceListings.id,
          slug: marketplaceListings.slug,
          name: marketplaceListings.name,
          description: marketplaceListings.description,
          niche: marketplaceListings.niche,
          tags: marketplaceListings.tags,
          price: marketplaceListings.price,
          agentType: marketplaceListings.agentType,
          installCount: marketplaceListings.installCount,
          rating: marketplaceListings.rating,
          reviewCount: marketplaceListings.reviewCount,
          isFeatured: marketplaceListings.isFeatured,
          previewImageUrl: marketplaceListings.previewImageUrl,
        })
        .from(marketplaceListings)
        .where(and(eq(marketplaceListings.isPublished, true), eq(marketplaceListings.kind, "agent")));
      return rows as MarketplaceAgentRow[];
    },
  };
}

/** Storefront convenience: list published agent listings from the real DB,
 *  filtered + sorted. Thin wrapper over listMarketplaceAgents with the default
 *  DB dep so server code (the /marketplace route) needn't hand-write the WHERE. */
export async function listMarketplaceAgentsFromDb(
  filters: ListMarketplaceAgentsFilters = {},
): Promise<MarketplaceAgentRow[]> {
  return listMarketplaceAgents(filters, buildDefaultListAgentsDeps());
}

// ─── get-one published agent listing by slug (ACP checkout) ──────────────────

/** A single published kind='agent' listing resolved for ACP checkout: the
 *  fields needed to price a line item + attribute the (recorded) fee to the
 *  creator org. `creatorOrgId` is the agent's owner (the seller). */
export type AgentListingForCheckout = {
  slug: string;
  name: string;
  priceCents: number;
  niche: string;
  creatorOrgId: string;
};

/**
 * Resolve ONE published kind='agent' listing by slug for ACP checkout. Returns
 * null when the slug doesn't resolve to a published agent listing. Lazy-imports
 * the db so unit tests that don't hit this never touch Postgres (the ACP handler
 * is tested with a fake resolver). `price` is the listing's one-time price in
 * cents; the caller decides checkout-eligibility (price > 0 → enable_checkout).
 */
export async function getPublishedAgentListingBySlug(
  slug: string,
): Promise<AgentListingForCheckout | null> {
  const { db } = await import("@/db");
  const { marketplaceListings } = await import("@/db/schema/marketplace");
  const { and, eq } = await import("drizzle-orm");
  const [row] = await db
    .select({
      slug: marketplaceListings.slug,
      name: marketplaceListings.name,
      price: marketplaceListings.price,
      niche: marketplaceListings.niche,
      creatorOrgId: marketplaceListings.creatorOrgId,
      kind: marketplaceListings.kind,
    })
    .from(marketplaceListings)
    .where(and(eq(marketplaceListings.slug, slug), eq(marketplaceListings.isPublished, true)))
    .limit(1);
  if (!row || row.kind !== "agent") return null;
  return {
    slug: row.slug,
    name: row.name,
    priceCents: row.price ?? 0,
    niche: row.niche,
    creatorOrgId: row.creatorOrgId,
  };
}
