// ICP-3 — the deployment-first / workspace-fallback decision, extracted as a
// tiny PURE function so the additive ordering is locked by a unit test and can't
// silently regress.
//
// The contract (HARD RULE for this change): try the DEPLOYMENT path FIRST; if an
// active deployment matched the dialed number, it ALWAYS wins. Only when no
// deployment matched do we fall through to the EXISTING workspace path — which is
// left completely unchanged, and which already degrades gracefully to a
// tool-less greeting when it can't resolve a workspace either. So a "no
// deployment" call ALWAYS routes to "workspace" regardless of whether the
// workspace itself resolves.

export type VoiceTarget = "deployment" | "workspace";

/**
 * Decide which voice path handles the call.
 *
 * @param hasDeployment        true when resolveDeploymentByNumber matched an
 *                             active deployment for the dialed number.
 * @param workspaceResolvable  whether the workspace path could resolve a
 *                             workspace (informational only — it does NOT change
 *                             the decision: the workspace path owns the
 *                             unresolved case itself today).
 */
export function chooseVoiceTarget(
  hasDeployment: boolean,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  workspaceResolvable: boolean,
): VoiceTarget {
  return hasDeployment ? "deployment" : "workspace";
}
