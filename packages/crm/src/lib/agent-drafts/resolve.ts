// Thin, store-agnostic resolution used by the /approvals server actions —
// kept out of actions.ts so it's unit-testable against the memory twin.
import type { AgentDraftStore, ResolveDraftInput } from "./types";

export async function resolveDraftForOperator(
  store: AgentDraftStore,
  input: ResolveDraftInput,
): Promise<{ ok: boolean; conflict?: boolean }> {
  const row = await store.resolveDraft(input);
  if (!row) return { ok: false, conflict: true };
  return { ok: true };
}
