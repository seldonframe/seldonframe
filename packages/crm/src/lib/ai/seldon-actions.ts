"use server";

import { desc, eq, sql as drizzleSql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { generatedBlocks, marketplaceBlocks, organizations, stripeConnections } from "@/db/schema";
import { getCurrentUser, getOrgId } from "@/lib/auth/helpers";
import { canSeldonIt, resolvePlanFromPlanId } from "@/lib/billing/entitlements";
import { assertWritable } from "@/lib/demo/server";
import { blockMdToCode, decideMigrationExecution, planBlockMds } from "@/lib/ai/generate-block";
import { getAIClient, recordSeldonUsage } from "@/lib/ai/client";
import { enableBlockForOrg } from "@/lib/marketplace/actions";
import type { OrganizationIntegrations } from "@/db/schema";

export type SeldonRunResult = {
  blockId: string;
  blockName: string;
  blockMd: string;
  summary: string;
  fromInventory: boolean;
  installMode: "instant" | "review";
  openPath: string;
  marketplaceSubmitPath: string;
};

export type SeldonRunState = {
  ok: boolean;
  error?: string;
  message?: string;
  results?: SeldonRunResult[];
};

export type SeldonHistoryItem = {
  blockId: string;
  blockName: string;
  createdAt: string;
  lastUpdatedAt: string;
  status: "Active" | "Review" | "Disabled";
  openPath: string;
  marketplaceSubmitPath: string;
};

function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40);
}

function extractNameFromBlockMd(blockMd: string, fallback: string) {
  const firstLine = blockMd.split("\n").find((line) => line.trim().toLowerCase().startsWith("# block:"));
  if (!firstLine) {
    return fallback;
  }

  const parsed = firstLine.replace(/^#\s*block\s*:\s*/i, "").trim();
  return parsed || fallback;
}

function readIntegrations(raw: unknown): OrganizationIntegrations {
  if (!raw || typeof raw !== "object") {
    return {};
  }

  return raw as OrganizationIntegrations;
}

export async function getSeldonPageData() {
  const user = await getCurrentUser();
  const orgId = await getOrgId();

  if (!user?.id || !orgId) {
    return null;
  }

  const plan = resolvePlanFromPlanId(user.planId ?? null);
  const allowed = canSeldonIt(plan);

  const [[org], [stripe]] = await Promise.all([
    db.select({ integrations: organizations.integrations, enabledBlocks: organizations.enabledBlocks }).from(organizations).where(eq(organizations.id, orgId)).limit(1),
    db.select({ id: stripeConnections.id }).from(stripeConnections).where(eq(stripeConnections.orgId, orgId)).limit(1),
  ]);

  const integrations = readIntegrations(org?.integrations);
  const enabledSet = new Set(org?.enabledBlocks ?? []);

  const historyRows = await db
    .select({
      blockId: generatedBlocks.blockId,
      name: marketplaceBlocks.name,
      createdAt: generatedBlocks.createdAt,
      updatedAt: generatedBlocks.updatedAt,
      generationStatus: marketplaceBlocks.generationStatus,
    })
    .from(generatedBlocks)
    .innerJoin(marketplaceBlocks, eq(marketplaceBlocks.blockId, generatedBlocks.blockId))
    .where(eq(generatedBlocks.sellerOrgId, orgId))
    .orderBy(desc(generatedBlocks.createdAt))
    .limit(12);

  const history: SeldonHistoryItem[] = historyRows.map((row) => ({
    blockId: row.blockId,
    blockName: row.name,
    createdAt: row.createdAt.toISOString(),
    lastUpdatedAt: row.updatedAt.toISOString(),
    status: enabledSet.has(row.blockId) ? "Active" : row.generationStatus === "published" ? "Disabled" : "Review",
    openPath: `/${row.blockId}`,
    marketplaceSubmitPath: `/marketplace/submit?from=${encodeURIComponent(row.blockId)}`,
  }));

  return {
    allowed,
    services: {
      stripe: Boolean(stripe),
      resend: Boolean(integrations.resend?.connected),
      twilio: Boolean(integrations.twilio?.connected),
      kit: Boolean(integrations.kit?.connected),
    },
    history,
  };
}

export async function disableSeldonBlockAction(formData: FormData) {
  assertWritable();

  const orgId = await getOrgId();
  if (!orgId) {
    throw new Error("Unauthorized");
  }

  const blockId = String(formData.get("blockId") ?? "").trim();
  if (!blockId) {
    throw new Error("Block ID is required");
  }

  const [org] = await db
    .select({ enabledBlocks: organizations.enabledBlocks })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) {
    throw new Error("Organization not found");
  }

  const nextEnabled = (org.enabledBlocks ?? []).filter((entry) => entry !== blockId);
  await db.update(organizations).set({ enabledBlocks: nextEnabled, updatedAt: new Date() }).where(eq(organizations.id, orgId));

  revalidatePath("/seldon");
  revalidatePath(`/marketplace/${blockId}`);
}

export async function runSeldonItAction(_prev: SeldonRunState, formData: FormData): Promise<SeldonRunState> {
  assertWritable();

  const user = await getCurrentUser();
  const orgId = await getOrgId();

  if (!user?.id || !orgId) {
    return { ok: false, error: "Unauthorized" };
  }

  const plan = resolvePlanFromPlanId(user.planId ?? null);
  if (!canSeldonIt(plan)) {
    return {
      ok: false,
      error: "Upgrade to Cloud Pro to Seldon custom blocks.",
    };
  }

  const description = String(formData.get("description") ?? "").trim();

  if (!description) {
    return { ok: false, error: "Describe what you want to build." };
  }

  try {
    const planned = await planBlockMds({ orgId, description });

    if (planned.length === 0) {
      return { ok: false, error: "Could not generate a block plan. Try adding more detail." };
    }

    const results: SeldonRunResult[] = [];

    for (const [idx, item] of planned.entries()) {
      const fallbackName = item.need.slice(0, 48) || `Custom Block ${idx + 1}`;

      if (item.result.fromInventory && item.result.matchedBlockId) {
        await enableBlockForOrg(orgId, item.result.matchedBlockId);

        const [existing] = await db
          .select({ name: marketplaceBlocks.name, blockMd: marketplaceBlocks.blockMd })
          .from(marketplaceBlocks)
          .where(eq(marketplaceBlocks.blockId, item.result.matchedBlockId))
          .limit(1);

        results.push({
          blockId: item.result.matchedBlockId,
          blockName: existing?.name || fallbackName,
          blockMd: item.result.blockMd,
          summary: item.result.summary,
          fromInventory: true,
          installMode: "instant",
          openPath: `/${item.result.matchedBlockId}`,
          marketplaceSubmitPath: `/marketplace/submit?from=${encodeURIComponent(item.result.matchedBlockId)}`,
        });
        continue;
      }

      const generatedId = `${slugify(item.need) || `custom-block-${idx + 1}`}-${Date.now().toString().slice(-4)}`;
      const blockName = extractNameFromBlockMd(item.result.blockMd, fallbackName);

      const generatedCode = await blockMdToCode({
        orgId,
        blockId: generatedId,
        blockMd: item.result.blockMd,
        blockName,
        blockDescription: item.need,
      });

      let decision = decideMigrationExecution(generatedCode.migrationSQL);

      if (decision.mode === "instant" && generatedCode.migrationSQL.trim()) {
        try {
          await db.execute(drizzleSql.raw(generatedCode.migrationSQL));
        } catch {
          decision = { mode: "queue_review", reason: "unsafe_sql" };
        }
      }

      const generationStatus = decision.mode === "instant" ? "published" : "approved";
      const generatedStatus = decision.mode === "instant" ? "merged" : "approved";

      await db
        .insert(marketplaceBlocks)
        .values({
          blockId: generatedId,
          name: blockName,
          description: item.need.slice(0, 160),
          longDescription: item.need,
          icon: "Puzzle",
          category: "generated",
          price: "0",
          currency: "usd",
          sellerId: user.id,
          sellerName: "Seldon It",
          blockMd: item.result.blockMd,
          generationStatus,
          publishedAt: decision.mode === "instant" ? new Date() : null,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: marketplaceBlocks.blockId,
          set: {
            name: blockName,
            description: item.need.slice(0, 160),
            longDescription: item.need,
            sellerId: user.id,
            sellerName: "Seldon It",
            blockMd: item.result.blockMd,
            generationStatus,
            publishedAt: decision.mode === "instant" ? new Date() : null,
            updatedAt: new Date(),
          },
        });

      await db
        .insert(generatedBlocks)
        .values({
          blockId: generatedId,
          sellerOrgId: orgId,
          files: generatedCode.files,
          status: generatedStatus,
          approvedAt: decision.mode === "queue_review" ? new Date() : null,
          mergedAt: decision.mode === "instant" ? new Date() : null,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: generatedBlocks.blockId,
          set: {
            sellerOrgId: orgId,
            files: generatedCode.files,
            status: generatedStatus,
            approvedAt: decision.mode === "queue_review" ? new Date() : null,
            mergedAt: decision.mode === "instant" ? new Date() : null,
            updatedAt: new Date(),
          },
        });

      if (decision.mode === "instant") {
        await enableBlockForOrg(orgId, generatedId);
      }

      results.push({
        blockId: generatedId,
        blockName,
        blockMd: item.result.blockMd,
        summary: item.result.summary,
        fromInventory: false,
        installMode: decision.mode === "instant" ? "instant" : "review",
        openPath: `/${generatedId}`,
        marketplaceSubmitPath: `/marketplace/submit?from=${encodeURIComponent(generatedId)}`,
      });
    }

    revalidatePath("/seldon");
    revalidatePath("/marketplace");

    try {
      const resolution = await getAIClient({ orgId, userId: user.id });

      for (const result of results) {
        await recordSeldonUsage({
          orgId,
          userId: user.id,
          blockId: result.blockId,
          mode: resolution.mode,
          model: "claude-sonnet",
        });
      }
    } catch {
      // Usage recording is non-critical; do not fail the run.
    }

    const hasReview = results.some((entry) => entry.installMode === "review");

    return {
      ok: true,
      message: hasReview
        ? "Your block is being reviewed and will be live within 24 hours."
        : "Your block is ready!",
      results,
    };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Unknown error";
    const normalized = message.toLowerCase();

    if (normalized.includes("anthropic") || normalized.includes("api key") || normalized.includes("authentication")) {
      return {
        ok: false,
        error: "Seldon It could not reach Anthropic. Verify ANTHROPIC_API_KEY and model access.",
      };
    }

    if (normalized.includes("model") || normalized.includes("not found")) {
      return {
        ok: false,
        error: "Seldon It model configuration failed. Check SELDON_MODEL (expected claude-sonnet-4-20250514).",
      };
    }

    if (normalized.includes("unauthorized")) {
      return { ok: false, error: "Unauthorized. Please sign in again." };
    }

    return { ok: false, error: `Seldon It failed: ${message}` };
  }
}
