// ICP-3 — status pill for a deployment (lite-tenant). Pure server-safe React
// (no "use client", no hooks). Mirrors the agent-template status-badge chrome.
//
// draft     — saved, not yet activated (no number/billing). The common state
//             until the gated activation steps ship.
// active    — live (number provisioned + billing running).
// paused    — temporarily off.
// canceled  — ended.

import type { DeploymentStatus } from "@/db/schema/deployments";

export function DeploymentStatusBadge({
  status,
}: {
  status: DeploymentStatus | string;
}) {
  const tone =
    status === "active"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
      : status === "paused"
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
        : status === "canceled"
          ? "bg-rose-500/15 text-rose-700 dark:text-rose-400"
          : // draft (and any unknown) — neutral
            "bg-slate-500/15 text-slate-700 dark:text-slate-300";
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${tone}`}>
      {status}
    </span>
  );
}
