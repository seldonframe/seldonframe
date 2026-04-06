import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { marketplaceListings } from "@/db/schema";
import { assertWritable, demoApiBlockedResponse, isDemoReadonly } from "@/lib/demo/server";
import { exportSoulPackage } from "@/lib/marketplace/export-soul";
import type { SoulPackage } from "@/lib/marketplace/soul-package";

function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 64);
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !session.user.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const listings = await db
    .select()
    .from(marketplaceListings)
    .where(eq(marketplaceListings.creatorOrgId, session.user.orgId))
    .orderBy(desc(marketplaceListings.createdAt));

  return NextResponse.json(listings);
}

export async function POST(req: Request) {
  if (isDemoReadonly()) {
    return demoApiBlockedResponse();
  }

  assertWritable();

  const session = await auth();
  if (!session?.user?.id || !session.user.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    name?: string;
    niche?: string;
    description?: string;
    longDescription?: string;
    price?: number;
    tags?: string[];
    previewImageUrl?: string;
    previewImages?: string[];
    soulPackage?: SoulPackage;
  };

  const name = String(body.name ?? "").trim();
  const niche = String(body.niche ?? "other").trim() || "other";
  const description = String(body.description ?? "").trim();
  const longDescription = String(body.longDescription ?? "").trim();
  const priceDollars = Number(body.price ?? 0);
  const price = Number.isFinite(priceDollars) ? Math.max(0, Math.round(priceDollars * 100)) : 0;
  const tags = Array.isArray(body.tags) ? body.tags.map((tag) => String(tag).trim()).filter(Boolean) : [];
  const previewImageUrl = String(body.previewImageUrl ?? "").trim() || null;
  const previewImages = Array.isArray(body.previewImages)
    ? body.previewImages.map((image) => String(image).trim()).filter(Boolean)
    : [];

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const [existingSlug] = await db
    .select({ id: marketplaceListings.id })
    .from(marketplaceListings)
    .where(eq(marketplaceListings.slug, slugify(name)))
    .limit(1);

  const soulPackageBase = body.soulPackage ?? (await exportSoulPackage(session.user.orgId));
  const soulPackage: SoulPackage = {
    ...soulPackageBase,
    meta: {
      ...soulPackageBase.meta,
      name,
      slug: existingSlug ? `${slugify(name)}-${Date.now().toString().slice(-6)}` : slugify(name),
      description,
      ...(longDescription ? { longDescription } : {}),
      niche,
      tags,
      previewImages,
    },
  };

  const [created] = await db
    .insert(marketplaceListings)
    .values({
      creatorOrgId: session.user.orgId,
      slug: soulPackage.meta.slug,
      name,
      description: description || null,
      longDescription: longDescription || null,
      niche,
      tags,
      price,
      soulPackage,
      previewImageUrl,
      previewImages,
      isPublished: false,
    })
    .returning();

  return NextResponse.json(created);
}
