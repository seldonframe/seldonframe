import type { EventEnvelope, EventType } from "@seldonframe/core/events";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookings, contacts, deals, emails, landingPages, soulSources } from "@/db/schema";
import { incrementalCompile } from "@/lib/soul-wiki/compile";

type GenericEvent = EventEnvelope<EventType>;

const AUTO_INGEST_EVENT_TYPES = new Set<string>([
  "contact.created",
  "contact.updated",
  "deal.stage_changed",
  "form.submitted",
  "booking.created",
  "booking.completed",
  "booking.cancelled",
  "booking.no_show",
  "email.sent",
  "email.opened",
  "email.clicked",
  "landing.visited",
  "landing.converted",
  "payment.completed",
  "payment.failed",
  "subscription.created",
  "subscription.cancelled",
  "invoice.created",
]);

const MAX_EVENT_SOURCES_PER_ORG = 2000;
const MAX_EVENT_SOURCES_PER_DAY = 120;
const MAX_EVENT_PAYLOAD_CHARS = 12_000;

export async function autoIngestSoulFromEvent(event: GenericEvent) {
  if (!AUTO_INGEST_EVENT_TYPES.has(event.type)) {
    return;
  }

  const orgId = await resolveOrgIdFromEvent(event);
  if (!orgId) {
    return;
  }

  const canIngest = await canIngestEventSource(orgId, event.createdAt);
  if (!canIngest) {
    return;
  }

  const title = buildSourceTitle(event.type, event.createdAt);
  const rawContent = buildRawContent(event);

  const [existing] = await db
    .select({ id: soulSources.id })
    .from(soulSources)
    .where(and(eq(soulSources.orgId, orgId), eq(soulSources.type, "event"), eq(soulSources.title, title)))
    .orderBy(desc(soulSources.createdAt))
    .limit(1);

  if (existing?.id) {
    return;
  }

  const [source] = await db
    .insert(soulSources)
    .values({
      orgId,
      type: "event",
      title,
      rawContent,
      metadata: {
        eventType: event.type,
        createdAt: event.createdAt.toISOString(),
      },
      status: "pending",
    })
    .returning({ id: soulSources.id });

  if (!source?.id) {
    return;
  }

  void incrementalCompile(orgId, source.id).catch(() => {
    return;
  });
}

async function resolveOrgIdFromEvent(event: GenericEvent) {
  const data = readObject(event.data);

  const contactId = readString(data.contactId);
  if (contactId) {
    const [row] = await db.select({ orgId: contacts.orgId }).from(contacts).where(eq(contacts.id, contactId)).limit(1);
    if (row?.orgId) {
      return row.orgId;
    }
  }

  const dealId = readString(data.dealId);
  if (dealId) {
    const [row] = await db.select({ orgId: deals.orgId }).from(deals).where(eq(deals.id, dealId)).limit(1);
    if (row?.orgId) {
      return row.orgId;
    }
  }

  const appointmentId = readString(data.appointmentId);
  if (appointmentId) {
    const [row] = await db.select({ orgId: bookings.orgId }).from(bookings).where(eq(bookings.id, appointmentId)).limit(1);
    if (row?.orgId) {
      return row.orgId;
    }
  }

  const pageId = readString(data.pageId);
  if (pageId) {
    const [row] = await db.select({ orgId: landingPages.orgId }).from(landingPages).where(eq(landingPages.id, pageId)).limit(1);
    if (row?.orgId) {
      return row.orgId;
    }
  }

  const emailId = readString(data.emailId);
  if (emailId) {
    const [row] = await db.select({ orgId: emails.orgId }).from(emails).where(eq(emails.id, emailId)).limit(1);
    if (row?.orgId) {
      return row.orgId;
    }
  }

  return null;
}

function buildSourceTitle(eventType: string, createdAt: Date) {
  const hourBucket = createdAt.toISOString().slice(0, 13);
  return `Event: ${eventType} @ ${hourBucket}:00Z`;
}

function buildRawContent(event: GenericEvent) {
  const payload = truncate(JSON.stringify(event.data ?? {}, null, 2), MAX_EVENT_PAYLOAD_CHARS);

  return [
    `Event Type: ${event.type}`,
    `Occurred At: ${event.createdAt.toISOString()}`,
    "",
    "Event Payload:",
    payload,
  ].join("\n");
}

async function canIngestEventSource(orgId: string, createdAt: Date) {
  const [totalCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(soulSources)
    .where(and(eq(soulSources.orgId, orgId), eq(soulSources.type, "event")));

  if (Number(totalCount?.count ?? 0) >= MAX_EVENT_SOURCES_PER_ORG) {
    return false;
  }

  const dayStart = new Date(createdAt);
  dayStart.setUTCHours(0, 0, 0, 0);

  const [dailyCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(soulSources)
    .where(and(eq(soulSources.orgId, orgId), eq(soulSources.type, "event"), gte(soulSources.createdAt, dayStart)));

  return Number(dailyCount?.count ?? 0) < MAX_EVENT_SOURCES_PER_DAY;
}

function readObject(value: unknown) {
  if (!value || typeof value !== "object") {
    return {} as Record<string, unknown>;
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown) {
  return typeof value === "string" && value ? value : "";
}

function truncate(value: string, max: number) {
  if (value.length <= max) {
    return value;
  }

  return `${value.slice(0, Math.max(0, max - 3))}...`;
}
