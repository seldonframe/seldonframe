// ChatGPT App MCP — the REAL dependency factory.
//
// Binds the DI'd handler (chatgpt-mcp-handler.ts) to the EXISTING SeldonFrame
// functions. This module is the ONLY place in the ChatGPT path that touches the
// DB / env / rate-limiter — the handler + wire layer stay pure and unit-tested.
//
// NOT a "use server" file (it exports a const factory + plain async functions),
// so it can export non-async values. The route imports buildRealDeps() and
// hands the result to handleChatGptRpc.
//
// MONEY-SAFETY + COMMERCE-FREE: deploy() NEVER charges. The ChatGPT app surface
// is deliberately commerce-free for OpenAI's physical-goods-only policy — browse
// returns ONLY free agents (price === 0), deploy installs only free agents, and
// a paid slug returns a friendly "add it from your dashboard" message with NO
// purchase link. No Stripe call, no checkout, no outbound purchase direction —
// so the app's "links/directs users out to make purchases" answer is NO.

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { marketplaceListings } from "@/db/schema/marketplace";
import { agentTemplates } from "@/db/schema/agent-templates";
import type { AgentBlueprint } from "@/db/schema/agents";
import {
  createAnonymousWorkspace,
  buildWorkspaceUrls,
  buildStructuredWorkspaceUrls,
} from "@/lib/billing/anonymous-workspace";
import {
  buildInstalledAgentTemplate,
  listMarketplaceAgentsFromDb,
  type AgentListingForBuyer,
  type MarketplaceAgentRow,
} from "@/lib/marketplace/agent-listings";
import { resolveUniqueTemplateSlug } from "@/lib/agent-templates/store";
import {
  STARTER_TEMPLATES,
  instantiateStarter,
  buildDefaultInstantiateDeps,
} from "@/lib/agent-templates/starter-pack";
import { runR1LandingStep } from "@/lib/landing/r1-landing-step";
import { validateRawWorkspaceToken } from "@/lib/auth/workspace-token";
import { checkRateLimit } from "@/lib/utils/rate-limit";
import type {
  ChatGptMcpDeps,
  BuildWorkspaceResult,
  DeployAgentResult,
} from "./chatgpt-mcp-handler";
import { assembleWorkspaceSource, type BuildWorkspaceArgs } from "./chatgpt-mcp-rpc";

const WORKSPACE_BASE_DOMAIN =
  process.env.WORKSPACE_BASE_DOMAIN?.trim() || "app.seldonframe.com";
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://app.seldonframe.com").replace(/\/$/, "");

// The curated FREE starter agents (the 6 SeldonFrame house starters) mapped to
// the marketplace row shape, so browse_marketplace ALWAYS returns real,
// deployable agents — even before any marketplace listing is published. They are
// always free; deploy_agent forks them via instantiateStarter.
const STARTER_ROWS: MarketplaceAgentRow[] = STARTER_TEMPLATES.map((s) => ({
  id: s.id,
  slug: s.id,
  name: s.name,
  description: s.summary,
  niche: s.category,
  tags: [],
  price: 0,
  agentType: s.type,
  installCount: 0,
  rating: 0,
  reviewCount: 0,
  isFeatured: false,
  previewImageUrl: null,
}));
const STARTER_IDS = new Set(STARTER_TEMPLATES.map((s) => s.id));

/** A friendly Error whose message surfaces to ChatGPT as a tool isError result
 *  (the handler catches throws → tool-level error, never a transport 500). */
class FriendlyToolError extends Error {}

/**
 * Build a workspace from the parsed build args. Applies the SAME IP rate-limit
 * the anonymous /api/v1/workspace/create route uses (3/hr, 10/day per IP). On
 * limit, throws a friendly Error → the handler turns it into a tool isError so
 * ChatGPT shows the message instead of failing the connection.
 */
async function buildWorkspace(ip: string, args: BuildWorkspaceArgs): Promise<BuildWorkspaceResult> {
  const hourOk = await checkRateLimit(`anon-workspace-create:hour:${ip}`, 3, 60 * 60 * 1000);
  const dayOk = await checkRateLimit(`anon-workspace-create:day:${ip}`, 10, 24 * 60 * 60 * 1000);
  if (!hourOk || !dayOk) {
    throw new FriendlyToolError(
      "Workspace creation is limited to 3 per hour and 10 per day. Please try again later, or sign up at app.seldonframe.com to create more.",
    );
  }

  // `source` folds description + location + phone + website into one string
  // that seeds the workspace Soul (no LLM call on this path).
  const source = assembleWorkspaceSource({
    description: args.description,
    website_url: args.website_url,
    city: args.city,
    state: args.state,
    phone: args.phone,
  });

  const result = await createAnonymousWorkspace({
    name: args.business_name,
    source: source || null,
    phone: args.phone ?? null,
    city: args.city ?? null,
    state: args.state ?? null,
    description: args.description ?? null,
  });

  // Upgrade the generic seed landing to the archetype-themed R-framework
  // landing — the SAME step /clients/new runs (run-create-from-url.ts) right
  // after createAnonymousWorkspace. Without it the public page is the basic
  // "Trusted Local Service" default instead of the vertical-specific design
  // (bold-urgency for HVAC/plumbing, clinical-trust for dental, …). Best-effort
  // and keyed on the platform Anthropic key (the same fallback the URL flow
  // uses); runR1LandingStep never throws, so on any failure the seed landing
  // simply remains and we fall back to the subdomain URL below.
  let r1Ok = false;
  const platformKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (platformKey) {
    const r1 = await runR1LandingStep({
      workspaceId: result.orgId,
      facts: {
        business_name: result.name,
        city: args.city ?? "",
        state: args.state ?? "",
        phone: args.phone ?? "",
        services: [],
        business_description: args.description ?? "",
      },
      byokKey: platformKey,
    });
    r1Ok = r1.ok;
  }

  const urls = buildWorkspaceUrls(result.slug, WORKSPACE_BASE_DOMAIN, result.orgId);
  // The single-click, token-scoped admin URL (no signup; 7-day token).
  const structured = buildStructuredWorkspaceUrls(result.slug, WORKSPACE_BASE_DOMAIN, result.orgId, {
    bearerToken: result.bearerToken,
  });

  // The R-framework landing renders at /w/<slug> — the SAME public URL
  // /clients/new surfaces (ready/page.tsx: `${APP_BASE}/w/${slug}`). Point the
  // operator there when it rendered; otherwise fall back to the subdomain home
  // (which still serves the seed landing, never a 404).
  const publicUrl = r1Ok ? `${APP_URL}/w/${result.slug}` : urls.home;

  return {
    url: publicUrl,
    claimUrl: structured.admin_url ?? undefined,
    workspaceToken: result.bearerToken,
  };
}

/** The columns the deploy path reads off a marketplace_listings row. `price`
 *  (cents) drives the free-vs-paid branch; the agent fields drive the clone. */
const DEPLOY_LISTING_COLUMNS = {
  id: marketplaceListings.id,
  slug: marketplaceListings.slug,
  name: marketplaceListings.name,
  kind: marketplaceListings.kind,
  price: marketplaceListings.price,
  agentType: marketplaceListings.agentType,
  agentBlueprint: marketplaceListings.agentBlueprint,
} as const;

/**
 * Deploy a marketplace agent into the workspace identified by the bearer token.
 *
 *   - Resolve the target org from the workspace_token (the bearer encodes the
 *     orgId). Invalid/expired → ok:false with a friendly message.
 *   - Resolve the PUBLISHED kind:'agent' listing by slug.
 *   - FREE (price === 0): clone the blueprint into the buyer org as a fresh
 *     DRAFT agent_templates row (the same clone the install action does), and
 *     return the workspace admin URL.
 *   - PAID (price > 0): return a claim URL to the public marketplace page.
 *     DO NOT CHARGE — no Stripe call on this path.
 */
async function deploy(input: { workspaceToken: string; slug: string }): Promise<DeployAgentResult> {
  const resolved = await validateRawWorkspaceToken(input.workspaceToken);
  if (!resolved) {
    return { ok: false, error: "That workspace link expired — build one first." };
  }
  const orgId = resolved.orgId;

  // Curated FREE starter agent? Fork it into the workspace via instantiateStarter
  // (no marketplace listing required — these are always available + always free).
  const starter = STARTER_TEMPLATES.find((s) => s.id === input.slug);
  if (starter) {
    const res = await instantiateStarter(
      { builderOrgId: orgId, starterId: starter.id },
      buildDefaultInstantiateDeps(),
    );
    if (!res.ok) {
      return { ok: false, error: "Could not add that agent — please try again." };
    }
    return {
      ok: true,
      name: starter.name,
      url: `${APP_URL}/admin/${encodeURIComponent(orgId)}?token=${encodeURIComponent(input.workspaceToken)}`,
    };
  }

  const [listing] = await db
    .select(DEPLOY_LISTING_COLUMNS)
    .from(marketplaceListings)
    .where(
      and(
        eq(marketplaceListings.slug, input.slug),
        eq(marketplaceListings.isPublished, true),
        eq(marketplaceListings.kind, "agent"),
      ),
    )
    .limit(1);

  if (!listing) {
    return { ok: false, error: `No published agent found with slug "${input.slug}". Try browse_marketplace first.` };
  }

  // PAID → NOT added from ChatGPT, and NO purchase link. The app stays
  // commerce-free (OpenAI physical-goods-only policy); premium agents are added
  // later from the SeldonFrame dashboard, never sold or linked-to in-chat.
  if ((listing.price ?? 0) > 0) {
    return {
      ok: false,
      error: `"${listing.name}" is a premium agent and can't be added from ChatGPT. Build or keep your free workspace, then add premium agents anytime from your SeldonFrame dashboard.`,
    };
  }

  // FREE → clone the listing's blueprint into the buyer org (fresh DRAFT row).
  const args = buildInstalledAgentTemplate(
    {
      id: listing.id,
      slug: listing.slug,
      name: listing.name,
      kind: listing.kind,
      agentType: listing.agentType,
      agentBlueprint: listing.agentBlueprint as AgentBlueprint | null,
    } satisfies AgentListingForBuyer,
    orgId,
  );

  const existing = await db
    .select({ slug: agentTemplates.slug })
    .from(agentTemplates)
    .where(eq(agentTemplates.builderOrgId, orgId));
  const slug = resolveUniqueTemplateSlug(args.name, existing.map((r) => r.slug));

  const [created] = await db
    .insert(agentTemplates)
    .values({ ...args, slug })
    .returning({ id: agentTemplates.id });

  if (!created) {
    return { ok: false, error: "Could not install the agent — please try again." };
  }

  // Token-scoped admin URL so the operator lands in their workspace to review
  // and publish the freshly-installed draft agent (no signup; 7-day token).
  return {
    ok: true,
    name: listing.name,
    url: `${APP_URL}/admin/${encodeURIComponent(orgId)}?token=${encodeURIComponent(input.workspaceToken)}`,
  };
}

/**
 * Build the real deps for one request. `ip` is read from the request headers so
 * the build_workspace rate-limit keys on the caller's IP (matching the
 * anonymous route).
 */
export function buildRealDeps(ip: string): ChatGptMcpDeps {
  return {
    buildWorkspace: (args) => buildWorkspace(ip, args),
    browse: async (filters) => {
      const q = filters.query?.trim().toLowerCase();
      const niche = filters.niche?.trim().toLowerCase();
      // Always-available curated FREE starter agents first (so the app is never
      // empty — even with zero published marketplace listings).
      const starters = STARTER_ROWS.filter((r) => {
        if (niche && r.niche.toLowerCase() !== niche) return false;
        if (q && !`${r.name} ${r.description ?? ""}`.toLowerCase().includes(q)) return false;
        return true;
      });
      // Plus any FREE published marketplace listings (paid excluded — the app is
      // commerce-free; any starter-id collision de-dupes to the starter).
      const listings = (
        await listMarketplaceAgentsFromDb({ q: filters.query, niche: filters.niche })
      ).filter((r) => (r.price ?? 0) === 0 && !STARTER_IDS.has(r.slug));
      return [...starters, ...listings];
    },
    deploy,
    now: () => new Date(),
  };
}
