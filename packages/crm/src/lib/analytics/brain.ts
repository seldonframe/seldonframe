// May 1, 2026 — Measurement Layer 3: Brain learning event logger.
//
// Fire-and-forget. Never blocks. Never throws. Same contract as
// trackEvent in ./track.ts but writes to brain_events instead so
// outcome data is partitioned from product-journey events.
//
// Brain events are deliberately VERTICAL-AWARE: every row carries a
// `vertical` string so per-vertical learning queries are cheap. When
// the caller doesn't know the vertical (org missing, soul not yet
// classified), pass null and the row still records — Brain analysis
// just bucket-routes "unknown" separately.
//
// Usage:
//   import { logBrainEvent } from "@/lib/analytics/brain";
//
//   logBrainEvent({
//     orgId,
//     vertical: "hvac",
//     eventType: "landing_to_intake",
//     context: { ... },
//     outcome: "converted",
//     outcomeValueCents: 0,
//   });

import { db } from "@/db";
import { brainOutcomes } from "@/db/schema";

export interface BrainEventInput {
  orgId: string;
  vertical?: string | null;
  eventType: string;
  context: Record<string, unknown>;
  outcome?: string | null;
  outcomeValueCents?: number | null;
}

/**
 * Log a Brain learning event. Fire-and-forget — DOES NOT await,
 * DOES NOT throw, DOES NOT block. Identical safety contract to
 * trackEvent: failures log to console.error and are dropped.
 */
export function logBrainEvent(params: BrainEventInput): void {
  if (!params.orgId) {
    // Brain events are required to be org-scoped (the column is NOT
    // NULL by design — cross-workspace learning only makes sense
    // anchored to a workspace). Defensive guard so a buggy caller
    // doesn't 23502 the insert.
    console.error(
      `[brain] dropped event "${params.eventType}": orgId is required`
    );
    return;
  }

  // Defensive truncation — both columns are varchar(50).
  const eventType = params.eventType.slice(0, 50);
  const vertical = params.vertical ? params.vertical.slice(0, 50) : null;
  const outcome = params.outcome ? params.outcome.slice(0, 50) : null;

  void db
    .insert(brainOutcomes)
    .values({
      orgId: params.orgId,
      vertical,
      eventType,
      context: params.context,
      outcome,
      outcomeValueCents: params.outcomeValueCents ?? 0,
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[brain] failed to log outcome "${eventType}": ${message}`
      );
    });
}
