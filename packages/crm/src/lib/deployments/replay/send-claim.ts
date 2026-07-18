// Replay gate v2 — the send-claim ledger (spec §2, migration 0077's
// replay_send_claims). Mirrors deployments/store.ts's claimComposioPushRun
// idiom: ONE atomic write is the lock, a Postgres unique-violation (23505)
// on that write means "someone else already claimed this" — fails CLOSED
// (never executes, never throws into the caller as an ambiguous state).
//
// Lifecycle: claimSendStep (INSERT, outcome='unknown') BEFORE the
// destructive tool call runs -> markSendClaimOutcome('sent'|'failed') AFTER
// it resolves. The claim row is NEVER deleted or retried automatically —
// a failed claim intentionally blocks a later automatic retry from
// re-attempting an ambiguous send (spec §2: "a failed send may or may not
// have delivered ... the claim stays, preventing automatic retry").
import type {
  NewReplaySendClaimRow,
  ReplaySendClaimOutcome,
} from "@/db/schema/replay-send-claims";

export type ClaimSendStepInput = {
  orgId: string;
  skillId: string;
  stepN: number;
  /** The resolved key VALUE (e.g. the fired event's message_id) — never
   *  the var name. */
  idempotencyKey: string;
};

export type ClaimSendStepResult =
  | { claimed: true; claimId: string }
  | { claimed: false; reason: "already-claimed" | "claim-error" };

/** Injectable I/O — defaults to real DB calls (kept out of the top-level
 *  import graph so this module stays test-friendly, mirroring every other
 *  replay module's Deps pattern). */
export type SendClaimDeps = {
  insert?: (row: NewReplaySendClaimRow) => Promise<{ id: string }>;
  updateOutcome?: (claimId: string, outcome: ReplaySendClaimOutcome) => Promise<void>;
};

async function defaultInsert(row: NewReplaySendClaimRow): Promise<{ id: string }> {
  const { db } = await import("@/db");
  const { replaySendClaims } = await import("@/db/schema/replay-send-claims");
  const [inserted] = await db
    .insert(replaySendClaims)
    .values(row)
    .returning({ id: replaySendClaims.id });
  return inserted;
}

async function defaultUpdateOutcome(
  claimId: string,
  outcome: ReplaySendClaimOutcome,
): Promise<void> {
  const { db } = await import("@/db");
  const { replaySendClaims } = await import("@/db/schema/replay-send-claims");
  const { eq } = await import("drizzle-orm");
  await db.update(replaySendClaims).set({ outcome }).where(eq(replaySendClaims.id, claimId));
}

/** True iff `err` is a Postgres unique-constraint violation (code 23505).
 *  Same check as deployments/store.ts's claimComposioPushRun error path /
 *  scripts/replay-ops.ts's isUniqueViolation — reimplemented locally
 *  (each of those modules' own contract is about a different domain), a
 *  one-line dependency-free check. */
function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  return (err as { code?: string }).code === "23505";
}

/**
 * Attempt to claim the send-once slot for one (skill, step, key). FAILS
 * CLOSED on any ambiguity:
 *  - unique-violation (someone already claimed this key) -> `claimed:false,
 *    reason:"already-claimed"` — the caller must NOT execute the send;
 *    treat it as already-sent and continue past this step.
 *  - any OTHER insert failure (DB error, connectivity) -> `claimed:false,
 *    reason:"claim-error"` — the caller must ALSO not execute (we cannot
 *    tell whether a prior attempt succeeded), but this is a real failure
 *    (not "already sent") and should propagate as a step failure so the
 *    run is honestly recorded as failed-post-send rather than silently
 *    treated as a successful skip. Never throws.
 */
export async function claimSendStep(
  input: ClaimSendStepInput,
  deps?: SendClaimDeps,
): Promise<ClaimSendStepResult> {
  const insert = deps?.insert ?? defaultInsert;
  try {
    const row = await insert({
      orgId: input.orgId,
      skillId: input.skillId,
      stepN: input.stepN,
      idempotencyKey: input.idempotencyKey,
      outcome: "unknown",
    });
    return { claimed: true, claimId: row.id };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { claimed: false, reason: "already-claimed" };
    }
    console.warn(
      "[deployments/replay/send-claim] claim insert failed (treated as claim-error, fails closed):",
      err instanceof Error ? err.message : String(err),
    );
    return { claimed: false, reason: "claim-error" };
  }
}

/** Record the outcome of an executed send. FAIL-SOFT — a bookkeeping write
 *  must never mask the underlying tool result the caller already has (the
 *  claim row exists either way; a failed write here just means it stays
 *  'unknown' until someone investigates, never silently 'sent'). */
export async function markSendClaimOutcome(
  claimId: string,
  outcome: ReplaySendClaimOutcome,
  deps?: SendClaimDeps,
): Promise<void> {
  try {
    const updateOutcome = deps?.updateOutcome ?? defaultUpdateOutcome;
    await updateOutcome(claimId, outcome);
  } catch (err) {
    console.warn(
      "[deployments/replay/send-claim] markSendClaimOutcome failed (fail-soft):",
      err instanceof Error ? err.message : String(err),
    );
  }
}
