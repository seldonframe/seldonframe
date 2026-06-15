"use server";

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts, smsMessages } from "@/db/schema";

// NOTE: a `"use server"` module may only export ASYNC functions (and
// types). The two PURE helpers below are exported for unit testing, so
// they MUST stay async (they're trivially async-wrapped) to satisfy
// the check-use-server build gate. Callers `await` them; tests `await`
// them too.

/** Pure: is `date` within the last `days` days relative to `now`?
 *  Async only to satisfy the "use server" export rule. */
export async function isWithinDays(
  date: Date,
  days: number,
  now: Date = new Date(),
): Promise<boolean> {
  const windowStart = now.getTime() - days * 24 * 60 * 60 * 1000;
  return date.getTime() >= windowStart && date.getTime() <= now.getTime();
}

type DirectionRow = { contactId: string | null; direction: "inbound" | "outbound" };

/** Pure: count unread inbound SMS from desc-by-createdAt rows.
 *  Unread = inbound messages with no outbound AFTER them (newer).
 *  Mirrors app/(dashboard)/conversations/page.tsx's thread reduction.
 *  Async only to satisfy the "use server" export rule. */
export async function unreadInboundCountFromRows(
  rows: DirectionRow[],
): Promise<number> {
  const seenOutbound = new Map<string, boolean>();
  let unread = 0;
  for (const row of rows) {
    if (!row.contactId) continue;
    if (row.direction === "inbound") {
      if (!seenOutbound.get(row.contactId)) unread += 1;
    } else {
      seenOutbound.set(row.contactId, true);
    }
  }
  return unread;
}

/** New leads = contacts with status='lead' created in the last 7 days,
 *  scoped to the workspace. Counts in JS over a small filtered set so
 *  we can reuse the pure isWithinDays window logic. */
export async function countNewLeads(orgId: string, days = 7): Promise<number> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ id: contacts.id, createdAt: contacts.createdAt })
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), eq(contacts.status, "lead")));
  let count = 0;
  for (const row of rows) {
    if (row.createdAt >= since) count += 1;
  }
  return count;
}

/** Unread inbound SMS across the workspace. Loads recent sms_messages
 *  desc-by-createdAt (same shape as the conversations inbox) and
 *  reduces via the pure unreadInboundCountFromRows. */
export async function countUnreadInboundSms(orgId: string): Promise<number> {
  const rows = await db
    .select({ contactId: smsMessages.contactId, direction: smsMessages.direction })
    .from(smsMessages)
    .where(eq(smsMessages.orgId, orgId))
    .orderBy(desc(smsMessages.createdAt))
    .limit(500);
  return unreadInboundCountFromRows(
    rows.map((r) => ({
      contactId: r.contactId,
      direction: r.direction as "inbound" | "outbound",
    })),
  );
}
