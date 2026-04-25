// Scheduled-trigger dispatcher logic.
//
// Shipped in SLICE 5 PR 1 C5 per audit §4.3 + §4.4.
//
// Three layers, all pure-logic testable:
//   1. computeMissedWindows(cron, tz, lastFire, now) — enumerates the
//      cron hits in (lastFire, now]. Capped by maxWindows for safety.
//   2. applyCatchupPolicy(policy, windows) — filters windows per G-5-2:
//        skip     → fire zero if >1 window missed; fire the single
//                   window if exactly one (= on-time)
//        fire_all → all windows in chronological order
//        fire_one → most recent window only
//   3. dispatchScheduledTriggerTick(context) — orchestrates:
//        a. findDue(now, batchLimit)
//        b. for each trigger:
//             compute missed windows from lastFiredAt (or createdAt) to now
//             apply catchup policy
//             for each fire window to dispatch:
//                check concurrency (skip if in-flight + concurrency=skip)
//                recordFire (UNIQUE-protected; idempotent-skip on conflict)
//                invoke onFire callback
//             advance nextFireAt + lastFiredAt regardless
//
// Errors in onFire do NOT abort the tick — one failed trigger shouldn't
// starve the rest. Failed count surfaces via DispatchOutcome so callers
// can log.

import { computeNextFireAt } from "./cron";
import {
  computeNextFireAtForTrigger,
  type ScheduledTrigger,
  type ScheduledTriggerCatchup,
  type ScheduledTriggerStore,
} from "./scheduled-triggers-storage";

// ---------------------------------------------------------------------
// Layer 1 — computeMissedWindows
// ---------------------------------------------------------------------

/**
 * Enumerate cron hits in the half-open interval (lastFire, now].
 * Returns dates in chronological order. Safety bound: at most
 * `maxWindows` (default 100) — degenerate lags (years behind) don't
 * explode.
 */
export function computeMissedWindows(
  cronExpression: string,
  timezone: string,
  lastFire: Date,
  now: Date,
  opts: { maxWindows?: number } = {},
): Date[] {
  const max = opts.maxWindows ?? 100;
  const windows: Date[] = [];

  let cursor = lastFire;
  while (windows.length < max) {
    const next = computeNextFireAt(cronExpression, timezone, cursor);
    if (next.getTime() > now.getTime()) break;
    windows.push(next);
    cursor = next;
  }

  return windows;
}

// ---------------------------------------------------------------------
// Layer 2 — applyCatchupPolicy
// ---------------------------------------------------------------------

export function applyCatchupPolicy(
  policy: ScheduledTriggerCatchup,
  windows: Date[],
): Date[] {
  if (windows.length === 0) return [];
  switch (policy) {
    case "skip":
      // If exactly one window, it's an on-time fire — dispatch it.
      // Two or more windows = catchup situation; skip all.
      return windows.length === 1 ? windows : [];
    case "fire_all":
      return [...windows];
    case "fire_one":
      return [windows[windows.length - 1]];
  }
}

// ---------------------------------------------------------------------
// Layer 3 — dispatchScheduledTriggerTick
// ---------------------------------------------------------------------

export type DispatchOutcome = {
  scanned: number;
  dispatched: number;
  skippedByConcurrency: number;
  skippedByIdempotency: number;
  failed: number;
};

export type DispatchContext = {
  store: ScheduledTriggerStore;
  now: Date;
  batchLimit: number;
  /** Called once per fire window the policy selects. */
  onFire: (trigger: ScheduledTrigger, fireTime: Date) => Promise<void>;
  /** Concurrency=skip gate. Return true if a run for (orgId, archetypeId) is in-flight. */
  isArchetypeRunInFlight: (orgId: string, archetypeId: string) => Promise<boolean>;
};

export async function dispatchScheduledTriggerTick(
  ctx: DispatchContext,
): Promise<DispatchOutcome> {
  const outcome: DispatchOutcome = {
    scanned: 0,
    dispatched: 0,
    skippedByConcurrency: 0,
    skippedByIdempotency: 0,
    failed: 0,
  };

  const due = await ctx.store.findDue(ctx.now, ctx.batchLimit);
  outcome.scanned = due.length;

  for (const trigger of due) {
    const reference = trigger.lastFiredAt ?? new Date(trigger.nextFireAt.getTime() - 60_000);
    // Use (reference, now] — reference is the last known fire OR one
    // minute before nextFireAt, to ensure the first scheduled window
    // enumerates correctly.
    const missed = computeMissedWindows(
      trigger.cronExpression,
      trigger.timezone,
      reference,
      ctx.now,
    );
    const firesToDispatch = applyCatchupPolicy(trigger.catchup, missed);

    // Concurrency gate (applied to the FIRST dispatch attempt; if
    // concurrency=skip and a run is in-flight, we skip ALL fires
    // for this tick and advance anyway — next tick re-evaluates).
    let concurrencyBlocked = false;
    if (trigger.concurrency === "skip" && firesToDispatch.length > 0) {
      concurrencyBlocked = await ctx.isArchetypeRunInFlight(trigger.orgId, trigger.archetypeId);
    }

    if (concurrencyBlocked) {
      outcome.skippedByConcurrency += firesToDispatch.length;
    } else {
      for (const fireTime of firesToDispatch) {
        const recorded = await ctx.store.recordFire({
          id: `${trigger.id}:${fireTime.toISOString()}`,
          scheduledTriggerId: trigger.id,
          fireTimeUtc: fireTime,
          dispatchedAt: ctx.now,
        });
        if (!recorded.ok) {
          outcome.skippedByIdempotency += 1;
          continue;
        }
        try {
          await ctx.onFire(trigger, fireTime);
          outcome.dispatched += 1;
        } catch {
          // Swallow + count; don't abort the tick. Caller logs via
          // the returned outcome.failed.
          outcome.failed += 1;
        }
      }
    }

    // Advance nextFireAt regardless of dispatch outcome — next tick
    // shouldn't retry the same windows.
    const newNextFireAt = computeNextFireAtForTrigger(trigger, ctx.now);
    await ctx.store.advanceTrigger(trigger.id, {
      lastFiredAt: ctx.now,
      nextFireAt: newNextFireAt,
    });
  }

  return outcome;
}
