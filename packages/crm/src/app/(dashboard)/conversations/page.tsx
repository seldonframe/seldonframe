// 2026-05-18 — /conversations inbox list (Slice 4 of messaging-layer plan).
//
// Lists every contact this workspace has had inbound SMS from, sorted
// by most recent activity. Each row links to /conversations/[contactId]
// where the operator sees the full thread + an inline reply box.
//
// Data source: `sms_messages` table directly. NO dedicated thread
// table — we derive threads by grouping on contactId. The plan v2
// proposed customer_threads + customer_messages but sms_messages
// already carries direction + orgId + contactId, so we defer the
// extra tables until we need email threading too (out of scope here).
//
// Unread badge = count of inbound messages with no outbound after
// them. Derived from message order; no read_at column. The badge is
// just decoration; clicking the thread visually marks it read
// (no persistence yet — see [contactId]/page.tsx).

import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts, smsMessages } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { getLabels } from "@/lib/soul/labels";
import { resolveBuilderTelephony } from "@/lib/telephony/config";

type ThreadRow = {
  contactId: string;
  contactName: string | null;
  contactPhone: string;
  lastMessageAt: Date;
  lastMessageBody: string;
  lastMessageDirection: "inbound" | "outbound";
  unreadCount: number;
};

function formatRelative(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

function snippet(body: string, max = 80): string {
  const trimmed = body.trim().replace(/\s+/g, " ");
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export default async function ConversationsPage() {
  const orgId = await getOrgId();
  if (!orgId) {
    redirect("/login");
  }

  const labels = await getLabels();

  // Inbox SMS-gate (2026-07-05): the empty state differs depending on
  // whether a phone is connected at all. No phone ⇒ an actionable CTA to
  // /settings/integrations (the Twilio-connect route) instead of the
  // generic "no messages yet" copy, which would be confusing/dead-end for
  // an operator who hasn't set up texting yet.
  const telephony = await resolveBuilderTelephony(orgId);
  const phoneConnected = telephony.ok;

  // Load all sms_messages for this workspace that are tied to a
  // contact. Ordered by created_at desc so the threads display
  // most-recent-first when we group below.
  const rows = await db
    .select({
      id: smsMessages.id,
      contactId: smsMessages.contactId,
      direction: smsMessages.direction,
      fromNumber: smsMessages.fromNumber,
      toNumber: smsMessages.toNumber,
      body: smsMessages.body,
      createdAt: smsMessages.createdAt,
    })
    .from(smsMessages)
    .where(eq(smsMessages.orgId, orgId))
    .orderBy(desc(smsMessages.createdAt))
    .limit(500);

  // Group into threads. A workspace can have hundreds of contacts;
  // we filter to only those with at least one inbound row so the
  // inbox reflects "people who texted us" rather than every outbound
  // notification we ever sent.
  const threadMap = new Map<
    string,
    {
      contactId: string;
      lastMessageAt: Date;
      lastMessageBody: string;
      lastMessageDirection: "inbound" | "outbound";
      hasInbound: boolean;
      // unread = inbound messages with no outbound after them. Walking
      // the rows in desc order means as soon as we hit the first
      // outbound for a contact, subsequent inbounds are NOT unread.
      seenOutbound: boolean;
      unreadCount: number;
    }
  >();

  for (const row of rows) {
    if (!row.contactId) continue;
    const direction = row.direction as "inbound" | "outbound";
    let thread = threadMap.get(row.contactId);
    if (!thread) {
      thread = {
        contactId: row.contactId,
        lastMessageAt: row.createdAt,
        lastMessageBody: row.body,
        lastMessageDirection: direction,
        hasInbound: false,
        seenOutbound: false,
        unreadCount: 0,
      };
      threadMap.set(row.contactId, thread);
    }
    if (direction === "inbound") {
      thread.hasInbound = true;
      if (!thread.seenOutbound) thread.unreadCount += 1;
    } else {
      thread.seenOutbound = true;
    }
  }

  const candidateContactIds = Array.from(threadMap.values())
    .filter((thread) => thread.hasInbound)
    .map((thread) => thread.contactId);

  // Resolve contact display names + phones in a single round-trip.
  const contactRows =
    candidateContactIds.length > 0
      ? await db
          .select({
            id: contacts.id,
            firstName: contacts.firstName,
            lastName: contacts.lastName,
            phone: contacts.phone,
          })
          .from(contacts)
          .where(eq(contacts.orgId, orgId))
      : [];

  const contactById = new Map(contactRows.map((c) => [c.id, c]));

  const threads: ThreadRow[] = candidateContactIds
    .map((contactId) => {
      const thread = threadMap.get(contactId)!;
      const contact = contactById.get(contactId) ?? null;
      const name = contact
        ? [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim()
        : null;
      return {
        contactId,
        contactName: name && name.length > 0 ? name : null,
        contactPhone: contact?.phone ?? "",
        lastMessageAt: thread.lastMessageAt,
        lastMessageBody: thread.lastMessageBody,
        lastMessageDirection: thread.lastMessageDirection,
        unreadCount: thread.unreadCount,
      };
    })
    .sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());

  return (
    <section className="animate-page-enter space-y-4 p-4 sm:space-y-6 sm:p-6">
      <header>
        <div className="flex items-center gap-2">
          <MessageCircle className="size-5 text-foreground" />
          <h1 className="text-lg sm:text-[22px] font-semibold leading-relaxed text-foreground">
            Conversations
          </h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">
          Two-way SMS threads with your {labels.contact.plural.toLowerCase()}. Replies land
          here when a customer texts your Twilio number.
        </p>
      </header>

      {threads.length === 0 ? (
        <article className="crm-card mx-auto max-w-[480px] p-10 text-center">
          <MessageCircle className="mx-auto mb-4 size-10 text-muted-foreground" />
          {phoneConnected ? (
            <>
              <h3 className="text-base font-semibold tracking-tight">
                No inbound messages yet
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                When a customer texts your Twilio number, their thread will
                show up here. Outbound-only sends (booking confirmations,
                reminders) aren&apos;t listed until a customer replies.
              </p>
            </>
          ) : (
            <>
              <h3 className="text-base font-semibold tracking-tight">
                No phone number connected yet
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Connect a phone number to start texting with{" "}
                {labels.contact.plural.toLowerCase()}.
              </p>
              <Link
                href="/settings/integrations"
                className="crm-button-primary mt-4 inline-flex h-9 items-center px-4 text-xs"
              >
                Connect a phone number to start texting with customers →
              </Link>
            </>
          )}
        </article>
      ) : (
        <ul className="crm-card divide-y divide-border overflow-hidden p-0">
          {threads.map((thread) => (
            <li key={thread.contactId}>
              <Link
                href={`/conversations/${thread.contactId}`}
                className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-accent/40 sm:px-5 sm:py-4"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border/70 bg-muted/30 text-sm font-semibold text-foreground">
                  {(thread.contactName ?? thread.contactPhone ?? "?")
                    .trim()
                    .charAt(0)
                    .toUpperCase() || "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {thread.contactName ?? thread.contactPhone ?? "Unknown"}
                    </p>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {formatRelative(thread.lastMessageAt)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {thread.lastMessageDirection === "outbound" ? (
                        <span className="text-muted-foreground/70">You: </span>
                      ) : null}
                      {snippet(thread.lastMessageBody)}
                    </p>
                    {thread.unreadCount > 0 ? (
                      <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                        {thread.unreadCount}
                      </span>
                    ) : null}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
