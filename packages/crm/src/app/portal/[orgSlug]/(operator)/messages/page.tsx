// v1 PWA — Messages inbox.
//
// SMS threads grouped by contact (latest message + unread badge),
// most-recent first. Same derivation as the desktop /conversations
// inbox (group sms_messages by contactId; unread = inbound with no
// outbound after), scoped to the operator workspace. Tapping a thread
// opens the read-only thread view.

import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts, smsMessages } from "@/db/schema";
import { getOperatorSessionForOrg } from "@/lib/operator-portal/auth";
import { contactDisplayName, formatRelative } from "@/lib/operator-portal/mobile-format";

function snippet(body: string, max = 64): string {
  const t = body.trim().replace(/\s+/g, " ");
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

export default async function OperatorMessagesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const session = await getOperatorSessionForOrg(orgSlug);
  if (!session) return null;
  const orgId = session.orgId;

  const rows = await db
    .select({
      contactId: smsMessages.contactId,
      direction: smsMessages.direction,
      body: smsMessages.body,
      createdAt: smsMessages.createdAt,
    })
    .from(smsMessages)
    .where(eq(smsMessages.orgId, orgId))
    .orderBy(desc(smsMessages.createdAt))
    .limit(500);

  type Thread = {
    contactId: string;
    lastMessageAt: Date;
    lastMessageBody: string;
    lastDirection: "inbound" | "outbound";
    hasInbound: boolean;
    seenOutbound: boolean;
    unreadCount: number;
  };
  const threadMap = new Map<string, Thread>();
  for (const row of rows) {
    if (!row.contactId) continue;
    const direction = row.direction as "inbound" | "outbound";
    let t = threadMap.get(row.contactId);
    if (!t) {
      t = {
        contactId: row.contactId,
        lastMessageAt: row.createdAt,
        lastMessageBody: row.body,
        lastDirection: direction,
        hasInbound: false,
        seenOutbound: false,
        unreadCount: 0,
      };
      threadMap.set(row.contactId, t);
    }
    if (direction === "inbound") {
      t.hasInbound = true;
      if (!t.seenOutbound) t.unreadCount += 1;
    } else {
      t.seenOutbound = true;
    }
  }

  const candidateIds = Array.from(threadMap.values())
    .filter((t) => t.hasInbound)
    .map((t) => t.contactId);

  const contactRows = candidateIds.length
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

  const threads = candidateIds
    .map((id) => {
      const t = threadMap.get(id)!;
      const c = contactById.get(id) ?? null;
      return {
        ...t,
        name: contactDisplayName({
          firstName: c?.firstName ?? null,
          lastName: c?.lastName ?? null,
          phone: c?.phone ?? null,
        }),
      };
    })
    .sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());

  const base = `/portal/${orgSlug}`;

  return (
    <section className="flex flex-col gap-3 px-4 py-4">
      <header>
        <h1 className="text-[18px] font-semibold tracking-tight" style={{ color: "#111" }}>
          Messages
        </h1>
        <p className="text-[13px]" style={{ color: "#777" }}>
          {threads.length === 0
            ? "No texts yet. Replies land here when a customer texts you."
            : "Two-way SMS with your customers."}
        </p>
      </header>

      {threads.length === 0 ? null : (
        <ul className="overflow-hidden rounded-2xl bg-white" style={{ border: "1px solid #E5E5E1" }}>
          {threads.map((t, i) => (
            <li key={t.contactId} style={{ borderTop: i === 0 ? "none" : "1px solid #EFEFEC" }}>
              <Link href={`${base}/messages/${t.contactId}`} className="flex items-start gap-3 px-4 py-3">
                <div
                  className="flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold"
                  style={{ backgroundColor: "#F0F0EC", color: "#555" }}
                >
                  {t.name.trim().charAt(0).toUpperCase() || "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[14px] font-semibold" style={{ color: "#111" }}>{t.name}</p>
                    <span className="shrink-0 text-[11px]" style={{ color: "#999" }}>
                      {formatRelative(t.lastMessageAt)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-[12px]" style={{ color: "#777" }}>
                      {t.lastDirection === "outbound" ? <span style={{ color: "#AAA" }}>You: </span> : null}
                      {snippet(t.lastMessageBody)}
                    </p>
                    {t.unreadCount > 0 ? (
                      <span
                        className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white"
                        style={{ backgroundColor: "#5b21b6" }}
                      >
                        {t.unreadCount}
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
