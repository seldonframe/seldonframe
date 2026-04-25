// Production runtime wiring for message-triggered runs.
// SLICE 7 PR 2 C2 per audit §4.1 + §5.3.
//
// Two factories:
//   - buildMessageTriggerSpecResolver — resolves an archetype id to a
//     filled AgentSpec via the registry. v1 supports placeholder-free
//     archetypes only (appointment-confirm-sms ships in C3).
//     Per-workspace placeholder filling is a follow-up slice (requires
//     an installer flow + workspace_archetype_install table).
//   - buildMessageTriggerStartRun — adapter that invokes
//     workflow/runtime.startRun via an injected runtime context.
//     Caller (message-trigger-wiring.ts) constructs the runtime
//     context once per webhook request and passes it in.
//
// Both kept as factories so the dispatcher tests can inject fakes
// without instantiating real DB / runtime infrastructure.

import { getArchetype } from "./archetypes";
import type { StartRunInput } from "./message-trigger-dispatcher";
import type { AgentSpec } from "./validator";
import type { RuntimeContext } from "../workflow/types";

export type SpecResolver = (archetypeId: string) => Promise<AgentSpec>;

export function buildMessageTriggerSpecResolver(): SpecResolver {
  return async (archetypeId: string) => {
    const archetype = getArchetype(archetypeId);
    if (!archetype) {
      throw new Error(`unknown archetype "${archetypeId}" — not found in registry`);
    }
    // v1: placeholder-free archetypes only. specTemplate IS the
    // AgentSpec. C3's appointment-confirm-sms is the first
    // placeholder-free archetype designed for message-trigger dispatch.
    return archetype.specTemplate as unknown as AgentSpec;
  };
}

export type StartRunFn = (input: StartRunInput) => Promise<string>;

export type RuntimeStartRunFn = (
  ctx: RuntimeContext,
  input: {
    orgId: string;
    archetypeId: string;
    spec: AgentSpec;
    triggerEventId: string | null;
    triggerPayload: Record<string, unknown>;
  },
) => Promise<string>;

export function buildMessageTriggerStartRun(deps: {
  runtimeContext: RuntimeContext;
  runtimeStartRun: RuntimeStartRunFn;
}): StartRunFn {
  return async (input) => deps.runtimeStartRun(deps.runtimeContext, input);
}
