// Per-sub-account usage meter (2026-07-08) — Task 2: the usage panel.
//
// Spec: docs/superpowers/specs/2026-07-08-subaccount-usage-meter-design.md (D3).
// Plan: docs/superpowers/plans/2026-07-08-subaccount-usage-meter.md (Task 2).
//
// Pure presentation — the page (page.tsx) loads the rollup ONCE for the whole
// book (getAgencyUsageRollup) and passes each client's row (or undefined, when
// the client has zero usage this period) as a prop. formatUsageLine (Task 1)
// owns the pinned "estimated" copy so the wording only lives in one place.
//
// Server Component (no "use client" — no interactivity yet; the cap editor
// lands here in Task 3 as a nested client island).

import { Gauge, Wallet } from "lucide-react";
import { formatUsageLine, type OrgUsageRow } from "@/lib/billing/usage-rollup";
import type { RevenueRollupTotals } from "@/lib/payments/revenue-rollup";

/** One client card's usage line — a quiet, secondary-tone strip beneath the
 *  agent list. `row` is undefined when the client has no provisioned org yet
 *  (never activated → not in the counted sub-account set); the section is
 *  omitted entirely in that case (nothing to show). A zeroed row (provisioned,
 *  zero usage this period) still renders — the operator sees every counted
 *  client, including quiet ones. */
export function ClientUsagePanel({ row }: { row: OrgUsageRow | undefined }) {
  if (!row) return null;

  return (
    <div className="flex items-start gap-2 border-t border-border px-5 py-3 text-[12px] text-muted-foreground">
      <Gauge className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <p>{formatUsageLine(row)}</p>
    </div>
  );
}

/** The portfolio-wide usage totals strip — sits alongside the existing
 *  Clients / Total-MRR / Active-agents KPI tiles. Omitted when the agency has
 *  no counted sub-accounts (nothing to total). */
export function UsageTotalsTile({
  totals,
}: {
  totals: { conversations: number; tokensIn: number; tokensOut: number; estCostCents: number; voiceSpendCents: number };
}) {
  const totalTokens = totals.tokensIn + totals.tokensOut;
  const estDollars = (totals.estCostCents / 100).toFixed(2);

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-(--shadow-xs)">
      <span
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"
        aria-hidden
      >
        <Gauge className="size-[22px]" />
      </span>
      <div>
        <div className="font-mono text-2xl font-semibold tracking-tight text-foreground">
          ~${estDollars}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          Estimated AI cost this month · {totals.conversations.toLocaleString("en-US")} conversations ·{" "}
          {totalTokens.toLocaleString("en-US")} tokens
        </div>
      </div>
    </div>
  );
}

/** Autopay console (2026-07-08, Task 5) — the month-to-date revenue strip.
 *  Sits alongside the Clients / Total-MRR / Active-agents / Usage KPI tiles.
 *  Flag-gated (SF_AUTOPAY_CONSOLE) by the caller; omitted when the agency has
 *  collected nothing this period (nothing to show). The fee line is a
 *  DISPLAY number only, read from GMV_FEE_PERCENT — Stripe already collected
 *  it at the application_fee_percent level on each charge. */
export function RevenueStripTile({ totals }: { totals: RevenueRollupTotals }) {
  const collectedDollars = (totals.collectedCents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  const feeDollars = (totals.feeCents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-(--shadow-xs)">
      <span
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
        aria-hidden
      >
        <Wallet className="size-[22px]" />
      </span>
      <div>
        <div className="font-mono text-2xl font-semibold tracking-tight text-foreground">
          {collectedDollars}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          Collected this month across your book · includes SeldonFrame&apos;s {feeDollars} platform fee
        </div>
      </div>
    </div>
  );
}
