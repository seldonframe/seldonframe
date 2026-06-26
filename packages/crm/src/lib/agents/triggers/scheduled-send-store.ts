// 2026-06-26 — Outbound-UX Bundle F2 (send delay): the DB-backed store for the
// event-agent scheduled-send queue (event_agent_scheduled_sends).
//
// Three responsibilities:
//   • enqueueScheduledEventAgentSend — insert a 'pending' row from the frozen
//     ScheduledEventAgentSend the orchestrator hands us (wired into
//     buildRunEventAgentDeps.enqueueScheduledSend);
//   • listDueScheduledEventAgentSends — the cron's claim query: 'pending' rows
//     whose due_at <= now, oldest-first, capped;
//   • markScheduledEventAgentSend — flip a row to sent/failed/skipped after the
//     cron processes it (CAS on status='pending' so a row can't double-fire),
//     stamping processed_at, the error, and (on failure) bumping attempts.
//
// Plain lib module (NOT "use server") — it touches Postgres directly, exactly
// like lib/messaging/schedule.ts, and is imported by the cron tick + the
// production run-event-agent deps (both server-only). The pure tick LOGIC that
// drives this store is DI'd + unit-tested separately (see scheduled-send-cron.ts
// + tests) with an in-memory fake, so no Postgres is needed to test the loop.

import { and, asc, eq, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  eventAgentScheduledSends,
  type EventAgentScheduledSend,
} from "@/db/schema/event-agent-scheduled-sends";
import type { ScheduledEventAgentSend } from "./scheduled-event-agent";

/** The terminal states the cron can stamp on a processed row. */
export type ScheduledSendStatus = "sent" | "failed" | "skipped";

/**
 * The store contract the cron tick depends on. Extracted as an interface so the
 * pure tick logic (scheduled-send-cron.ts) can be DI'd with an in-memory fake in
 * tests — no Postgres in the unit test. Production passes
 * `scheduledEventAgentSendStore` (the DB-backed impl below).
 */
export type ScheduledEventAgentSendStore = {
  listDue: (now: Date, limit: number) => Promise<EventAgentScheduledSend[]>;
  mark: (
    id: string,
    update: { status: ScheduledSendStatus; error?: string | null },
  ) => Promise<void>;
};

/**
 * Insert a pending scheduled event-agent send. Called by the orchestrator's
 * enqueue seam when a matched agent's `delayMinutes > 0`. The row IS the frozen
 * event context; due_at is the send's computed due time. We do NOT swallow the
 * error here — the orchestrator's enqueue branch counts `failed` and refuses to
 * send now when this throws (so a queue failure surfaces instead of double-firing).
 */
export async function enqueueScheduledEventAgentSend(
  send: ScheduledEventAgentSend,
): Promise<void> {
  await db.insert(eventAgentScheduledSends).values({
    orgId: send.orgId,
    eventType: send.eventType,
    contactId: send.contactId,
    payload: send.payload ?? {},
    agentSkill: send.agentSkill,
    channel: send.channel,
    dueAt: send.dueAt,
    status: "pending",
  });
}

/**
 * Load up to `limit` due pending sends, oldest-due first. The cron claims each
 * one via `markScheduledEventAgentSend` (CAS on status='pending') before/after
 * replaying, so selecting here without locking is safe — a second tick that
 * raced would lose the CAS and skip.
 */
export async function listDueScheduledEventAgentSends(
  now: Date,
  limit: number,
): Promise<EventAgentScheduledSend[]> {
  return db
    .select()
    .from(eventAgentScheduledSends)
    .where(
      and(
        eq(eventAgentScheduledSends.status, "pending"),
        lte(eventAgentScheduledSends.dueAt, now),
      ),
    )
    .orderBy(asc(eventAgentScheduledSends.dueAt))
    .limit(limit);
}

/**
 * Mark a row's terminal outcome. CAS on status='pending' so a row can transition
 * out of 'pending' AT MOST ONCE — two ticks can't both fire the same row. On
 * 'failed' we bump `attempts` (a SQL increment, no read needed); `processed_at`
 * is always stamped and `last_error` carries the reason.
 *
 * We do NOT requeue failed rows automatically (no retry storm); `attempts` +
 * `last_error` make a failure observable, and a row stays terminal once marked.
 */
export async function markScheduledEventAgentSend(
  id: string,
  update: { status: ScheduledSendStatus; error?: string | null },
): Promise<void> {
  await db
    .update(eventAgentScheduledSends)
    .set({
      status: update.status,
      processedAt: new Date(),
      lastError: update.error ?? null,
      // Only the failure path advances the attempt counter.
      ...(update.status === "failed"
        ? { attempts: sql`${eventAgentScheduledSends.attempts} + 1` }
        : {}),
    })
    .where(
      and(
        eq(eventAgentScheduledSends.id, id),
        eq(eventAgentScheduledSends.status, "pending"),
      ),
    );
}

/** The production, DB-backed store the cron tick consumes. */
export const scheduledEventAgentSendStore: ScheduledEventAgentSendStore = {
  listDue: listDueScheduledEventAgentSends,
  mark: markScheduledEventAgentSend,
};
