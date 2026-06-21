// 2026-06-21 — sendBookingCalendarInvite (owner + customer .ics emission).
//
// All DB + network access is injected via `deps`, so these are pure unit
// tests: a fake `loadInviteData` returns a booking/org/owner, and a fake
// `sendEmail` records every send. We assert:
//   (a) the OWNER receives a dedicated email carrying a text/calendar
//       attachment whose .ics contains the booking UID/time/summary,
//   (b) the CUSTOMER receives the .ics too (attachment on their address),
//   (c) a thrown send error is swallowed — the booking flow is unaffected
//       (soft-fail), and the function still resolves.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  sendBookingCalendarInvite,
  type BookingInviteDeps,
  type InviteData,
} from "../../../src/lib/calendar/booking-invite.ts";

type SentEmail = {
  orgId: string;
  toEmail: string;
  subject: string;
  body: string;
  attachments?: Array<{ filename: string; content: string; contentType?: string }>;
};

const inviteData: InviteData = {
  booking: {
    id: "bk-1",
    title: "Drain cleaning",
    startsAt: new Date("2026-07-01T15:00:00Z"),
    endsAt: new Date("2026-07-01T15:30:00Z"),
    notes: "Gate code 4242",
    location: null,
    customerName: "Pat Lee",
    customerEmail: "pat@example.test",
  },
  org: {
    id: "org-1",
    name: "Acme Plumbing",
    slug: "acme",
    timezone: "America/Chicago",
    fromEmail: "hello@acme.test",
    businessPhone: "(512) 555-0100",
  },
  ownerEmail: "owner@acme.test",
};

function makeDeps(
  overrides: Partial<BookingInviteDeps> = {},
  sink: SentEmail[] = [],
): { deps: BookingInviteDeps; sent: SentEmail[] } {
  const deps: BookingInviteDeps = {
    loadInviteData: async () => inviteData,
    sendEmail: async (p) => {
      sink.push({
        orgId: p.orgId,
        toEmail: p.toEmail,
        subject: p.subject,
        body: p.body,
        attachments: p.attachments,
      });
      return { emailId: "em-1", contactId: null, suppressed: false };
    },
    now: new Date("2026-06-21T12:00:00Z"),
    ...overrides,
  };
  return { deps, sent: sink };
}

function icsOf(e: SentEmail): string {
  assert.ok(e.attachments && e.attachments.length > 0, "email must carry an attachment");
  const ics = Buffer.from(e.attachments![0].content, "base64").toString("utf8");
  return ics;
}

test("sends the OWNER a dedicated email with a text/calendar invite", async () => {
  const { deps, sent } = makeDeps();
  await sendBookingCalendarInvite({ orgId: "org-1", bookingId: "bk-1" }, deps);

  const owner = sent.find((e) => e.toEmail === "owner@acme.test");
  assert.ok(owner, "owner must receive an email");
  assert.ok(owner!.attachments && owner!.attachments.length === 1);
  assert.equal(owner!.attachments![0].filename, "appointment.ics");
  assert.match(owner!.attachments![0].contentType ?? "", /text\/calendar/);

  const ics = icsOf(owner!);
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /UID:booking-bk-1@seldonframe\.com/);
  assert.match(ics, /DTSTART:20260701T150000Z/);
  assert.match(ics, /SUMMARY:Drain cleaning/);
});

test("sends the CUSTOMER the same invite (attachment on their address)", async () => {
  const { deps, sent } = makeDeps();
  await sendBookingCalendarInvite({ orgId: "org-1", bookingId: "bk-1" }, deps);

  const customer = sent.find((e) => e.toEmail === "pat@example.test");
  assert.ok(customer, "customer must receive an email");
  const ics = icsOf(customer!);
  assert.match(ics, /UID:booking-bk-1@seldonframe\.com/);
  assert.match(ics, /ATTENDEE;CN=Pat Lee[^\r\n]*:mailto:pat@example\.test/);
});

test("soft-fails: a thrown send error never propagates", async () => {
  const { deps } = makeDeps({
    sendEmail: async () => {
      throw new Error("resend down");
    },
  });

  // Must resolve without throwing.
  await assert.doesNotReject(
    sendBookingCalendarInvite({ orgId: "org-1", bookingId: "bk-1" }, deps),
  );
});

test("soft-fails: a loader error never propagates (booking flow unaffected)", async () => {
  const { deps } = makeDeps({
    loadInviteData: async () => {
      throw new Error("db hiccup");
    },
  });

  await assert.doesNotReject(
    sendBookingCalendarInvite({ orgId: "org-1", bookingId: "bk-1" }, deps),
  );
});

test("skips the owner send when no owner email resolves (still sends customer)", async () => {
  const { deps, sent } = makeDeps({
    loadInviteData: async () => ({ ...inviteData, ownerEmail: null }),
  });
  await sendBookingCalendarInvite({ orgId: "org-1", bookingId: "bk-1" }, deps);

  assert.ok(!sent.some((e) => e.toEmail === "owner@acme.test"));
  assert.ok(sent.some((e) => e.toEmail === "pat@example.test"));
});

test("skips the customer send when no customer email is present (still sends owner)", async () => {
  const { deps, sent } = makeDeps({
    loadInviteData: async () => ({
      ...inviteData,
      booking: { ...inviteData.booking, customerEmail: null },
    }),
  });
  await sendBookingCalendarInvite({ orgId: "org-1", bookingId: "bk-1" }, deps);

  assert.ok(sent.some((e) => e.toEmail === "owner@acme.test"));
  assert.ok(!sent.some((e) => e.toEmail === "pat@example.test"));
});
