// packages/crm/src/lib/workspaces/rollup.ts
//
// Per-workspace rollup query for GET /api/v1/web/workspaces/mine.
// Fans out three light queries (soul completion, last activity, new
// leads this week) per workspace. Called once per org from the
// orchestrator. Returns nullable values so the orchestrator's downstream
// `summarizeWorkspace` can fall back to "setup" / "no activity" states.
//
// The query body lives here (Task 10 wires it). Type lives at top so
// the orchestrator can import it before the DB call is implemented.

export type WorkspaceRollup = {
  orgId: string;
  soulCompletedAt: Date | null;
  lastActivityAt: Date | null;
  newLeadsThisWeek: number;
};

// Implemented in Task 10 (real DB query). Stubbed here so the
// orchestrator's import compiles without a circular Task ordering.
export async function rollupWorkspace(
  _orgId: string,
): Promise<WorkspaceRollup> {
  throw new Error("rollupWorkspace not implemented — see Task 10");
}
