// read_state step dispatcher — queries the workspace's Soul (or
// theme) slice and binds the result as a capture.
//
// Shipped in SLICE 3 PR 1 C1 per audit §3.1 + G-3-1.
//
// Contract:
//   - Path interpolation is resolved BEFORE slicing + reading. A
//     path like `workspace.soul.contact.{{selected.key}}.email`
//     resolves `{{selected.key}}` against the run's scope first,
//     then walks.
//   - The SoulStore is in `context.soulStore`; if absent, the
//     dispatcher fails loud (required for SLICE 3 step types).
//   - Missing paths return undefined captures (not an error) —
//     matches the existing interpolation resolver's "miss leaves
//     raw" spirit. Downstream steps branching on the captured
//     value handle the undefined case.
//   - On SoulStore throw → `{kind: "fail", reason}`.

import type { ReadStateStep } from "../../agents/validator";
import type { NextAction, RuntimeContext, StoredRun } from "../types";
import { splitWorkspacePath } from "../state-access/soul-store";
import { resolveInterpolationsInString } from "../interpolate";

export async function dispatchReadState(
  run: StoredRun,
  step: ReadStateStep,
  context: RuntimeContext,
): Promise<NextAction> {
  if (!context.soulStore) {
    return {
      kind: "fail",
      reason: "read_state dispatcher requires context.soulStore (wire SoulStore into RuntimeContext)",
    };
  }

  const resolvedPath = resolveInterpolationsInString(step.path, run);
  const split = splitWorkspacePath(resolvedPath);
  if (!split) {
    return {
      kind: "fail",
      reason: `read_state.path "${resolvedPath}" does not start with "workspace.soul." or "workspace.theme."`,
    };
  }

  try {
    const value = await context.soulStore.readPath(run.orgId, split.innerPath, split.slice);
    return {
      kind: "advance",
      next: step.next,
      capture: { name: step.capture, value },
    };
  } catch (err) {
    return {
      kind: "fail",
      reason: `read_state read failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
