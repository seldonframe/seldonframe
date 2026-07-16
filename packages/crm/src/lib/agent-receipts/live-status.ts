// Agent receipts slice (Task 3) — the per-deployment LIVE banner's pure
// fold: "● LIVE — watching via push · 3 runs today · last 00:04". Design:
// docs/superpowers/specs/2026-07-16-agent-receipts-design.md.
//
// Split pure-fold / DB-loader (same convention as activity.ts /
// activity-store.ts): `summarizeDeploymentLiveStatus` is pure + unit-tested
// here; `getDeploymentLiveStatus` (the DB composition) lives in
// lib/agent-receipts/store.ts, which calls this fold.

import type {
  AgentRunReceiptTriggerKind,
} from "@/db/schema/agent-run-receipts";

export type DeploymentLiveStatus = {
  active: boolean;
  triggerKind: AgentRunReceiptTriggerKind | null;
  todayCount: number;
  lastReceiptAt: string | null;
  /** Present only when a connected-account pin (Task 4) is recorded for
   *  this deployment — surfaced on the banner as "reading <account>". */
  connectedAccountLabel?: string | null;
};

/**
 * Fold a deployment's status + its receipts into the banner's view model.
 * Pure. `receiptCreatedAtIso` should already be the deployment's own
 * receipts (caller/loader scopes the query) — this function only counts
 * "today" (UTC calendar day of `nowMs`) and finds the max timestamp.
 */
export function summarizeDeploymentLiveStatus(args: {
  deploymentStatus: string;
  triggerKind: AgentRunReceiptTriggerKind | null;
  receiptCreatedAtIso: string[];
  nowMs: number;
  connectedAccountLabel?: string | null;
}): DeploymentLiveStatus {
  const todayKey = new Date(args.nowMs).toISOString().slice(0, 10);
  let todayCount = 0;
  let lastMs = -Infinity;
  let lastIso: string | null = null;

  for (const iso of args.receiptCreatedAtIso) {
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) continue;
    if (iso.slice(0, 10) === todayKey) todayCount += 1;
    if (ms > lastMs) {
      lastMs = ms;
      lastIso = iso;
    }
  }

  return {
    active: args.deploymentStatus === "active",
    triggerKind: args.triggerKind,
    todayCount,
    lastReceiptAt: lastIso,
    connectedAccountLabel: args.connectedAccountLabel ?? null,
  };
}

/** Render the banner's headline text, e.g. "LIVE — watching via push · 3
 *  runs today · last 00:04" or "LIVE — watching via schedule · no runs yet".
 *  Pure; the caller decides whether to render at all (design: "if no
 *  deployment exists render nothing" — that's a presence check upstream,
 *  not this function's job). Returns null when `active` is false (an
 *  inactive/paused/draft deployment gets no LIVE banner). */
export function describeDeploymentLiveStatus(status: DeploymentLiveStatus): string | null {
  if (!status.active) return null;
  const via = status.triggerKind ? ` — watching via ${status.triggerKind}` : "";
  const runsPart =
    status.todayCount > 0
      ? `${status.todayCount} run${status.todayCount === 1 ? "" : "s"} today`
      : "no runs yet";
  const lastPart = status.lastReceiptAt ? ` · last ${formatClock(status.lastReceiptAt)}` : "";
  const accountPart = status.connectedAccountLabel
    ? ` · reading ${status.connectedAccountLabel}`
    : "";
  return `LIVE${via} · ${runsPart}${lastPart}${accountPart}`;
}

/** "HH:MM" (UTC) from an ISO timestamp — a compact, locale-stable clock for
 *  the banner. Falls back to the raw string if unparseable. */
function formatClock(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return new Date(ms).toISOString().slice(11, 16);
}
