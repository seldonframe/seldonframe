"use server";

// Agent marketplace — SELLER-side server actions (Phase 3, seller side).
//
// These power the Studio "List on the marketplace" panel + the earnings
// dashboard. They are thin org-guarded db wiring over the EXISTING marketplace
// engine: a Studio agent_templates blueprint becomes a kind:'agent'
// marketplace_listings row (reusing the soul purchase/install/Stripe/2% engine
// via the kind discriminator — no parallel commerce stack, no migration).
//
// Template ↔ listing link: marketplace_listings has no templateId column and we
// add no migration, so a listing is linked back to its source template by a
// RESERVED tag `tmpl:<templateId>`. That tag is invisible in the storefront
// (the card renders surfaces/price/builder, never raw tags; the storefront's
// tag parsers only match `surfaces:` / `builder:`), so it is a clean,
// migration-free foreign key. User-facing tags are kept separate.
//
// Stripe-Connect gate (mirrors the soul publish gate +
// /api/v1/marketplace/listings/[id]/publish): a PAID listing can only go live
// when the seller has an ACTIVE Stripe Connect account. We read it from the
// same `stripe_connections` row the proposals flow onboards, and stamp its
// account id onto the listing's `stripeConnectAccountId` so the buyer checkout
// path (installAgentListingAction) can create the destination charge.

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { marketplaceListings } from "@/db/schema/marketplace";
import { agentTemplates } from "@/db/schema/agent-templates";
import { stripeConnections } from "@/db/schema/payments";
import { getCurrentUser, getOrgId } from "@/lib/auth/helpers";
import { assertWritable } from "@/lib/demo/server";
import {
  TEMPLATE_LINK_TAG_PREFIX,
  buildListingTags,
  splitListingTags,
} from "@/lib/marketplace/listing-tags";
import {
  validateListingPricing,
  normalizePricingForPersist,
  resolveListingPublishState,
  isPriceModel,
  isOutcomeType,
  type PriceModel,
  type OutcomeType,
} from "@/lib/marketplace/pricing-model";
import { getLatestEvalRun, listEvalRunsForSubject } from "@/lib/agents/evals/eval-runs-store";
import { buildTrustStats } from "@/lib/marketplace/trust-stats";

// ─── types returned to the client ────────────────────────────────────────────

/** The seller's current listing for a template, shaped for the publish panel. */
export type SellerListingView = {
  id: string;
  slug: string;
  name: string;
  description: string;
  niche: string;
  /** User-facing tags only (the reserved tmpl:/surfaces:/builder: tags removed). */
  tags: string[];
  /** The one-time install price in cents (the `price` column; 0 = free). */
  priceCents: number;
  /** The seller's chosen pricing model (defaults to 'onetime' for legacy rows). */
  priceModel: PriceModel;
  monthlyPriceCents: number | null;
  perCallPriceCents: number | null;
  perOutcomePriceCents: number | null;
  outcomeType: OutcomeType | null;
  isPublished: boolean;
  installCount: number;
};

export type SellerConnectStatus = {
  /** true once Stripe Connect onboarding is complete (charges enabled). */
  ready: boolean;
  /** true if an account exists but onboarding is incomplete. */
  pending: boolean;
};

type PublishResult =
  | { ok: true; slug: string; isPublished: boolean }
  | { ok: false; error: "needs_connect"; slug: string }
  | { ok: false; error: "unauthorized" | "template_not_found" | "invalid" };

// ─── helpers ─────────────────────────────────────────────────────────────────

function sanitizePriceCents(input: unknown): number {
  const n = Number(input);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n);
}

/** Read the seller org's Stripe Connect status from stripe_connections. */
async function readConnectStatus(orgId: string): Promise<{
  status: SellerConnectStatus;
  accountId: string | null;
}> {
  const [row] = await db
    .select({ stripeAccountId: stripeConnections.stripeAccountId, isActive: stripeConnections.isActive })
    .from(stripeConnections)
    .where(eq(stripeConnections.orgId, orgId))
    .limit(1);

  if (!row) return { status: { ready: false, pending: false }, accountId: null };
  return {
    status: { ready: row.isActive === true, pending: row.isActive !== true },
    accountId: row.stripeAccountId ?? null,
  };
}

/** The seller's existing kind:'agent' listing for a template (via the tmpl: tag). */
async function findListingForTemplate(orgId: string, templateId: string) {
  const linkTag = `${TEMPLATE_LINK_TAG_PREFIX}${templateId}`;
  const [row] = await db
    .select()
    .from(marketplaceListings)
    .where(
      and(
        eq(marketplaceListings.creatorOrgId, orgId),
        eq(marketplaceListings.kind, "agent"),
        // jsonb array containment — the tags column holds the reserved link tag.
        sql`${marketplaceListings.tags} @> ${JSON.stringify([linkTag])}::jsonb`,
      ),
    )
    .limit(1);
  return row ?? null;
}

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 48);
}

/** Resolve a globally-unique listing slug (marketplace_listings.slug is UNIQUE),
 *  excluding the listing being updated so re-publishing keeps its slug. */
async function resolveUniqueListingSlug(base: string, excludeId?: string): Promise<string> {
  const root = slugify(base) || "agent";
  let candidate = root;
  for (let i = 0; i < 50; i += 1) {
    const [taken] = await db
      .select({ id: marketplaceListings.id })
      .from(marketplaceListings)
      .where(eq(marketplaceListings.slug, candidate))
      .limit(1);
    if (!taken || taken.id === excludeId) return candidate;
    candidate = `${root}-${Date.now().toString().slice(-4)}${i}`;
  }
  return `${root}-${Date.now().toString(36)}`;
}

function toView(row: typeof marketplaceListings.$inferSelect): SellerListingView {
  const { userTags } = splitListingTags(row.tags ?? []);
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? "",
    niche: row.niche,
    tags: userTags,
    priceCents: row.price ?? 0,
    // Defaults keep legacy rows (and pre-migration DBs) reading as a plain
    // one-time listing — backward compatible.
    priceModel: isPriceModel(row.priceModel) ? row.priceModel : "onetime",
    monthlyPriceCents: row.monthlyPriceCents ?? null,
    perCallPriceCents: row.perCallPriceCents ?? null,
    perOutcomePriceCents: row.perOutcomePriceCents ?? null,
    outcomeType: isOutcomeType(row.outcomeType) ? row.outcomeType : null,
    isPublished: row.isPublished === true,
    installCount: row.installCount ?? 0,
  };
}

/**
 * Copy-through the platform-verified eval badge onto a just-published/
 * refreshed kind:'agent' listing row (Task 13, improve-verb + trust-rail).
 *
 * Reads the template's latest eval_runs row (subjectKind:'template',
 * subjectId: templateId — the SAME subject key `persistTemplateEvalRun`
 * writes under) + its total run count, builds the pure ListingTrustStats
 * snapshot (buildTrustStats — null when the template has never been run),
 * and writes it onto the listing's `trust_stats` column.
 *
 * FAIL-SOFT: this must NEVER block a publish/republish. A DB hiccup here
 * only costs the seller their trust badge for now (a future publish retries
 * it) — it must not surface as a publish error. Mirrors
 * persist-template-run.ts's try/catch + structured `[module] event_name`
 * console.warn convention.
 */
async function copyThroughTrustStats(args: { orgId: string; templateId: string; listingId: string }): Promise<void> {
  const { orgId, templateId, listingId } = args;
  try {
    const [latest, runs] = await Promise.all([
      getLatestEvalRun({ orgId, subjectKind: "template", subjectId: templateId }),
      listEvalRunsForSubject({ orgId, subjectKind: "template", subjectId: templateId }),
    ]);
    const trustStats = buildTrustStats({ latest, runsCount: runs.length });

    await db
      .update(marketplaceListings)
      .set({ trustStats, updatedAt: new Date() })
      .where(and(eq(marketplaceListings.id, listingId), eq(marketplaceListings.creatorOrgId, orgId)));
  } catch (err) {
    console.warn("[seller-actions] copy_through_trust_stats_failed", {
      orgId,
      templateId,
      listingId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── actions ─────────────────────────────────────────────────────────────────

/**
 * Load the publish-panel context for a template: the seller's current listing
 * (if any) + their Stripe Connect status. Org-guarded on the template.
 */
export async function getSellerListingContextAction(input: { templateId: string }): Promise<
  | { ok: true; listing: SellerListingView | null; connect: SellerConnectStatus }
  | { ok: false; error: "unauthorized" | "template_not_found" }
> {
  const orgId = await getOrgId();
  const user = await getCurrentUser();
  if (!user?.id || !orgId) return { ok: false, error: "unauthorized" };

  const templateId = String(input.templateId ?? "").trim();
  if (!templateId) return { ok: false, error: "template_not_found" };

  const [template] = await db
    .select({ id: agentTemplates.id })
    .from(agentTemplates)
    .where(and(eq(agentTemplates.id, templateId), eq(agentTemplates.builderOrgId, orgId)))
    .limit(1);
  if (!template) return { ok: false, error: "template_not_found" };

  const [listing, { status }] = await Promise.all([
    findListingForTemplate(orgId, templateId),
    readConnectStatus(orgId),
  ]);

  return {
    ok: true,
    listing: listing ? toView(listing) : null,
    connect: status,
  };
}

/**
 * Publish a NEW listing for a template, or UPDATE the seller's existing one.
 * Always refreshes name/blueprint/type from the live template so the listing
 * reflects the current agent. Sets the marketing description + user tags + price.
 *
 * Free → goes live immediately (isPublished=true). Paid → only goes live when
 * the seller has an ACTIVE Stripe Connect account; otherwise it is saved as a
 * DRAFT (isPublished=false) and we return `needs_connect` so the UI can prompt
 * the connect flow. Either way the row is persisted, so the seller doesn't lose
 * their listing details while connecting.
 */
export async function publishOrUpdateAgentListingAction(input: {
  templateId: string;
  /** The one-time install price in cents (used by the `onetime` model). */
  priceCents: number;
  niche: string;
  description?: string;
  tags?: string[];
  // ── pricing MENU (BUILD #2) — optional, backward compatible ──
  // Omitting all of these keeps the legacy one-time behaviour (priceModel
  // defaults to 'onetime', which reads priceCents).
  priceModel?: PriceModel;
  monthlyPriceCents?: number;
  perCallPriceCents?: number;
  perOutcomePriceCents?: number;
  outcomeType?: OutcomeType;
}): Promise<PublishResult> {
  assertWritable();

  const orgId = await getOrgId();
  const user = await getCurrentUser();
  if (!user?.id || !orgId) return { ok: false, error: "unauthorized" };

  const templateId = String(input.templateId ?? "").trim();
  if (!templateId) return { ok: false, error: "invalid" };

  const [template] = await db
    .select()
    .from(agentTemplates)
    .where(and(eq(agentTemplates.id, templateId), eq(agentTemplates.builderOrgId, orgId)))
    .limit(1);
  if (!template) return { ok: false, error: "template_not_found" };

  // Resolve + validate the pricing model. Default 'onetime' keeps the legacy
  // path (priceCents) working byte-for-byte when callers omit priceModel.
  const priceModel: PriceModel = isPriceModel(input.priceModel) ? input.priceModel : "onetime";
  const pricingInput = {
    priceModel,
    priceCents: sanitizePriceCents(input.priceCents),
    monthlyPriceCents: input.monthlyPriceCents,
    perCallPriceCents: input.perCallPriceCents,
    perOutcomePriceCents: input.perOutcomePriceCents,
    outcomeType: isOutcomeType(input.outcomeType) ? input.outcomeType : null,
  };
  const validation = validateListingPricing(pricingInput);
  if (!validation.ok) return { ok: false, error: "invalid" };

  // Project onto the row columns, zeroing every non-selected model.
  const pricing = normalizePricingForPersist(pricingInput);

  const niche = String(input.niche ?? "other").trim() || "other";
  const description = String(input.description ?? "").trim() || template.name;
  const tags = buildListingTags({ templateId, userTags: input.tags ?? [] });

  // Connect gate: a listing that charges ANYTHING (any model with a positive
  // amount) needs an active Stripe Connect account to go live. Free (onetime,
  // price 0) needs no Connect. We stamp the account id onto the listing so the
  // buyer checkout path (installAgentListingAction) can build the destination
  // charge.
  const { status: connect, accountId } = await readConnectStatus(orgId);
  const isPaid =
    pricing.price > 0 ||
    (pricing.monthlyPriceCents ?? 0) > 0 ||
    (pricing.perCallPriceCents ?? 0) > 0 ||
    (pricing.perOutcomePriceCents ?? 0) > 0;
  const connectReady = connect.ready && Boolean(accountId);
  // Single source of truth for the publish gate (TDD'd in storefront-pricing
  // spec): free → live; paid + Stripe-ready → live with price; paid + no Stripe
  // → saved as draft + needs_connect.
  const { isPublished } = resolveListingPublishState({ isPaid, connectReady });

  const existing = await findListingForTemplate(orgId, templateId);

  let slug: string;
  let listingId: string;
  if (existing) {
    slug = existing.slug;
    listingId = existing.id;
    await db
      .update(marketplaceListings)
      .set({
        name: template.name,
        description,
        niche,
        tags,
        price: pricing.price,
        priceModel: pricing.priceModel,
        monthlyPriceCents: pricing.monthlyPriceCents,
        perCallPriceCents: pricing.perCallPriceCents,
        perOutcomePriceCents: pricing.perOutcomePriceCents,
        outcomeType: pricing.outcomeType,
        agentType: template.type,
        agentBlueprint: template.blueprint,
        stripeConnectAccountId: isPaid ? accountId : null,
        isPublished,
        updatedAt: new Date(),
      })
      .where(and(eq(marketplaceListings.id, existing.id), eq(marketplaceListings.creatorOrgId, orgId)));
  } else {
    slug = await resolveUniqueListingSlug(template.name);
    const [created] = await db
      .insert(marketplaceListings)
      .values({
        kind: "agent",
        creatorOrgId: orgId,
        slug,
        name: template.name,
        description,
        niche,
        tags,
        price: pricing.price,
        priceModel: pricing.priceModel,
        monthlyPriceCents: pricing.monthlyPriceCents,
        perCallPriceCents: pricing.perCallPriceCents,
        perOutcomePriceCents: pricing.perOutcomePriceCents,
        outcomeType: pricing.outcomeType,
        agentType: template.type,
        agentBlueprint: template.blueprint,
        soulPackage: {},
        stripeConnectAccountId: isPaid ? accountId : null,
        isPublished,
      })
      .returning({ id: marketplaceListings.id });
    listingId = created.id;
  }

  // Platform-verified eval badge copy-through (Task 13). Fail-soft by
  // construction (copyThroughTrustStats swallows its own errors) — a hiccup
  // here must never block the publish the seller is waiting on.
  await copyThroughTrustStats({ orgId, templateId, listingId });

  revalidatePath("/marketplace");
  revalidatePath(`/marketplace/${slug}`);
  revalidatePath("/studio/earnings");
  revalidatePath(`/studio/agents/${templateId}`);

  if (isPaid && !connectReady) {
    return { ok: false, error: "needs_connect", slug };
  }
  return { ok: true, slug, isPublished };
}

/** Unpublish (hide from storefront) the seller's listing for a template. */
export async function unpublishAgentListingAction(input: { templateId: string }): Promise<
  { ok: true } | { ok: false; error: "unauthorized" | "not_found" }
> {
  assertWritable();

  const orgId = await getOrgId();
  const user = await getCurrentUser();
  if (!user?.id || !orgId) return { ok: false, error: "unauthorized" };

  const templateId = String(input.templateId ?? "").trim();
  const existing = templateId ? await findListingForTemplate(orgId, templateId) : null;
  if (!existing) return { ok: false, error: "not_found" };

  await db
    .update(marketplaceListings)
    .set({ isPublished: false, updatedAt: new Date() })
    .where(and(eq(marketplaceListings.id, existing.id), eq(marketplaceListings.creatorOrgId, orgId)));

  revalidatePath("/marketplace");
  revalidatePath(`/marketplace/${existing.slug}`);
  revalidatePath("/studio/earnings");
  revalidatePath(`/studio/agents/${templateId}`);
  return { ok: true };
}

/**
 * Re-publish a previously-unpublished listing. Re-checks the Connect gate for
 * paid listings (the seller may still owe onboarding).
 */
export async function republishAgentListingAction(input: { templateId: string }): Promise<
  | { ok: true; slug: string }
  | { ok: false; error: "needs_connect"; slug: string }
  | { ok: false; error: "unauthorized" | "not_found" }
> {
  assertWritable();

  const orgId = await getOrgId();
  const user = await getCurrentUser();
  if (!user?.id || !orgId) return { ok: false, error: "unauthorized" };

  const templateId = String(input.templateId ?? "").trim();
  const existing = templateId ? await findListingForTemplate(orgId, templateId) : null;
  if (!existing) return { ok: false, error: "not_found" };

  // A listing that charges anything (any pricing model) needs Connect to relist.
  const isPaid =
    (existing.price ?? 0) > 0 ||
    (existing.monthlyPriceCents ?? 0) > 0 ||
    (existing.perCallPriceCents ?? 0) > 0 ||
    (existing.perOutcomePriceCents ?? 0) > 0;
  const { status: connect, accountId } = await readConnectStatus(orgId);
  const connectReady = connect.ready && Boolean(accountId);

  if (isPaid && !connectReady) {
    return { ok: false, error: "needs_connect", slug: existing.slug };
  }

  await db
    .update(marketplaceListings)
    .set({
      isPublished: true,
      stripeConnectAccountId: isPaid ? accountId : null,
      updatedAt: new Date(),
    })
    .where(and(eq(marketplaceListings.id, existing.id), eq(marketplaceListings.creatorOrgId, orgId)));

  // Refresh the platform-verified eval badge on republish too (Task 13) — the
  // template may have accrued new eval runs while the listing was
  // unpublished. Fail-soft; never blocks the republish.
  await copyThroughTrustStats({ orgId, templateId, listingId: existing.id });

  revalidatePath("/marketplace");
  revalidatePath(`/marketplace/${existing.slug}`);
  revalidatePath("/studio/earnings");
  revalidatePath(`/studio/agents/${templateId}`);
  return { ok: true, slug: existing.slug };
}
