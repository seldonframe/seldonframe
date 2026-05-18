// 2026-05-18 — Outbound scheduled send queue (messaging plan v2, slice 6).
//
// Three exported entry points:
//   - scheduleOutboundMessage: called by dispatch.ts when a trigger's
//     delayMinutes > 0. Computes the absolute fireAt and inserts a
//     pending row.
//   - processScheduledSend: called by the cron worker for each due
//     row. Rebuilds render-vars from the frozen payload + current
//     workspace/contact state and dispatches through the same
//     compose+send path the immediate dispatcher uses.
//   - cancelScheduledSendsForBooking: called from the booking.cancelled
//     event listener. Flips matching pending rows to 'cancelled' so
//     reminders don't fire post-cancellation.
//
// fireAt semantics:
//   - booking.* events with a startsAt in the payload →
//     fireAt = startsAt - delayMinutes (i.e. 1440 = 24h BEFORE)
//   - everything else → fireAt = now + delayMinutes (i.e. 4320 = 3d AFTER)

import { and, asc, eq, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  contacts,
  organizations,
  outboundMessageSends,
  outboundMessageTriggers,
  outboundScheduledSends,
  type OutboundMessageTrigger,
  type OutboundScheduledSend,
} from "@/db/schema";
import { sendEmailFromApi } from "@/lib/emails/api";
import { sendSmsFromApi } from "@/lib/sms/api";
import { composeOutboundMessage } from "./compose";
import { buildRenderVars, type DispatchEventPayload } from "./render-vars";

const SMS_STOP_FOOTER = "Reply STOP to unsubscribe.";

function appendStopFooter(body: string): string {
  if (body.toLowerCase().includes("reply stop")) return body;
  return `${body.trimEnd()} ${SMS_STOP_FOOTER}`;
}

/**
 * Compute the absolute time a scheduled send should fire.
 *
 * For booking.* events with a startsAt, delayMinutes is interpreted
 * as "fire N minutes BEFORE startsAt" — so a reminder trigger with
 * delayMinutes=1440 fires 24h before the appointment, even if the
 * appointment was booked just 10 minutes in advance (in which case
 * fireAt may already be in the past — caller decides to skip).
 *
 * For everything else, delayMinutes is interpreted as "fire N minutes
 * AFTER the event was received" (e.g. a 3-day intake followup).
 */
export function computeFireAt(
  eventType: string,
  payload: DispatchEventPayload,
  delayMinutes: number,
  now: Date = new Date(),
): Date {
  const startsAtRaw = payload.startsAt;
  if (eventType.startsWith("booking.") && startsAtRaw) {
    const startsAt =
      startsAtRaw instanceof Date
        ? startsAtRaw
        : typeof startsAtRaw === "string"
          ? new Date(startsAtRaw)
          : null;
    if (startsAt && !Number.isNaN(startsAt.getTime())) {
      return new Date(startsAt.getTime() - delayMinutes * 60_000);
    }
  }
  return new Date(now.getTime() + delayMinutes * 60_000);
}

export type ScheduleInput = {
  orgId: string;
  trigger: OutboundMessageTrigger;
  eventType: string;
  payload: DispatchEventPayload;
};

/**
 * Insert a pending scheduled send. Called by dispatch.ts when a
 * trigger's delayMinutes > 0.
 *
 * Idempotency: not enforced at the DB level (no unique key) because
 * the same event firing twice should produce two queued sends — the
 * caller (event bus) is expected to deduplicate at the event level
 * if needed.
 *
 * Skips silently when fireAt is in the past (booking was made too
 * close to the appointment time for a 24h reminder to be meaningful).
 * Logs a 'skipped_past_fireAt' row instead so the audit log still
 * reflects the attempt.
 */
export async function scheduleOutboundMessage(
  input: ScheduleInput,
): Promise<void> {
  const fireAt = computeFireAt(
    input.eventType,
    input.payload,
    input.trigger.delayMinutes,
  );

  const now = new Date();
  const contactId =
    typeof input.payload.contactId === "string"
      ? input.payload.contactId
      : null;

  if (fireAt.getTime() <= now.getTime()) {
    // Skip — fire time is already past. Record an audit row so the
    // operator can see "we wanted to send a 24h reminder but the
    // booking was made less than 24h before startsAt".
    await db.insert(outboundMessageSends).values({
      orgId: input.orgId,
      triggerId: input.trigger.id,
      channel: input.trigger.channel,
      eventType: input.eventType,
      contactId,
      toAddress: "",
      subject: null,
      body: "",
      status: "skipped",
      error: "fire_at_in_past",
      metadata: {
        skill: input.trigger.skillId,
        delayMinutes: input.trigger.delayMinutes,
        wouldFireAt: fireAt.toISOString(),
      },
    });
    return;
  }

  await db.insert(outboundScheduledSends).values({
    orgId: input.orgId,
    triggerId: input.trigger.id,
    channel: input.trigger.channel,
    eventType: input.eventType,
    fireAt,
    contactId,
    payload: input.payload as Record<string, unknown>,
    status: "pending",
  });
}

/**
 * Process a single due scheduled send. Called by the cron worker
 * after it has CAS-claimed the row (flipped status='processing' to
 * prevent concurrent ticks from dispatching the same row).
 *
 * The compose+send path is identical to the immediate dispatcher's
 * — only the entry point differs.
 */
export async function processScheduledSend(
  row: OutboundScheduledSend,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  // Re-load the trigger in case it was disabled / edited since
  // scheduling. If disabled, skip without firing.
  const [trigger] = await db
    .select()
    .from(outboundMessageTriggers)
    .where(eq(outboundMessageTriggers.id, row.triggerId))
    .limit(1);
  if (!trigger) {
    await markScheduledSendFailed(row.id, "trigger_deleted");
    return { ok: false, reason: "trigger_deleted" };
  }
  if (!trigger.enabled) {
    await markScheduledSendCancelled(row.id, "trigger_disabled");
    return { ok: false, reason: "trigger_disabled" };
  }

  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      timezone: organizations.timezone,
      soul: organizations.soul,
    })
    .from(organizations)
    .where(eq(organizations.id, row.orgId))
    .limit(1);
  if (!org) {
    await markScheduledSendFailed(row.id, "org_not_found");
    return { ok: false, reason: "org_not_found" };
  }

  const contactRow = row.contactId
    ? await db
        .select({
          id: contacts.id,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          email: contacts.email,
          phone: contacts.phone,
        })
        .from(contacts)
        .where(and(eq(contacts.id, row.contactId), eq(contacts.orgId, row.orgId)))
        .limit(1)
        .then((rows) => rows[0] ?? null)
    : null;

  const vars = buildRenderVars({
    eventType: row.eventType,
    payload: row.payload,
    org,
    contact: contactRow,
  });

  const toAddress =
    trigger.channel === "email" ? vars.contactEmail || "" : vars.contactPhone || "";
  if (!toAddress) {
    await markScheduledSendFailed(
      row.id,
      trigger.channel === "email" ? "no_recipient_email" : "no_recipient_phone",
    );
    return { ok: false, reason: "no_recipient" };
  }

  const composed = await composeOutboundMessage({
    orgId: row.orgId,
    skillId: trigger.skillId,
    customSkillMd: trigger.customSkillMd ?? null,
    vars,
    channel: trigger.channel as "email" | "sms",
  });

  if (!composed.ok) {
    await markScheduledSendFailed(row.id, `compose_failed:${composed.reason}`);
    return { ok: false, reason: composed.reason };
  }

  const finalBody =
    trigger.channel === "sms" ? appendStopFooter(composed.body) : composed.body;

  const [sendRow] = await db
    .insert(outboundMessageSends)
    .values({
      orgId: row.orgId,
      triggerId: trigger.id,
      channel: trigger.channel,
      eventType: row.eventType,
      contactId: contactRow?.id ?? null,
      toAddress,
      subject: composed.subject,
      body: finalBody,
      status: "queued",
      metadata: {
        skill: trigger.skillId,
        model: composed.model,
        scheduledSendId: row.id,
      },
    })
    .returning({ id: outboundMessageSends.id });

  try {
    if (trigger.channel === "email") {
      const result = await sendEmailFromApi({
        orgId: row.orgId,
        userId: "system",
        contactId: contactRow?.id ?? null,
        toEmail: toAddress,
        subject: composed.subject ?? "Reminder",
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
      const result = await sendSmsFromApi({
        orgId: row.orgId,
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

    await db
      .update(outboundScheduledSends)
      .set({
        status: "fired",
        sendId: sendRow.id,
        firedAt: new Date(),
      })
      .where(eq(outboundScheduledSends.id, row.id));
    return { ok: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await db
      .update(outboundMessageSends)
      .set({ status: "failed", error: reason })
      .where(eq(outboundMessageSends.id, sendRow.id));
    await markScheduledSendFailed(row.id, reason);
    return { ok: false, reason };
  }
}

async function markScheduledSendFailed(id: string, reason: string) {
  await db
    .update(outboundScheduledSends)
    .set({ status: "failed", note: reason, firedAt: new Date() })
    .where(eq(outboundScheduledSends.id, id));
}

async function markScheduledSendCancelled(id: string, reason: string) {
  await db
    .update(outboundScheduledSends)
    .set({ status: "cancelled", note: reason, firedAt: new Date() })
    .where(eq(outboundScheduledSends.id, id));
}

/**
 * Cancel pending scheduled sends targeted at a specific booking. Run
 * from the booking.cancelled event listener so the 24h reminder
 * doesn't fire post-cancellation.
 */
export async function cancelScheduledSendsForBooking(
  orgId: string,
  bookingId: string,
): Promise<{ cancelled: number }> {
  if (!orgId || !bookingId) return { cancelled: 0 };

  // booking.created payload stores the booking id as 'bookingId' (see
  // bookings/actions.ts emitSeldonEvent calls). The dispatcher inserts
  // the same payload into outbound_scheduled_sends.payload, so we
  // filter on the JSONB key.
  const result = await db
    .update(outboundScheduledSends)
    .set({
      status: "cancelled",
      note: "booking_cancelled",
      firedAt: new Date(),
    })
    .where(
      and(
        eq(outboundScheduledSends.orgId, orgId),
        eq(outboundScheduledSends.status, "pending"),
        sql`${outboundScheduledSends.payload} ->> 'bookingId' = ${bookingId}`,
      ),
    )
    .returning({ id: outboundScheduledSends.id });

  return { cancelled: result.length };
}

/**
 * Cron worker entrypoint: claim + process all due pending sends.
 * Returns counts for observability.
 *
 * Concurrency: uses a single UPDATE … RETURNING to claim a batch with
 * CAS semantics — only rows still in 'pending' get flipped to
 * 'processing' so concurrent ticks can't dispatch the same row twice.
 * Vercel cron is single-tenant per schedule, so concurrency is mostly
 * theoretical, but the CAS is cheap.
 */
const TICK_BATCH = 50;

export async function tickScheduledSends(): Promise<{
  claimed: number;
  fired: number;
  failed: number;
  cancelled: number;
}> {
  // 1. Fetch up to TICK_BATCH pending+due rows ordered by oldest
  //    fireAt first. We do NOT claim here — concurrent claim happens
  //    in step 2 via CAS so a second tick can't dispatch the same
  //    row even if step 1 races.
  const due = await db
    .select()
    .from(outboundScheduledSends)
    .where(
      and(
        eq(outboundScheduledSends.status, "pending"),
        lte(outboundScheduledSends.fireAt, new Date()),
      ),
    )
    .orderBy(asc(outboundScheduledSends.fireAt))
    .limit(TICK_BATCH);

  let claimed = 0;
  let fired = 0;
  let failed = 0;
  let cancelled = 0;

  for (const row of due) {
    // 2. CAS claim: flip status='pending' → 'processing' atomically.
    //    If the row was already claimed by a parallel tick, the
    //    returning array is empty and we skip.
    const claim = await db
      .update(outboundScheduledSends)
      .set({ status: "processing" })
      .where(
        and(
          eq(outboundScheduledSends.id, row.id),
          eq(outboundScheduledSends.status, "pending"),
        ),
      )
      .returning({ id: outboundScheduledSends.id });
    if (claim.length === 0) continue;
    claimed += 1;

    // 3. Process — the helper updates status to fired/failed/cancelled
    //    based on the result. Wrap in try/catch as a safety net so a
    //    runaway exception doesn't strand the row in 'processing'.
    try {
      const result = await processScheduledSend(row);
      if (result.ok) {
        fired += 1;
      } else if (result.reason === "trigger_disabled") {
        cancelled += 1;
      } else {
        failed += 1;
      }
    } catch (err) {
      failed += 1;
      await markScheduledSendFailed(
        row.id,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return { claimed, fired, failed, cancelled };
}
