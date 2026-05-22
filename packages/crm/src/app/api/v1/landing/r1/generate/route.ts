// POST /api/v1/landing/r1/generate
//
// Re-runs the R1 landing generation step for an existing workspace.
// Called from the ready page when the initial generation failed silently
// (non-fatal mode in run-create-from-url / run-create-from-paste).
//
// Auth: session cookie. The caller must own or co-manage the workspace.
// Body: { workspace_slug: string }
//
// Derives ExtractedBusinessFacts from the workspace's soul jsonb column
// (set by createFullWorkspace / seedSoulFromScratch), which stores phone,
// city, state, services, etc. alongside the standard OrgSoul fields.
// Soul sources rawContent is appended as a fallback for any missing fields.
//
// Mirror of the auth + BYOK pattern in customize/route.ts.

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { organizations, orgMembers, soulSources } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getAIClient } from "@/lib/ai/client";
import { runR1LandingStep } from "@/lib/landing/r1-landing-step";
import type { ExtractedBusinessFacts } from "@/lib/web-onboarding/extraction-prompt";
import type { OrgSoul } from "@/lib/soul/types";

export const runtime = "nodejs";
// Allow up to 60 seconds — LLM generation can be slow on large payloads.
export const maxDuration = 60;

/** Read a string value off a soul-shaped object (some keys are informal extras). */
function readSoulStr(soul: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const val = soul[key];
    if (typeof val === "string" && val.trim().length > 0) return val.trim();
  }
  return null;
}

/** Read a string[] off a soul-shaped object. */
function readSoulStrArr(soul: Record<string, unknown>, ...keys: string[]): string[] | null {
  for (const key of keys) {
    const val = soul[key];
    if (Array.isArray(val) && val.length > 0) {
      const strs = val.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
      if (strs.length > 0) return strs;
    }
  }
  return null;
}

/** Read a number off a soul-shaped object. */
function readSoulNum(soul: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const val = soul[key];
    if (typeof val === "number" && Number.isFinite(val)) return val;
  }
  return null;
}

/** Read a boolean off a soul-shaped object. */
function readSoulBool(soul: Record<string, unknown>, ...keys: string[]): boolean | null {
  for (const key of keys) {
    const val = soul[key];
    if (typeof val === "boolean") return val;
  }
  return null;
}

export async function POST(request: Request) {
  // Require a valid session — this endpoint is for authenticated operators only.
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { workspace_slug?: unknown };
  if (typeof body.workspace_slug !== "string" || !body.workspace_slug.trim()) {
    return NextResponse.json(
      { error: "workspace_slug is required and must be a non-empty string" },
      { status: 400 },
    );
  }

  const workspaceSlug = body.workspace_slug.trim();

  // Resolve workspace + ownership gate.
  const [workspace] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      ownerId: organizations.ownerId,
      parentUserId: organizations.parentUserId,
      soul: organizations.soul,
    })
    .from(organizations)
    .where(eq(organizations.slug, workspaceSlug))
    .limit(1);

  if (!workspace) {
    return NextResponse.json({ error: "workspace_not_found" }, { status: 404 });
  }

  // Gate: must be owner, parent, or org member.
  const isOwner = workspace.ownerId === session.user.id;
  const isParent = workspace.parentUserId === session.user.id;
  if (!isOwner && !isParent) {
    const [member] = await db
      .select({ userId: orgMembers.userId })
      .from(orgMembers)
      .where(and(eq(orgMembers.orgId, workspace.id), eq(orgMembers.userId, session.user.id)))
      .limit(1);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Resolve AI client (BYOK → platform env fallback).
  const aiResolution = await getAIClient({ orgId: workspace.id });
  if (!aiResolution.client) {
    return NextResponse.json(
      {
        error: "no_ai_key",
        detail: "No Anthropic API key configured for this workspace. Add one at /settings/integrations.",
      },
      { status: 503 },
    );
  }
  const byokKey = (aiResolution.client as { apiKey?: string }).apiKey ?? "";

  // Re-derive ExtractedBusinessFacts from the stored soul jsonb.
  // createFullWorkspace / seedSoulFromScratch stores the original extraction
  // results as informal extra keys on the soul object: soul.phone,
  // soul.city, soul.state, soul.offerings (services), soul.testimonials,
  // soul.review_count, soul.review_rating, soul.certifications,
  // soul.trust_signals, soul.emergency_service, soul.same_day,
  // soul.service_area. These shadow/extend the typed OrgSoul interface.
  // See packages/crm/src/lib/billing/anonymous-workspace.ts line ~640.
  const typedSoul = workspace.soul as OrgSoul | null;
  const soul = (typedSoul ?? {}) as Record<string, unknown>;

  const businessName = readSoulStr(soul, "businessName", "business_name", "name");
  const businessDescription = readSoulStr(soul, "businessDescription", "business_description", "soul_description", "aiContext");
  const city = readSoulStr(soul, "city");
  const state = readSoulStr(soul, "state");
  const phone = readSoulStr(soul, "phone");
  const services = readSoulStrArr(soul, "offerings", "services")?.flatMap((s) => {
    // SoulService objects have a .name field; strings are already usable.
    if (typeof s === "string") return [s];
    const sObj = s as Record<string, unknown>;
    return typeof sObj.name === "string" ? [sObj.name] : [];
  }) ?? null;

  // Hard requirement: name + description are needed for a coherent payload.
  // city/state/phone are important but we can fall back to placeholder values
  // (the operator can customize via the natural-language editor after).
  if (!businessName || !businessDescription) {
    // Attempt last-resort: use org name + first soul_source rawContent.
    const [sourceRow] = await db
      .select({ rawContent: soulSources.rawContent })
      .from(soulSources)
      .where(and(eq(soulSources.orgId, workspace.id), eq(soulSources.status, "indexed")))
      .limit(1);

    if (!businessName && !workspace.name) {
      return NextResponse.json(
        {
          error: "insufficient_data",
          detail: "Workspace has no business name on record. Cannot generate a landing page without a business name.",
        },
        { status: 422 },
      );
    }

    // We have enough to attempt generation with what we have.
    // Synthesize minimal facts and proceed.
    const minimalFacts: ExtractedBusinessFacts = {
      business_name: businessName ?? workspace.name,
      business_description: businessDescription ?? sourceRow?.rawContent?.slice(0, 400) ?? `${workspace.name} is a local service business.`,
      city: city ?? "your city",
      state: state ?? "",
      phone: phone ?? "",
      services: services ?? ["Local services"],
    };

    const result = await runR1LandingStep({
      workspaceId: workspace.id,
      facts: minimalFacts,
      byokKey,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: "generation_failed", detail: result.reason },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, archetype: result.archetype });
  }

  // Happy path: full facts derived from soul.
  const facts: ExtractedBusinessFacts = {
    business_name: businessName,
    business_description: businessDescription,
    city: city ?? "your city",
    state: state ?? "",
    phone: phone ?? "",
    services: services ?? ["Local services"],
    review_count: readSoulNum(soul, "review_count"),
    review_rating: readSoulNum(soul, "review_rating"),
    certifications: readSoulStrArr(soul, "certifications"),
    trust_signals: readSoulStrArr(soul, "trust_signals"),
    emergency_service: readSoulBool(soul, "emergency_service"),
    same_day: readSoulBool(soul, "same_day"),
    service_area: readSoulStrArr(soul, "service_area"),
    email: readSoulStr(soul, "email"),
    address: readSoulStr(soul, "address"),
    // testimonials: stored as soul.testimonials — shape matches ExtractedBusinessFacts
    testimonials: Array.isArray(soul["testimonials"])
      ? (soul["testimonials"] as ExtractedBusinessFacts["testimonials"])
      : null,
  };

  const result = await runR1LandingStep({
    workspaceId: workspace.id,
    facts,
    byokKey,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: "generation_failed", detail: result.reason },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, archetype: result.archetype });
}
