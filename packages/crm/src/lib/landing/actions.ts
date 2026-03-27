"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts, landingPages, organizations } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { assertWritable } from "@/lib/demo/server";
import { emitSeldonEvent } from "@/lib/events/bus";
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

  return page ?? null;
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

  await assertLandingPageLimit(orgId);

  await db.insert(landingPages).values({
    orgId,
    title,
    slug,
    status: "draft",
    sections: defaultLandingSections() as unknown as Record<string, unknown>[],
  });
}

export async function updateLandingSectionsAction(pageId: string, sectionsJson: string) {
  assertWritable();

  const orgId = await getOrgId();

  if (!orgId) {
    throw new Error("Unauthorized");
  }

  const parsed = JSON.parse(sectionsJson) as LandingSection[];

  await db
    .update(landingPages)
    .set({
      sections: parsed as unknown as Record<string, unknown>[],
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
  const [org] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, orgSlug)).limit(1);

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

  return { orgId: org.id, page };
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
