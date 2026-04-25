// conversation step dispatcher — PR 2 stub.
//
// Per the PR 2 kickoff ambiguity resolution: the full conversation
// runtime (integrating the existing Conversation Primitive with the
// workflow engine's wait/resume model) is a follow-up slice. The
// NL-judged `exit_when` predicate needs its own semantics decision
// (Claude-call each turn? regex fallback? structural-only subset?)
// that the 2c audit didn't resolve.
//
// For PR 2: this dispatcher records the intent, emits a synthetic
// trace event, and advances straight to on_exit.next. Runtime-wise
// this is equivalent to "assume the conversation exited cleanly".
// The shipped Client Onboarding integration test doesn't include a
// conversation step, so this stub doesn't affect PR 2's success
// criteria — but it unblocks any future test that needs to walk past
// a conversation step structurally.
//
// TODO(2c-followup): full conversation runtime. Expected shape:
//   1. Call send_conversation_turn with initial_message.
//   2. Register a wait on conversation.turn.received with a
//      predicate that resolves `exit_when` per-turn.
//   3. Each inbound turn wakes the run; the dispatcher re-evaluates
//      exit_when; if true, extract fields and advance; if false,
//      re-register the wait.
//   Gate items remaining: how exit_when is evaluated (Claude call
//   adds ~$0.01/turn cost; regex-based needs a grammar); and
//   whether timeout on conversation steps is separate or reuses
//   the per-turn wait timeout.

import type { ConversationStep } from "../../agents/validator";
import type { NextAction, RuntimeContext, StoredRun } from "../types";

export function dispatchConversation(
  _run: StoredRun,
  step: ConversationStep,
  _context: RuntimeContext,
): NextAction {
  // Stub: advance without running the conversation. See TODO above.
  return { kind: "advance", next: step.on_exit.next };
}
