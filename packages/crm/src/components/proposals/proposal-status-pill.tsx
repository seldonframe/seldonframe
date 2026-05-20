// packages/crm/src/components/proposals/proposal-status-pill.tsx
import type { ProposalStatus } from "@/db/schema/proposals";

const STATUS_STYLES: Record<ProposalStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  sent: { label: "Sent", className: "bg-sky-500/10 text-sky-700" },
  viewed: { label: "Viewed", className: "bg-violet-500/10 text-violet-700" },
  accepted: { label: "Accepted", className: "bg-emerald-500/10 text-emerald-700" },
  declined: { label: "Declined", className: "bg-rose-500/10 text-rose-700" },
  expired: { label: "Expired", className: "bg-amber-500/10 text-amber-700" },
};

export function ProposalStatusPill({ status }: { status: ProposalStatus }) {
  const style = STATUS_STYLES[status];
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${style.className}`}>
      {style.label}
    </span>
  );
}
