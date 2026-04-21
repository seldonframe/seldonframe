import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { landingPages, organizations } from "@/db/schema";
import { emitSeldonEvent } from "@/lib/events/bus";
import {
  validatePuckPayload,
  type PuckPayload,
  type PuckValidationIssue,
} from "@/lib/puck/validator";
import { assertLandingPageLimit } from "@/lib/tier/limits";
import { dispatchWebhook } from "@/lib/utils/webhooks";

function toSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export async function listLandingPagesForOrg(orgId: string, limit = 50) {
  return db
    .select({
      id: landingPages.id,
      title: landingPages.title,
      slug: landingPages.slug,
      status: landingPages.status,
      pageType: landingPages.pageType,
      source: landingPages.source,
      createdAt: landingPages.createdAt,
      updatedAt: landingPages.updatedAt,
    })
    .from(landingPages)
    .where(eq(landingPages.orgId, orgId))
    .orderBy(desc(landingPages.updatedAt))
    .limit(limit);
}

export async function getLandingPage(orgId: string, pageId: string) {
  const [row] = await db
    .select()
    .from(landingPages)
    .where(and(eq(landingPages.orgId, orgId), eq(landingPages.id, pageId)))
    .limit(1);
  return row ?? null;
}

export type CreateLandingInput = {
  orgId: string;
  title: string;
  slug?: string;
  puckData?: unknown;
  published?: boolean;
  source?: string;
};

export type CreateLandingResult =
  | { ok: true; page: typeof landingPages.$inferSelect; droppedIssues: [] }
  | { ok: false; reason: "invalid_puck_data"; issues: PuckValidationIssue[] };

export async function createLandingPageFromApi(input: CreateLandingInput): Promise<CreateLandingResult> {
  await assertLandingPageLimit(input.orgId);

  let cleaned: PuckPayload | null = null;
  if (input.puckData) {
    const validation = validatePuckPayload(input.puckData);
    if (!validation.ok) {
      return { ok: false, reason: "invalid_puck_data", issues: validation.issues };
    }
    cleaned = validation.payload;
  }

  const slug = toSlug(input.slug ?? input.title ?? "landing-page") || "landing-page";

  const [created] = await db
    .insert(landingPages)
    .values({
      orgId: input.orgId,
      title: input.title,
      slug,
      status: input.published ? "published" : "draft",
      source: input.source ?? "api",
      puckData: cleaned as unknown as Record<string, unknown> | null,
      sections: [],
    })
    .returning();

  if (!created) {
    throw new Error("Could not create landing page");
  }

  if (input.published) {
    await emitSeldonEvent("landing.published", {
      pageId: created.id,
      slug: created.slug,
      orgId: input.orgId,
    });
    await dispatchWebhook({
      orgId: input.orgId,
      event: "landing.published",
      payload: { pageId: created.id, slug: created.slug },
    });

    const [org] = await db
      .select({ slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, input.orgId))
      .limit(1);
    if (org?.slug) {
      revalidatePath(`/l/${org.slug}/${created.slug}`);
    }
  }

  return { ok: true, page: created, droppedIssues: [] };
}

export type UpdateLandingInput = {
  orgId: string;
  pageId: string;
  title?: string;
  puckData?: unknown;
};

export type UpdateLandingResult =
  | { ok: true; page: typeof landingPages.$inferSelect }
  | { ok: false; reason: "not_found" | "invalid_puck_data"; issues?: PuckValidationIssue[] };

export async function updateLandingPageFromApi(input: UpdateLandingInput): Promise<UpdateLandingResult> {
  const values: Record<string, unknown> = { updatedAt: new Date() };

  if (typeof input.title === "string") {
    values.title = input.title;
  }

  if (input.puckData !== undefined) {
    if (input.puckData === null) {
      values.puckData = null;
    } else {
      const validation = validatePuckPayload(input.puckData);
      if (!validation.ok) {
        return { ok: false, reason: "invalid_puck_data", issues: validation.issues };
      }
      values.puckData = validation.payload as unknown as Record<string, unknown>;
    }
  }

  const [row] = await db
    .update(landingPages)
    .set(values)
    .where(and(eq(landingPages.orgId, input.orgId), eq(landingPages.id, input.pageId)))
    .returning();

  if (!row) {
    return { ok: false, reason: "not_found" };
  }

  await emitSeldonEvent("landing.updated", {
    pageId: row.id,
    orgId: input.orgId,
  });

  if (row.status === "published") {
    const [org] = await db
      .select({ slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, input.orgId))
      .limit(1);
    if (org?.slug) {
      revalidatePath(`/l/${org.slug}/${row.slug}`);
    }
  }

  return { ok: true, page: row };
}

export async function publishLandingPageFromApi(params: {
  orgId: string;
  pageId: string;
  published: boolean;
}) {
  const [row] = await db
    .update(landingPages)
    .set({
      status: params.published ? "published" : "draft",
      updatedAt: new Date(),
    })
    .where(and(eq(landingPages.orgId, params.orgId), eq(landingPages.id, params.pageId)))
    .returning({ id: landingPages.id, slug: landingPages.slug });

  if (!row) {
    return { ok: false as const, reason: "not_found" as const };
  }

  const [org] = await db
    .select({ slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, params.orgId))
    .limit(1);
  if (org?.slug) {
    revalidatePath(`/l/${org.slug}/${row.slug}`);
  }

  if (params.published) {
    await emitSeldonEvent("landing.published", {
      pageId: row.id,
      slug: row.slug,
      orgId: params.orgId,
    });
    await dispatchWebhook({
      orgId: params.orgId,
      event: "landing.published",
      payload: { pageId: row.id, slug: row.slug },
    });
  } else {
    await emitSeldonEvent("landing.unpublished", { pageId: row.id, orgId: params.orgId });
  }

  return { ok: true as const, page: row };
}
