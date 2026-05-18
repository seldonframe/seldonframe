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
