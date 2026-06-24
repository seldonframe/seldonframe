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
  type AgentListingForBuyer,
} from "@/lib/marketplace/agent-listings";
import { listMarketplaceAgentsFromDb } from "@/lib/marketplace/agent-listings";
import { resolveUniqueTemplateSlug } from "@/lib/agent-templates/store";
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

  const urls = buildWorkspaceUrls(result.slug, WORKSPACE_BASE_DOMAIN, result.orgId);
  // The single-click, token-scoped admin URL (no signup; 7-day token).
  const structured = buildStructuredWorkspaceUrls(result.slug, WORKSPACE_BASE_DOMAIN, result.orgId, {
    bearerToken: result.bearerToken,
  });

  return {
    url: urls.home,
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
      const rows = await listMarketplaceAgentsFromDb({ q: filters.query, niche: filters.niche });
      // FREE agents only — the ChatGPT app surfaces no paid items + no purchase
      // direction (commerce-free for OpenAI's physical-goods-only policy).
      return rows.filter((r) => (r.price ?? 0) === 0);
    },
    deploy,
    now: () => new Date(),
  };
}
