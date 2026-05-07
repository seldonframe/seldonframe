// v1.28.4 — post-booking 24h reminder workflow.
//
// First SF use of Vercel Workflow DevKit. Demonstrates the durable-flow
// pattern for any future scheduled action (post-cancel apology email,
// no-show follow-up, anniversary check-in, etc.).
//
// FLOW
// ----
// 1. submitPublicBookingAction creates a booking row (status='scheduled')
// 2. Fires bookingReminderWorkflow.start(bookingId) — fire-and-forget
// 3. Workflow sleeps until (booking.startsAt - 24h)
// 4. Re-fetches the booking; skips if cancelled/rescheduled to <24h away
// 5. Sends reminder SMS via Twilio (if configured) OR email via Resend
//    (fallback) OR logs and skips (if neither configured)
// 6. Writes activity row to operator's CRM
//
// PHILOSOPHY: this lives ALONGSIDE the existing workflow_runs system
// (which powers /automations archetypes). NOT a rewrite. Vercel Workflows
// is for NEW durable flows where we'd otherwise hand-roll cron + DB
// polling. workflow_runs stays for Soul-integrated rule-based archetypes.
//
// SANDBOX RULES (per Vercel Workflow DevKit):
//   - The workflow function (`"use workflow"`) runs in a sandboxed VM.
//     No fs, no native crypto, no fetch (use `from "workflow"`).
//   - Step functions (`"use step"`) have full Node.js access. ALL the
//     DB queries, SMS sends, etc. live in steps. The workflow function
//     only orchestrates.

import { sleep } from "workflow";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  activities,
  bookings,
  contacts,
  organizations,
  users,
} from "@/db/schema";

// ─── steps (full Node.js access) ──────────────────────────────────────────

type BookingForReminder = {
  id: string;
  orgId: string;
  contactId: string | null;
  fullName: string | null;
  email: string | null;
  startsAt: string; // ISO string (workflow serialization is JSON)
  status: string;
  title: string;
};

async function loadBookingForReminder(
  bookingId: string,
): Promise<BookingForReminder | null> {
  "use step";
  const [row] = await db
    .select({
      id: bookings.id,
      orgId: bookings.orgId,
      contactId: bookings.contactId,
      fullName: bookings.fullName,
      email: bookings.email,
      startsAt: bookings.startsAt,
      status: bookings.status,
      title: bookings.title,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!row) return null;
  return {
    ...row,
    startsAt:
      row.startsAt instanceof Date
        ? row.startsAt.toISOString()
        : String(row.startsAt),
  };
}

type ChannelResult = {
  channel: "sms" | "email" | "skipped";
  reason?: string;
};

async function sendReminder(
  booking: BookingForReminder,
): Promise<ChannelResult> {
  "use step";
  // Lookup workspace integrations to decide which channel to use.
  const [org] = await db
    .select({ integrations: organizations.integrations })
    .from(organizations)
    .where(eq(organizations.id, booking.orgId))
    .limit(1);
  const integrations = (org?.integrations ?? {}) as Record<string, unknown>;
  const hasTwilio = Boolean(
    (integrations.twilio as { authToken?: string } | undefined)?.authToken,
  );
  const hasResend = Boolean(
    (integrations.resend as { apiKey?: string } | undefined)?.apiKey,
  );

  const startsAtDate = new Date(booking.startsAt);
  const dateStr = startsAtDate.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const fullName = booking.fullName ?? "there";
  const messageBody = `Hi ${fullName.split(" ")[0]} — reminder: your ${booking.title} is tomorrow ${dateStr}. Reply STOP to cancel.`;

  // Resolve a userId to anchor the send (lib/sms + lib/emails both
  // require a userId since these are normally operator-initiated).
  const [owner] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.orgId, booking.orgId))
    .limit(1);

  if (hasTwilio && booking.contactId) {
    try {
      // Look up the contact's phone number.
      const [contact] = await db
        .select({ phone: contacts.phone })
        .from(contacts)
        .where(eq(contacts.id, booking.contactId))
        .limit(1);
      if (contact?.phone) {
        const { sendSmsFromApi } = await import("@/lib/sms/api");
        await sendSmsFromApi({
          orgId: booking.orgId,
          userId: owner?.id ?? null,
          contactId: booking.contactId,
          toNumber: contact.phone,
          body: messageBody,
        });
        return { channel: "sms" };
      }
    } catch (err) {
      console.error(
        `[booking-reminder] sms_send_failed bookingId=${booking.id} err=${err instanceof Error ? err.message : String(err)}`,
      );
      // fall through to email
    }
  }

  if (hasResend && booking.email && owner?.id) {
    try {
      const { sendEmailFromApi } = await import("@/lib/emails/api");
      await sendEmailFromApi({
        orgId: booking.orgId,
        userId: owner.id,
        contactId: booking.contactId,
        toEmail: booking.email,
        subject: `Reminder: ${booking.title} tomorrow`,
        body: messageBody,
      });
      return { channel: "email" };
    } catch (err) {
      console.error(
        `[booking-reminder] email_send_failed bookingId=${booking.id} err=${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return {
    channel: "skipped",
    reason: hasTwilio || hasResend ? "send_error" : "no_channel_configured",
  };
}

async function logReminderActivity(input: {
  bookingId: string;
  orgId: string;
  contactId: string | null;
  channel: ChannelResult["channel"];
  reason?: string;
}): Promise<void> {
  "use step";
  // Find a userId to anchor the activity (activities.userId NOT NULL).
  const [owner] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.orgId, input.orgId))
    .limit(1);
  if (!owner?.id) return;
  await db.insert(activities).values({
    orgId: input.orgId,
    userId: owner.id,
    contactId: input.contactId,
    type:
      input.channel === "skipped"
        ? "reminder_skipped"
        : `reminder_sent_${input.channel}`,
    subject:
      input.channel === "skipped"
        ? `Reminder skipped (${input.reason ?? "unknown"})`
        : `24h reminder sent via ${input.channel}`,
    metadata: {
      source: "booking_reminder_workflow",
      bookingId: input.bookingId,
      channel: input.channel,
      reason: input.reason,
    },
    completedAt: new Date(),
  });
}

// ─── workflow (orchestration only — no Node.js APIs) ─────────────────────

export async function bookingReminderWorkflow(bookingId: string) {
  "use workflow";

  // Step 1: load booking
  const booking = await loadBookingForReminder(bookingId);
  if (!booking) {
    return { skipped: "booking_not_found", bookingId };
  }
  if (booking.status !== "scheduled") {
    // Could be pending_payment (booking still awaiting Stripe), cancelled,
    // or completed — no reminder needed.
    return { skipped: "status_not_scheduled", status: booking.status };
  }

  // Compute reminder fire time: 24h before booking start.
  const startsAtMs = new Date(booking.startsAt).getTime();
  const fireAtMs = startsAtMs - 24 * 60 * 60 * 1000;
  const nowMs = Date.now();
  if (fireAtMs <= nowMs) {
    return {
      skipped: "less_than_24h_to_appointment",
      hoursAhead: Math.round((startsAtMs - nowMs) / 3600000),
    };
  }

  // Step 2: durable sleep until the reminder time.
  // Vercel Workflow keeps the workflow paused without burning compute.
  await sleep(new Date(fireAtMs));

  // Step 3: re-fetch the booking AFTER the sleep — could have been
  // cancelled / rescheduled in the meantime.
  const fresh = await loadBookingForReminder(bookingId);
  if (!fresh) {
    return { skipped: "booking_deleted_during_sleep" };
  }
  if (fresh.status !== "scheduled") {
    return {
      skipped: "status_changed_during_sleep",
      newStatus: fresh.status,
    };
  }
  // Also check it didn't get rescheduled to MORE than 24h away.
  const newStartsAtMs = new Date(fresh.startsAt).getTime();
  const newHoursAhead = (newStartsAtMs - Date.now()) / 3600000;
  if (newHoursAhead > 25) {
    return {
      skipped: "rescheduled_further_out",
      newStartsAt: fresh.startsAt,
      hoursAhead: Math.round(newHoursAhead),
    };
  }

  // Step 4: send the reminder.
  const result = await sendReminder(fresh);

  // Step 5: log activity for operator visibility.
  await logReminderActivity({
    bookingId: fresh.id,
    orgId: fresh.orgId,
    contactId: fresh.contactId,
    channel: result.channel,
    reason: result.reason,
  });

  return {
    bookingId: fresh.id,
    delivered: result.channel,
    reason: result.reason,
  };
}
