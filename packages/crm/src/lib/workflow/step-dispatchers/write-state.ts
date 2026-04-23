// write_state step dispatcher — writes a value to a workspace-
// scoped Soul/theme path. SLICE 3 C2 per audit §3.2 + G-3-3
// Option B-2 (static allowlist + defense-in-depth runtime check).
//
// Contract:
//   - Path interpolation resolved BEFORE allowlist check + write.
//     `workspace.soul.contact.{{id}}.stage` with `id=c-1` becomes
//     `workspace.soul.contact.c-1.stage`. The allowlist check
//     applies to the LITERAL template (see §3 note below).
//   - Value interpolation resolved (strings only; nested objects
//     walked).
//   - Allowlist re-check in the dispatcher is defense-in-depth.
//     The validator already rejected non-allowlisted paths at
//     synthesis time, but if that gate is bypassed (hand-crafted
//     spec, stale validator, etc.), runtime fails loud.
//   - Missing SoulStore → fail.
//   - SoulStore.writePath throws → fail.
//
// Note on dynamic paths: the allowlist check applies to the
// LITERAL template path (with `{{...}}` unresolved) — NOT the
// post-interpolation path. Allowing dynamic paths to bypass via
// interpolation would defeat the safety model. If a use case
// needs a dynamic path prefix, the allowlist entry must carry
// the {{template}} exactly.

import type { WriteStateStep } from "../../agents/validator";
import type { NextAction, RuntimeContext, StoredRun } from "../types";
import { splitWorkspacePath } from "../state-access/soul-store";
import { isAgentWritablePath } from "../state-access/allowlist";
import { resolveInterpolations, resolveInterpolationsInString } from "../interpolate";

export async function dispatchWriteState(
  run: StoredRun,
  step: WriteStateStep,
  context: RuntimeContext,
): Promise<NextAction> {
  if (!context.soulStore) {
    return {
      kind: "fail",
      reason: "write_state dispatcher requires context.soulStore",
    };
  }

  // Defense-in-depth allowlist check on the LITERAL template.
  // Synthesis-time validator already rejected non-allowlisted
  // paths; this is the second gate.
  if (!isAgentWritablePath(step.path)) {
    return {
      kind: "fail",
      reason: `write_state.path "${step.path}" is not agent-writable (allowlist refused at runtime — indicates validator bypass)`,
    };
  }

  // Resolve interpolations in path (for targeting the write) and
  // in value (for the content). The allowlist check above used
  // the template; SoulStore uses the resolved path.
  const resolvedPath = resolveInterpolationsInString(step.path, run);

  const split = splitWorkspacePath(resolvedPath);
  if (!split) {
    return {
      kind: "fail",
      reason: `write_state.path "${resolvedPath}" does not start with "workspace.soul." or "workspace.theme."`,
    };
  }

  const resolvedValue = resolveInterpolations(step.value, run);

  try {
    await context.soulStore.writePath(run.orgId, split.innerPath, resolvedValue, split.slice);
    return { kind: "advance", next: step.next };
  } catch (err) {
    return {
      kind: "fail",
      reason: `write_state write failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
