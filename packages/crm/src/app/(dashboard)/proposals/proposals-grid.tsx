"use client";

// packages/crm/src/app/(dashboard)/proposals/proposals-grid.tsx
import Link from "next/link";
import type { Proposal } from "@/db/schema/proposals";
import { ProposalStatusPill } from "@/components/proposals/proposal-status-pill";

function formatPrice(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}/mo`;
}

function formatDate(value: Date | string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ProposalsGrid({ proposals }: { proposals: Proposal[] }) {
  if (proposals.length === 0) {
    return (
      <section className="rounded-2xl border border-border/70 bg-card/40 p-12 text-center space-y-3">
        <h2 className="text-xl font-semibold">No proposals yet</h2>
        <p className="text-sm text-muted-foreground">
          No proposals yet — click{" "}
          <span className="font-medium">+ New proposal</span> to pitch your first prospect.
        </p>
      </section>
    );
  }

  return (
    <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
      {proposals.map((p) => (
        <Link
          key={p.id}
          href={`/proposals/${p.id}`}
          className="rounded-2xl border border-border/80 bg-card/80 p-5 hover:shadow-lg transition-shadow"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <h3 className="font-semibold truncate">{p.prospectName}</h3>
              <p className="text-xs text-muted-foreground truncate">{p.prospectEmail}</p>
            </div>
            <ProposalStatusPill status={p.status} />
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Price</dt>
              <dd className="font-medium">{formatPrice(p.monthlyPriceCents)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Sent</dt>
              <dd className="font-medium">{formatDate(p.sentAt)}</dd>
            </div>
          </dl>
        </Link>
      ))}
    </div>
  );
}
