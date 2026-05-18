// 2026-05-18 — Outbound message dispatcher (plan v2, slice 2).
//
// Called from the event-bus listener when a matching event fires
// (booking.created, intake.submitted, etc.). For each matching
// outbound_message_trigger row:
//
//   1. Build the render-vars from event payload + workspace soul +
//      linked contact (when available).
//   2. Compose the message via the operator's LLM (lib/messaging/compose).
//   3. Insert a row into outbound_message_sends (status='queued').
//   4. Hand off to sendEmailFromApi / sendSmsFromApi (slice 2 = email
//      only; sms wired in slice 3).
//   5. Update the send row with the provider id + sent_at OR error.
//
// Non-fatal: a failure to compose or send is logged + recorded but
// does not throw (the caller is in an event-bus handler that should
// never propagate exceptions out).

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  contacts,
  organizations,
  outboundMessageSends,
  outboundMessageTriggers,
} from "@/db/schema";
import { sendEmailFromApi } from "@/lib/emails/api";
import { composeOutboundMessage } from "./compose";
import { buildRenderVars, type DispatchEventPayload } from "./render-vars";

export type DispatchInput = {
  orgId: string;
  eventType: string;
  /** Event payload from emitSeldonEvent — the shape depends on
   *  eventType. The render-vars builder normalises to a flat
   *  Record<string,string>. */
  payload: DispatchEventPayload;
};

export async function dispatchOutboundMessagesForEvent(
  input: DispatchInput,
): Promise<void> {
  const triggers = await db
    .select()
    .from(outboundMessageTriggers)
    .where(
      and(
        eq(outboundMessageTriggers.orgId, input.orgId),
        eq(outboundMessageTriggers.eventType, input.eventType),
        eq(outboundMessageTriggers.enabled, true),
      ),
    );

  if (triggers.length === 0) return;

  // Pre-fetch workspace + contact data once; render-vars uses both.
  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      timezone: organizations.timezone,
      soul: organizations.soul,
    })
    .from(organizations)
    .where(eq(organizations.id, input.orgId))
    .limit(1);
  if (!org) return;

  const contactId =
    typeof input.payload.contactId === "string" ? input.payload.contactId : null;
  const contactRow = contactId
    ? await db
        .select({
          id: contacts.id,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          email: contacts.email,
          phone: contacts.phone,
        })
        .from(contacts)
        .where(and(eq(contacts.id, contactId), eq(contacts.orgId, input.orgId)))
        .limit(1)
        .then((rows) => rows[0] ?? null)
    : null;

  const vars = buildRenderVars({
    eventType: input.eventType,
    payload: input.payload,
    org,
    contact: contactRow,
  });

  for (const trigger of triggers) {
    // Slice 2: only email is wired through composeOutboundMessage.
    // SMS lands in slice 3 — skip with an audit row so the gap is
    // visible.
    if (trigger.channel !== "email") {
      await db.insert(outboundMessageSends).values({
        orgId: input.orgId,
        triggerId: trigger.id,
        channel: trigger.channel,
        eventType: input.eventType,
        contactId: contactRow?.id ?? null,
        toAddress: vars.contactEmail || vars.contactPhone || "",
        subject: null,
        body: "",
        status: "skipped",
        error: "channel_not_wired_yet",
        metadata: { skill: trigger.skillId },
      });
      continue;
    }

    const toAddress = vars.contactEmail || "";
    if (!toAddress) {
      await db.insert(outboundMessageSends).values({
        orgId: input.orgId,
        triggerId: trigger.id,
        channel: trigger.channel,
        eventType: input.eventType,
        contactId: contactRow?.id ?? null,
        toAddress: "",
        subject: null,
        body: "",
        status: "skipped",
        error: "no_recipient_email",
        metadata: { skill: trigger.skillId },
      });
      continue;
    }

    const composed = await composeOutboundMessage({
      orgId: input.orgId,
      skillId: trigger.skillId,
      customSkillMd: trigger.customSkillMd ?? null,
      vars,
      channel: "email",
    });

    if (!composed.ok) {
      await db.insert(outboundMessageSends).values({
        orgId: input.orgId,
        triggerId: trigger.id,
        channel: trigger.channel,
        eventType: input.eventType,
        contactId: contactRow?.id ?? null,
        toAddress,
        subject: null,
        body: "",
        status: "failed",
        error: `compose_failed:${composed.reason}`,
        metadata: { skill: trigger.skillId },
      });
      continue;
    }

    // Queue + send. sendEmailFromApi handles the Resend resolution
    // (operator's key OR fallback to platform key via process.env.
    // RESEND_API_KEY + DEFAULT_FROM_EMAIL). It also handles the
    // suppression check + records into the existing `emails` table.
    //
    // We additionally record into outbound_message_sends so the
    // operator can see the trigger-attributed audit log on /emails
    // and /sms separate from the generic email_log.
    const [sendRow] = await db
      .insert(outboundMessageSends)
      .values({
        orgId: input.orgId,
        triggerId: trigger.id,
        channel: trigger.channel,
        eventType: input.eventType,
        contactId: contactRow?.id ?? null,
        toAddress,
        subject: composed.subject,
        body: composed.body,
        status: "queued",
        metadata: { skill: trigger.skillId, model: composed.model },
      })
      .returning({ id: outboundMessageSends.id });

    try {
      const result = await sendEmailFromApi({
        orgId: input.orgId,
        userId: "system",
        contactId: contactRow?.id ?? null,
        toEmail: toAddress,
        subject: composed.subject ?? "Confirmation",
        body: composed.body,
      });

      if (result.suppressed) {
        await db
          .update(outboundMessageSends)
          .set({
            status: "suppressed",
            error: result.reason,
          })
          .where(eq(outboundMessageSends.id, sendRow.id));
      } else {
        await db
          .update(outboundMessageSends)
          .set({
            status: "sent",
            externalMessageId: result.emailId,
            sentAt: new Date(),
          })
          .where(eq(outboundMessageSends.id, sendRow.id));
      }
    } catch (err) {
      await db
        .update(outboundMessageSends)
        .set({
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
        })
        .where(eq(outboundMessageSends.id, sendRow.id));
    }
  }
}
