import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { landingPages, organizations, soulWiki } from "@/db/schema";
import { normalizeTheme } from "@/lib/theme/normalize-theme";
import type { OrgSoul } from "@/lib/soul/types";
import type { SoulPackage } from "@/lib/marketplace/soul-package";

export async function installSoulPackage(orgId: string, pkg: SoulPackage) {
  const [org] = await db
    .select({ id: organizations.id, soul: organizations.soul, theme: organizations.theme })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) {
    throw new Error("Organization not found");
  }

  const existingSoul = (org.soul ?? {}) as Record<string, unknown>;
  const currentBusinessName = String(existingSoul.businessName ?? "").trim();

  const nextSoul: OrgSoul = {
    ...(existingSoul as unknown as OrgSoul),
    businessName: currentBusinessName || "[Your Business Name]",
    businessDescription: String(existingSoul.businessDescription ?? "").trim() || String(pkg.meta.description ?? "").trim(),
    industry: String(pkg.soul.industry ?? existingSoul.industry ?? "other"),
    offerType: String(pkg.soul.businessType ?? existingSoul.offerType ?? pkg.meta.name),
    aiContext: String(existingSoul.aiContext ?? "").trim() || String(pkg.soul.customContext ?? "").trim(),
    customContext: pkg.soul.customContext,
    services: Array.isArray(pkg.soul.services)
      ? pkg.soul.services.map((service) => ({
          name: service.name,
          description: service.description,
          duration: service.duration,
          price: service.price ? Number(service.price) : undefined,
        }))
      : [],
    pipeline: {
      name: String((existingSoul.pipeline as { name?: string } | undefined)?.name ?? "Pipeline"),
      stages: Array.isArray(pkg.soul.pipelineStages)
        ? pkg.soul.pipelineStages.map((stage) => ({
            name: stage.name,
            probability: 0,
            color: "#14b8a6",
          }))
        : ((existingSoul.pipeline as { stages?: Array<{ name: string; probability: number; color: string }> } | undefined)?.stages ?? []),
    },
    voice: {
      style: String(pkg.soul.voiceGuide ?? (existingSoul.voice as { style?: string } | undefined)?.style ?? "professional"),
      vocabulary: (existingSoul.voice as { vocabulary?: string[] } | undefined)?.vocabulary ?? [],
      avoidWords: (existingSoul.voice as { avoidWords?: string[] } | undefined)?.avoidWords ?? [],
      samplePhrases: (existingSoul.voice as { samplePhrases?: string[] } | undefined)?.samplePhrases ?? [],
    },
  };

  const nextTheme = normalizeTheme({
    ...(org.theme ?? {}),
    primaryColor: pkg.theme.primaryColor,
    accentColor: pkg.theme.accentColor,
    fontFamily: pkg.theme.fontFamily,
    borderRadius: pkg.theme.borderRadius,
    mode: pkg.theme.mode,
    logoUrl: pkg.theme.logoUrl ?? null,
  });

  await db
    .update(organizations)
    .set({ soul: nextSoul, theme: nextTheme, updatedAt: new Date() })
    .where(eq(organizations.id, orgId));

  for (const article of pkg.wiki.articles) {
    await db
      .insert(soulWiki)
      .values({
        orgId,
        slug: article.slug,
        title: article.title,
        category: article.category,
        content: article.content,
        sourceIds: [],
        lastCompiledAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [soulWiki.orgId, soulWiki.slug],
        set: {
          content: article.content,
          category: article.category,
          title: article.title,
          lastCompiledAt: new Date(),
          updatedAt: new Date(),
        },
      });
  }

  let blocksCreated = 0;

  for (const template of pkg.blocks.templates) {
    if (template.type !== "page" && template.type !== "form") {
      continue;
    }

    const slug = template.type === "form" ? `form-${template.slug}` : template.slug;

    const [existing] = await db
      .select({ id: landingPages.id })
      .from(landingPages)
      .where(and(eq(landingPages.orgId, orgId), eq(landingPages.slug, slug)))
      .limit(1);

    if (existing?.id) {
      continue;
    }

    await db.insert(landingPages).values({
      orgId,
      title: template.name,
      slug,
      status: "published",
      pageType: template.type,
      source: "marketplace",
      puckData: (template.data as Record<string, unknown>) ?? null,
      settings: {
        source: "marketplace",
        description: template.description,
      },
    });

    blocksCreated += 1;
  }

  return {
    success: true,
    blocksCreated,
  };
}
