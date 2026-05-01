"use server";

import { and, count, desc, eq, ilike, isNull, ne, or, gt, lte, asc } from "drizzle-orm";
import { db } from "@/db";
import {
  bookings,
  deals,
  emails,
  pipelines,
  portalMessages,
  portalResources,
  users,
} from "@/db/schema";
import { emitSeldonEvent } from "@/lib/events/bus";
import { assertPortalEnabled } from "@/lib/tier/limits";
import { requirePortalSessionForOrg } from "./auth";

type PortalSession = Awaited<ReturnType<typeof requirePortalSessionForOrg>>;

export async function getUnreadPortalMessageCount(session: PortalSession) {
  await assertPortalEnabled(session.orgId);

  const [row] = await db
    .select({ value: count() })
    .from(portalMessages)
    .where(
      and(
        eq(portalMessages.orgId, session.orgId),
        eq(portalMessages.contactId, session.contact.id),
        ne(portalMessages.senderType, "client"),
        isNull(portalMessages.readAt)
      )
    );

  return row?.value ?? 0;
}

export async function listPortalMessages(orgSlug: string, search?: string) {
  const session = await requirePortalSessionForOrg(orgSlug);

  await assertPortalEnabled(session.orgId);

  await db
    .update(portalMessages)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(portalMessages.orgId, session.orgId),
        eq(portalMessages.contactId, session.contact.id),
        ne(portalMessages.senderType, "client"),
        isNull(portalMessages.readAt)
      )
    );

  const searchTerm = (search ?? "").trim();

  if (searchTerm) {
    return db
      .select()
      .from(portalMessages)
      .where(
        and(
          eq(portalMessages.orgId, session.orgId),
          eq(portalMessages.contactId, session.contact.id),
          or(ilike(portalMessages.subject, `%${searchTerm}%`), ilike(portalMessages.body, `%${searchTerm}%`))
        )
      )
      .orderBy(desc(portalMessages.isPinned), desc(portalMessages.pinnedAt), desc(portalMessages.createdAt));
  }

  return db
    .select()
    .from(portalMessages)
    .where(and(eq(portalMessages.orgId, session.orgId), eq(portalMessages.contactId, session.contact.id)))
    .orderBy(desc(portalMessages.isPinned), desc(portalMessages.pinnedAt), desc(portalMessages.createdAt));
}

export async function sendPortalMessageAction(orgSlug: string, formData: FormData) {
  const session = await requirePortalSessionForOrg(orgSlug);

  await assertPortalEnabled(session.orgId);

  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const attachmentUrl = String(formData.get("attachmentUrl") ?? "").trim() || null;
  const attachmentName = String(formData.get("attachmentName") ?? "").trim() || null;

  if (!body) {
    throw new Error("Message body is required");
  }

  const [created] = await db
    .insert(portalMessages)
    .values({
      orgId: session.orgId,
      contactId: session.contact.id,
      senderType: "client",
      senderName: `${session.contact.firstName} ${session.contact.lastName ?? ""}`.trim(),
      subject: subject || null,
      body,
      attachmentUrl,
      attachmentName,
    })
    .returning({ id: portalMessages.id });

  if (created?.id) {
    await emitSeldonEvent("portal.message_sent", {
      contactId: session.contact.id,
      messageId: created.id,
    }, { orgId: session.orgId });
  }

  const [owner] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(and(eq(users.orgId, session.orgId), eq(users.role, "owner")))
    .limit(1);

  if (owner?.email) {
    await db.insert(emails).values({
      orgId: session.orgId,
      contactId: session.contact.id,
      userId: owner.id,
      provider: "manual",
      fromEmail: "portal@seldonframe.local",
      toEmail: owner.email,
      subject: `New portal message${subject ? `: ${subject}` : ""}`,
      bodyText: body,
      bodyHtml: `<p>${body}</p>`,
      status: "queued",
      metadata: {
        source: "portal",
        attachmentUrl,
        attachmentName,
      },
    });
  }
}

export async function togglePortalMessagePinAction(orgSlug: string, messageId: string, pinned: boolean) {
  const session = await requirePortalSessionForOrg(orgSlug);

  await assertPortalEnabled(session.orgId);

  await db
    .update(portalMessages)
    .set({
      isPinned: pinned ? "true" : "false",
      pinnedAt: pinned ? new Date() : null,
    })
    .where(and(eq(portalMessages.orgId, session.orgId), eq(portalMessages.contactId, session.contact.id), eq(portalMessages.id, messageId)));
}

export async function listPortalResources(orgSlug: string) {
  const session = await requirePortalSessionForOrg(orgSlug);

  await assertPortalEnabled(session.orgId);

  return db
    .select()
    .from(portalResources)
    .where(and(eq(portalResources.orgId, session.orgId), eq(portalResources.contactId, session.contact.id)));
}

/**
 * May 1, 2026 — Client Portal V1: Pipeline page.
 *
 * List deals scoped to the authenticated contact + their workspace's
 * default pipeline. Read-only — clients see progress but can't move
 * cards (admin operators do that on the dashboard side).
 *
 * Returns the deals plus the pipeline's stage definitions so the page
 * can group cards by stage even when no deals exist yet.
 */
export async function listPortalDeals(orgSlug: string) {
  const session = await requirePortalSessionForOrg(orgSlug);
  await assertPortalEnabled(session.orgId);

  const contactDeals = await db
    .select()
    .from(deals)
    .where(and(eq(deals.orgId, session.orgId), eq(deals.contactId, session.contact.id)))
    .orderBy(desc(deals.updatedAt));

  // Pull the workspace's default pipeline so stage names render even
  // when this contact has zero deals yet (the page shows the kanban
  // shell with empty columns instead of a generic "no deals" wall).
  const [pipeline] = await db
    .select({ id: pipelines.id, stages: pipelines.stages })
    .from(pipelines)
    .where(and(eq(pipelines.orgId, session.orgId), eq(pipelines.isDefault, true)))
    .limit(1);

  return {
    deals: contactDeals,
    stages: pipeline?.stages ?? [],
  };
}

/**
 * May 1, 2026 — Client Portal V1: Bookings page.
 *
 * Returns upcoming + past bookings scoped to the authenticated contact.
 * The page renders them as two distinct lists (upcoming above, past
 * below). Cancelled / no-show bookings appear in the past list with
 * muted status badges.
 */
export async function listPortalBookings(orgSlug: string) {
  const session = await requirePortalSessionForOrg(orgSlug);
  await assertPortalEnabled(session.orgId);

  const now = new Date();

  const [upcoming, past] = await Promise.all([
    db
      .select()
      .from(bookings)
      .where(
        and(
          eq(bookings.orgId, session.orgId),
          eq(bookings.contactId, session.contact.id),
          gt(bookings.startsAt, now)
        )
      )
      .orderBy(asc(bookings.startsAt)),
    db
      .select()
      .from(bookings)
      .where(
        and(
          eq(bookings.orgId, session.orgId),
          eq(bookings.contactId, session.contact.id),
          lte(bookings.startsAt, now)
        )
      )
      .orderBy(desc(bookings.startsAt)),
  ]);

  return { upcoming, past };
}

export async function markPortalResourceViewedAction(orgSlug: string, resourceId: string) {
  const session = await requirePortalSessionForOrg(orgSlug);

  await assertPortalEnabled(session.orgId);

  const [resource] = await db
    .update(portalResources)
    .set({ viewedAt: new Date() })
    .where(
      and(
        eq(portalResources.orgId, session.orgId),
        eq(portalResources.contactId, session.contact.id),
        eq(portalResources.id, resourceId),
        isNull(portalResources.viewedAt)
      )
    )
    .returning({ id: portalResources.id });

  if (resource?.id) {
    await emitSeldonEvent("portal.resource_viewed", {
      contactId: session.contact.id,
      resourceId: resource.id,
    }, { orgId: session.orgId });
  }
}
