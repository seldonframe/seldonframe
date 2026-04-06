import { and, eq, gt, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { organizations, previewSessions, soulSources, type OrganizationIntegrations } from "@/db/schema";
import { assertWritable, demoApiBlockedResponse, isDemoReadonly } from "@/lib/demo/server";
import { installBlock } from "@/lib/seldon/block-installer";
import type { OrgSoul } from "@/lib/soul/types";
import { compileSoulWiki } from "@/lib/soul-wiki/compile";
import { normalizeTheme } from "@/lib/theme/normalize-theme";
import type { OrgTheme } from "@/lib/theme/types";

function readObject(value: unknown) {
  if (!value || typeof value !== "object") {
    return {} as Record<string, unknown>;
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeHexColor(value: string) {
  const color = value.trim();

  if (/^#[0-9a-fA-F]{6}$/.test(color)) {
    return color;
  }

  const shortMatch = color.match(/^#([0-9a-fA-F]{3})$/);
  if (shortMatch?.[1]) {
    const [r, g, b] = shortMatch[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`;
  }

  return "#14b8a6";
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
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

  const body = (await req.json().catch(() => ({}))) as { token?: unknown };
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  const orgId = session.user.orgId;
  const now = new Date();

  const [claimedPreview] = await db
    .update(previewSessions)
    .set({ claimedByOrgId: orgId, updatedAt: new Date() })
    .where(and(eq(previewSessions.token, token), isNull(previewSessions.claimedByOrgId), gt(previewSessions.expiresAt, now)))
    .returning({
      id: previewSessions.id,
      url: previewSessions.url,
      businessData: previewSessions.businessData,
      detectedTools: previewSessions.detectedTools,
      themeColor: previewSessions.themeColor,
      rawMarkdown: previewSessions.rawMarkdown,
      claimedByOrgId: previewSessions.claimedByOrgId,
      expiresAt: previewSessions.expiresAt,
    });

  if (!claimedPreview) {
    const [existingPreview] = await db
      .select({ claimedByOrgId: previewSessions.claimedByOrgId, expiresAt: previewSessions.expiresAt })
      .from(previewSessions)
      .where(eq(previewSessions.token, token))
      .limit(1);

    if (!existingPreview || existingPreview.expiresAt.getTime() <= now.getTime()) {
      return NextResponse.json({ error: "Preview expired or not found" }, { status: 404 });
    }

    if (existingPreview.claimedByOrgId === orgId) {
      return NextResponse.json({ success: true, alreadyClaimed: true, blocksCreated: 0 });
    }

    return NextResponse.json({ error: "Preview already claimed" }, { status: 409 });
  }

  const [org] = await db
    .select({
      id: organizations.id,
      slug: organizations.slug,
      name: organizations.name,
      soul: organizations.soul,
      theme: organizations.theme,
      integrations: organizations.integrations,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const business = readObject(claimedPreview.businessData);
  const existingSoul = readObject(org.soul);

  const mappedServices = Array.isArray(business.services)
    ? business.services
        .map((item) => {
          const row = readObject(item);
          const name = readString(row.name);
          if (!name) {
            return null;
          }

          const priceRaw = readString(row.price);
          const numericPrice = priceRaw ? Number.parseFloat(priceRaw.replace(/[^0-9.]/g, "")) : Number.NaN;

          return {
            name,
            description: readString(row.description),
            duration: readString(row.duration) || undefined,
            price: Number.isFinite(numericPrice) ? numericPrice : undefined,
          };
        })
        .filter(Boolean)
    : [];

  const voiceTone = readString(business.voiceTone);
  const businessName = readString(business.businessName) || readString(existingSoul.businessName) || org.name;
  const businessDescription = readString(business.description) || readString(existingSoul.businessDescription);
  const industry = readString(business.industry) || readString(existingSoul.industry) || "other";
  const framework = readString(business.suggestedFramework) || readString(existingSoul.offerType) || "services";
  const idealClient = readString(business.idealClient);

  const nextSoul = {
    ...existingSoul,
    businessName,
    businessDescription,
    industry,
    offerType: framework,
    aiContext: readString(existingSoul.aiContext) || businessDescription,
    customContext: idealClient ? `Ideal client: ${idealClient}` : readString(existingSoul.customContext),
    services: mappedServices,
    voice: {
      ...(readObject(existingSoul.voice) as Record<string, unknown>),
      style: voiceTone || readString(readObject(existingSoul.voice).style) || "professional",
      vocabulary: Array.isArray(readObject(existingSoul.voice).vocabulary) ? readObject(existingSoul.voice).vocabulary : [],
      avoidWords: Array.isArray(readObject(existingSoul.voice).avoidWords) ? readObject(existingSoul.voice).avoidWords : [],
      samplePhrases: Array.isArray(readObject(existingSoul.voice).samplePhrases) ? readObject(existingSoul.voice).samplePhrases : [],
    },
  } as unknown as OrgSoul;

  const nextTheme = normalizeTheme({
    ...readObject(org.theme),
    primaryColor: normalizeHexColor(readString(claimedPreview.themeColor) || "#14b8a6"),
    accentColor: "#6366f1",
    fontFamily: "DM Sans",
    borderRadius: "rounded",
    mode: "dark",
  });

  await db
    .update(organizations)
    .set({
      soul: nextSoul,
      theme: nextTheme,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));

  const rawMarkdown = readString(claimedPreview.rawMarkdown);
  if (rawMarkdown) {
    await db.insert(soulSources).values({
      orgId,
      type: "url",
      title: `Website: ${businessName}`,
      sourceUrl: claimedPreview.url,
      rawContent: rawMarkdown,
      metadata: {
        extractedAt: new Date().toISOString(),
        auto: true,
        claimToken: token,
      },
      status: "pending",
    });

    void compileSoulWiki(orgId).catch(() => {
      return;
    });
  }

  let blocksCreated = 0;

  try {
    const integrations = (org.integrations ?? {}) as OrganizationIntegrations;
    const primaryServiceName = mappedServices[0]?.name || "Consultation";
    const bookingSlug = slugify(`book-${primaryServiceName}`) || "book-consultation";

    await installBlock(
      orgId,
      org.slug,
      "booking",
      {
        name: `Book a ${primaryServiceName}`,
        slug: bookingSlug,
        description: `Schedule your ${primaryServiceName}`,
        durationMinutes: 30,
      },
      nextSoul,
      nextTheme as OrgTheme,
      integrations
    );
    blocksCreated += 1;

    await installBlock(
      orgId,
      org.slug,
      "form",
      {
        name: "New Client Intake",
        slug: "new-client-intake",
        description: "Quick intake to collect lead details.",
        mode: "soul-template",
        template: "lead-capture",
        fields: [
          { type: "text", label: "Full Name", required: true },
          { type: "email", label: "Email", required: true },
          { type: "text", label: "Phone", required: false },
          { type: "textarea", label: "What do you need help with?", required: false },
        ],
      },
      nextSoul,
      nextTheme as OrgTheme,
      integrations
    );
    blocksCreated += 1;
  } catch {
    return NextResponse.json({ success: true, blocksCreated, warning: "Some starter blocks could not be created." });
  }

  return NextResponse.json({ success: true, blocksCreated });
}
