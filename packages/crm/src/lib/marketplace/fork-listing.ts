// "Fork this agent" — keyless buyer→builder conversion (virality pack, Task 3).
//
// A marketplace visitor with NO account and NO API key can turn a FREE agent
// listing into their own live, hosted workspace in one click — the fastest
// path from "browsing the storefront" to "I have a real Business OS running
// this agent." This is deliberately the SAME shape as the ChatGPT app's
// deploy() (src/lib/chatgpt-app/deps.ts): rate-limit → resolve PUBLISHED
// kind:'agent' listing → REFUSE paid via storefrontPriceFromRow(...).isPaid →
// clone the blueprint via the buildInstalledAgentTemplate shape. The only
// difference is WHERE the clone lands: deploy() installs into an existing
// (already-created) workspace identified by a bearer token; this installs
// into a BRAND NEW anonymous workspace created on the spot
// (createAnonymousWorkspace), because the caller here has no workspace yet.
//
// SECURITY: this is a keyless WRITE path (it creates an org with no auth).
// The ONLY client input is `slug` — validated against published, free
// listings before anything is created. `ip` drives rate limiting only, never
// authorization. There is no orgId in the request; the org is minted fresh
// by createAnonymousWorkspace, which is the sole org-creation seam. A fork of
// a paid listing would let a buyer skip the storefront's purchase flow
// entirely, so that gate is non-negotiable — same reasoning the ChatGPT deps
// comment gives for deploy().
//
// DI'd (repo convention) so it unit-tests with fakes — no DB, no network, no
// rate-limit backend. The route (api/marketplace/fork/route.ts) binds
// buildRealForkListingDeps() and translates the result into a 303 redirect.

import type { AgentBlueprint } from "@/db/schema/agents";
import type { AgentTemplateType } from "@/lib/agent-templates/store";
import { storefrontPriceFromRow, type StorefrontPricingRow } from "@/lib/marketplace/pricing-model";

/** The columns the fork path needs off a marketplace_listings row — mirrors
 *  deps.ts's DEPLOY_LISTING_COLUMNS (the pricing-MENU columns drive the
 *  free-vs-paid gate; the agent* columns drive the clone). */
export type AgentListingForFork = StorefrontPricingRow & {
  id: string;
  slug: string;
  name: string;
  kind: string;
  agentType: string | null;
  agentBlueprint: AgentBlueprint | null;
};

/** The subset of createAnonymousWorkspace's result the fork path needs. */
export type ForkWorkspaceResult = {
  orgId: string;
  slug: string;
  name: string;
  bearerToken: string;
  bearerTokenExpiresAt: Date | null;
  installedBlocks: string[];
};

export type ForkListingDeps = {
  /** Same signature as checkRateLimit(key, limit, windowMs) — DI'd so the
   *  in-memory/Upstash backend is never touched in tests. */
  checkRateLimit: (key: string, limit: number, windowMs: number) => Promise<boolean>;
  /** Resolve ONE published kind:'agent' listing by slug, or null when it
   *  doesn't exist / isn't published / isn't an agent listing. */
  resolvePublishedAgentListing: (slug: string) => Promise<AgentListingForFork | null>;
  /** Mint the brand-new anonymous workspace (the ONLY org-creation seam on
   *  this path — never accepts a caller-supplied orgId). */
  createAnonymousWorkspace: (args: { name: string }) => Promise<ForkWorkspaceResult>;
  /** Existing agent_templates slugs for the (freshly created) org — always
   *  empty for a brand-new org, but resolved the same way createAgentTemplate
   *  does so resolveUniqueTemplateSlug's contract stays identical everywhere. */
  listExistingTemplateSlugs: (orgId: string) => Promise<string[]>;
  /** Insert the cloned agent_templates row. Returns null/falsy on failure
   *  (mirrors the ChatGPT deps.ts `!created` branch) rather than throwing. */
  insertAgentTemplate: (values: {
    builderOrgId: string;
    name: string;
    type: AgentTemplateType;
    blueprint: AgentBlueprint;
    status: "draft";
    slug: string;
  }) => Promise<{ id: string } | null>;
  /** Build the token-scoped admin URL (mirrors buildStructuredWorkspaceUrls'
   *  admin_url derivation). */
  buildAdminUrl: (orgId: string, bearerToken: string) => string;
  /** Build the public subdomain URL for the new workspace. */
  buildPublicUrl: (slug: string) => string;
};

export type ForkListingResult =
  | { ok: true; adminUrl: string; publicUrl: string }
  | { ok: false; reason: string };

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const RATE_LIMIT_PER_HOUR = 3;
const RATE_LIMIT_PER_DAY = 10;

/**
 * Fork a published, FREE marketplace agent listing into a brand-new anonymous
 * workspace. Mirrors the ChatGPT app's deploy() gating exactly (same rate
 * limits, same paid-listing refusal), but creates the workspace itself rather
 * than requiring one to already exist.
 *
 * Order matters for the happy path: create the workspace FIRST, then clone
 * the blueprint into it — the reverse order would have no org to install into.
 */
export async function forkListingIntoNewWorkspace(
  args: { slug: string; ip: string },
  deps: ForkListingDeps,
): Promise<ForkListingResult> {
  const hourOk = await deps.checkRateLimit(`fork-listing:hour:${args.ip}`, RATE_LIMIT_PER_HOUR, HOUR_MS);
  if (!hourOk) {
    return {
      ok: false,
      reason: "Forking is limited to 3 per hour. Please try again later.",
    };
  }
  const dayOk = await deps.checkRateLimit(`fork-listing:day:${args.ip}`, RATE_LIMIT_PER_DAY, DAY_MS);
  if (!dayOk) {
    return {
      ok: false,
      reason: "Forking is limited to 10 per day. Please try again later.",
    };
  }

  const listing = await deps.resolvePublishedAgentListing(args.slug);
  if (!listing) {
    return {
      ok: false,
      reason: "That agent could not be found — it may have been unpublished.",
    };
  }

  // PAID (any pricing model) → refuse. Forking a paid listing for free would
  // bypass the purchase flow entirely. storefrontPriceFromRow reads the
  // SELECTED pricing model's column (not just the legacy `price` field), so a
  // monthly/per-usage/per-outcome listing is correctly classified as paid even
  // when `price` itself is 0 — same reasoning as deps.ts's deploy() gate.
  if (storefrontPriceFromRow(listing).isPaid) {
    return {
      ok: false,
      reason: `"${listing.name}" isn't free to fork — install it from the marketplace instead.`,
    };
  }
  if (!listing.agentBlueprint || !listing.agentType) {
    return {
      ok: false,
      reason: "That agent isn't ready to fork yet — please try again later.",
    };
  }

  const workspace = await deps.createAnonymousWorkspace({ name: `${listing.name} Workspace` });

  const existingSlugs = await deps.listExistingTemplateSlugs(workspace.orgId);
  const { resolveUniqueTemplateSlug } = await import("@/lib/agent-templates/store");
  const templateSlug = resolveUniqueTemplateSlug(listing.name, existingSlugs);

  const created = await deps.insertAgentTemplate({
    builderOrgId: workspace.orgId,
    name: listing.name,
    type: listing.agentType satisfies string as AgentTemplateType,
    // Defensive copy — editing the installed template must never reach back
    // into the listing row (mirrors buildInstalledAgentTemplate).
    blueprint: structuredClone(listing.agentBlueprint),
    status: "draft",
    slug: templateSlug,
  });

  if (!created) {
    return {
      ok: false,
      reason: "Could not set up your workspace — please try again.",
    };
  }

  return {
    ok: true,
    adminUrl: deps.buildAdminUrl(workspace.orgId, workspace.bearerToken),
    publicUrl: deps.buildPublicUrl(workspace.slug),
  };
}

// ─── real deps (lazy — never imported in unit tests) ─────────────────────────

const WORKSPACE_BASE_DOMAIN =
  process.env.WORKSPACE_BASE_DOMAIN?.trim() || "app.seldonframe.com";
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://app.seldonframe.com").replace(/\/$/, "");

/** Build the real deps, binding the exact same DB/rate-limit/workspace
 *  primitives the ChatGPT app's deps.ts uses. Not a "use server" file (a
 *  plain factory + async functions), so it can export a non-async const. */
export function buildRealForkListingDeps(): ForkListingDeps {
  return {
    checkRateLimit: async (key, limit, windowMs) => {
      const { checkRateLimit } = await import("@/lib/utils/rate-limit");
      return checkRateLimit(key, limit, windowMs);
    },
    resolvePublishedAgentListing: async (slug) => {
      const { db } = await import("@/db");
      const { marketplaceListings } = await import("@/db/schema/marketplace");
      const { and, eq } = await import("drizzle-orm");
      const [row] = await db
        .select({
          id: marketplaceListings.id,
          slug: marketplaceListings.slug,
          name: marketplaceListings.name,
          kind: marketplaceListings.kind,
          price: marketplaceListings.price,
          priceModel: marketplaceListings.priceModel,
          monthlyPriceCents: marketplaceListings.monthlyPriceCents,
          perCallPriceCents: marketplaceListings.perCallPriceCents,
          perOutcomePriceCents: marketplaceListings.perOutcomePriceCents,
          outcomeType: marketplaceListings.outcomeType,
          agentType: marketplaceListings.agentType,
          agentBlueprint: marketplaceListings.agentBlueprint,
        })
        .from(marketplaceListings)
        .where(
          and(
            eq(marketplaceListings.slug, slug),
            eq(marketplaceListings.isPublished, true),
            eq(marketplaceListings.kind, "agent"),
          ),
        )
        .limit(1);
      if (!row) return null;
      return row as AgentListingForFork;
    },
    createAnonymousWorkspace: async (args) => {
      const { createAnonymousWorkspace } = await import("@/lib/billing/anonymous-workspace");
      return createAnonymousWorkspace({ name: args.name, source: null });
    },
    listExistingTemplateSlugs: async (orgId) => {
      const { db } = await import("@/db");
      const { agentTemplates } = await import("@/db/schema/agent-templates");
      const { eq } = await import("drizzle-orm");
      const rows = await db
        .select({ slug: agentTemplates.slug })
        .from(agentTemplates)
        .where(eq(agentTemplates.builderOrgId, orgId));
      return rows.map((r) => r.slug);
    },
    insertAgentTemplate: async (values) => {
      const { db } = await import("@/db");
      const { agentTemplates } = await import("@/db/schema/agent-templates");
      const [created] = await db
        .insert(agentTemplates)
        .values(values)
        .returning({ id: agentTemplates.id });
      return created ?? null;
    },
    buildAdminUrl: (orgId, bearerToken) =>
      `${APP_URL}/admin/${encodeURIComponent(orgId)}?token=${encodeURIComponent(bearerToken)}`,
    buildPublicUrl: (slug) => `https://${slug}.${WORKSPACE_BASE_DOMAIN}`,
  };
}
