// v1.35.4 — Revenue tab.
//
// Local-DB-sourced for speed. Stripe API direct (true source of
// truth, especially for downgrades / churn / failed payments)
// graduates in v1.35.4.x. For v1.35.4 this gives Maxime the right
// shape of MRR by plan + monthly trend + conversion funnel + recent
// paid signups, all in <50ms.

import Link from "next/link";
import { getRevenueMetrics } from "@/lib/super-admin/revenue";

export const dynamic = "force-dynamic";

export default async function RevenueTabPage() {
  const m = await getRevenueMetrics();

  const maxMonthly = Math.max(...m.monthly.map((row) => row.mrrDollars), 1);

  return (
    <div className="px-6 py-8 sm:px-10 sm:py-10 max-w-[1200px] mx-auto space-y-10">
      <header>
        <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground font-mono mb-2">
          SeldonFrame · Revenue
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Revenue
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Local-DB approximation. Stripe-sourced numbers (with downgrades + churn) land in v1.35.4.x.
        </p>
      </header>

      {/* MRR + ARR strip */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <BigCard
          label="MRR"
          value={`$${m.totalMrrDollars.toLocaleString()}`}
          subtitle={`across ${m.totalPaidUsers.toLocaleString()} paid user${m.totalPaidUsers === 1 ? "" : "s"}`}
          accent="primary"
        />
        <BigCard
          label="ARR"
          value={`$${m.totalArrDollars.toLocaleString()}`}
          subtitle="MRR × 12"
        />
        <BigCard
          label="Paid users"
          value={m.totalPaidUsers.toLocaleString()}
          subtitle="Growth + Scale"
        />
      </section>

      {/* MRR over time */}
      <section>
        <h2 className="text-base font-semibold text-foreground mb-1">MRR over time</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Monthly snapshot for the last 12 months. Approximation — doesn&apos;t model downgrades or churn yet.
        </p>
        <div className="rounded-[12px] border border-border bg-card p-4 sm:p-6">
          <div className="grid grid-cols-12 gap-1 sm:gap-2 items-end h-44">
            {m.monthly.map((row) => {
              const heightPct = maxMonthly > 0 ? (row.mrrDollars / maxMonthly) * 100 : 0;
              return (
                <div key={row.month} className="flex flex-col items-center gap-1">
                  <div className="w-full flex-1 flex items-end">
                    <div
                      className="w-full rounded-t bg-gradient-to-t from-[#1FAE85] to-[#24c997]"
                      style={{ height: `${Math.max(heightPct, 2)}%` }}
                      title={`${row.monthLabel}: $${row.mrrDollars.toLocaleString()}`}
                    />
                  </div>
                  <p className="text-[9px] font-mono text-muted-foreground tabular-nums">
                    {row.monthLabel}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>0</span>
            <span>{`$${maxMonthly.toLocaleString()} max`}</span>
          </div>
        </div>
      </section>

      {/* By plan */}
      <section>
        <h2 className="text-base font-semibold text-foreground mb-3">By plan</h2>
        <div className="rounded-[12px] border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b">
              <tr className="text-left">
                <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] font-mono text-muted-foreground font-semibold">Plan</th>
                <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] font-mono text-muted-foreground font-semibold text-right">Users</th>
                <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] font-mono text-muted-foreground font-semibold text-right">Monthly</th>
                <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] font-mono text-muted-foreground font-semibold text-right">% of MRR</th>
              </tr>
            </thead>
            <tbody>
              {m.byPlan.map((row) => {
                const isPaid = row.monthlyDollars > 0;
                const pctOfMrr = m.totalMrrDollars > 0 ? (row.monthlyDollars / m.totalMrrDollars) * 100 : 0;
                return (
                  <tr key={row.planId} className="border-b last:border-b-0 hover:bg-accent/30 transition-colors">
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full border text-[10.5px] font-medium ${
                          isPaid
                            ? "bg-[#1FAE85]/10 border-[#1FAE85]/30 text-[#1FAE85]"
                            : "bg-muted/40 border-border text-muted-foreground"
                        }`}
                      >
                        {row.planLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">
                      {row.userCount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground font-medium">
                      ${row.monthlyDollars.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {isPaid ? `${pctOfMrr.toFixed(0)}%` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Conversion funnel */}
      <section>
        <h2 className="text-base font-semibold text-foreground mb-1">Conversion funnel</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Each step shows the % retained from the previous step. Drop-offs point at activation work.
        </p>
        <div className="rounded-[12px] border border-border bg-card overflow-hidden">
          {m.funnel.map((row, i) => {
            const widthPct =
              m.funnel[0].count > 0 ? (row.count / m.funnel[0].count) * 100 : 0;
            return (
              <div
                key={row.step}
                className={`flex items-center gap-3 px-4 sm:px-6 py-4 ${
                  i < m.funnel.length - 1 ? "border-b border-border/60" : ""
                }`}
              >
                <div className="w-6 text-xs text-muted-foreground font-mono">{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-3 mb-1.5">
                    <p className="text-sm text-foreground font-medium truncate">{row.step}</p>
                    <p className="text-sm tabular-nums text-foreground font-semibold whitespace-nowrap">
                      {row.count.toLocaleString()}
                      {row.retainedFromPrevious !== null && (
                        <span className="ml-2 text-xs text-muted-foreground font-normal">
                          ({Math.round(row.retainedFromPrevious * 100)}% from previous)
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#1FAE85] to-[#24c997]"
                      style={{ width: `${Math.max(widthPct, 2)}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Recent paid signups */}
      <section>
        <h2 className="text-base font-semibold text-foreground mb-3">Recent paid signups</h2>
        {m.recentPaid.length === 0 ? (
          <div className="rounded-[10px] border border-dashed border-border bg-card/30 px-5 py-6 text-sm text-muted-foreground">
            No paid users yet. Convert someone this week.
          </div>
        ) : (
          <div className="rounded-[12px] border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b">
                <tr className="text-left">
                  <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] font-mono text-muted-foreground font-semibold">User</th>
                  <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] font-mono text-muted-foreground font-semibold">Plan</th>
                  <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] font-mono text-muted-foreground font-semibold">Joined</th>
                </tr>
              </thead>
              <tbody>
                {m.recentPaid.map((u) => (
                  <tr key={u.id} className="border-b last:border-b-0 hover:bg-accent/30 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/super-admin/users/${u.id}`}
                        className="block hover:text-[#1FAE85] transition-colors"
                      >
                        <div className="font-medium text-foreground truncate">{u.name || u.email}</div>
                        <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-block px-2 py-0.5 rounded-full border border-[#1FAE85]/30 bg-[#1FAE85]/10 text-[#1FAE85] text-[10.5px] font-medium">
                        {u.planLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(u.createdAt).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-[11px] font-mono text-muted-foreground/70">
        Computed at {new Date(m.computedAt).toLocaleString()} · cache TTL 5m · Stripe-sourced version coming in v1.35.4.x
      </p>
    </div>
  );
}

function BigCard({
  label,
  value,
  subtitle,
  accent,
}: {
  label: string;
  value: string;
  subtitle?: string;
  accent?: "primary";
}) {
  const accentClass = accent === "primary"
    ? "border-[#1FAE85]/30 bg-gradient-to-br from-[#1FAE85]/8 to-transparent"
    : "border-border bg-card";
  return (
    <div className={`rounded-[14px] border ${accentClass} p-5`}>
      <p className="text-[11px] uppercase tracking-[0.08em] font-mono text-muted-foreground mb-2">
        {label}
      </p>
      <p className="text-[clamp(28px,3.5vw,40px)] font-bold tracking-tight text-foreground leading-none tabular-nums">
        {value}
      </p>
      {subtitle ? (
        <p className="mt-2 text-xs text-muted-foreground">{subtitle}</p>
      ) : null}
    </div>
  );
}
