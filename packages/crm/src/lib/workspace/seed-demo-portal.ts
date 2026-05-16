// v1.55.x — Seed ONE contact + ONE upcoming booking + ONE message
// thread at workspace-creation time so operators can demo the client
// portal to a prospect without going through magic-link auth.
//
// The demo contact carries tag '__demo__' so it can be filtered out
// of operator-facing CRM lists (see lib/contacts/actions.ts). The
// /customer/<slug>/demo route looks up THIS contact by tag and signs
// a portal session for it — one-click prospect demo.
//
// Soft-fail throughout: any error logs but never throws. Workspace
// creation must NEVER block on this seed. The /demo route gracefully
// falls back to /login when the contact is absent (covers both
// pre-v1.55 workspaces and any soft-failed seeds).
//
// This module exports a pure shape builder (buildDemoSeedShape) so
// tests can verify the row shapes without a live DB, plus the I/O
// wrapper (seedDemoPortalContent) called by v2/complete.

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { bookings, contacts, organizations, portalMessages } from "@/db/schema";

/** Tag marker. Filterable via `'__demo__' = ANY(tags)` in operator
 *  CRM list queries. NOT for end-user display — pure plumbing. */
export const DEMO_CONTACT_TAG = "__demo__";

export interface SeedDemoPortalInput {
  orgId: string;
  businessName: string;
  /** Workspace IANA timezone (organizations.timezone). Used to anchor
   *  tomorrow 10:00 in the operator's timezone, not UTC. */
  timezone: string;
  /** Workspace slug — used in the demo contact's email (which has a
   *  partial unique index on (org_id, lower(email))) so multiple demo
   *  workspaces don't collide. */
  orgSlug: string;
}

export interface DemoSeedShape {
  contact: {
    orgId: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    status: string;
    source: string;
    tags: string[];
    portalAccessEnabled: boolean;
  };
  /** Optional welcome message FROM the business TO the demo contact. */
  message: {
    senderType: string;
    senderName: string;
    subject: string;
    body: string;
  };
  /** Optional booking — only inserted when an appointment template
   *  exists for the org. Times are computed at insert time (need a
   *  Date with the right Timezone offset), not in the shape builder. */
  booking: {
    title: string;
    notes: string;
    status: string;
    provider: string;
  };
}

/**
 * Pure shape builder — no I/O. The booking startsAt/endsAt are
 * computed at the call site (need an actual Date with the workspace's
 * timezone applied). Tests use this to verify the values that don't
 * depend on timestamps.
 */
export function buildDemoSeedShape(input: SeedDemoPortalInput): DemoSeedShape {
  return {
    contact: {
      orgId: input.orgId,
      firstName: "Demo",
      lastName: "Customer",
      email: `demo+${input.orgSlug}@example.com`,
      phone: "+15555550199",
      status: "active",
      source: "demo",
      tags: [DEMO_CONTACT_TAG],
      portalAccessEnabled: true,
    },
    message: {
      senderType: "operator",
      senderName: input.businessName,
      subject: `Welcome to ${input.businessName}`,
      body:
        `Hi Demo Customer — this is a sample message thread your real ` +
        `customers will see in the portal. You can reply, attach documents, ` +
        `and view upcoming appointments here. Let us know if you have questions!`,
    },
    booking: {
      title: "Sample appointment",
      notes:
        "Sample demo booking — visible only when viewing the portal as the demo customer.",
      status: "confirmed",
      provider: "manual",
    },
  };
}

/**
 * Compute tomorrow at 10:00 (and 11:00) in the workspace timezone.
 *
 * Approach: build a UTC Date for "tomorrow at 10:00 UTC", then
 * subtract the workspace's UTC offset at that local time. This is
 * pragmatic, not perfect — DST transitions over the next 24h could
 * shift the displayed time by an hour. For a demo seed that's fine
 * (the operator only needs "an upcoming time roughly tomorrow morning"
 * to make the portal look populated). If precision becomes important
 * later, swap to Temporal or a tz lib.
 *
 * Exported for unit tests.
 */
export function buildTomorrowMorningRange(
  now: Date,
  timezone: string,
): { startsAt: Date; endsAt: Date } {
  // Day after `now`, in UTC.
  const tomorrow = new Date(now.getTime());
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  // Anchor at 10:00 UTC, then shift by the local offset for `timezone`.
  const utcMorning = new Date(
    Date.UTC(
      tomorrow.getUTCFullYear(),
      tomorrow.getUTCMonth(),
      tomorrow.getUTCDate(),
      10,
      0,
      0,
      0,
    ),
  );

  // Find the named-zone offset at utcMorning using Intl. Returns a
  // string like "GMT-04:00" we parse to minutes.
  let offsetMinutes = 0;
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "longOffset",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
    });
    const parts = fmt.formatToParts(utcMorning);
    const tz = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(tz);
    if (match) {
      const sign = match[1] === "-" ? -1 : 1;
      const hours = parseInt(match[2], 10);
      const minutes = match[3] ? parseInt(match[3], 10) : 0;
      offsetMinutes = sign * (hours * 60 + minutes);
    }
  } catch {
    // Unknown timezone → fall back to UTC. Demo seed; not a hard error.
    offsetMinutes = 0;
  }

  // utcMorning is "10:00 UTC for tomorrow." To make it "10:00 local
  // for that timezone," subtract the offset (a +5 timezone is 5h
  // ahead of UTC, so local 10:00 is UTC 05:00 — subtract 5h).
  const startsAt = new Date(utcMorning.getTime() - offsetMinutes * 60_000);
  const endsAt = new Date(startsAt.getTime() + 60 * 60_000);

  return { startsAt, endsAt };
}

export interface SeedDemoPortalResult {
  ok: boolean;
  contactId: string | null;
  bookingId: string | null;
  messageId: string | null;
  /** Present when ok === false OR when a sub-step was skipped. */
  reason?: string;
}

/**
 * I/O wrapper — inserts the demo contact + welcome message, and the
 * sample booking when a booking template exists for the org. Logs
 * `demo_portal_seeded` on success.
 *
 * SOFT-FAIL: never throws. Callers (v2/complete) treat a failed seed
 * as "the operator can still ship the workspace; they just can't
 * one-click the portal demo." That's an acceptable degraded state.
 */
export async function seedDemoPortalContent(
  input: SeedDemoPortalInput,
): Promise<SeedDemoPortalResult> {
  const shape = buildDemoSeedShape(input);

  let contactId: string | null = null;
  let bookingId: string | null = null;
  let messageId: string | null = null;

  try {
    // 1. Insert the demo contact.
    const [insertedContact] = await db
      .insert(contacts)
      .values(shape.contact)
      .returning({ id: contacts.id });

    if (!insertedContact?.id) {
      return {
        ok: false,
        contactId: null,
        bookingId: null,
        messageId: null,
        reason: "contact_insert_returned_no_id",
      };
    }
    contactId = insertedContact.id;

    // 2. Insert the welcome message thread (always — independent of
    //    booking template availability).
    const [insertedMessage] = await db
      .insert(portalMessages)
      .values({
        orgId: input.orgId,
        contactId,
        senderType: shape.message.senderType,
        senderName: shape.message.senderName,
        subject: shape.message.subject,
        body: shape.message.body,
      })
      .returning({ id: portalMessages.id });
    messageId = insertedMessage?.id ?? null;

    // 3. Fetch the first booking template for the org. The booking
    //    schema doesn't have a separate appointment_types table — the
    //    bookings table itself holds templates (status: "template")
    //    keyed by bookingSlug. The demo booking references the
    //    template by bookingSlug.
    const [bookingTemplate] = await db
      .select({
        bookingSlug: bookings.bookingSlug,
        title: bookings.title,
      })
      .from(bookings)
      .where(and(eq(bookings.orgId, input.orgId), eq(bookings.status, "template")))
      .limit(1);

    if (bookingTemplate) {
      const { startsAt, endsAt } = buildTomorrowMorningRange(new Date(), input.timezone);
      const [insertedBooking] = await db
        .insert(bookings)
        .values({
          orgId: input.orgId,
          contactId,
          title: bookingTemplate.title || shape.booking.title,
          bookingSlug: bookingTemplate.bookingSlug,
          fullName: `${shape.contact.firstName} ${shape.contact.lastName}`,
          email: shape.contact.email,
          notes: shape.booking.notes,
          provider: shape.booking.provider,
          status: shape.booking.status,
          startsAt,
          endsAt,
        })
        .returning({ id: bookings.id });
      bookingId = insertedBooking?.id ?? null;
    }

    console.warn(
      JSON.stringify({
        event: "demo_portal_seeded",
        workspace_id: input.orgId,
        contact_id: contactId,
        booking_id: bookingId,
        message_id: messageId,
        booking_skipped: !bookingTemplate,
      }),
    );

    return {
      ok: true,
      contactId,
      bookingId,
      messageId,
      ...(bookingTemplate ? {} : { reason: "no_booking_template_for_org" }),
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(
      JSON.stringify({
        event: "demo_portal_seed_failed",
        workspace_id: input.orgId,
        reason,
      }),
    );
    return {
      ok: false,
      contactId,
      bookingId,
      messageId,
      reason,
    };
  }
}

/** Convenience: load businessName + slug + timezone from the org row
 *  and seed in one call. Used by v2/complete. */
export async function seedDemoPortalContentForOrg(args: {
  orgId: string;
}): Promise<SeedDemoPortalResult> {
  const [org] = await db
    .select({
      name: organizations.name,
      slug: organizations.slug,
      timezone: organizations.timezone,
    })
    .from(organizations)
    .where(eq(organizations.id, args.orgId))
    .limit(1);

  if (!org) {
    return {
      ok: false,
      contactId: null,
      bookingId: null,
      messageId: null,
      reason: "org_not_found",
    };
  }

  return seedDemoPortalContent({
    orgId: args.orgId,
    businessName: org.name,
    timezone: org.timezone ?? "UTC",
    orgSlug: org.slug,
  });
}

/** Returns the demo contact for an org if one exists, otherwise null.
 *  Used by /customer/<slug>/demo route to find the contact whose
 *  session it should sign. */
export async function findDemoContactForOrg(orgId: string) {
  const [contact] = await db
    .select({
      id: contacts.id,
      email: contacts.email,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      portalAccessEnabled: contacts.portalAccessEnabled,
    })
    .from(contacts)
    .where(
      and(
        eq(contacts.orgId, orgId),
        sql`${DEMO_CONTACT_TAG} = ANY(${contacts.tags})`,
        eq(contacts.portalAccessEnabled, true),
      ),
    )
    .limit(1);
  return contact ?? null;
}
