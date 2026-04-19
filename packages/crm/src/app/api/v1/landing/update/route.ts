import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { landingPages, organizations } from "@/db/schema";
import {
  resolveOrgIdForWrite,
  resolveV1Identity,
} from "@/lib/auth/v1-identity";
import { assertWritable, demoApiBlockedResponse, isDemoReadonly } from "@/lib/demo/server";

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

  const headline = typeof body.headline === "string" ? body.headline.trim().slice(0, 200) : "";
  const subhead = typeof body.subhead === "string" ? body.subhead.trim().slice(0, 400) : "";
  const ctaLabel =
    typeof body.cta_label === "string" && body.cta_label.trim().length > 0
      ? body.cta_label.trim().slice(0, 60)
      : "Get started";

  if (!headline || !subhead) {
    return NextResponse.json(
      { error: "headline and subhead are required." },
      { status: 400 }
    );
  }

  const requestedWorkspaceId =
    typeof body.workspace_id === "string" ? body.workspace_id : null;
  const resolved = await resolveOrgIdForWrite(identity, requestedWorkspaceId);
  if (!resolved.ok) return resolved.response;
  const orgId = resolved.orgId;

  const [org] = await db
    .select({ slug: organizations.slug, theme: organizations.theme })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }

  const theme = org.theme?.mode ?? "dark";
  const contentHtml =
    `<main data-theme="${theme}">` +
    `<section><h1>${escapeHtml(headline)}</h1>` +
    `<p>${escapeHtml(subhead)}</p>` +
    `<p><a href="/book">${escapeHtml(ctaLabel)}</a> · <a href="/intake">Send us a note</a></p>` +
    `</section></main>`;

  const [existing] = await db
    .select({
      id: landingPages.id,
      seo: landingPages.seo,
      settings: landingPages.settings,
    })
    .from(landingPages)
    .where(and(eq(landingPages.orgId, orgId), eq(landingPages.slug, LANDING_SLUG)))
    .limit(1);

  if (!existing) {
    await db.insert(landingPages).values({
      orgId,
      title: headline,
      slug: LANDING_SLUG,
      status: "published",
      pageType: "page",
      source: "mcp-typed",
      sections: [],
      contentHtml,
      seo: { title: headline, description: subhead },
      settings: { theme, cta_label: ctaLabel },
    });
  } else {
    const nextSeo = {
      ...((existing.seo ?? {}) as Record<string, unknown>),
      title: headline,
      description: subhead,
    };
    const nextSettings = {
      ...((existing.settings ?? {}) as Record<string, unknown>),
      theme,
      cta_label: ctaLabel,
    };
    await db
      .update(landingPages)
      .set({
        title: headline,
        sections: [],
        contentHtml,
        seo: nextSeo,
        settings: nextSettings,
        updatedAt: new Date(),
      })
      .where(eq(landingPages.id, existing.id));
  }

  return NextResponse.json({
    ok: true,
    workspace_id: orgId,
    slug: LANDING_SLUG,
    applied: { headline, subhead, cta_label: ctaLabel },
    public_url: `https://${org.slug}.${process.env.WORKSPACE_BASE_DOMAIN?.trim() || "app.seldonframe.com"}`,
    next: ["Visit / on your subdomain to see the new landing copy."],
  });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
