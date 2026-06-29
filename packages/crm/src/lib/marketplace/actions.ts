"use server";

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { blockPurchases, blockRatings, generatedBlocks, marketplaceBlocks, marketplaceListings, marketplaceReviews, organizations } from "@/db/schema";
import { getCurrentUser, getOrgId } from "@/lib/auth/helpers";
import { canInstallBlocks, canRateBlocks, canSubmitBlocks, resolvePlanFromPlanId } from "@/lib/billing/entitlements";
import { computeMarketplaceFeeCents } from "@/lib/billing/gmv";
import { assertWritable } from "@/lib/demo/server";
import { installSoulPackage } from "@/lib/marketplace/install-soul";
import type { SoulPackage } from "@/lib/marketplace/soul-package";
import {
  buildInstalledAgentTemplate,
  mapTemplateToAgentListing,
  type AgentListingForBuyer,
} from "@/lib/marketplace/agent-listings";
import { agentTemplates } from "@/db/schema/agent-templates";
import { resolveUniqueTemplateSlug } from "@/lib/agent-templates/store";
import type { AgentBlueprint } from "@/db/schema/agents";
import { getStripeClient } from "@seldonframe/payments";
import { createOneTimeAgentCheckout } from "@/lib/marketplace/billing/one-time-checkout";
import { createMonthlyAgentSubscription } from "@/lib/marketplace/billing/monthly-subscription";
import { createMeteredAgentSubscription } from "@/lib/marketplace/billing/metered-subscription";
import { selectInstallCreator } from "@/lib/marketplace/billing/subscription-deps";
import {
  buildOneTimeCheckoutDeps,
  buildSubscriptionCheckoutDeps,
} from "@/lib/marketplace/billing/real-deps";

type GeneratedFile = { path: string; content: string };

export type GeneratedBlockCode = {
  files: GeneratedFile[];
  schemaAdditions: string;
  registryEntry: string;
  migrationSQL: string;
  cronConfig: string;
};

type BlockSubmission = {
  slug: string;
  name: string;
  description: string;
  longDescription: string | null;
  icon: string;
  category: string;
  price: string;
  sellerName: string;
  blockMd: string;
};

function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 48);
}

function readInstalledListingIds(settings: Record<string, unknown> | null | undefined) {
  const value = settings?.marketplaceInstalledListingIds;
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value.map((item) => String(item)).filter(Boolean);
}

async function hasOrgInstalledListing(orgId: string, listingId: string) {
  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const installedIds = readInstalledListingIds(org?.settings as Record<string, unknown> | null | undefined);
  return installedIds.includes(listingId);
}

async function markOrgInstalledListing(orgId: string, listingId: string) {
  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const currentSettings = (org?.settings ?? {}) as Record<string, unknown>;
  const installedIds = readInstalledListingIds(currentSettings);

  if (installedIds.includes(listingId)) {
    return;
  }

  await db
    .update(organizations)
    .set({
      settings: {
        ...currentSettings,
        marketplaceInstalledListingIds: [...installedIds, listingId],
      },
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));
}

async function hasOrgPurchasedBlock(orgId: string, blockId: string) {
  const [row] = await db
    .select({ id: blockPurchases.id })
    .from(blockPurchases)
    .where(and(eq(blockPurchases.orgId, orgId), eq(blockPurchases.blockId, blockId)))
    .limit(1);

  return Boolean(row);
}

export async function listMarketplaceBlocksAction(params?: {
  category?: string;
  query?: string;
  sort?: "popular" | "rated" | "newest" | "price";
}) {
  const orgId = await getOrgId();

  const rows = await db
    .select({
      id: marketplaceBlocks.id,
      blockId: marketplaceBlocks.blockId,
      name: marketplaceBlocks.name,
      description: marketplaceBlocks.description,
      icon: marketplaceBlocks.icon,
      category: marketplaceBlocks.category,
      sellerName: marketplaceBlocks.sellerName,
      price: marketplaceBlocks.price,
      currency: marketplaceBlocks.currency,
      installCount: marketplaceBlocks.installCount,
      ratingAverage: marketplaceBlocks.ratingAverage,
      ratingCount: marketplaceBlocks.ratingCount,
      publishedAt: marketplaceBlocks.publishedAt,
    })
    .from(marketplaceBlocks)
    .where(eq(marketplaceBlocks.generationStatus, "published"))
    .orderBy(desc(marketplaceBlocks.publishedAt));

  const enabledSet = new Set<string>();
  if (orgId) {
    const [org] = await db
      .select({ enabledBlocks: organizations.enabledBlocks })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    for (const id of org?.enabledBlocks ?? []) {
      enabledSet.add(id);
    }
  }

  let filtered = rows;

  if (params?.category && params.category !== "All") {
    filtered = filtered.filter((row) => row.category === params.category);
  }

  if (params?.query) {
    const q = params.query.toLowerCase();
    filtered = filtered.filter(
      (row) =>
        row.name.toLowerCase().includes(q) ||
        row.description.toLowerCase().includes(q) ||
        row.sellerName.toLowerCase().includes(q)
    );
  }

  if (params?.sort === "popular") {
    filtered = [...filtered].sort((a, b) => (b.installCount ?? 0) - (a.installCount ?? 0));
  } else if (params?.sort === "rated") {
    filtered = [...filtered].sort((a, b) => Number(b.ratingAverage ?? 0) - Number(a.ratingAverage ?? 0));
  } else if (params?.sort === "price") {
    filtered = [...filtered].sort((a, b) => Number(a.price ?? 0) - Number(b.price ?? 0));
  }

  return filtered.map((row) => ({
    ...row,
    installed: enabledSet.has(row.blockId),
  }));
}

export async function getMarketplaceBlockDetailsAction(blockId: string) {
  const orgId = await getOrgId();
  const user = await getCurrentUser();

  const [block] = await db
    .select()
    .from(marketplaceBlocks)
    .where(and(eq(marketplaceBlocks.blockId, blockId), eq(marketplaceBlocks.generationStatus, "published")))
    .limit(1);

  if (!block) {
    throw new Error("Marketplace block not found");
  }

  const installed = orgId ? (await db
    .select({ enabledBlocks: organizations.enabledBlocks })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1)).some((org) => (org.enabledBlocks ?? []).includes(block.blockId)) : false;

  const ratings = await db
    .select({
      id: blockRatings.id,
      rating: blockRatings.rating,
      review: blockRatings.review,
      createdAt: blockRatings.createdAt,
      orgId: blockRatings.orgId,
    })
    .from(blockRatings)
    .where(eq(blockRatings.blockId, block.blockId))
    .orderBy(desc(blockRatings.createdAt));

  const [purchase] = orgId
    ? await db
        .select({ purchasedAt: blockPurchases.purchasedAt })
        .from(blockPurchases)
        .where(and(eq(blockPurchases.blockId, block.blockId), eq(blockPurchases.orgId, orgId)))
        .orderBy(desc(blockPurchases.purchasedAt))
        .limit(1)
    : [null];

  const [myRating] = user?.id
    ? await db
        .select({ id: blockRatings.id, rating: blockRatings.rating, review: blockRatings.review })
        .from(blockRatings)
        .where(and(eq(blockRatings.blockId, block.blockId), eq(blockRatings.userId, user.id)))
        .limit(1)
    : [null];

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const canRateNow = Boolean(purchase?.purchasedAt && purchase.purchasedAt.getTime() <= sevenDaysAgo);

  return {
    block,
    installed,
    ratings,
    myRating: myRating ?? null,
    canRateNow,
  };
}

export async function finalizeBlockPurchaseFromWebhook(params: {
  orgId: string;
  userId?: string | null;
  blockId: string;
  stripePaymentId?: string | null;
}) {
  const [block] = await db
    .select({ blockId: marketplaceBlocks.blockId })
    .from(marketplaceBlocks)
    .where(and(eq(marketplaceBlocks.blockId, params.blockId), eq(marketplaceBlocks.generationStatus, "published")))
    .limit(1);

  if (!block) {
    return;
  }

  if (params.stripePaymentId) {
    const [existing] = await db
      .select({ id: blockPurchases.id })
      .from(blockPurchases)
      .where(
        and(
          eq(blockPurchases.orgId, params.orgId),
          eq(blockPurchases.blockId, params.blockId),
          eq(blockPurchases.stripePaymentId, params.stripePaymentId)
        )
      )
      .limit(1);

    if (existing) {
      await enableBlockForOrg(params.orgId, params.blockId);
      return;
    }
  }

  const [existingForOrg] = await db
    .select({ id: blockPurchases.id })
    .from(blockPurchases)
    .where(
      and(
        eq(blockPurchases.orgId, params.orgId),
        eq(blockPurchases.blockId, params.blockId),
        params.stripePaymentId ? eq(blockPurchases.stripePaymentId, params.stripePaymentId) : isNull(blockPurchases.stripePaymentId)
      )
    )
    .limit(1);

  if (!existingForOrg) {
    await db.insert(blockPurchases).values({
      orgId: params.orgId,
      userId: params.userId ?? null,
      blockId: params.blockId,
      stripePaymentId: params.stripePaymentId ?? null,
    });

    await db
      .update(marketplaceBlocks)
      .set({ installCount: sql`${marketplaceBlocks.installCount} + 1`, updatedAt: new Date() })
      .where(eq(marketplaceBlocks.blockId, params.blockId));
  }

  await enableBlockForOrg(params.orgId, params.blockId);
}

/** The columns both the soul and agent finalize/install paths read off a
 *  marketplace_listings row. `kind` discriminates which clone runs. */
const LISTING_INSTALL_COLUMNS = {
  id: marketplaceListings.id,
  slug: marketplaceListings.slug,
  name: marketplaceListings.name,
  kind: marketplaceListings.kind,
  soulPackage: marketplaceListings.soulPackage,
  agentType: marketplaceListings.agentType,
  agentBlueprint: marketplaceListings.agentBlueprint,
} as const;

type ListingInstallRow = {
  id: string;
  slug: string;
  name: string;
  kind: string;
  soulPackage: unknown;
  agentType: string | null;
  agentBlueprint: AgentBlueprint | null;
};

/**
 * Clone a kind:'agent' listing into the buyer's org as a fresh DRAFT
 * agent_templates row (the buyer runs it on their OWN BYOK — nothing here
 * touches keys). Reuses the pure mapper (buildInstalledAgentTemplate) + the
 * agent-templates slug primitive (resolveUniqueTemplateSlug), and inserts via
 * the same agentTemplates table createAgentTemplate uses. Returns the new
 * template id.
 */
async function cloneAgentListingIntoOrg(listing: ListingInstallRow, buyerOrgId: string): Promise<string> {
  const args = buildInstalledAgentTemplate(
    {
      id: listing.id,
      slug: listing.slug,
      name: listing.name,
      kind: listing.kind,
      agentType: listing.agentType,
      agentBlueprint: listing.agentBlueprint,
    } satisfies AgentListingForBuyer,
    buyerOrgId,
  );

  const existing = await db
    .select({ slug: agentTemplates.slug })
    .from(agentTemplates)
    .where(eq(agentTemplates.builderOrgId, buyerOrgId));
  const slug = resolveUniqueTemplateSlug(args.name, existing.map((r) => r.slug));

  const [created] = await db
    .insert(agentTemplates)
    .values({ ...args, slug })
    .returning({ id: agentTemplates.id });

  if (!created) {
    throw new Error("agent_templates insert returned no row");
  }
  return created.id;
}

export async function finalizeSoulPurchaseFromWebhook(params: {
  orgId: string;
  userId?: string | null;
  listingId?: string | null;
  listingSlug?: string | null;
  stripePaymentId?: string | null;
}) {
  if (!params.orgId) {
    return;
  }

  const listing = (params.listingId
    ? (
        await db
          .select(LISTING_INSTALL_COLUMNS)
          .from(marketplaceListings)
          .where(and(eq(marketplaceListings.id, params.listingId), eq(marketplaceListings.isPublished, true)))
          .limit(1)
      )[0]
    : params.listingSlug
      ? (
          await db
            .select(LISTING_INSTALL_COLUMNS)
            .from(marketplaceListings)
            .where(and(eq(marketplaceListings.slug, params.listingSlug), eq(marketplaceListings.isPublished, true)))
            .limit(1)
        )[0]
      : null) as ListingInstallRow | undefined;

  if (!listing) {
    return;
  }

  const alreadyInstalled = await hasOrgInstalledListing(params.orgId, listing.id);
  if (alreadyInstalled) {
    return;
  }

  // kind:'agent' → clone the blueprint into the buyer org. Same Stripe charge +
  // 2% application fee already fired at the checkout site (purchaseAgentListing
  // path), exactly like a paid soul. kind:'soul' (default) → the original soul
  // install, untouched.
  if (listing.kind === "agent") {
    await cloneAgentListingIntoOrg(listing, params.orgId);
  } else {
    await installSoulPackage(params.orgId, listing.soulPackage as SoulPackage);
  }
  await markOrgInstalledListing(params.orgId, listing.id);

  await db
    .update(marketplaceListings)
    .set({ installCount: sql`${marketplaceListings.installCount} + 1`, updatedAt: new Date() })
    .where(eq(marketplaceListings.id, listing.id));

  revalidatePath("/soul-marketplace");
  revalidatePath(`/soul-marketplace/${listing.slug}`);
  revalidatePath("/marketplace");
  revalidatePath(`/marketplace/${listing.slug}`);
}

// ─── agent listings — publish + install ──────────────────────────────────────
//
// A builder lists a Studio agent_templates blueprint as a kind:'agent'
// marketplace listing; a buyer installs it (clone into their org). Both reuse
// the EXISTING marketplaceListings table + the soul purchase/install/Stripe/2%
// engine via the kind discriminator — no parallel commerce stack.

export async function publishAgentTemplateAction(input: {
  templateId: string;
  priceCents: number;
  niche: string;
  tags?: string[];
}) {
  assertWritable();

  const user = await getCurrentUser();
  const orgId = await getOrgId();
  if (!user?.id || !orgId) {
    throw new Error("Unauthorized");
  }

  const templateId = String(input.templateId ?? "").trim();
  if (!templateId) {
    throw new Error("Template ID is required");
  }

  const niche = String(input.niche ?? "other").trim() || "other";
  const priceCents = Number.isFinite(input.priceCents) ? Math.max(0, Math.round(input.priceCents)) : 0;
  const tags = Array.isArray(input.tags) ? input.tags.map((t) => String(t).trim()).filter(Boolean) : [];

  // Load the template and confirm it belongs to this builder's org.
  const [template] = await db
    .select()
    .from(agentTemplates)
    .where(and(eq(agentTemplates.id, templateId), eq(agentTemplates.builderOrgId, orgId)))
    .limit(1);

  if (!template) {
    throw new Error("Agent template not found");
  }

  // Resolve a globally-unique listing slug (marketplace_listings.slug is UNIQUE).
  const baseSlug = slugify(template.name) || "agent";
  let slug = baseSlug;
  const [slugTaken] = await db
    .select({ id: marketplaceListings.id })
    .from(marketplaceListings)
    .where(eq(marketplaceListings.slug, slug))
    .limit(1);
  if (slugTaken) {
    slug = `${baseSlug}-${Date.now().toString().slice(-6)}`;
  }

  const values = mapTemplateToAgentListing(template, {
    creatorOrgId: orgId,
    slug,
    priceCents,
    niche,
    tags,
    description: template.name,
  });

  // Mirror soul publish: a FREE agent goes live immediately; a PAID agent stays
  // unpublished until the builder connects Stripe + publishes (the existing
  // /api/v1/marketplace/listings/[id]/publish gate: price>0 needs a connect
  // account). Buyers run the agent on their OWN BYOK regardless.
  const isPublished = priceCents <= 0;

  const [created] = await db
    .insert(marketplaceListings)
    .values({ ...values, isPublished })
    .returning({ slug: marketplaceListings.slug });

  if (!created) {
    throw new Error("Could not create agent listing");
  }

  revalidatePath("/marketplace");
  revalidatePath(`/marketplace/${created.slug}`);

  return { slug: created.slug };
}

/** Auth seam for the buy-box actions — DI'd so the unit tests run with no
 *  Next.js session (tsx's CJS interop makes module-mocking the @/ auth helpers
 *  unreliable; see set-booking-policy.spec.ts). Defaults to the real helpers. */
export type BuyBoxAuthDeps = {
  getCurrentUser: typeof getCurrentUser;
  getOrgId: typeof getOrgId;
};

export async function installAgentListingAction(
  input: { slug: string },
  _deps: BuyBoxAuthDeps = { getCurrentUser, getOrgId },
) {
  assertWritable();

  const user = await _deps.getCurrentUser();
  const orgId = await _deps.getOrgId();
  if (!user?.id || !orgId) {
    // Logged-out visitor (or on www., where the host-only session cookie isn't
    // sent). Return a structured signal instead of throwing — in production Next
    // masks a thrown Server Action error to a generic "An error occurred…
    // digest…" string, which the buy box would render as a scary error. The
    // client treats auth_required as "redirect to the app-origin sign-in".
    return { ok: false as const, reason: "auth_required" as const };
  }

  const slug = String(input.slug ?? "").trim();
  if (!slug) {
    throw new Error("Listing slug is required");
  }

  const [listing] = await db
    .select({
      id: marketplaceListings.id,
      slug: marketplaceListings.slug,
      name: marketplaceListings.name,
      description: marketplaceListings.description,
      kind: marketplaceListings.kind,
      price: marketplaceListings.price,
      priceModel: marketplaceListings.priceModel,
      monthlyPriceCents: marketplaceListings.monthlyPriceCents,
      perCallPriceCents: marketplaceListings.perCallPriceCents,
      perOutcomePriceCents: marketplaceListings.perOutcomePriceCents,
      outcomeType: marketplaceListings.outcomeType,
      creatorOrgId: marketplaceListings.creatorOrgId,
      stripeConnectAccountId: marketplaceListings.stripeConnectAccountId,
      agentType: marketplaceListings.agentType,
      agentBlueprint: marketplaceListings.agentBlueprint,
      soulPackage: marketplaceListings.soulPackage,
    })
    .from(marketplaceListings)
    .where(and(eq(marketplaceListings.slug, slug), eq(marketplaceListings.isPublished, true)))
    .limit(1);

  if (!listing || listing.kind !== "agent") {
    throw new Error("Agent listing not found");
  }

  // Idempotent: an org installs a given listing once.
  const alreadyInstalled = await hasOrgInstalledListing(orgId, listing.id);
  if (alreadyInstalled) {
    return { ok: true as const };
  }

  const price = Number(listing.price ?? 0);

  // #139 P2/P3 — RECURRING models (monthly / per_usage / per_outcome). These keep
  // `price` (the one-time column) at 0, so WITHOUT this branch they'd fall into
  // the free-clone shortcut below. Behind the SF_MARKETPLACE_BILLING flag (default
  // OFF) + a Connect-ready seller + a Stripe key, route to the subscription
  // Checkout. Any { skipped } (flag off / not connected / inert / not paid) falls
  // THROUGH to today's free-install path UNCHANGED — money-safe by construction.
  const installCreator = selectInstallCreator(listing.priceModel);
  if (installCreator === "monthly" || installCreator === "metered") {
    const recurringListing = {
      id: listing.id,
      slug: listing.slug,
      name: listing.name,
      description: listing.description,
      priceModel: listing.priceModel,
      price: price,
      monthlyPriceCents: listing.monthlyPriceCents,
      perCallPriceCents: listing.perCallPriceCents,
      perOutcomePriceCents: listing.perOutcomePriceCents,
      outcomeType: listing.outcomeType,
    };
    const subInput = { listing: recurringListing, buyerOrgId: orgId, sellerOrgId: listing.creatorOrgId };
    const subscribed =
      installCreator === "monthly"
        ? await createMonthlyAgentSubscription(subInput, buildSubscriptionCheckoutDeps())
        : await createMeteredAgentSubscription(subInput, buildSubscriptionCheckoutDeps());
    if (subscribed.ok) {
      return { ok: true as const, checkoutUrl: subscribed.url };
    }
    // else: fall through to the free-install path below (today's behavior).
  }

  // FREE → clone immediately into the buyer org.
  if (price <= 0) {
    const templateId = await cloneAgentListingIntoOrg(listing as ListingInstallRow, orgId);
    await markOrgInstalledListing(orgId, listing.id);

    await db
      .update(marketplaceListings)
      .set({ installCount: sql`${marketplaceListings.installCount} + 1`, updatedAt: new Date() })
      .where(eq(marketplaceListings.id, listing.id));

    revalidatePath("/marketplace");
    revalidatePath(`/marketplace/${listing.slug}`);

    return { ok: true as const, templateId };
  }

  // PAID (onetime) → reuse the soul Stripe-checkout path. metadata.type "soul_purchase"
  // routes the webhook to finalizeSoulPurchaseFromWebhook, which now branches on
  // kind:'agent' to clone the template. The 5% marketplace fee is computed off
  // the SAME computeMarketplaceFeeCents(price) as a paid soul, so the
  // platform fee carries identically to the agent paid path.
  if (!listing.stripeConnectAccountId) {
    throw new Error("Seller payout account is not configured for this agent.");
  }

  // #139 P1 — gated one-time Connect Checkout. Behind the SF_MARKETPLACE_BILLING
  // feature flag (default OFF) and ONLY for a `onetime` paid agent whose seller
  // is Connect-ready, this records a marketplace_purchases row + uses an
  // idempotency key. It is INERT without a Stripe key and returns { skipped } for
  // any other case — in which case we fall through to today's free-install /
  // legacy soul-checkout path UNCHANGED. Money-safe: test mode unless explicitly
  // live-gated; no real charge is reachable in dev.
  const billed = await createOneTimeAgentCheckout(
    {
      listing: {
        id: listing.id,
        slug: listing.slug,
        name: listing.name,
        description: listing.description,
        priceModel: listing.priceModel,
        price: Number(listing.price ?? 0),
        stripeConnectAccountId: listing.stripeConnectAccountId,
      },
      buyerOrgId: orgId,
      sellerOrgId: listing.creatorOrgId,
    },
    buildOneTimeCheckoutDeps(),
  );
  if (billed.ok) {
    return { ok: true as const, checkoutUrl: billed.url };
  }

  const stripe = getStripeClient();
  if (!stripe) {
    throw new Error("Stripe is not configured.");
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.seldonframe.com";
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    success_url: `${baseUrl}/marketplace/${listing.slug}?purchased=true`,
    cancel_url: `${baseUrl}/marketplace/${listing.slug}`,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(price),
          product_data: {
            name: `SeldonFrame Agent: ${listing.name}`,
            description: listing.description || undefined,
          },
        },
      },
    ],
    payment_intent_data: {
      // SeldonFrame marketplace takes a 5% fee on agent sales — the SAME
      // computeMarketplaceFeeCents off the same rounded cents value as a
      // paid soul (Stripe Connect destination charge). `price` is already cents.
      application_fee_amount: computeMarketplaceFeeCents(Math.round(price)),
      transfer_data: {
        destination: listing.stripeConnectAccountId,
      },
    },
    metadata: {
      // Reuse the soul finalize entry point; it is now kind-aware and clones
      // the agent when listing.kind === 'agent'.
      type: "soul_purchase",
      orgId,
      userId: user.id,
      listingId: listing.id,
      listingSlug: listing.slug,
    },
  });

  return { ok: true as const, checkoutUrl: session.url };
}

export async function finalizeMarketplacePurchaseReturnAction(formData: FormData) {
  assertWritable();

  const user = await getCurrentUser();
  const orgId = await getOrgId();

  if (!user?.id || !orgId) {
    throw new Error("Unauthorized");
  }

  const blockId = String(formData.get("blockId") ?? "").trim();

  if (!blockId) {
    throw new Error("Block ID is required");
  }

  await enableBlockForOrg(orgId, blockId);
  revalidatePath(`/templates/${blockId}`);
  revalidatePath("/templates");
}

export async function finalizeSoulListingPurchaseReturnAction(formData: FormData) {
  assertWritable();

  const user = await getCurrentUser();
  const orgId = await getOrgId();

  if (!user?.id || !orgId) {
    throw new Error("Unauthorized");
  }

  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) {
    throw new Error("Soul slug is required");
  }

  const [listing] = await db
    .select({
      id: marketplaceListings.id,
      slug: marketplaceListings.slug,
      soulPackage: marketplaceListings.soulPackage,
    })
    .from(marketplaceListings)
    .where(and(eq(marketplaceListings.slug, slug), eq(marketplaceListings.isPublished, true)))
    .limit(1);

  if (!listing) {
    throw new Error("Soul listing not found");
  }

  const alreadyInstalled = await hasOrgInstalledListing(orgId, listing.id);
  if (!alreadyInstalled) {
    await installSoulPackage(orgId, listing.soulPackage as SoulPackage);
    await markOrgInstalledListing(orgId, listing.id);

    await db
      .update(marketplaceListings)
      .set({ installCount: sql`${marketplaceListings.installCount} + 1`, updatedAt: new Date() })
      .where(eq(marketplaceListings.id, listing.id));
  }

  revalidatePath("/soul-marketplace");
  revalidatePath(`/soul-marketplace/${listing.slug}`);

  return { installed: true };
}

export async function purchaseSoulListingAction(formData: FormData) {
  assertWritable();

  const user = await getCurrentUser();
  const orgId = await getOrgId();

  if (!user?.id || !orgId) {
    throw new Error("Unauthorized");
  }

  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) {
    throw new Error("Soul slug is required");
  }

  const [listing] = await db
    .select({
      id: marketplaceListings.id,
      slug: marketplaceListings.slug,
      name: marketplaceListings.name,
      description: marketplaceListings.description,
      price: marketplaceListings.price,
      stripeConnectAccountId: marketplaceListings.stripeConnectAccountId,
      soulPackage: marketplaceListings.soulPackage,
    })
    .from(marketplaceListings)
    .where(and(eq(marketplaceListings.slug, slug), eq(marketplaceListings.isPublished, true)))
    .limit(1);

  if (!listing) {
    throw new Error("Soul listing not found");
  }

  const alreadyInstalled = await hasOrgInstalledListing(orgId, listing.id);
  if (alreadyInstalled) {
    return { installed: true };
  }

  const price = Number(listing.price ?? 0);
  if (price <= 0) {
    await installSoulPackage(orgId, listing.soulPackage as SoulPackage);
    await markOrgInstalledListing(orgId, listing.id);

    await db
      .update(marketplaceListings)
      .set({ installCount: sql`${marketplaceListings.installCount} + 1`, updatedAt: new Date() })
      .where(eq(marketplaceListings.id, listing.id));

    revalidatePath("/soul-marketplace");
    revalidatePath(`/soul-marketplace/${listing.slug}`);

    return { installed: true };
  }

  if (!listing.stripeConnectAccountId) {
    throw new Error("Seller payout account is not configured for this soul.");
  }

  const stripe = getStripeClient();
  if (!stripe) {
    throw new Error("Stripe is not configured.");
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.seldonframe.com";
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    success_url: `${baseUrl}/soul-marketplace/${listing.slug}/install?purchased=true`,
    cancel_url: `${baseUrl}/soul-marketplace/${listing.slug}`,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(price),
          product_data: {
            name: `SeldonFrame Soul: ${listing.name}`,
            description: listing.description || undefined,
          },
        },
      },
    ],
    payment_intent_data: {
      // SeldonFrame marketplace takes a 5% GMV fee on agent/soul sales
      // (Stripe Connect destination charge). `price` is already in cents,
      // matching the `unit_amount` above, so we fee off the same rounded
      // cents value. computeMarketplaceFeeCents = round(cents * 5/100).
      application_fee_amount: computeMarketplaceFeeCents(Math.round(price)),
      transfer_data: {
        destination: listing.stripeConnectAccountId,
      },
    },
    metadata: {
      type: "soul_purchase",
      orgId,
      userId: user.id,
      listingId: listing.id,
      listingSlug: listing.slug,
    },
  });

  return { checkoutUrl: session.url };
}

export async function submitSoulListingReviewAction(formData: FormData) {
  assertWritable();

  const user = await getCurrentUser();
  const orgId = await getOrgId();

  if (!user?.id || !orgId) {
    throw new Error("Unauthorized");
  }

  const slug = String(formData.get("slug") ?? "").trim();
  const rating = Number(formData.get("rating") ?? 0);
  const review = String(formData.get("review") ?? "").trim() || null;

  if (!slug || !Number.isFinite(rating) || rating < 1 || rating > 5) {
    throw new Error("Valid soul slug and rating are required");
  }

  const [listing] = await db
    .select({ id: marketplaceListings.id, slug: marketplaceListings.slug })
    .from(marketplaceListings)
    .where(and(eq(marketplaceListings.slug, slug), eq(marketplaceListings.isPublished, true)))
    .limit(1);

  if (!listing) {
    throw new Error("Soul listing not found");
  }

  const installed = await hasOrgInstalledListing(orgId, listing.id);
  if (!installed) {
    throw new Error("Install this soul before leaving a review.");
  }

  const [existing] = await db
    .select({ id: marketplaceReviews.id })
    .from(marketplaceReviews)
    .where(and(eq(marketplaceReviews.listingId, listing.id), eq(marketplaceReviews.buyerOrgId, orgId)))
    .limit(1);

  if (existing) {
    await db
      .update(marketplaceReviews)
      .set({ rating, review })
      .where(eq(marketplaceReviews.id, existing.id));
  } else {
    await db.insert(marketplaceReviews).values({
      listingId: listing.id,
      buyerOrgId: orgId,
      rating,
      review,
    });
  }

  const rows = await db.select({ rating: marketplaceReviews.rating }).from(marketplaceReviews).where(eq(marketplaceReviews.listingId, listing.id));
  const total = rows.reduce((sum, row) => sum + row.rating, 0);
  const average = rows.length > 0 ? total / rows.length : 0;

  await db
    .update(marketplaceListings)
    .set({
      rating: average,
      reviewCount: rows.length,
      updatedAt: new Date(),
    })
    .where(eq(marketplaceListings.id, listing.id));

  revalidatePath("/soul-marketplace");
  revalidatePath(`/soul-marketplace/${listing.slug}`);
}

export async function purchaseMarketplaceBlockAction(formData: FormData) {
  assertWritable();

  const user = await getCurrentUser();
  const orgId = await getOrgId();

  if (!user?.id || !orgId) {
    throw new Error("Unauthorized");
  }

  const plan = resolvePlanFromPlanId(user.planId ?? null);
  if (!canInstallBlocks(plan)) {
    throw new Error("Your current plan cannot install marketplace blocks.");
  }

  const blockId = String(formData.get("blockId") ?? "").trim();
  if (!blockId) {
    throw new Error("Block ID is required");
  }

  const [block] = await db
    .select()
    .from(marketplaceBlocks)
    .where(and(eq(marketplaceBlocks.blockId, blockId), eq(marketplaceBlocks.generationStatus, "published")))
    .limit(1);

  if (!block) {
    throw new Error("Block not found");
  }

  const alreadyPurchased = await hasOrgPurchasedBlock(orgId, blockId);

  if (alreadyPurchased) {
    await enableBlockForOrg(orgId, blockId);
    return { installed: true };
  }

  const price = Number(block.price ?? 0);

  if (price <= 0) {
    await db.insert(blockPurchases).values({
      orgId,
      userId: user.id,
      blockId,
      stripePaymentId: null,
    });

    await enableBlockForOrg(orgId, blockId);
    await db
      .update(marketplaceBlocks)
      .set({ installCount: sql`${marketplaceBlocks.installCount} + 1`, updatedAt: new Date() })
      .where(eq(marketplaceBlocks.blockId, blockId));

    revalidatePath("/templates");
    revalidatePath(`/templates/${blockId}`);

    return { installed: true };
  }

  if (!block.sellerStripeAccountId) {
    throw new Error("Seller payout account is not configured for this block.");
  }

  const stripe = getStripeClient();
  if (!stripe) {
    throw new Error("Stripe is not configured.");
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.seldonframe.com";
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    success_url: `${baseUrl}/templates/${blockId}?purchased=true`,
    cancel_url: `${baseUrl}/templates/${blockId}`,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: (block.currency || "usd").toLowerCase(),
          unit_amount: Math.round(price * 100),
          product_data: {
            name: `SeldonFrame Block: ${block.name}`,
            description: block.description,
          },
        },
      },
    ],
    payment_intent_data: {
      // SeldonFrame marketplace takes a 5% GMV fee on block sales
      // (Stripe Connect destination charge). `price` here is in DOLLARS
      // (multiplied by 100 for `unit_amount` above), so convert to the
      // same cents amount first, then fee off it.
      // computeMarketplaceFeeCents = round(cents * 5/100).
      application_fee_amount: computeMarketplaceFeeCents(Math.round(price * 100)),
      transfer_data: {
        destination: block.sellerStripeAccountId,
      },
    },
    metadata: {
      type: "block_purchase",
      orgId,
      userId: user.id,
      blockId,
    },
  });

  return { checkoutUrl: session.url };
}

export async function submitBlockRatingAction(formData: FormData) {
  assertWritable();

  const user = await getCurrentUser();
  const orgId = await getOrgId();

  if (!user?.id || !orgId) {
    throw new Error("Unauthorized");
  }

  const plan = resolvePlanFromPlanId(user.planId ?? null);
  if (!canRateBlocks(plan)) {
    throw new Error("Your current plan cannot submit ratings.");
  }

  const blockId = String(formData.get("blockId") ?? "").trim();
  const rating = Number(formData.get("rating") ?? 0);
  const review = String(formData.get("review") ?? "").trim() || null;

  if (!blockId || !Number.isFinite(rating) || rating < 1 || rating > 5) {
    throw new Error("Valid block ID and rating are required");
  }

  const [purchase] = await db
    .select({ purchasedAt: blockPurchases.purchasedAt })
    .from(blockPurchases)
    .where(and(eq(blockPurchases.blockId, blockId), eq(blockPurchases.orgId, orgId)))
    .orderBy(desc(blockPurchases.purchasedAt))
    .limit(1);

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const canRateNow = Boolean(purchase?.purchasedAt && purchase.purchasedAt.getTime() <= sevenDaysAgo);

  if (!canRateNow) {
    throw new Error("Ratings are available after 7 days of block usage.");
  }

  const [existing] = await db
    .select({ id: blockRatings.id })
    .from(blockRatings)
    .where(and(eq(blockRatings.blockId, blockId), eq(blockRatings.userId, user.id)))
    .limit(1);

  if (existing) {
    await db.update(blockRatings).set({ rating, review }).where(eq(blockRatings.id, existing.id));
  } else {
    await db.insert(blockRatings).values({
      blockId,
      userId: user.id,
      orgId,
      rating,
      review,
    });
  }

  const rows = await db.select({ rating: blockRatings.rating }).from(blockRatings).where(eq(blockRatings.blockId, blockId));
  const total = rows.reduce((sum, row) => sum + row.rating, 0);
  const average = rows.length > 0 ? total / rows.length : 0;

  await db
    .update(marketplaceBlocks)
    .set({
      ratingAverage: average.toFixed(1),
      ratingCount: rows.length,
      updatedAt: new Date(),
    })
    .where(eq(marketplaceBlocks.blockId, blockId));

  revalidatePath(`/templates/${blockId}`);
  revalidatePath("/templates");
}

function parseSubmission(formData: FormData, fallbackSellerName: string): BlockSubmission {
  const name = String(formData.get("name") ?? "").trim();
  const slugInput = String(formData.get("slug") ?? "").trim();
  const slug = slugify(slugInput || name);
  const description = String(formData.get("description") ?? "").trim();
  const longDescription = String(formData.get("longDescription") ?? "").trim() || null;
  const icon = String(formData.get("icon") ?? "Puzzle").trim() || "Puzzle";
  const category = String(formData.get("category") ?? "Operations").trim() || "Operations";
  const price = String(formData.get("price") ?? "0").trim() || "0";
  const sellerName = String(formData.get("sellerName") ?? "").trim() || fallbackSellerName;
  const blockMd = String(formData.get("blockMd") ?? "").trim();

  if (!name || !slug || !description || !blockMd) {
    throw new Error("Name, slug, description, and BLOCK.md content are required.");
  }

  return {
    slug,
    name,
    description,
    longDescription,
    icon,
    category,
    price,
    sellerName,
    blockMd,
  };
}

function buildGeneratedFilesFromBlockMd(input: BlockSubmission): GeneratedFile[] {
  return [
    {
      path: `generated/marketplace/${input.slug}/BLOCK.md`,
      content: input.blockMd,
    },
    {
      path: `generated/marketplace/${input.slug}/README.md`,
      content: `# ${input.name}\n\n${input.description}\n`,
    },
  ];
}

export async function generateMarketplaceBlockCodeFromBlockMd(input: {
  blockId: string;
  blockMd: string;
  blockName?: string;
  blockDescription?: string;
}) {
  const normalizedBlockId = slugify(input.blockId || input.blockName || "custom-block") || "custom-block";
  const displayName = (input.blockName || normalizedBlockId).trim();
  const shortDescription = (input.blockDescription || `Generated block for ${displayName}`).trim();

  const files = buildGeneratedFilesFromBlockMd({
    slug: normalizedBlockId,
    name: displayName,
    description: shortDescription,
    longDescription: null,
    icon: "Puzzle",
    category: "generated",
    price: "0",
    sellerName: "Auto-generated",
    blockMd: input.blockMd,
  });

  return {
    files,
    schemaAdditions: `// Add Drizzle schema for ${normalizedBlockId}`,
    registryEntry: `// Add BlockManifest entry for ${normalizedBlockId}`,
    migrationSQL: `-- migration for ${normalizedBlockId}\n-- add CREATE TABLE statements here`,
    cronConfig: "",
  } satisfies GeneratedBlockCode;
}

async function sendAdminReviewNotification(params: {
  blockId: string;
  blockName: string;
  sellerName: string;
  reviewUrl: string;
}) {
  const adminEmail = process.env.PRO_ADMIN_EMAIL;
  const resendApiKey = process.env.RESEND_API_KEY;

  if (!adminEmail || !resendApiKey) {
    return;
  }

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.DEFAULT_FROM_EMAIL || "marketplace@seldonframe.local",
      to: [adminEmail],
      subject: `Marketplace block ready for admin review: ${params.blockName}`,
      html: `<p>${params.sellerName} approved <strong>${params.blockName}</strong> for publishing.</p><p>Review queue: <a href="${params.reviewUrl}">${params.reviewUrl}</a></p>`,
      text: `${params.sellerName} approved ${params.blockName}. Review queue: ${params.reviewUrl}`,
    }),
  });
}

export async function enableBlockForOrg(orgId: string, blockId: string) {
  const [org] = await db
    .select({ id: organizations.id, enabledBlocks: organizations.enabledBlocks })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) {
    return;
  }

  const current = Array.isArray(org.enabledBlocks) ? org.enabledBlocks : [];
  if (current.includes(blockId)) {
    return;
  }

  await db
    .update(organizations)
    .set({ enabledBlocks: [...current, blockId], updatedAt: new Date() })
    .where(eq(organizations.id, org.id));
}

export async function generateBlockForReviewAction(formData: FormData) {
  assertWritable();

  const user = await getCurrentUser();
  const orgId = await getOrgId();

  if (!user?.id || !orgId) {
    throw new Error("Unauthorized");
  }

  const plan = resolvePlanFromPlanId(user.planId ?? null);
  if (!canSubmitBlocks(plan)) {
    throw new Error("Your plan cannot submit marketplace blocks.");
  }

  const submission = parseSubmission(formData, user.name || user.email || "Seller");

  const [marketplace] = await db
    .insert(marketplaceBlocks)
    .values({
      blockId: submission.slug,
      name: submission.name,
      description: submission.description,
      longDescription: submission.longDescription,
      icon: submission.icon,
      category: submission.category,
      price: submission.price,
      currency: "usd",
      sellerId: user.id,
      sellerName: submission.sellerName,
      blockMd: submission.blockMd,
      generationStatus: "generating",
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: marketplaceBlocks.blockId,
      set: {
        name: submission.name,
        description: submission.description,
        longDescription: submission.longDescription,
        icon: submission.icon,
        category: submission.category,
        price: submission.price,
        sellerId: user.id,
        sellerName: submission.sellerName,
        blockMd: submission.blockMd,
        generationStatus: "generating",
        updatedAt: new Date(),
      },
    })
    .returning({ blockId: marketplaceBlocks.blockId, name: marketplaceBlocks.name });

  if (!marketplace) {
    throw new Error("Could not create marketplace submission");
  }

  const generated = await generateMarketplaceBlockCodeFromBlockMd({
    blockId: submission.slug,
    blockMd: submission.blockMd,
    blockName: submission.name,
    blockDescription: submission.description,
  });

  const generatedFiles = generated.files;

  await db
    .insert(generatedBlocks)
    .values({
      blockId: marketplace.blockId,
      sellerOrgId: orgId,
      files: generatedFiles,
      status: "review",
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: generatedBlocks.blockId,
      set: {
        sellerOrgId: orgId,
        files: generatedFiles,
        status: "review",
        reviewNotes: null,
        approvedAt: null,
        mergedAt: null,
        updatedAt: new Date(),
      },
    });

  await enableBlockForOrg(orgId, marketplace.blockId);

  await db
    .update(marketplaceBlocks)
    .set({ generationStatus: "review", updatedAt: new Date() })
    .where(eq(marketplaceBlocks.blockId, marketplace.blockId));

  revalidatePath("/templates");
  revalidatePath(`/templates/review/${marketplace.blockId}`);

  return { blockId: marketplace.blockId };
}

export async function listSellerBlocksForReview() {
  const user = await getCurrentUser();
  if (!user?.id) {
    return [];
  }

  return db
    .select({
      blockId: marketplaceBlocks.blockId,
      name: marketplaceBlocks.name,
      status: marketplaceBlocks.generationStatus,
      updatedAt: marketplaceBlocks.updatedAt,
    })
    .from(marketplaceBlocks)
    .where(eq(marketplaceBlocks.sellerId, user.id));
}

export async function getSellerReviewBlock(blockId: string) {
  const user = await getCurrentUser();
  if (!user?.id) {
    throw new Error("Unauthorized");
  }

  const [row] = await db
    .select({
      id: marketplaceBlocks.id,
      blockId: marketplaceBlocks.blockId,
      name: marketplaceBlocks.name,
      description: marketplaceBlocks.description,
      generationStatus: marketplaceBlocks.generationStatus,
      sellerId: marketplaceBlocks.sellerId,
      files: generatedBlocks.files,
      generatedStatus: generatedBlocks.status,
      reviewNotes: generatedBlocks.reviewNotes,
    })
    .from(marketplaceBlocks)
    .leftJoin(generatedBlocks, eq(generatedBlocks.blockId, marketplaceBlocks.blockId))
    .where(eq(marketplaceBlocks.blockId, blockId))
    .limit(1);

  if (!row || row.sellerId !== user.id) {
    throw new Error("Not found");
  }

  return row;
}

export async function approveGeneratedBlockAction(formData: FormData) {
  assertWritable();

  const user = await getCurrentUser();
  const orgId = await getOrgId();
  if (!user?.id || !orgId) {
    throw new Error("Unauthorized");
  }

  const blockId = String(formData.get("blockId") ?? "").trim();
  if (!blockId) {
    throw new Error("Block ID is required");
  }

  const [row] = await db
    .select({ sellerId: marketplaceBlocks.sellerId, name: marketplaceBlocks.name })
    .from(marketplaceBlocks)
    .where(eq(marketplaceBlocks.blockId, blockId))
    .limit(1);

  if (!row || row.sellerId !== user.id) {
    throw new Error("Not found");
  }

  await db
    .update(generatedBlocks)
    .set({ status: "approved", approvedAt: new Date(), updatedAt: new Date() })
    .where(eq(generatedBlocks.blockId, blockId));

  await db
    .update(marketplaceBlocks)
    .set({ generationStatus: "approved", updatedAt: new Date() })
    .where(eq(marketplaceBlocks.blockId, blockId));

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.seldonframe.com";
  await sendAdminReviewNotification({
    blockId,
    blockName: row.name,
    sellerName: user.name || user.email || "Seller",
    reviewUrl: `${appUrl}/admin/blocks/review`,
  });

  revalidatePath(`/templates/review/${blockId}`);
  revalidatePath("/admin/blocks/review");
}

export async function rejectGeneratedBlockAction(formData: FormData) {
  assertWritable();

  const user = await getCurrentUser();
  if (!user?.id) {
    throw new Error("Unauthorized");
  }

  const blockId = String(formData.get("blockId") ?? "").trim();
  const reviewNotes = String(formData.get("reviewNotes") ?? "").trim() || null;

  if (!blockId) {
    throw new Error("Block ID is required");
  }

  const [row] = await db
    .select({ sellerId: marketplaceBlocks.sellerId })
    .from(marketplaceBlocks)
    .where(eq(marketplaceBlocks.blockId, blockId))
    .limit(1);

  if (!row || row.sellerId !== user.id) {
    throw new Error("Not found");
  }

  await db
    .update(generatedBlocks)
    .set({ status: "rejected", reviewNotes, updatedAt: new Date() })
    .where(eq(generatedBlocks.blockId, blockId));

  await db
    .update(marketplaceBlocks)
    .set({ generationStatus: "rejected", updatedAt: new Date() })
    .where(eq(marketplaceBlocks.blockId, blockId));

  revalidatePath(`/templates/review/${blockId}`);
}

function isAdminUser(userEmail: string | null | undefined) {
  const adminEmail = process.env.PRO_ADMIN_EMAIL;
  if (!adminEmail) {
    return false;
  }

  return (userEmail || "").toLowerCase() === adminEmail.toLowerCase();
}

export async function listAdminReviewQueue() {
  const user = await getCurrentUser();
  if (!isAdminUser(user?.email)) {
    throw new Error("Forbidden");
  }

  return db
    .select({
      blockId: marketplaceBlocks.blockId,
      name: marketplaceBlocks.name,
      sellerName: marketplaceBlocks.sellerName,
      generationStatus: marketplaceBlocks.generationStatus,
      files: generatedBlocks.files,
      generatedStatus: generatedBlocks.status,
      approvedAt: generatedBlocks.approvedAt,
      updatedAt: marketplaceBlocks.updatedAt,
    })
    .from(marketplaceBlocks)
    .leftJoin(generatedBlocks, eq(generatedBlocks.blockId, marketplaceBlocks.blockId))
    .where(and(eq(marketplaceBlocks.generationStatus, "approved"), eq(generatedBlocks.status, "approved")));
}

export async function mergeGeneratedBlockAction(formData: FormData) {
  assertWritable();

  const user = await getCurrentUser();
  if (!isAdminUser(user?.email)) {
    throw new Error("Forbidden");
  }

  const blockId = String(formData.get("blockId") ?? "").trim();
  if (!blockId) {
    throw new Error("Block ID is required");
  }

  await db
    .update(generatedBlocks)
    .set({ status: "merged", mergedAt: new Date(), updatedAt: new Date() })
    .where(eq(generatedBlocks.blockId, blockId));

  await db
    .update(marketplaceBlocks)
    .set({ generationStatus: "published", publishedAt: new Date(), updatedAt: new Date() })
    .where(eq(marketplaceBlocks.blockId, blockId));

  revalidatePath("/admin/blocks/review");
  revalidatePath(`/templates/review/${blockId}`);
}
