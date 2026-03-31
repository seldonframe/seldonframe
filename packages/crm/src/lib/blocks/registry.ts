import { createMarketplaceManifest, mergeBlockManifests, type BlockManifest, BUILT_IN_BLOCKS } from "@seldonframe/core/blocks";
import { db } from "@/db";
import { marketplaceBlocks, organizations } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

function getDefaultEnabledBlockIds() {
  return BUILT_IN_BLOCKS.map((block) => block.id);
}

function extractEnabledBlockIds(input: { enabledBlocks: string[] | null; settings: unknown }) {
  if (Array.isArray(input.enabledBlocks) && input.enabledBlocks.length > 0) {
    return input.enabledBlocks;
  }

  const maybeEnabled = (input.settings as { enabledBlocks?: unknown } | null)?.enabledBlocks;

  if (!Array.isArray(maybeEnabled)) {
    return getDefaultEnabledBlockIds();
  }

  const normalized = maybeEnabled.filter((item): item is string => typeof item === "string" && item.length > 0);
  return normalized.length > 0 ? normalized : getDefaultEnabledBlockIds();
}

export async function getAllBlocksForOrg(orgId: string): Promise<BlockManifest[]> {
  const [org] = await db
    .select({ settings: organizations.settings, enabledBlocks: organizations.enabledBlocks })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) {
    return BUILT_IN_BLOCKS;
  }

  const enabledIds = extractEnabledBlockIds({
    enabledBlocks: org.enabledBlocks,
    settings: org.settings,
  });

  const marketplaceRows = enabledIds.length
    ? await db
        .select({
          blockId: marketplaceBlocks.blockId,
          name: marketplaceBlocks.name,
          description: marketplaceBlocks.description,
          icon: marketplaceBlocks.icon,
          sellerName: marketplaceBlocks.sellerName,
        })
        .from(marketplaceBlocks)
        .where(inArray(marketplaceBlocks.blockId, enabledIds))
    : [];

  const marketplaceManifests = marketplaceRows
    .filter((row) => row.blockId)
    .map((row) =>
      createMarketplaceManifest({
        id: row.blockId,
        name: row.name,
        description: row.description,
        icon: row.icon || "Puzzle",
        author: row.sellerName,
        route: `/${row.blockId}`,
        order: 80,
      })
    );

  return mergeBlockManifests({
    enabledBlockIds: enabledIds,
    marketplaceBlocks: marketplaceManifests,
  });
}
