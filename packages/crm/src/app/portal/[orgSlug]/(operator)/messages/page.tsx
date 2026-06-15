// v2 PWA — Messages inbox.
//
// All/Unread segmented tabs + client-side search (debounced 300ms).
// Thread grouping via getInboxThreads() from messages.ts (readAt-based unread).
// Contact name resolution via contacts table join.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { getOperatorSessionForOrg } from "@/lib/operator-portal/auth";
import { getInboxThreads } from "@/lib/operator-portal/messages";
import { getEffectiveBrandingForWorkspace } from "@/lib/partner-agencies/branding";
import { MessagesClient } from "./_components/messages-client";

export default async function OperatorMessagesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const session = await getOperatorSessionForOrg(orgSlug);
  if (!session) return null;
  const orgId = session.orgId;

  const [threads, branding] = await Promise.all([
    getInboxThreads(orgId),
    getEffectiveBrandingForWorkspace(orgId),
  ]);

  // Resolve contact names for the threads that have inbound messages
  const contactIds = [...new Set(threads.map((t) => t.contactId))];
  const contactRows = contactIds.length
    ? await db
        .select({
          id: contacts.id,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          phone: contacts.phone,
          email: contacts.email,
        })
        .from(contacts)
        .where(eq(contacts.orgId, orgId))
    : [];

  const contactById = new Map(contactRows.map((c) => [c.id, c]));

  const threadItems = threads.map((t) => {
    const c = contactById.get(t.contactId) ?? null;
    const firstName = c?.firstName ?? null;
    const lastName = c?.lastName ?? null;
    const phone = c?.phone ?? null;
    const name =
      [firstName, lastName].filter(Boolean).join(" ").trim() ||
      phone ||
      "Unknown";
    return {
      contactId: t.contactId,
      name,
      initial: name.charAt(0).toUpperCase() || "?",
      lastBody: t.lastBody,
      lastDirection: t.lastDirection,
      lastMessageAt: t.lastMessageAt.toISOString(),
      unreadCount: t.unreadCount,
    };
  });

  const accentColor =
    (branding?.is_white_label && branding.primary_color) || "#5b21b6";
  const base = `/portal/${orgSlug}`;

  return (
    <MessagesClient
      threads={threadItems}
      base={base}
      accentColor={accentColor}
    />
  );
}
