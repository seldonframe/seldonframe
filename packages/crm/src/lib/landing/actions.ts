"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts, landingPages, organizations } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { assertWritable } from "@/lib/demo/server";
import { emitSeldonEvent } from "@/lib/events/bus";
import { sectionsToHTML } from "@/lib/landing/section-to-html";
import { assertLandingPageLimit } from "@/lib/tier/limits";
import { dispatchWebhook } from "@/lib/utils/webhooks";
import { defaultLandingSections, type LandingSection } from "./types";

function toSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export async function listLandingPages() {
  const orgId = await getOrgId();

  if (!orgId) {
    return [];
  }

  return db.select().from(landingPages).where(eq(landingPages.orgId, orgId));
}

export async function getLandingPageById(id: string) {
  const orgId = await getOrgId();

  if (!orgId) {
    return null;
  }

  const [page] = await db
    .select()
    .from(landingPages)
    .where(and(eq(landingPages.orgId, orgId), eq(landingPages.id, id)))
    .limit(1);

  if (!page) {
    return null;
  }

  const [org] = await db.select({ slug: organizations.slug }).from(organizations).where(eq(organizations.id, orgId)).limit(1);

  return {
    ...page,
    orgSlug: org?.slug ?? "",
  };
}

export async function createLandingPageAction(formData: FormData) {
  assertWritable();

  const orgId = await getOrgId();

  if (!orgId) {
    throw new Error("Unauthorized");
  }

  const title = String(formData.get("title") ?? "New Landing Page");
  const slugInput = String(formData.get("slug") ?? title);
  const slug = toSlug(slugInput || "landing-page");
  const mode = String(formData.get("mode") ?? "soul-template");
  const template = String(formData.get("template") ?? "lead-capture");

  await assertLandingPageLimit(orgId);

  const sections = defaultLandingSections();
  const initial = sectionsToHTML(sections);

  await db.insert(landingPages).values({
    orgId,
    title,
    slug,
    status: "draft",
    source: mode === "scratch" ? "scratch" : mode === "template" ? "template" : "soul",
    sections: sections as unknown as Record<string, unknown>[],
    contentHtml: mode === "scratch" ? null : initial.html,
    contentCss: mode === "scratch" ? null : initial.css,
    settings: {
      mode,
      template,
    },
  });
}

export async function createLandingPageForSeldonAction(input: {
  title: string;
  slug: string;
  mode?: string;
  template?: string;
  published?: boolean;
}) {
  assertWritable();

  const orgId = await getOrgId();

  if (!orgId) {
    throw new Error("Unauthorized");
  }

  const title = String(input.title ?? "New Landing Page");
  const slugInput = String(input.slug ?? title ?? "landing-page");
  const slug = toSlug(slugInput);
  const mode = String(input.mode ?? "soul-template");
  const template = String(input.template ?? "lead-capture");
  const status = input.published ? "published" : "draft";

  await assertLandingPageLimit(orgId);

  const sections = defaultLandingSections();
  const initial = sectionsToHTML(sections);

  const [created] = await db
    .insert(landingPages)
    .values({
      orgId,
      title,
      slug,
      status,
      source: mode === "scratch" ? "scratch" : mode === "template" ? "template" : "soul",
      sections: sections as unknown as Record<string, unknown>[],
      contentHtml: mode === "scratch" ? null : initial.html,
      contentCss: mode === "scratch" ? null : initial.css,
      settings: {
        mode,
        template,
      },
    })
    .returning({ id: landingPages.id, slug: landingPages.slug, title: landingPages.title, status: landingPages.status });

  return {
    id: created?.id ?? null,
    slug: created?.slug ?? slug,
    title: created?.title ?? title,
    status: created?.status ?? status,
  };
}

export async function updateLandingEditorAction({
  pageId,
  html,
  css,
  editorData,
  sections,
}: {
  pageId: string;
  html: string;
  css: string;
  editorData: Record<string, unknown>;
  sections?: LandingSection[];
}) {
  assertWritable();

  const orgId = await getOrgId();

  if (!orgId) {
    throw new Error("Unauthorized");
  }

  await db
    .update(landingPages)
    .set({
      contentHtml: html,
      contentCss: css,
      editorData,
      ...(sections ? { sections: sections as unknown as Record<string, unknown>[] } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(landingPages.orgId, orgId), eq(landingPages.id, pageId)));
}

export async function updateLandingPageAction(input: {
  pageId: string;
  title: string;
  slug: string;
  contentHtml: string;
  contentCss: string;
  sections?: Record<string, unknown>[];
  seoDescription?: string;
}) {
  assertWritable();

  const orgId = await getOrgId();

  if (!orgId) {
    throw new Error("Unauthorized");
  }

  const pageId = String(input.pageId ?? "").trim();
  const title = String(input.title ?? "").trim();
  const slug = toSlug(String(input.slug ?? title));

  if (!pageId || !title || !slug) {
    throw new Error("Page ID, title, and slug are required");
  }

  const [page] = await db
    .select({ seo: landingPages.seo })
    .from(landingPages)
    .where(and(eq(landingPages.orgId, orgId), eq(landingPages.id, pageId)))
    .limit(1);

  if (!page) {
    throw new Error("Landing page not found");
  }

  await db
    .update(landingPages)
    .set({
      title,
      slug,
      contentHtml: input.contentHtml,
      contentCss: input.contentCss,
      ...(input.sections ? { sections: input.sections } : {}),
      seo: {
        ...(page.seo ?? {}),
        description: input.seoDescription ?? "",
      },
      updatedAt: new Date(),
    })
    .where(and(eq(landingPages.orgId, orgId), eq(landingPages.id, pageId)));

  return { id: pageId, title, slug };
}

export async function updateLandingPageSettingsAction({
  pageId,
  title,
  slug,
  seoDescription,
}: {
  pageId: string;
  title: string;
  slug: string;
  seoDescription?: string;
}) {
  assertWritable();

  const orgId = await getOrgId();

  if (!orgId) {
    throw new Error("Unauthorized");
  }

  const [page] = await db
    .select({ seo: landingPages.seo })
    .from(landingPages)
    .where(and(eq(landingPages.orgId, orgId), eq(landingPages.id, pageId)))
    .limit(1);

  if (!page) {
    throw new Error("Landing page not found");
  }

  await db
    .update(landingPages)
    .set({
      title,
      slug: toSlug(slug || title),
      seo: {
        ...(page.seo ?? {}),
        description: seoDescription ?? "",
      },
      updatedAt: new Date(),
    })
    .where(and(eq(landingPages.orgId, orgId), eq(landingPages.id, pageId)));
}

export async function publishLandingPageAction(pageId: string, published: boolean) {
  assertWritable();

  const orgId = await getOrgId();

  if (!orgId) {
    throw new Error("Unauthorized");
  }

  await db
    .update(landingPages)
    .set({
      status: published ? "published" : "draft",
      updatedAt: new Date(),
    })
    .where(and(eq(landingPages.orgId, orgId), eq(landingPages.id, pageId)));
}

export async function getPublicLandingPage(orgSlug: string, slug: string) {
  const [org] = await db
    .select({ id: organizations.id, name: organizations.name, settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.slug, orgSlug))
    .limit(1);

  if (!org) {
    return null;
  }

  const [page] = await db
    .select()
    .from(landingPages)
    .where(and(eq(landingPages.orgId, org.id), eq(landingPages.slug, slug), eq(landingPages.status, "published")))
    .limit(1);

  if (!page) {
    return null;
  }

  return { orgId: org.id, orgName: org.name, orgSettings: org.settings, page };
}

export async function trackLandingVisitAction({ pageId, visitorId }: { pageId: string; visitorId: string }) {
  const [page] = await db.select({ orgId: landingPages.orgId }).from(landingPages).where(eq(landingPages.id, pageId)).limit(1);

  if (!page) {
    return;
  }

  await emitSeldonEvent("landing.visited", {
    pageId,
    visitorId,
  });

  await dispatchWebhook({
    orgId: page.orgId,
    event: "landing.visited",
    payload: { pageId, visitorId },
  });
}

export async function submitLandingLeadAction({
  orgSlug,
  pageSlug,
  fullName,
  email,
}: {
  orgSlug: string;
  pageSlug: string;
  fullName: string;
  email: string;
}) {
  assertWritable();

  const [org] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, orgSlug)).limit(1);

  if (!org) {
    throw new Error("Organization not found");
  }

  const [page] = await db
    .select({ id: landingPages.id })
    .from(landingPages)
    .where(and(eq(landingPages.orgId, org.id), eq(landingPages.slug, pageSlug), eq(landingPages.status, "published")))
    .limit(1);

  if (!page) {
    throw new Error("Landing page not found");
  }

  const [existing] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.orgId, org.id), eq(contacts.email, email)))
    .limit(1);

  let contactId = existing?.id ?? null;

  if (!contactId) {
    const [created] = await db
      .insert(contacts)
      .values({
        orgId: org.id,
        firstName: fullName || "Lead",
        email,
        status: "lead",
        source: "landing",
      })
      .returning({ id: contacts.id });

    contactId = created?.id ?? null;

    if (contactId) {
      await emitSeldonEvent("contact.created", { contactId });
    }
  }

  if (contactId) {
    await emitSeldonEvent("landing.converted", {
      pageId: page.id,
      contactId,
    });
  }

  await dispatchWebhook({
    orgId: org.id,
    event: "landing.converted",
    payload: { pageId: page.id, contactId, email },
  });

  return { success: true };
}
