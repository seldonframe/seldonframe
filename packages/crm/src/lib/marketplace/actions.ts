"use server";

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { blockPurchases, blockRatings, generatedBlocks, marketplaceBlocks, organizations } from "@/db/schema";
import { getCurrentUser, getOrgId } from "@/lib/auth/helpers";
import { canInstallBlocks, canRateBlocks, canSubmitBlocks, resolvePlanFromPlanId } from "@/lib/billing/entitlements";
import { assertWritable } from "@/lib/demo/server";
import { getStripeClient } from "@seldonframe/payments";

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
  revalidatePath(`/marketplace/${blockId}`);
  revalidatePath("/marketplace");
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

    revalidatePath("/marketplace");
    revalidatePath(`/marketplace/${blockId}`);

    return { installed: true };
  }

  if (!block.sellerStripeAccountId) {
    throw new Error("Seller payout account is not configured for this block.");
  }

  const stripe = getStripeClient();
  if (!stripe) {
    throw new Error("Stripe is not configured.");
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    success_url: `${baseUrl}/marketplace/${blockId}?purchased=true`,
    cancel_url: `${baseUrl}/marketplace/${blockId}`,
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
      application_fee_amount: 0,
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

  revalidatePath(`/marketplace/${blockId}`);
  revalidatePath("/marketplace");
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

  revalidatePath("/marketplace");
  revalidatePath(`/marketplace/review/${marketplace.blockId}`);

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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  await sendAdminReviewNotification({
    blockId,
    blockName: row.name,
    sellerName: user.name || user.email || "Seller",
    reviewUrl: `${appUrl}/admin/blocks/review`,
  });

  revalidatePath(`/marketplace/review/${blockId}`);
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

  revalidatePath(`/marketplace/review/${blockId}`);
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
  revalidatePath(`/marketplace/review/${blockId}`);
}
