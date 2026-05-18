// 2026-05-18 — /conversations/[contactId] thread view (Slice 4).
//
// Shows the full back-and-forth between this workspace and a single
// contact — inbound + outbound SMS interleaved in chronological order
// — with an inline reply box anchored at the bottom. Pulls from
// sms_messages directly (no dedicated thread table; see the parent
// page header comment for why).
//
// Layout-shape reference: /contacts/[id] header chrome + crm-card
// content.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, Mail, Phone } from "lucide-react";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts, smsMessages } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { ConversationReplyForm } from "@/components/conversations/conversation-reply-form";

type MessageRow = {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
  status: string;
  createdAt: Date;
};

function formatTime(date: Date): string {
  const sameDay =
    new Date().toDateString() === date.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function ConversationThreadPage({
  params,
}: {
  params: Promise<{ contactId: string }>;
}) {
  const { contactId } = await params;

  const orgId = await getOrgId();
  if (!orgId) {
    redirect("/login");
  }

  const [contact] = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      phone: contacts.phone,
    })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.orgId, orgId)))
    .limit(1);

  if (!contact) {
    notFound();
  }

  // Pull last 200 messages for this contact in ascending order so the
  // operator reads top→bottom like a normal messaging app. At v1 scale
  // this is plenty; pagination can land later.
  const messageRows = await db
    .select({
      id: smsMessages.id,
      direction: smsMessages.direction,
      body: smsMessages.body,
      status: smsMessages.status,
      createdAt: smsMessages.createdAt,
    })
    .from(smsMessages)
    .where(and(eq(smsMessages.orgId, orgId), eq(smsMessages.contactId, contactId)))
    .orderBy(desc(smsMessages.createdAt))
    .limit(200);

  const messages: MessageRow[] = messageRows
    .map((row) => ({
      id: row.id,
      direction: row.direction as "inbound" | "outbound",
      body: row.body,
      status: row.status,
      createdAt: row.createdAt,
    }))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const fullName =
    [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() ||
    contact.phone ||
    "Unknown contact";

  return (
    <main className="animate-page-enter flex-1 overflow-auto bg-background">
      <div className="border-b bg-background/60 px-4 pb-1 pt-4 sm:px-6 lg:px-8">
        <Link
          href="/conversations"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-3" />
          Back to Conversations
        </Link>
      </div>

      <div className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
        <header className="crm-card flex items-center gap-4 p-4 sm:p-5">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full border border-border/70 bg-muted/30 text-base font-semibold text-foreground">
            {fullName.charAt(0).toUpperCase() || "?"}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold sm:text-lg">{fullName}</h1>
            <div className="mt-0.5 flex flex-wrap gap-3 text-xs text-muted-foreground">
              {contact.phone ? (
                <span className="inline-flex items-center gap-1">
                  <Phone className="size-3" />
                  {contact.phone}
                </span>
              ) : null}
              {contact.email ? (
                <span className="inline-flex items-center gap-1">
                  <Mail className="size-3" />
                  {contact.email}
                </span>
              ) : null}
            </div>
          </div>
          <Link
            href={`/contacts/${contact.id}`}
            className="shrink-0 rounded-md border border-border/80 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent/40"
          >
            View profile
          </Link>
        </header>

        <article className="crm-card p-4 sm:p-5">
          {messages.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No messages with this contact yet.
            </p>
          ) : (
            <ol className="space-y-3">
              {messages.map((message) => {
                const isOutbound = message.direction === "outbound";
                const failed = message.status === "failed";
                return (
                  <li
                    key={message.id}
                    className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
                        isOutbound
                          ? "bg-primary text-primary-foreground"
                          : "border border-border/70 bg-card text-foreground"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words leading-snug">
                        {message.body}
                      </p>
                      <p
                        className={`mt-1 text-[10px] ${
                          isOutbound
                            ? "text-primary-foreground/70"
                            : "text-muted-foreground"
                        }`}
                      >
                        {formatTime(message.createdAt)}
                        {failed ? " · failed" : null}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </article>

        {contact.phone ? (
          <ConversationReplyForm contactId={contact.id} />
        ) : (
          <article className="crm-card p-4 text-center text-xs text-muted-foreground">
            This contact has no phone number on file. Add a phone to
            <Link href={`/contacts/${contact.id}`} className="ml-1 underline">
              their profile
            </Link>{" "}
            to send an SMS reply.
          </article>
        )}
      </div>
    </main>
  );
}
