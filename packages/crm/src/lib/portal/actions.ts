"use server";

import { and, desc, eq, ilike, isNull, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { emails, portalMessages, portalResources, users } from "@/db/schema";
import { emitSeldonEvent } from "@/lib/events/bus";
import { assertPortalEnabled } from "@/lib/tier/limits";
import { requirePortalSessionForOrg } from "./auth";

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
