// v2 PWA — SMS thread view.
//
// Opens with mark-read (server-side, before first render).
// Shows messages ascending + private notes inline (amber treatment).
// Composer: when outboundSmsEnabled=true → send via sendReplyAction (optimistic).
//           when false → "Texting turns on the moment your A2P is approved." notice.
// "+ Add Note" tab always visible and functional (internal only, never sent).

import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts, smsMessages } from "@/db/schema";
import { requireOperatorSessionForOrg } from "@/lib/operator-portal/auth";
import { listThreadNotes, markThreadRead } from "@/lib/operator-portal/messages";
import { getOutboundSmsEnabled } from "@/lib/operator-portal/outbound-sms-flag";
import { getEffectiveBrandingForWorkspace } from "@/lib/partner-agencies/branding";
import { contactDisplayName, smsHref, telHref } from "@/lib/operator-portal/mobile-format";
import { ThreadViewClient } from "./_components/thread-view-client";

export default async function OperatorThreadPage({
  params,
}: {
  params: Promise<{ orgSlug: string; contactId: string }>;
}) {
  const { orgSlug, contactId } = await params;
  const session = await requireOperatorSessionForOrg(orgSlug);
  const orgId = session.orgId;

  const [contact] = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      phone: contacts.phone,
      email: contacts.email,
    })
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId)))
    .limit(1);

  if (!contact) notFound();

  // Mark all unread inbound as read before rendering (server-side)
  await markThreadRead({ orgId, contactId });

  const [rawMessages, notes, outboundEnabled, branding] = await Promise.all([
    db
      .select({
        id: smsMessages.id,
        direction: smsMessages.direction,
        body: smsMessages.body,
        createdAt: smsMessages.createdAt,
      })
      .from(smsMessages)
      .where(and(eq(smsMessages.orgId, orgId), eq(smsMessages.contactId, contactId)))
      .orderBy(asc(smsMessages.createdAt)),
    listThreadNotes({ orgId, contactId }),
    getOutboundSmsEnabled(orgId),
    getEffectiveBrandingForWorkspace(orgId),
  ]);

  const name = contactDisplayName({
    firstName: contact.firstName,
    lastName: contact.lastName,
    phone: contact.phone,
  });

  const accentColor =
    (branding?.is_white_label && branding.primary_color) || "#5b21b6";
  const base = `/portal/${orgSlug}`;

  const messages = rawMessages.map((m) => ({
    id: m.id,
    direction: m.direction as "inbound" | "outbound",
    body: m.body,
    createdAt: m.createdAt.toISOString(),
  }));

  const threadNotes = notes.map((n) => ({
    id: n.id,
    authorEmail: n.authorEmail,
    body: n.body,
    createdAt: n.createdAt.toISOString(),
  }));

  return (
    <>
      {/* Sticky thread header (server-rendered for fast paint) */}
      <header
        className="sticky top-[57px] z-10 flex items-center gap-3 px-4 py-2.5"
        style={{ backgroundColor: "#FFFFFF", borderBottom: "1px solid #E5E5E1" }}
      >
        <Link
          href={`${base}/messages`}
          className="shrink-0 text-[13px] font-medium"
          style={{ color: accentColor }}
        >
          ‹ Back
        </Link>
        <p className="min-w-0 flex-1 truncate text-[14px] font-semibold" style={{ color: "#111" }}>
          {name}
        </p>
        {contact.phone ? (
          <div className="flex shrink-0 items-center gap-3">
            <a
              href={telHref(contact.phone)}
              className="text-[12px] font-semibold"
              style={{ color: accentColor }}
            >
              Call
            </a>
            <a
              href={smsHref(contact.phone)}
              className="text-[12px] font-semibold"
              style={{ color: accentColor }}
            >
              SMS app
            </a>
          </div>
        ) : null}
      </header>

      <ThreadViewClient
        orgSlug={orgSlug}
        contactId={contactId}
        contactPhone={contact.phone}
        initialMessages={messages}
        initialNotes={threadNotes}
        outboundSmsEnabled={outboundEnabled}
        accentColor={accentColor}
      />
    </>
  );
}
