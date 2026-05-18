// 2026-05-18 — Seed default outbound message triggers for a new
// workspace (plan v2, slice 2).
//
// Called from run-create-from-url after the workspace is provisioned.
// Idempotent — uses upsert with the unique (org, event, channel, skill)
// index so re-runs are no-ops.
//
// Slice 2 ships one default: booking-confirmation email on
// booking.created. Subsequent slices add SMS confirmation, intake
// auto-reply, booking reminders, etc.

import { db } from "@/db";
import { outboundMessageTriggers } from "@/db/schema";

type DefaultTrigger = {
  eventType: string;
  channel: "email" | "sms";
  skillId: string;
  delayMinutes: number;
};

const DEFAULTS: DefaultTrigger[] = [
  {
    eventType: "booking.created",
    channel: "email",
    skillId: "booking-confirmation",
    delayMinutes: 0,
  },
  // 2026-05-18 — Slice 3 adds the SMS confirmation default. Fires
  // only when the contact has a phone number AND the workspace has
  // Twilio configured; otherwise the dispatcher records status=skipped
  // or status=failed in the audit log (sendSmsFromApi throws on
  // missing config).
  {
    eventType: "booking.created",
    channel: "sms",
    skillId: "booking-confirmation-sms",
    delayMinutes: 0,
  },
  // 2026-05-18 — Slice 7 adds the intake auto-reply (email + SMS)
  // and booking cancellation (email-only) defaults. Cancellation is
  // intentionally email-only — an SMS on the cancellation moment
  // feels intrusive, and the operator can wire an SMS cancellation
  // trigger from the editor on /emails if they want it.
  {
    eventType: "form.submitted",
    channel: "email",
    skillId: "intake-auto-reply",
    delayMinutes: 0,
  },
  {
    eventType: "form.submitted",
    channel: "sms",
    skillId: "intake-auto-reply-sms",
    delayMinutes: 0,
  },
  {
    eventType: "booking.cancelled",
    channel: "email",
    skillId: "booking-cancellation",
    delayMinutes: 0,
  },
  // 2026-05-18 — Slice 6: 24h-before-appointment reminder. The
  // scheduler computes fireAt = startsAt - delayMinutes (so 1440 =
  // 24h before, NOT 24h after the event), enqueues a row in
  // outbound_scheduled_sends, and the /api/cron/outbound-scheduled-sends
  // cron worker picks it up at fire time. If the booking is cancelled
  // before fireAt, the cancellation hook flips the pending row to
  // 'cancelled' so the reminder doesn't fire post-cancellation.
  {
    eventType: "booking.created",
    channel: "email",
    skillId: "booking-reminder-24h",
    delayMinutes: 1440,
  },
];

export async function seedDefaultOutboundTriggers(orgId: string): Promise<void> {
  if (!orgId) return;

  for (const def of DEFAULTS) {
    await db
      .insert(outboundMessageTriggers)
      .values({
        orgId,
        eventType: def.eventType,
        channel: def.channel,
        skillId: def.skillId,
        delayMinutes: def.delayMinutes,
        enabled: true,
      })
      .onConflictDoNothing({
        target: [
          outboundMessageTriggers.orgId,
          outboundMessageTriggers.eventType,
          outboundMessageTriggers.channel,
          outboundMessageTriggers.skillId,
        ],
      });
  }
}
