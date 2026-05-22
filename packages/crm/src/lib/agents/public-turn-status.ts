// 2026-05-22 — public turn conversation status decision (bug fix).
//
// BUG: public visitors using the auto-deployed website chatbot on /w/[slug]
// were completing full booking conversations but nothing persisted. The
// public turn route at /api/v1/public/agent/[slug]/turn was writing
// `agent_conversations.status = "test"` whenever `agent.status === "test"`,
// which makes the book_appointment + escalate_to_human tools short-circuit
// (testMode no-op stubs in lib/agents/tools.ts).
//
// FIX: anonymous public callers ALWAYS get conversation.status = "active",
// regardless of the agent's current status. The operator test sandbox
// at /agents/[id]/test routes through the same public endpoint, so we
// can't simply drop the conditional — we'd break operator testMode.
// Instead, the test sandbox sends an `x-test-mode: 1` header, and we only
// honor that header for authenticated callers. Anonymous traffic sending
// the header is treated like any other anonymous traffic (refused).
//
// Pure function — no DB, no IO. Trivially testable. The route hosts the
// session lookup + header parsing; this function just decides the status.

export type AgentRowStatus = "draft" | "test" | "live" | "paused" | string;
export type PublicConversationStatus = "active" | "test";

export interface DecidePublicConversationStatusInput {
  /** The current `agents.status` value from the DB row. */
  agentStatus: AgentRowStatus;
  /** `true` iff the request carried `x-test-mode: 1` (or equivalent). */
  requestedTestMode: boolean;
  /** `true` iff the route resolved an authenticated SF operator session. */
  isAuthenticatedOperator: boolean;
}

/**
 * Decide what value to write into `agent_conversations.status` for a
 * new public-turn conversation.
 *
 * Rules:
 *  - Anonymous callers ALWAYS get "active". This is the bug fix — the
 *    pre-fix behavior leaked agent.status into the conversation row,
 *    which caused the runtime testMode plumbing to short-circuit
 *    booking and escalation tools for real customers.
 *  - Authenticated SF operators who explicitly opt INTO test mode (via
 *    the `x-test-mode: 1` header that /agents/[id]/test sends) get
 *    "test" — preserves the operator-sandbox UX.
 *  - All other combinations → "active".
 */
export function decidePublicConversationStatus(
  input: DecidePublicConversationStatusInput,
): PublicConversationStatus {
  if (input.requestedTestMode && input.isAuthenticatedOperator) {
    return "test";
  }
  return "active";
}
