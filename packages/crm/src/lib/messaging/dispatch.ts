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
// 2026-05-18 — Slice 3 wires SMS sends. sendSmsFromApi has existed
// for a while (the inbound webhook + auto-reply piece is what Slice 4
// adds); we just plug it in.
import { sendSmsFromApi } from "@/lib/sms/api";
import { composeOutboundMessage } from "./compose";
import { buildRenderVars, type DispatchEventPayload } from "./render-vars";
// 2026-05-18 — Slice 6: triggers with delayMinutes > 0 land in
// outbound_scheduled_sends instead of dispatching immediately.
import { scheduleOutboundMessage } from "./schedule";
// 2026-05-18 — booking events emit a sparse {appointmentId, contactId}
// payload. Hydrate to full {bookingId, title, startsAt, endsAt, slug}
// before composing so {{bookingTitle}} et al. actually resolve.
import { hydrateMessagingPayload } from "./hydrate-payload";
// 2026-05-18 (later) — self-healing trigger seed at dispatch time.
// Operator reported "booked a job, no confirmation email" even after
// the /emails lazy-seed fix shipped — because they booked BEFORE
// visiting /emails. We now seed inside the dispatcher itself when
// triggers.length === 0, so the very first booking.created for any
// workspace auto-bootstraps its defaults and fires immediately.
import { seedDefaultOutboundTriggers } from "./seed-default-triggers";
// 2026-05-18 — dispatch-time guard: when a deployed agent owns the
// event (speed-to-lead handles form.submitted, etc.) we skip the basic
// outbound trigger to avoid double-sending. Belt-and-suspenders with
// the auto-disable in setAgentDeployStateAction — that one only fires
// on a NEW deploy, this runtime check also covers agents that were
// already deployed before the auto-disable code shipped.
import { findDeployedAgentForEvent } from "@/lib/agents/configure-actions";

// 2026-05-18 — TCPA / A2P 10DLC footer. Auto-appended to every
// outbound SMS so operators can never accidentally skip it. Detection
// is case-insensitive substring match so we don't double-append if
// the operator's skill already includes it.
const SMS_STOP_FOOTER = "Reply STOP to unsubscribe.";

function appendStopFooter(body: string): string {
  if (body.toLowerCase().includes("reply stop")) return body;
  const trimmed = body.trimEnd();
  // Use a space separator (not a newline) — many carriers fold
  // multi-line SMS in a way that hides trailing lines.
  return `${trimmed} ${SMS_STOP_FOOTER}`;
}

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
  // 2026-05-18 — hydrate sparse booking payloads so render-vars +
  // scheduler have title/startsAt/endsAt/slug available. No-op for
  // events that aren't booking.* OR that already carry the data.
  const payload = await hydrateMessagingPayload(
    input.orgId,
    input.eventType,
    input.payload,
  );

  // 2026-05-18 — dispatch-time guard. If a deployed agent owns this
  // event (e.g. speed-to-lead on form.submitted), it will handle the
  // customer response itself. Skip the basic intake-auto-reply trigger
  // to prevent double-sending. We check BEFORE the trigger query so
  // an enabled-but-superseded trigger never fires.
  //
  // Visible bug fixed: operator received TWO SMS on every form
  // submission — one from speed-to-lead's conversation step (sending
  // the qualifier question), one from the intake-auto-reply trigger
  // (sending the generic "Thanks for reaching out!"). Customer is
  // confused about which one to reply to.
  try {
    const deployedAgentId = await findDeployedAgentForEvent(
      input.orgId,
      input.eventType,
    );
    if (deployedAgentId) {
      console.log(
        JSON.stringify({
          event: "dispatch.skipped_for_deployed_agent",
          orgId: input.orgId,
          eventType: input.eventType,
          agentId: deployedAgentId,
        }),
      );
      return;
    }
  } catch (err) {
    // Soft-fail — if the lookup throws (DB hiccup, unexpected settings
    // shape), fall through to the normal dispatch path. Worst case is
    // the legacy double-send; better than blocking all outbound on a
    // bad config row.
    console.warn(
      JSON.stringify({
        event: "dispatch.agent_guard_lookup_failed",
        orgId: input.orgId,
        eventType: input.eventType,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }

  let triggers = await db
    .select()
    .from(outboundMessageTriggers)
    .where(
      and(
        eq(outboundMessageTriggers.orgId, input.orgId),
        eq(outboundMessageTriggers.eventType, input.eventType),
        eq(outboundMessageTriggers.enabled, true),
      ),
    );

  // 2026-05-18 — self-healing seed. If this workspace has no
  // triggers for this event type, it almost certainly means the
  // workspace was created before the trigger-seeding code shipped
  // (or via a flow that skipped it). Seed the defaults now and
  // re-query. Idempotent (unique index + onConflictDoNothing), so
  // this is safe even if another request seeded concurrently.
  // Without this self-heal, the first booking on a pre-existing
  // workspace silently produces no confirmation email even after
  // /emails was visited (the operator's actual flow was: connect
  // Resend → book → no email, never visited /emails).
  if (triggers.length === 0) {
    try {
      await seedDefaultOutboundTriggers(input.orgId);
    } catch (err) {
      console.warn(
        JSON.stringify({
          event: "dispatch.lazy_seed_failed",
          orgId: input.orgId,
          eventType: input.eventType,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
    triggers = await db
      .select()
      .from(outboundMessageTriggers)
      .where(
        and(
          eq(outboundMessageTriggers.orgId, input.orgId),
          eq(outboundMessageTriggers.eventType, input.eventType),
          eq(outboundMessageTriggers.enabled, true),
        ),
      );
    if (triggers.length === 0) {
      // Still empty after seed — log + bail. This branch is rare:
      // means seeding ran but no defaults exist for this event type
      // (e.g. an event we haven't defined a default skill for).
      console.log(
        JSON.stringify({
          event: "dispatch.no_triggers_after_seed",
          orgId: input.orgId,
          eventType: input.eventType,
        }),
      );
      return;
    }
    console.log(
      JSON.stringify({
        event: "dispatch.lazy_seeded_ok",
        orgId: input.orgId,
        eventType: input.eventType,
        trigger_count: triggers.length,
      }),
    );
  }

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
    typeof payload.contactId === "string" ? payload.contactId : null;
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
    payload,
    org,
    contact: contactRow,
  });

  for (const trigger of triggers) {
    // 2026-05-18 — Slice 6: delay-aware queue. Anything with
    // delayMinutes > 0 lands in outbound_scheduled_sends; the cron
    // worker at /api/cron/outbound-scheduled-sends picks it up at
    // fireAt and runs the same compose+send path this function
    // would have run inline.
    if (trigger.delayMinutes > 0) {
      try {
        await scheduleOutboundMessage({
          orgId: input.orgId,
          trigger,
          eventType: input.eventType,
          payload,
        });
      } catch (err) {
        // Non-fatal — log + record as a failed audit row.
        await db.insert(outboundMessageSends).values({
          orgId: input.orgId,
          triggerId: trigger.id,
          channel: trigger.channel,
          eventType: input.eventType,
          contactId: contactRow?.id ?? null,
          toAddress: "",
          subject: null,
          body: "",
          status: "failed",
          error: `schedule_failed:${err instanceof Error ? err.message : String(err)}`,
          metadata: { skill: trigger.skillId, delayMinutes: trigger.delayMinutes },
        });
      }
      continue;
    }

    // Slice 3 — SMS now wired. Both 'email' and 'sms' route through
    // composeOutboundMessage; the channel-specific send happens after
    // composition. Any other channel (future: WhatsApp, voice drop)
    // still skips with a "channel_not_wired_yet" audit row.
    if (trigger.channel !== "email" && trigger.channel !== "sms") {
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

    // Route to the right recipient address per channel.
    const toAddress =
      trigger.channel === "email" ? vars.contactEmail || "" : vars.contactPhone || "";
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
        error:
          trigger.channel === "email" ? "no_recipient_email" : "no_recipient_phone",
        metadata: { skill: trigger.skillId },
      });
      continue;
    }

    const composed = await composeOutboundMessage({
      orgId: input.orgId,
      skillId: trigger.skillId,
      customSkillMd: trigger.customSkillMd ?? null,
      vars,
      channel: trigger.channel,
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

    // Auto-append the STOP footer on SMS (TCPA / A2P 10DLC compliance
    // — see appendStopFooter at the top of this file). Email doesn't
    // need this — unsubscribe links live in the Resend template chrome.
    const finalBody =
      trigger.channel === "sms" ? appendStopFooter(composed.body) : composed.body;

    // Queue + send. Channel-specific:
    //   email → sendEmailFromApi (Resend resolution, suppression,
    //     fallback to platform key when not connected).
    //   sms → sendSmsFromApi (Twilio config required; throws if
    //     fromNumber missing — caught + logged below).
    //
    // We additionally record into outbound_message_sends so /emails
    // and /sms surface the trigger-attributed audit log separate from
    // the generic emails / sms_messages tables.
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
        body: finalBody,
        status: "queued",
        metadata: { skill: trigger.skillId, model: composed.model },
      })
      .returning({ id: outboundMessageSends.id });

    try {
      if (trigger.channel === "email") {
        const result = await sendEmailFromApi({
          orgId: input.orgId,
          // 2026-05-18 — null for system-initiated dispatch. Was
          // previously the literal string "system" which crashed
          // the emails table insert (user_id is uuid NULL with FK
          // to users, "system" is neither a valid UUID nor a user).
          userId: null,
          contactId: contactRow?.id ?? null,
          toEmail: toAddress,
          subject: composed.subject ?? "Confirmation",
          body: finalBody,
        });

        if (result.suppressed) {
          await db
            .update(outboundMessageSends)
            .set({ status: "suppressed", error: result.reason })
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
      } else {
        // sms — sendSmsFromApi throws on suppression / config errors,
        // so we don't get the same { suppressed } shape email has.
        // Wrap the call so config-missing errors land in the audit
        // row instead of bubbling up to the event listener.
        const result = await sendSmsFromApi({
          orgId: input.orgId,
          userId: null,
          contactId: contactRow?.id ?? null,
          toNumber: toAddress,
          body: finalBody,
        });

        if (result.suppressed) {
          await db
            .update(outboundMessageSends)
            .set({ status: "suppressed", error: result.reason })
            .where(eq(outboundMessageSends.id, sendRow.id));
        } else {
          await db
            .update(outboundMessageSends)
            .set({
              status: "sent",
              externalMessageId: result.externalMessageId,
              sentAt: new Date(),
            })
            .where(eq(outboundMessageSends.id, sendRow.id));
        }
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
