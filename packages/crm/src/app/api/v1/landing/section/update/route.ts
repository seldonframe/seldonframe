import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { landingPages, organizations } from "@/db/schema";
import {
  resolveOrgIdForWrite,
  resolveV1Identity,
} from "@/lib/auth/v1-identity";
import { assertWritable, demoApiBlockedResponse, isDemoReadonly } from "@/lib/demo/server";
import { logEvent } from "@/lib/observability/log";
import {
  loadBlueprintOrFallback,
  renderBlueprint,
} from "@/lib/blueprint/persist";
import { mutateSectionField } from "@/lib/blueprint/mutate";
import type { Blueprint, LandingSection } from "@/lib/blueprint/types";

/**
 * POST /api/v1/landing/section/update
 *
 * Granular per-field landing edits — the escape hatch when an operator
 * needs to change something the convenience tools (`update_landing_content`,
 * `update_theme`) don't cover. Examples:
 *
 *   { section: "hero", field: "headline", value: "Same-day HVAC repair in DFW" }
 *   { section: "services-grid", field: "items.0.description", value: "..." }
 *   { section: "faq", field: "items.2.answer", value: "..." }
 *   { section: "footer", field: "showHours", value: false }
 *
 * The flow is identical to /landing/update — load → mutate → render → save —
 * but the mutation is `mutateSectionField` with a section type discriminator
 * + dot-path. Section types come from the Blueprint discriminated union
 * (hero / services-grid / about / mid-cta / testimonials / service-area /
 * faq / footer / trust-strip / emergency-strip).
 */

const LANDING_SLUG = "home";

const VALID_SECTION_TYPES: LandingSection["type"][] = [
  "emergency-strip",
  "hero",
  "trust-strip",
  "services-grid",
  "about",
  "mid-cta",
  "testimonials",
  "service-area",
  "faq",
  "footer",
];

type UpdateBody = {
  workspace_id?: unknown;
  section?: unknown;
  field?: unknown;
  value?: unknown;
};

export async function POST(request: Request) {
  if (isDemoReadonly()) return demoApiBlockedResponse();
  assertWritable();

  const auth = await resolveV1Identity(request);
  if (!auth.ok) return auth.response;
  const { identity } = auth;

  const body = (await request.json().catch(() => ({}))) as UpdateBody;

  // Validate section + field (value is freeform — caller's responsibility
  // to send a shape the renderer can handle).
  const sectionType = typeof body.section === "string" ? body.section : "";
  const field = typeof body.field === "string" ? body.field.trim() : "";
  if (!sectionType || !VALID_SECTION_TYPES.includes(sectionType as LandingSection["type"])) {
    return NextResponse.json(
      {
        error: `\`section\` must be one of: ${VALID_SECTION_TYPES.join(", ")}.`,
      },
      { status: 400 }
    );
  }
  if (!field) {
    return NextResponse.json(
      { error: "`field` is required (dot-segmented path, e.g. 'headline' or 'items.0.title')." },
      { status: 400 }
    );
  }
  if (body.value === undefined) {
    return NextResponse.json(
      { error: "`value` is required (use null to clear an optional field)." },
      { status: 400 }
    );
  }

  const requestedWorkspaceId =
    typeof body.workspace_id === "string" ? body.workspace_id : null;
  const resolved = await resolveOrgIdForWrite(identity, requestedWorkspaceId);
  if (!resolved.ok) return resolved.response;
  const orgId = resolved.orgId;

  const [org] = await db
    .select({ slug: organizations.slug, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }

  const [existing] = await db
    .select({
      id: landingPages.id,
      title: landingPages.title,
      seo: landingPages.seo,
      settings: landingPages.settings,
      blueprintJson: landingPages.blueprintJson,
    })
    .from(landingPages)
    .where(and(eq(landingPages.orgId, orgId), eq(landingPages.slug, LANDING_SLUG)))
    .limit(1);

  if (!existing) {
    return NextResponse.json(
      {
        error:
          "No landing page exists for this workspace yet. Use `update_landing_content` first to seed one, or wait for workspace creation to complete.",
      },
      { status: 404 }
    );
  }

  const fallbackIndustry =
    typeof (existing.settings as Record<string, unknown>)?.industry === "string"
      ? ((existing.settings as Record<string, unknown>).industry as string)
      : null;

  const startingBlueprint: Blueprint = loadBlueprintOrFallback(
    { blueprintJson: existing.blueprintJson },
    existing.title ?? org.name,
    fallbackIndustry
  );

  let mutated: Blueprint;
  try {
    mutated = mutateSectionField(
      startingBlueprint,
      sectionType as LandingSection["type"],
      field,
      body.value
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Mutation failed",
      },
      { status: 400 }
    );
  }

  const rendered = renderBlueprint(mutated);

  const nextSettings = {
    ...((existing.settings ?? {}) as Record<string, unknown>),
    blueprintRenderer: "general-service-v1",
    industry: fallbackIndustry,
  };

  await db
    .update(landingPages)
    .set({
      contentHtml: rendered.contentHtml,
      contentCss: rendered.contentCss,
      blueprintJson: mutated as unknown as Record<string, unknown>,
      settings: nextSettings,
      updatedAt: new Date(),
    })
    .where(eq(landingPages.id, existing.id));

  logEvent(
    "landing_section_update",
    { section: sectionType, field, value_type: typeof body.value },
    { request, identity, orgId, status: 200 }
  );

  return NextResponse.json({
    ok: true,
    workspace_id: orgId,
    slug: LANDING_SLUG,
    applied: {
      section: sectionType,
      field,
      value: body.value,
    },
    public_url: `https://${org.slug}.${process.env.WORKSPACE_BASE_DOMAIN?.trim() || "app.seldonframe.com"}`,
    next: ["Visit / on your subdomain to verify the change."],
  });
}
