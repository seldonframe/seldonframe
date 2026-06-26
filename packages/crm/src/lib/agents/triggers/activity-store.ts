// Event-agent activity — the DB-backed loaders feeding the pure summarizer.
//
// summarizeEventAgentActivity (./activity.ts) is a pure fold over rows from the
// durable sources. THIS module fetches those rows — the only place that touches
// Postgres for the activity feed:
//   • loadAgentSends      — outbound smsMessages + emails tagged
//                           metadata.source like 'agent:%', for this org, newest
//                           first, joined to the contact's name;
//   • loadScheduledSends  — event_agent_scheduled_sends rows for this org, newest
//                           due first, joined to the contact's name;
//   • loadEventAgentActivity — runs both + folds via summarizeEventAgentActivity.
//
// Plain lib module (NOT "use server") — touches the DB directly like the sibling
// run-event-agent-deps.ts, imported only by the server page. Read-only + scoped
// to the org on every query.

import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { contacts } from "@/db/schema/contacts";
import { emails } from "@/db/schema/emails";
import { smsMessages } from "@/db/schema/sms-messages";
import { eventAgentScheduledSends } from "@/db/schema/event-agent-scheduled-sends";
import { deployments } from "@/db/schema/deployments";
import {
  summarizeEventAgentActivity,
  type EventAgentActivityRow,
  type EventAgentSendRow,
  type EventAgentScheduledRow,
} from "./activity";

/** Compose a contact's display name from first/last, or null. */
function joinName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string | null {
  const name = [firstName, lastName]
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean)
    .join(" ");
  return name || null;
}

/** ISO of a sent row's effective time: sentAt ?? createdAt. */
function sentIso(sentAt: Date | null, createdAt: Date): string {
  return (sentAt ?? createdAt).toISOString();
}

/**
 * Resolve the CLIENT this feed belongs to, or null. A deployed agent retargets
 * its outbound sends into the auto-provisioned CLIENT workspace (deployments
 * .clientOrgId), and a `booking.completed` / `lead.created` resolves its orgId
 * from that client org — so when the feed's `orgId` IS a provisioned client
 * workspace, every row in the feed belongs to that one client. We look up the
 * deployment whose `clientOrgId` equals this org and return its `clientName`
 * (most-recently-updated wins if an org somehow has several). When the org is the
 * builder's own workspace (not a client), there's no deployment → null → the rows
 * render "—". Read-only; single indexed lookup per feed (not per row).
 */
export async function resolveClientLabelForOrg(
  orgId: string,
): Promise<string | null> {
  if (!orgId) return null;
  const [row] = await db
    .select({ clientName: deployments.clientName })
    .from(deployments)
    .where(eq(deployments.clientOrgId, orgId))
    .orderBy(desc(deployments.updatedAt))
    .limit(1);
  const name = row?.clientName?.trim();
  return name ? name : null;
}

/**
 * Load the org's agent-tagged outbound sends (both channels), newest first.
 * Filters to rows whose `metadata->>'source'` starts with 'agent:' — i.e. the
 * event-agent path's sends (and Send-test sends, which end ':test'). Left-joins
 * the contact for a display name; falls back to the raw to-address.
 */
export async function loadAgentSends(
  orgId: string,
  limit: number,
  clientLabel: string | null = null,
): Promise<EventAgentSendRow[]> {
  // SMS sends.
  const smsRows = await db
    .select({
      source: sql<string>`${smsMessages.metadata} ->> 'source'`,
      toAddress: smsMessages.toNumber,
      sentAt: smsMessages.sentAt,
      createdAt: smsMessages.createdAt,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
    })
    .from(smsMessages)
    .leftJoin(contacts, eq(smsMessages.contactId, contacts.id))
    .where(
      and(
        eq(smsMessages.orgId, orgId),
        sql`${smsMessages.metadata} ->> 'source' LIKE 'agent:%'`,
      ),
    )
    .orderBy(desc(smsMessages.createdAt))
    .limit(limit);

  // Email sends.
  const emailRows = await db
    .select({
      source: sql<string>`${emails.metadata} ->> 'source'`,
      toAddress: emails.toEmail,
      sentAt: emails.sentAt,
      createdAt: emails.createdAt,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
    })
    .from(emails)
    .leftJoin(contacts, eq(emails.contactId, contacts.id))
    .where(
      and(
        eq(emails.orgId, orgId),
        sql`${emails.metadata} ->> 'source' LIKE 'agent:%'`,
      ),
    )
    .orderBy(desc(emails.createdAt))
    .limit(limit);

  const sends: EventAgentSendRow[] = [
    ...smsRows.map((r) => ({
      source: r.source ?? "",
      channel: "sms" as const,
      contactName: joinName(r.firstName, r.lastName),
      toAddress: r.toAddress,
      clientLabel,
      at: sentIso(r.sentAt, r.createdAt),
    })),
    ...emailRows.map((r) => ({
      source: r.source ?? "",
      channel: "email" as const,
      contactName: joinName(r.firstName, r.lastName),
      toAddress: r.toAddress,
      clientLabel,
      at: sentIso(r.sentAt, r.createdAt),
    })),
  ];
  return sends;
}

/**
 * Load the org's scheduled (F2 deferred) event-agent sends, newest due first.
 * Left-joins the contact for a display name. Carries the status (the summarizer
 * maps pending→scheduled, failed→blocked, …) and lastError (→ blocked detail).
 */
export async function loadScheduledSends(
  orgId: string,
  limit: number,
  clientLabel: string | null = null,
): Promise<EventAgentScheduledRow[]> {
  const rows = await db
    .select({
      agentSkill: eventAgentScheduledSends.agentSkill,
      channel: eventAgentScheduledSends.channel,
      status: eventAgentScheduledSends.status,
      dueAt: eventAgentScheduledSends.dueAt,
      lastError: eventAgentScheduledSends.lastError,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
    })
    .from(eventAgentScheduledSends)
    .leftJoin(contacts, eq(eventAgentScheduledSends.contactId, contacts.id))
    .where(eq(eventAgentScheduledSends.orgId, orgId))
    .orderBy(desc(eventAgentScheduledSends.dueAt))
    .limit(limit);

  return rows.map((r) => ({
    agentSkill: r.agentSkill,
    channel: r.channel,
    contactName: joinName(r.firstName, r.lastName),
    clientLabel,
    status: r.status,
    dueAt: r.dueAt.toISOString(),
    lastError: r.lastError,
  }));
}

/**
 * Load + fold the org's recent event-agent activity into one newest-first feed.
 * Fetches each source capped at `limit` (so the most-recent N per source enter
 * the merge), then summarizeEventAgentActivity caps the merged result at `limit`.
 * Read-only; org-scoped.
 */
export async function loadEventAgentActivity(
  orgId: string,
  limit = 50,
): Promise<EventAgentActivityRow[]> {
  // Resolve the feed's client ONCE (a single indexed deployments lookup), then
  // thread it onto every row — the whole feed shares one client because a single
  // org's outbound rows all belong to that org (the client workspace, when this
  // org is one). The two source loads then carry it onto each row they emit. All
  // three queries run in parallel.
  const clientLabel = await resolveClientLabelForOrg(orgId);
  const [sends, scheduled] = await Promise.all([
    loadAgentSends(orgId, limit, clientLabel),
    loadScheduledSends(orgId, limit, clientLabel),
  ]);
  return summarizeEventAgentActivity({ sends, scheduled }, limit);
}
