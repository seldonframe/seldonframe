// Agent receipts slice (Task 2) — writeRunReceipt: the ONE writer for
// `agent_run_receipts` (schema: db/schema/agent-run-receipts.ts). Design:
// docs/superpowers/specs/2026-07-16-agent-receipts-design.md.
//
// FAIL-SOFT BY CONTRACT: this function NEVER throws and NEVER rejects — a
// receipt-write failure must NEVER fail or retry the run that's completing
// (composio-event-dispatch.ts's dispatch loop, schedule-agents.ts's cron
// fire). Every error path is caught + console.warn'd, matching the
// lazy-import + try/catch convention store.ts's claimComposioPushRun /
// releaseComposioPushRunClaim already use.
//
// DI'd for unit tests: `deps.insert` defaults to a lazy `@/db` insert; tests
// pass a fake to assert the written row + exercise the fail-soft contract
// with a throwing insert.

import type {
  AgentRunReceiptStatus,
  AgentRunReceiptToolCall,
  AgentRunReceiptTriggerKind,
  NewAgentRunReceiptRow,
} from "@/db/schema/agent-run-receipts";

export type WriteRunReceiptInput = {
  orgId: string;
  /** Nullable — a receipt can outlive its deployment (FK is ON DELETE SET
   *  NULL), and some callers may not have a deployment id in scope. */
  deploymentId?: string | null;
  triggerKind: AgentRunReceiptTriggerKind;
  /** Gmail message id / cron fire tag / event id. Nullable. */
  sourceRef?: string | null;
  status: AgentRunReceiptStatus;
  /** Summarized tool-call outcomes (never a raw payload/secret) — mirrors
   *  StatelessToolEvent's `line` contract. Defaults to []. */
  toolCalls?: AgentRunReceiptToolCall[];
  /** Precomputed summary. When absent, derived from `toolCalls`/`replyText`
   *  via `deriveReceiptSummary` (below). */
  summary?: string;
  /** Only consulted when `summary` is absent — the turn's final reply text,
   *  used as the derivation fallback. */
  replyText?: string;
};

/** Injectable insert fn — defaults to a lazy `@/db` insert (kept out of the
 *  top-level import graph so this module stays test-friendly + tree-
 *  shakeable in non-DB callers). */
export type WriteRunReceiptDb = (row: NewAgentRunReceiptRow) => Promise<void>;

async function defaultInsert(row: NewAgentRunReceiptRow): Promise<void> {
  const { db } = await import("@/db");
  const { agentRunReceipts } = await import("@/db/schema/agent-run-receipts");
  await db.insert(agentRunReceipts).values(row);
}

/** Max length for a receipt summary line (matches the design's "truncated
 *  140 chars" rule). */
const SUMMARY_MAX_LENGTH = 140;

/**
 * Derive a one-line, human-readable summary per the design's rule: the first
 * tool call's note when present, else the turn's reply text truncated to 140
 * chars, else "ran with no actions". Pure; never throws.
 */
export function deriveReceiptSummary(input: {
  toolCalls?: AgentRunReceiptToolCall[];
  replyText?: string;
}): string {
  const firstNote = input.toolCalls?.find((c) => typeof c.note === "string" && c.note.trim().length > 0)
    ?.note;
  if (firstNote) return firstNote;

  const reply = input.replyText?.trim();
  if (reply) return reply.slice(0, SUMMARY_MAX_LENGTH);

  return "ran with no actions";
}

/**
 * Write one agent-run receipt. FAIL-SOFT BY CONTRACT: any throw (missing
 * required fields, a DB error, a deps.insert failure) is caught +
 * console.warn'd — this function always resolves, never rejects, and the
 * caller's run path must NEVER be blocked or retried because of it.
 */
export async function writeRunReceipt(
  input: WriteRunReceiptInput,
  deps?: { insert?: WriteRunReceiptDb },
): Promise<void> {
  try {
    if (!input.orgId || !input.orgId.trim()) {
      console.warn("[agent-receipts/write] missing orgId — receipt not written");
      return;
    }
    const insert = deps?.insert ?? defaultInsert;
    const toolCalls = input.toolCalls ?? [];
    const summary =
      input.summary && input.summary.trim().length > 0
        ? input.summary
        : deriveReceiptSummary({ toolCalls, replyText: input.replyText });

    await insert({
      orgId: input.orgId,
      deploymentId: input.deploymentId ?? null,
      triggerKind: input.triggerKind,
      sourceRef: input.sourceRef ?? null,
      status: input.status,
      summary,
      toolCalls,
    });
  } catch (err) {
    console.warn(
      "[agent-receipts/write] writeRunReceipt failed (fail-soft, run continues):",
      err instanceof Error ? err.message : String(err),
    );
  }
}
