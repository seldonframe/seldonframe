import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import type { SoulV4 } from "@/lib/soul-compiler/schema";
import { reconcileBlockSubscriptions } from "@/lib/subscriptions/installer";
import { DrizzleSubscriptionStorage } from "@/lib/subscriptions/storage-drizzle";

type BlockScope = "universal" | "framework";

type BlockRecipe = {
  id: string;
  scope: BlockScope;
  frameworks: string[];
  fileName: string;
  blockMd: string;
};

function normalizeId(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseFrontmatter(content: string) {
  if (!content.startsWith("---\n")) {
    return { meta: {} as Record<string, string>, body: content };
  }

  const endIndex = content.indexOf("\n---\n", 4);
  if (endIndex < 0) {
    return { meta: {} as Record<string, string>, body: content };
  }

  const rawMeta = content.slice(4, endIndex).trim();
  const body = content.slice(endIndex + 5);
  const meta: Record<string, string> = {};

  for (const line of rawMeta.split("\n")) {
    const separator = line.indexOf(":");
    if (separator <= 0) {
      continue;
    }

    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (!key || !value) {
      continue;
    }

    meta[key] = value;
  }

  return { meta, body };
}

function getCandidateBlocksDirs() {
  return [
    path.join(process.cwd(), "packages", "crm", "src", "blocks"),
    path.join(process.cwd(), "src", "blocks"),
  ];
}

async function resolveBlocksDir() {
  for (const candidate of getCandidateBlocksDirs()) {
    try {
      await readdir(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  return null;
}

async function loadBlockRecipes() {
  const blocksDir = await resolveBlocksDir();
  if (!blocksDir) {
    return [] as BlockRecipe[];
  }

  const files = await readdir(blocksDir);
  const recipes: BlockRecipe[] = [];

  for (const fileName of files) {
    if (!fileName.toLowerCase().endsWith(".block.md")) {
      continue;
    }

    const absolutePath = path.join(blocksDir, fileName);
    const content = await readFile(absolutePath, "utf8");
    const { meta, body } = parseFrontmatter(content);

    const fallbackId = normalizeId(fileName.replace(/\.block\.md$/i, ""));
    const id = normalizeId(meta.id ?? fallbackId);
    const frameworks = (meta.frameworks ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const scope = meta.scope?.toLowerCase() === "universal" ? "universal" : "framework";

    if (!id) {
      continue;
    }

    recipes.push({
      id,
      scope,
      frameworks,
      fileName,
      blockMd: body.trim() || content.trim(),
    });
  }

  return recipes;
}

export async function seedInitialBlocks(orgId: string, baseFramework: SoulV4["base_framework"]) {
  const recipes = await loadBlockRecipes();
  if (recipes.length === 0) {
    return [] as string[];
  }

  const selected = recipes.filter(
    (recipe) => recipe.scope === "universal" || recipe.frameworks.includes(baseFramework)
  );

  if (selected.length === 0) {
    return [] as string[];
  }

  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) {
    return [] as string[];
  }

  const currentSettings = ((org.settings ?? {}) as Record<string, unknown>) || {};
  const currentSoulCompiler =
    typeof currentSettings.soulCompiler === "object" && currentSettings.soulCompiler !== null
      ? (currentSettings.soulCompiler as Record<string, unknown>)
      : {};
  const existingSeeded = Array.isArray(currentSoulCompiler.seededBlocks)
    ? (currentSoulCompiler.seededBlocks as Array<Record<string, unknown>>)
    : [];

  const existingIds = new Set(
    existingSeeded
      .map((item) => (typeof item.id === "string" ? item.id : ""))
      .filter(Boolean)
  );

  const toSeed = selected.filter((recipe) => !existingIds.has(recipe.id));
  if (toSeed.length === 0) {
    return selected.map((recipe) => recipe.id);
  }

  const seededEntries = toSeed.map((recipe) => ({
    id: recipe.id,
    scope: recipe.scope,
    frameworks: recipe.frameworks,
    fileName: recipe.fileName,
    seededAt: new Date().toISOString(),
    blockMd: recipe.blockMd,
  }));

  await db
    .update(organizations)
    .set({
      settings: {
        ...currentSettings,
        soulCompiler: {
          ...currentSoulCompiler,
          seededBlocks: [...existingSeeded, ...seededEntries],
        },
      },
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));

  // SLICE 1 PR 2 C4: install-time subscription reconciliation. Reads
  // `## Subscriptions` sections from the seeded BLOCK.md files and
  // materializes rows into block_subscription_registry, handling G-4
  // auto-flip for subscriptions whose producer block just arrived.
  // Best-effort: a thrown error is logged so the block seeding itself
  // isn't blocked by a subscription-registration hiccup.
  try {
    const storage = new DrizzleSubscriptionStorage(db);
    const allSeededBlocks = [...existingSeeded, ...seededEntries].flatMap((entry) => {
      const id = typeof entry.id === "string" ? entry.id : null;
      const blockMd = typeof entry.blockMd === "string" ? entry.blockMd : null;
      if (!id || !blockMd) return [];
      return [{ id, blockMd }];
    });
    await reconcileBlockSubscriptions(orgId, allSeededBlocks, storage);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[seedInitialBlocks] subscription reconcile failed", {
      orgId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return selected.map((recipe) => recipe.id);
}
