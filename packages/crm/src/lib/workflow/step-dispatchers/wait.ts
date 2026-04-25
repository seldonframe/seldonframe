// wait step dispatcher — synchronous timer pause.
//
// Per the audit ambiguity resolution on PR 2 kickoff: wait steps
// reuse workflow_waits with sentinel eventType="__timer__". The same
// cron tick that resolves await_event timeouts also wakes wait steps
// — one code path, one index scan.

import type { WaitStep } from "../../agents/validator";
import type { NextAction, RuntimeContext, StoredRun } from "../types";

export function dispatchWait(
  _run: StoredRun,
  step: WaitStep,
  context: RuntimeContext,
): NextAction {
  const timeoutAt = new Date(context.now().getTime() + step.seconds * 1000);
  return {
    kind: "pause_timer",
    timeoutAt,
    nextAfter: step.next,
  };
}
