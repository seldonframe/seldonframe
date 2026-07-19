// <DeploymentLiveBanner> — "● LIVE — watching via push · 3 runs today ·
// last 00:04" on the agent template page's deploy/run area. Design:
// docs/superpowers/specs/2026-07-16-agent-receipts-design.md (Task 3).
//
// Pure presentation — the page composes the status via
// getDeploymentLiveStatus (lib/agent-receipts/store.ts) and passes it in.
// Renders nothing when `status` is null (no deployment) OR the described
// text is null (inactive deployment) — see describeDeploymentLiveStatus.

import {
  describeDeploymentLiveStatus,
  type DeploymentLiveStatus,
} from "@/lib/agent-receipts/live-status";

export function DeploymentLiveBanner({
  status,
}: {
  status: DeploymentLiveStatus | null;
}) {
  if (!status) return null;
  const text = describeDeploymentLiveStatus(status);
  if (!text) return null;

  return (
    <div
      data-deployment-live-banner
      className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400"
    >
      <span className="inline-flex size-1.5 rounded-full bg-emerald-500" aria-hidden />
      {text}
    </div>
  );
}
