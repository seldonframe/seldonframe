import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, intakeForms, landingPages, organizations } from "@/db/schema";
import { normalizeTheme } from "@/lib/theme/normalize-theme";
import type { OrgSoul } from "@/lib/soul/types";
import type { SoulPackage } from "@/lib/marketplace/soul-package";

export async function exportSoulPackage(orgId: string): Promise<SoulPackage> {
  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      soul: organizations.soul,
      theme: organizations.theme,
      settings: organizations.settings,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) {
    throw new Error("Organization not found");
  }

  const soul = (org.soul ?? {}) as Partial<OrgSoul>;
  const theme = normalizeTheme(org.theme);

  const articles: Array<{ slug: string; title: string; category: string; content: string }> = [];

  const pages = await db
    .select({
      title: landingPages.title,
      slug: landingPages.slug,
      pageType: landingPages.pageType,
      status: landingPages.status,
      puckData: landingPages.puckData,
      settings: landingPages.settings,
    })
    .from(landingPages)
    .where(and(eq(landingPages.orgId, orgId), eq(landingPages.status, "published")))
    .orderBy(desc(landingPages.updatedAt));

  const forms = await db
    .select({ name: intakeForms.name, slug: intakeForms.slug, fields: intakeForms.fields })
    .from(intakeForms)
    .where(eq(intakeForms.orgId, orgId))
    .orderBy(desc(intakeForms.updatedAt));

  const bookingTemplates = await db
    .select({ title: bookings.title, bookingSlug: bookings.bookingSlug, metadata: bookings.metadata })
    .from(bookings)
    .where(and(eq(bookings.orgId, orgId), eq(bookings.status, "template")))
    .orderBy(desc(bookings.updatedAt));

  const settings = (org.settings ?? {}) as Record<string, unknown>;
  const ownerFullName = String(settings.ownerFullName ?? "").trim();
  const ownerName = String(settings.ownerName ?? "").trim();
  const creatorName = ownerFullName || ownerName || org.name;

  const pageTemplates = pages.map((page) => ({
    type: page.pageType === "form" ? ("form" as const) : ("page" as const),
    name: page.title,
    slug: page.slug,
    description: String(((page.settings as Record<string, unknown> | null)?.description ?? "")).trim(),
    data: page.puckData ?? page.settings ?? {},
  }));

  const formTemplates = forms.map((form) => ({
    type: "form" as const,
    name: form.name,
    slug: form.slug,
    description: "",
    data: { fields: form.fields },
  }));

  const bookingBlocks = bookingTemplates.map((booking) => ({
    type: "booking" as const,
    name: booking.title,
    slug: booking.bookingSlug,
    description: String(((booking.metadata as Record<string, unknown> | null)?.description ?? "")).trim(),
    data: booking.metadata ?? {},
  }));

  const pipelineStages = Array.isArray(soul.pipeline?.stages)
    ? soul.pipeline.stages.map((stage, index) => ({
        name: stage.name,
        order: index + 1,
      }))
    : [];

  return {
    version: "1.0",
    meta: {
      name: soul.businessName || org.name || "Unnamed Soul",
      slug: slugify(soul.businessName || org.name || "soul"),
      description: String(soul.businessDescription ?? "").trim(),
      niche: String(soul.industry ?? "other") || "other",
      tags: [],
      creatorName,
      previewImages: [],
    },
    soul: {
      businessType: String(soul.offerType ?? "").trim() || undefined,
      industry: String(soul.industry ?? "").trim() || undefined,
      services: Array.isArray(soul.services)
        ? soul.services.map((service) => ({
            name: service.name,
            description: service.description || "",
            price: service.price ? String(service.price) : undefined,
            duration: service.duration,
          }))
        : [],
      pipelineStages,
      voiceGuide: String(soul.voice?.style ?? "").trim() || undefined,
      customContext: String(soul.customContext ?? "").trim() || undefined,
      framework: String(soul.industry ?? "").trim() || undefined,
    },
    wiki: {
      articles: articles.map((article) => ({
        slug: article.slug,
        title: article.title,
        category: article.category,
        content: article.content,
      })),
    },
    theme: {
      primaryColor: theme.primaryColor,
      accentColor: theme.accentColor,
      fontFamily: theme.fontFamily,
      borderRadius: theme.borderRadius,
      mode: theme.mode,
      ...(theme.logoUrl ? { logoUrl: theme.logoUrl } : {}),
    },
    blocks: {
      templates: [...pageTemplates, ...formTemplates, ...bookingBlocks],
    },
  };
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
