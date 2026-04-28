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
import {
  mutateHeroCtaPrimaryLabel,
  mutateHeroHeadline,
  mutateHeroSubhead,
} from "@/lib/blueprint/mutate";
import type { Blueprint } from "@/lib/blueprint/types";

/**
 * POST /api/v1/landing/update
 *
 * Three-field convenience tool for the most common copy edits: headline,
 * subhead, primary-CTA label. C3.4 made it blueprint-aware:
 *
 *   1. Load blueprintJson from landing_pages (or fall back to industry
 *      template if NULL — self-heals legacy rows on first edit)
 *   2. Apply mutateHeroHeadline / mutateHeroSubhead / mutateHeroCtaPrimaryLabel
 *      depending on which fields the caller passed
 *   3. Run the result back through renderGeneralServiceV1
 *   4. Persist blueprintJson + contentHtml + contentCss + seo together
 *
 * Net effect: the operator's edit lands without losing any of the C3.x
 * visual polish (frame, navbar, glass nav, italic accent, animations,
 * etc.) — provable via the golden test in
 * tests/unit/blueprint-customization-loop.spec.ts.
 */

type UpdateBody = {
  workspace_id?: unknown;
  headline?: unknown;
  subhead?: unknown;
  cta_label?: unknown;
};

const LANDING_SLUG = "home";

export async function POST(request: Request) {
  if (isDemoReadonly()) return demoApiBlockedResponse();
  assertWritable();

  const auth = await resolveV1Identity(request);
  if (!auth.ok) return auth.response;
  const { identity } = auth;

  const body = (await request.json().catch(() => ({}))) as UpdateBody;

  const headline =
    typeof body.headline === "string" ? body.headline.trim().slice(0, 200) : "";
  const subhead =
    typeof body.subhead === "string" ? body.subhead.trim().slice(0, 400) : "";
  const ctaLabel =
    typeof body.cta_label === "string" && body.cta_label.trim().length > 0
      ? body.cta_label.trim().slice(0, 60)
      : "";

  // At least one field must be supplied. Pure no-ops are 400s so the
  // operator gets a clear signal rather than a silent success.
  if (!headline && !subhead && !ctaLabel) {
    return NextResponse.json(
      {
        error:
          "At least one of headline, subhead, or cta_label is required.",
      },
      { status: 400 }
    );
  }

  const requestedWorkspaceId =
    typeof body.workspace_id === "string" ? body.workspace_id : null;
  const resolved = await resolveOrgIdForWrite(identity, requestedWorkspaceId);
  if (!resolved.ok) return resolved.response;
  const orgId = resolved.orgId;

  const [org] = await db
    .select({
      slug: organizations.slug,
      name: organizations.name,
    })
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

  // Load the source blueprint (or fall back). Industry hint comes from
  // settings — we stash it there at create time precisely so the fallback
  // path on legacy rows (those without a blueprint_json) can re-derive
  // the right template. Defaults to "general" if absent.
  const fallbackIndustry =
    typeof (existing?.settings as Record<string, unknown> | undefined)?.industry === "string"
      ? ((existing!.settings as Record<string, unknown>).industry as string)
      : null;
  const startingBlueprint: Blueprint = loadBlueprintOrFallback(
    { blueprintJson: existing?.blueprintJson ?? null },
    existing?.title ?? org.name,
    fallbackIndustry
  );

  let mutated: Blueprint = startingBlueprint;
  if (headline) mutated = mutateHeroHeadline(mutated, headline);
  if (subhead) mutated = mutateHeroSubhead(mutated, subhead);
  if (ctaLabel) mutated = mutateHeroCtaPrimaryLabel(mutated, ctaLabel);

  const rendered = renderBlueprint(mutated);

  // Pull the post-mutation hero values back out for the SEO + response,
  // so what the operator sees in `applied` matches what landed (in case
  // we later add per-field truncation that differs from the input).
  const newHero = mutated.landing.sections.find((s) => s.type === "hero");
  const appliedHeadline =
    newHero && newHero.type === "hero" ? newHero.headline : headline;
  const appliedSubhead =
    newHero && newHero.type === "hero" ? newHero.subhead ?? "" : subhead;
  const appliedCtaLabel =
    newHero && newHero.type === "hero"
      ? newHero.ctaPrimary.label
      : ctaLabel;

  // Pull the title / description for SEO from the (possibly mutated)
  // hero so search engines reflect the updated copy.
  const seoTitle = appliedHeadline || existing?.title || mutated.workspace.name;
  const seoDescription =
    appliedSubhead || `Learn more about ${mutated.workspace.name}.`;

  if (!existing) {
    await db.insert(landingPages).values({
      orgId,
      title: seoTitle,
      slug: LANDING_SLUG,
      status: "published",
      pageType: "page",
      source: "template",
      sections: [],
      contentHtml: rendered.contentHtml,
      contentCss: rendered.contentCss,
      blueprintJson: mutated as unknown as Record<string, unknown>,
      seo: { title: seoTitle, description: seoDescription },
      settings: {
        theme: "light",
        blueprintRenderer: "general-service-v1",
        cta_label: appliedCtaLabel,
        industry: fallbackIndustry,
      },
    });
  } else {
    const nextSeo = {
      ...((existing.seo ?? {}) as Record<string, unknown>),
      title: seoTitle,
      description: seoDescription,
    };
    const nextSettings = {
      ...((existing.settings ?? {}) as Record<string, unknown>),
      blueprintRenderer: "general-service-v1",
      cta_label: appliedCtaLabel,
    };
    await db
      .update(landingPages)
      .set({
        title: seoTitle,
        sections: [],
        contentHtml: rendered.contentHtml,
        contentCss: rendered.contentCss,
        blueprintJson: mutated as unknown as Record<string, unknown>,
        seo: nextSeo,
        settings: nextSettings,
        updatedAt: new Date(),
      })
      .where(eq(landingPages.id, existing.id));
  }

  logEvent(
    "landing_update",
    {
      created: !existing,
      headline_changed: Boolean(headline),
      subhead_changed: Boolean(subhead),
      cta_changed: Boolean(ctaLabel),
    },
    { request, identity, orgId, status: 200 }
  );

  return NextResponse.json({
    ok: true,
    workspace_id: orgId,
    slug: LANDING_SLUG,
    applied: {
      headline: appliedHeadline,
      subhead: appliedSubhead,
      cta_label: appliedCtaLabel,
    },
    public_url: `https://${org.slug}.${process.env.WORKSPACE_BASE_DOMAIN?.trim() || "app.seldonframe.com"}`,
    next: ["Visit / on your subdomain to see the new landing copy."],
  });
}
