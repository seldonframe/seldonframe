// packages/crm/src/lib/proposals/status.ts
// 2026-05-19 — Proposal Builder lifecycle. Pinned transitions so a row
// can't accidentally regress (e.g., declined → sent). Spec:
// 2026-05-19-proposal-builder-design.md §"Lifecycle".

import type { ProposalStatus } from "@/db/schema/proposals";

const ALLOWED: Record<ProposalStatus, readonly ProposalStatus[]> = {
  draft: ["sent"],
  sent: ["viewed", "accepted", "declined", "expired"],
  viewed: ["accepted", "declined", "expired"],
  accepted: [],
  declined: [],
  expired: [],
};

export function canTransition(from: ProposalStatus, to: ProposalStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function assertTransition(from: ProposalStatus, to: ProposalStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid proposal status transition: ${from} → ${to}`);
  }
}
