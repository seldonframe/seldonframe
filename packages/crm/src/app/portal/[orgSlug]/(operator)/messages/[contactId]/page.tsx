// v1 PWA — SMS thread view (read-focused).
//
// Full conversation with one contact (ascending), scoped to the
// operator workspace. Header shows the contact name + Call/Text
// actions (tap-to-text opens the native composer). In-app reply is a
// fast-follow; v1 reads the thread + bounces to the device SMS app.

import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts, smsMessages } from "@/db/schema";
import { getOperatorSessionForOrg } from "@/lib/operator-portal/auth";
import { contactDisplayName, smsHref, telHref } from "@/lib/operator-portal/mobile-format";

export default async function OperatorThreadPage({
  params,
}: {
  params: Promise<{ orgSlug: string; contactId: string }>;
}) {
  const { orgSlug, contactId } = await params;
  const session = await getOperatorSessionForOrg(orgSlug);
  if (!session) return null;
  const orgId = session.orgId;

  const [contact] = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      phone: contacts.phone,
    })
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId)))
    .limit(1);

  if (!contact) notFound();

  const messages = await db
    .select({
      id: smsMessages.id,
      direction: smsMessages.direction,
      body: smsMessages.body,
      createdAt: smsMessages.createdAt,
    })
    .from(smsMessages)
    .where(and(eq(smsMessages.orgId, orgId), eq(smsMessages.contactId, contactId)))
    .orderBy(asc(smsMessages.createdAt));

  const name = contactDisplayName({
    firstName: contact.firstName,
    lastName: contact.lastName,
    phone: contact.phone,
  });
  const base = `/portal/${orgSlug}`;

  return (
    <section className="flex flex-col">
      <header
        className="sticky top-[57px] z-10 flex items-center gap-3 px-4 py-2.5"
        style={{ backgroundColor: "#FFFFFF", borderBottom: "1px solid #E5E5E1" }}
      >
        <Link href={`${base}/messages`} className="text-[13px]" style={{ color: "#5b21b6" }}>
          ‹ Back
        </Link>
        <p className="min-w-0 flex-1 truncate text-[14px] font-semibold" style={{ color: "#111" }}>
          {name}
        </p>
        {contact.phone ? (
          <div className="flex items-center gap-2">
            <a href={telHref(contact.phone)} className="text-[12px] font-semibold" style={{ color: "#5b21b6" }}>
              Call
            </a>
            <a href={smsHref(contact.phone)} className="text-[12px] font-semibold" style={{ color: "#5b21b6" }}>
              Text
            </a>
          </div>
        ) : null}
      </header>

      <div className="flex flex-col gap-2 px-4 py-4">
        {messages.length === 0 ? (
          <p className="py-10 text-center text-[13px]" style={{ color: "#999" }}>
            No messages in this thread yet.
          </p>
        ) : (
          messages.map((m) => {
            const outbound = m.direction === "outbound";
            return (
              <div
                key={m.id}
                className="max-w-[80%] rounded-2xl px-3 py-2 text-[13px]"
                style={{
                  alignSelf: outbound ? "flex-end" : "flex-start",
                  backgroundColor: outbound ? "#5b21b6" : "#FFFFFF",
                  color: outbound ? "#FFFFFF" : "#111",
                  border: outbound ? "none" : "1px solid #E5E5E1",
                }}
              >
                {m.body}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
