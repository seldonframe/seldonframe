// src/lib/operator-portal/messages.ts
// NOT "use server" — the "use server" wrapper is messages-actions.ts.
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { contacts, conversationNotes, smsMessages } from "@/db/schema";

// ─── types ────────────────────────────────────────────────────────────────

export type SmsRow = {
  id: string;
  contactId: string | null;
  direction: "inbound" | "outbound";
  body: string;
  createdAt: Date;
  readAt: Date | null;
};

export type InboxThread = {
  contactId: string;
  lastMessageAt: Date;
  lastBody: string;
  lastDirection: "inbound" | "outbound";
  unreadCount: number;
};

export type ThreadNote = {
  id: string;
  authorEmail: string;
  body: string;
  createdAt: Date;
};

// ─── pure core (testable without DB) ──────────────────────────────────────

/**
 * Group SMS rows into inbox threads. Unread = inbound rows where readAt IS NULL.
 * Threads with no inbound messages are excluded (outbound-only = no thread to show).
 * Returns threads sorted most-recent-first by last message time.
 */
export function buildInboxThreads(rows: SmsRow[]): InboxThread[] {
  type ThreadAccum = {
    contactId: string;
    lastMessageAt: Date;
    lastBody: string;
    lastDirection: "inbound" | "outbound";
    hasInbound: boolean;
    unreadCount: number;
  };

  // rows are expected desc by createdAt from the DB query.
  const threadMap = new Map<string, ThreadAccum>();

  for (const row of rows) {
    if (!row.contactId) continue;
    const direction = row.direction;

    let t = threadMap.get(row.contactId);
    if (!t) {
      t = {
        contactId: row.contactId,
        lastMessageAt: row.createdAt,
        lastBody: row.body,
        lastDirection: direction,
        hasInbound: false,
        unreadCount: 0,
      };
      threadMap.set(row.contactId, t);
    }

    if (direction === "inbound") {
      t.hasInbound = true;
      if (row.readAt === null) {
        t.unreadCount += 1;
      }
    }
  }

  return Array.from(threadMap.values())
    .filter((t) => t.hasInbound)
    .sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());
}

// ─── DB-backed functions (not unit-tested; injected in tests via wrappers) ──

export async function getInboxThreads(orgId: string): Promise<InboxThread[]> {
  const rows = await db
    .select({
      id: smsMessages.id,
      contactId: smsMessages.contactId,
      direction: smsMessages.direction,
      body: smsMessages.body,
      createdAt: smsMessages.createdAt,
      readAt: smsMessages.readAt,
    })
    .from(smsMessages)
    .where(eq(smsMessages.orgId, orgId))
    .orderBy(desc(smsMessages.createdAt))
    .limit(500);

  return buildInboxThreads(
    rows.map((r) => ({
      id: r.id,
      contactId: r.contactId,
      direction: r.direction as "inbound" | "outbound",
      body: r.body,
      createdAt: r.createdAt,
      readAt: r.readAt,
    }))
  );
}

/** Mark all unread inbound messages for a contact as read. */
export async function markThreadRead(params: {
  orgId: string;
  contactId: string;
}): Promise<void> {
  await db
    .update(smsMessages)
    .set({ readAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(smsMessages.orgId, params.orgId),
        eq(smsMessages.contactId, params.contactId),
        eq(smsMessages.direction, "inbound"),
        isNull(smsMessages.readAt)
      )
    );
}

export async function listThreadNotes(params: {
  orgId: string;
  contactId: string;
}): Promise<ThreadNote[]> {
  const rows = await db
    .select({
      id: conversationNotes.id,
      authorEmail: conversationNotes.authorEmail,
      body: conversationNotes.body,
      createdAt: conversationNotes.createdAt,
    })
    .from(conversationNotes)
    .where(
      and(
        eq(conversationNotes.orgId, params.orgId),
        eq(conversationNotes.contactId, params.contactId)
      )
    )
    .orderBy(asc(conversationNotes.createdAt));

  return rows;
}

export async function addThreadNote(params: {
  orgId: string;
  contactId: string;
  authorEmail: string;
  body: string;
}): Promise<{ id: string }> {
  const [created] = await db
    .insert(conversationNotes)
    .values({
      orgId: params.orgId,
      contactId: params.contactId,
      authorEmail: params.authorEmail,
      body: params.body.trim(),
    })
    .returning({ id: conversationNotes.id });

  if (!created) throw new Error("Could not create note");
  return { id: created.id };
}
