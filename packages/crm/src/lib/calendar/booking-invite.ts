// 2026-06-21 — Emit an RFC-5545 calendar invite (.ics) when a booking is
// created, so the appointment lands in the WORKSPACE OWNER's real calendar
// (the core "it's in my calendar" win) and the customer's — zero OAuth,
// zero schema change.
//
// Design:
//   - The pure .ics is built by lib/calendar/build-ics.ts (injected clock).
//   - This module assembles the BookingICSInput from the booking + org +
//     owner, base64-encodes the .ics as a text/calendar attachment, and
//     sends TWO dedicated emails: one to the owner, one to the customer.
//   - DEDICATED emails (not the existing LLM-composed confirmation): the
//     customer confirmation is gated by triggers / suppression / deployed-
//     agent ownership (lib/messaging/dispatch.ts), so threading the .ics
//     there is fragile and could silently drop the invite. A dedicated
//     send guarantees delivery and leaves the existing confirmation/SMS
//     path byte-for-byte untouched.
//   - SOFT-FAIL: the whole thing is wrapped in try/catch. A build or send
//     failure must NEVER break the booking or the existing confirmation
//     email/SMS. The default sender (sendEmailFromApi) is itself
//     suppression-aware and resolves the workspace Resend creds; if email
//     isn't configured it throws, which we swallow.
//
// Owner-email resolution (default impl):
//   organizations.ownerId → users.email, falling back to the active
//   memberships.email for the org. If neither resolves, the owner send is
//   skipped (logged) — the customer still gets their invite.

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, memberships, organizations, users } from "@/db/schema";
import { sendEmailFromApi, type ApiSendEmailResult } from "@/lib/emails/api";
import { resolveDefaultFromEmail } from "@/lib/emails/providers";
import type { OrgSoul } from "@/lib/soul/types";
import { buildBookingICS } from "./build-ics";

const CALENDAR_CONTENT_TYPE = "text/calendar; method=REQUEST";
const ICS_FILENAME = "appointment.ics";

/** Normalised data the invite needs. Injected in tests; loaded from the DB
 *  in production via the default `loadInviteData`. */
export type InviteData = {
  booking: {
    id: string;
    title: string;
    startsAt: Date;
    endsAt: Date;
    notes: string | null;
    location: string | null;
    customerName: string | null;
    customerEmail: string | null;
  };
  org: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
    /** The workspace's outbound sender address — used as ORGANIZER email. */
    fromEmail: string;
    businessPhone: string | null;
  };
  /** Workspace owner's email — the calendar this is FOR. Null → skip owner. */
  ownerEmail: string | null;
};

type SendEmailFn = (params: {
  orgId: string;
  userId: string | null;
  contactId: string | null;
  toEmail: string;
  subject: string;
  body: string;
  attachments?: Array<{ filename: string; content: string; contentType?: string }>;
}) => Promise<ApiSendEmailResult>;

export type BookingInviteDeps = {
  /** Load + normalise the booking/org/owner. Returns null if not found. */
  loadInviteData: (orgId: string, bookingId: string) => Promise<InviteData | null>;
  /** Send one email. Defaults to sendEmailFromApi (suppression-aware). */
  sendEmail: SendEmailFn;
  /** DTSTAMP clock. Injected in tests; new Date() in prod. */
  now: Date;
};

export type SendBookingCalendarInviteInput = {
  orgId: string;
  bookingId: string;
};

/**
 * Default DB-backed loader. Resolves the booking row, the org (name, slug,
 * timezone, sender email, soul phone), and the owner email.
 */
async function defaultLoadInviteData(
  orgId: string,
  bookingId: string,
): Promise<InviteData | null> {
  const [bookingRow] = await db
    .select({
      id: bookings.id,
      title: bookings.title,
      startsAt: bookings.startsAt,
      endsAt: bookings.endsAt,
      notes: bookings.notes,
      meetingUrl: bookings.meetingUrl,
      fullName: bookings.fullName,
      email: bookings.email,
      contactEmail: bookings.email,
    })
    .from(bookings)
    .where(and(eq(bookings.id, bookingId), eq(bookings.orgId, orgId)))
    .limit(1);
  if (!bookingRow) return null;

  const [orgRow] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      timezone: organizations.timezone,
      ownerId: organizations.ownerId,
      soul: organizations.soul,
      integrations: organizations.integrations,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!orgRow) return null;

  // Sender / ORGANIZER email: prefer the workspace's configured Resend
  // fromEmail, else the platform default. (decryptValue not needed — we
  // only read the address, never the key.)
  const integrations = (orgRow.integrations ?? {}) as {
    resend?: { fromEmail?: string };
  };
  const fromEmail =
    integrations.resend?.fromEmail?.trim() || resolveDefaultFromEmail();

  // Business phone off the soul (snake + camel variants), same shape the
  // email branding + render-vars use.
  const soulRaw = (orgRow.soul ?? {}) as unknown as Record<string, unknown>;
  const businessPhone =
    typeof soulRaw.phone === "string" && soulRaw.phone.trim()
      ? soulRaw.phone.trim()
      : null;

  // Owner email: ownerId → users.email, else the active membership email.
  let ownerEmail: string | null = null;
  if (orgRow.ownerId) {
    const [ownerUser] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, orgRow.ownerId))
      .limit(1);
    ownerEmail = ownerUser?.email?.trim() || null;
  }
  if (!ownerEmail) {
    const [member] = await db
      .select({ email: memberships.email })
      .from(memberships)
      .where(and(eq(memberships.orgId, orgId), eq(memberships.status, "active")))
      .limit(1);
    ownerEmail = member?.email?.trim() || null;
  }

  return {
    booking: {
      id: bookingRow.id,
      title: bookingRow.title,
      startsAt: bookingRow.startsAt,
      endsAt: bookingRow.endsAt,
      notes: bookingRow.notes ?? null,
      location: bookingRow.meetingUrl ?? null,
      customerName: bookingRow.fullName ?? null,
      customerEmail: bookingRow.email ?? null,
    },
    org: {
      id: orgRow.id,
      name: orgRow.name,
      slug: orgRow.slug,
      timezone: orgRow.timezone || "UTC",
      fromEmail,
      businessPhone,
    },
    ownerEmail,
  };
}

const defaultDeps: BookingInviteDeps = {
  loadInviteData: defaultLoadInviteData,
  sendEmail: sendEmailFromApi,
  now: new Date(),
};

/** Human date for the email prose, in the workspace timezone. */
function formatLocal(d: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

/**
 * Build + send the calendar invite for a created booking to the owner and
 * the customer. Never throws (soft-fail). Returns void.
 */
export async function sendBookingCalendarInvite(
  input: SendBookingCalendarInviteInput,
  deps: BookingInviteDeps = defaultDeps,
): Promise<void> {
  try {
    const data = await deps.loadInviteData(input.orgId, input.bookingId);
    if (!data) {
      console.warn(
        JSON.stringify({
          event: "calendar_invite.skipped",
          reason: "no_invite_data",
          orgId: input.orgId,
          bookingId: input.bookingId,
        }),
      );
      return;
    }

    const { booking, org, ownerEmail } = data;

    const summary =
      booking.title && booking.title.trim()
        ? booking.title.trim()
        : `Appointment — ${org.name}`;

    const whenLocal = formatLocal(booking.startsAt, org.timezone);
    const descriptionParts = [
      `Appointment with ${org.name}.`,
      `When: ${whenLocal} (${org.timezone}).`,
    ];
    if (booking.customerName) descriptionParts.push(`Customer: ${booking.customerName}`);
    if (booking.notes && booking.notes.trim()) descriptionParts.push(`Notes: ${booking.notes.trim()}`);
    if (org.businessPhone) descriptionParts.push(`Phone: ${org.businessPhone}`);
    const description = descriptionParts.join("\n");

    const ics = buildBookingICS({
      uid: `booking-${booking.id}@seldonframe.com`,
      start: booking.startsAt,
      end: booking.endsAt,
      now: deps.now,
      summary,
      description,
      location: booking.location ?? undefined,
      organizerName: org.name,
      organizerEmail: org.fromEmail,
      attendeeName: booking.customerName ?? undefined,
      attendeeEmail: booking.customerEmail ?? undefined,
      method: "REQUEST",
      sequence: 0,
    });

    const attachment = {
      filename: ICS_FILENAME,
      content: Buffer.from(ics, "utf8").toString("base64"),
      contentType: CALENDAR_CONTENT_TYPE,
    };

    // OWNER side (priority): a dedicated "new booking — added to your
    // calendar" email. Each send is independently guarded so one failure
    // doesn't block the other recipient.
    if (ownerEmail) {
      try {
        await deps.sendEmail({
          orgId: org.id,
          userId: null,
          contactId: null,
          toEmail: ownerEmail,
          subject: `New booking: ${summary} — ${whenLocal}`,
          body: [
            `You have a new booking.`,
            ``,
            `${summary}`,
            `${whenLocal} (${org.timezone})`,
            booking.customerName ? `Customer: ${booking.customerName}` : ``,
            booking.customerEmail ? `Email: ${booking.customerEmail}` : ``,
            ``,
            `The calendar invite is attached — open it to add this appointment to your calendar.`,
          ]
            .filter((l) => l !== ``)
            .join("\n"),
          attachments: [attachment],
        });
      } catch (err) {
        console.warn(
          JSON.stringify({
            event: "calendar_invite.owner_send_failed",
            orgId: org.id,
            bookingId: booking.id,
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      }
    } else {
      console.warn(
        JSON.stringify({
          event: "calendar_invite.owner_skipped",
          reason: "no_owner_email",
          orgId: org.id,
          bookingId: booking.id,
        }),
      );
    }

    // CUSTOMER side: a dedicated "add to your calendar" email with the same
    // invite. Independent of the existing LLM confirmation (which still
    // fires via the messaging dispatcher).
    if (booking.customerEmail) {
      try {
        await deps.sendEmail({
          orgId: org.id,
          userId: null,
          contactId: null,
          toEmail: booking.customerEmail,
          subject: `Add to your calendar: ${summary}`,
          body: [
            booking.customerName ? `Hi ${booking.customerName},` : `Hi there,`,
            ``,
            `Your appointment with ${org.name} is confirmed:`,
            `${summary}`,
            `${whenLocal} (${org.timezone})`,
            ``,
            `The calendar invite is attached — open it to add this to your calendar.`,
            org.businessPhone ? `Questions? Call ${org.businessPhone}.` : ``,
            ``,
            `— ${org.name}`,
          ]
            .filter((l) => l !== ``)
            .join("\n"),
          attachments: [attachment],
        });
      } catch (err) {
        console.warn(
          JSON.stringify({
            event: "calendar_invite.customer_send_failed",
            orgId: org.id,
            bookingId: booking.id,
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      }
    }
  } catch (err) {
    // Outermost soft-fail: nothing here may break the booking or the
    // existing confirmation/SMS.
    console.warn(
      JSON.stringify({
        event: "calendar_invite.failed",
        orgId: input.orgId,
        bookingId: input.bookingId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}
