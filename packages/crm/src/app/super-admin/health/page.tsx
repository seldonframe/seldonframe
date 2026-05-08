// v1.35.5 — Health tab.
//
// What's available locally without instrumenting Sentry/Datadog:
// workflow run distribution + recent failures, event volume per
// day for the last 7 days, top events, and validator failure rate
// (the v1.28.6 critical-fail signal).
//
// Sentry-backed API error rate, p95/p99 latency, LLM provider
// observed uptime — defer to v1.35.5.x once we wire the
// integrations.

import { getHealthMetrics } from "@/lib/super-admin/health";

export const dynamic = "force-dynamic";

export default async function HealthTabPage() {
  const m = await getHealthMetrics();

  const successPct =
    m.workflows.successRate !== null ? Math.round(m.workflows.successRate * 100) : null;
  const validatorFailPct =
    m.validators.failureRate !== null ? Math.round(m.validators.failureRate * 100) : null;

  const maxDay = Math.max(...m.events.last7DaysByDay.map((d) => d.count), 1);

  return (
    <div className="px-6 py-8 sm:px-10 sm:py-10 max-w-[1200px] mx-auto space-y-10">
      <header>
        <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground font-mono mb-2">
          SeldonFrame · Health
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Platform health
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          What we can see locally. Sentry-backed error rate + Vercel Analytics latency land in v1.35.5.x.
        </p>
      </header>

      {/* Top KPI strip */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KPICard
          label="Workflow success rate"
          value={successPct !== null ? `${successPct}%` : "—"}
          subtitle={
            successPct !== null
              ? `${m.workflows.completed.toLocaleString()} completed · ${m.workflows.failed.toLocaleString()} failed`
              : "no terminal runs yet"
          }
          accent={successPct !== null && successPct >= 95 ? "primary" : successPct !== null && successPct >= 80 ? "neutral" : "warn"}
        />
        <KPICard
          label="Validator failure rate"
          value={validatorFailPct !== null ? `${validatorFailPct}%` : "—"}
          subtitle={
            m.validators.sampleSize > 0
              ? `last ${m.validators.sampleSize.toLocaleString()} assistant turns sampled`
              : "no agent turns yet"
          }
          accent={validatorFailPct !== null && validatorFailPct <= 5 ? "primary" : validatorFailPct !== null && validatorFailPct <= 15 ? "neutral" : "warn"}
        />
        <KPICard
          label="Events · 7d"
          value={m.events.total7d.toLocaleString()}
          subtitle="product analytics events fired"
        />
      </section>

      {/* Workflow status distribution */}
      <section>
        <h2 className="text-base font-semibold text-foreground mb-3">Workflow run status</h2>
        {m.workflows.distribution.length === 0 ? (
          <EmptyHint>No workflow runs yet — the durable runtime is idle.</EmptyHint>
        ) : (
          <div className="rounded-[12px] border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b">
                <tr className="text-left">
                  <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] font-mono text-muted-foreground font-semibold">Status</th>
                  <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] font-mono text-muted-foreground font-semibold text-right">Count</th>
                  <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] font-mono text-muted-foreground font-semibold text-right">% of total</th>
                </tr>
              </thead>
              <tbody>
                {m.workflows.distribution.map((row) => {
                  const pct = m.workflows.total > 0 ? (row.count / m.workflows.total) * 100 : 0;
                  return (
                    <tr key={row.status} className="border-b last:border-b-0">
                      <td className="px-4 py-3">
                        <WorkflowStatusBadge status={row.status} />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-foreground">
                        {row.count.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {pct.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Recent failed workflows */}
      {m.workflows.recentFailed.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">Recent failed workflows</h2>
          <div className="rounded-[12px] border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b">
                <tr className="text-left">
                  <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] font-mono text-muted-foreground font-semibold">Run ID</th>
                  <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] font-mono text-muted-foreground font-semibold">Archetype</th>
                  <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] font-mono text-muted-foreground font-semibold">Workspace</th>
                </tr>
              </thead>
              <tbody>
                {m.workflows.recentFailed.map((row) => (
                  <tr key={row.id} className="border-b last:border-b-0 hover:bg-accent/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground truncate max-w-[200px]">{row.id}</td>
                    <td className="px-4 py-3 font-mono text-xs text-foreground">{row.archetypeId}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground truncate max-w-[200px]">
                      <a href={`/super-admin/workspaces/${row.orgId}`} className="hover:text-[#1FAE85] transition-colors">
                        {row.orgId.slice(0, 8)}…
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Event volume sparkline */}
      <section>
        <h2 className="text-base font-semibold text-foreground mb-3">Event volume · 7 days</h2>
        <div className="rounded-[12px] border border-border bg-card p-4 sm:p-6">
          <div className="grid grid-cols-7 gap-2 items-end h-32">
            {m.events.last7DaysByDay.map((d) => {
              const heightPct = maxDay > 0 ? (d.count / maxDay) * 100 : 0;
              const dayLabel = new Date(d.day).toLocaleDateString(undefined, {
                weekday: "short",
              });
              return (
                <div key={d.day} className="flex flex-col items-center gap-1">
                  <div className="w-full flex-1 flex items-end">
                    <div
                      className="w-full rounded-t bg-gradient-to-t from-[#1FAE85] to-[#24c997]"
                      style={{ height: `${Math.max(heightPct, 2)}%` }}
                      title={`${d.day}: ${d.count.toLocaleString()} events`}
                    />
                  </div>
                  <p className="text-[9px] font-mono text-muted-foreground tabular-nums">
                    {dayLabel}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>0</span>
            <span>{maxDay.toLocaleString()} max</span>
          </div>
        </div>
      </section>

      {/* Top events */}
      <section>
        <h2 className="text-base font-semibold text-foreground mb-3">Top events · last 7 days</h2>
        {m.events.topLast7Days.length === 0 ? (
          <EmptyHint>No events recorded in the last 7 days.</EmptyHint>
        ) : (
          <div className="rounded-[12px] border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b">
                <tr className="text-left">
                  <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] font-mono text-muted-foreground font-semibold">Event</th>
                  <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] font-mono text-muted-foreground font-semibold text-right">Count</th>
                </tr>
              </thead>
              <tbody>
                {m.events.topLast7Days.map((row) => (
                  <tr key={row.event} className="border-b last:border-b-0">
                    <td className="px-4 py-3 font-mono text-xs text-foreground">{row.event}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">
                      {row.count.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-[11px] font-mono text-muted-foreground/70">
        Computed at {new Date(m.computedAt).toLocaleString()} · cache TTL 5m · API error rate + p95 latency land in v1.35.5.x
      </p>
    </div>
  );
}

function KPICard({
  label,
  value,
  subtitle,
  accent,
}: {
  label: string;
  value: string;
  subtitle?: string;
  accent?: "primary" | "neutral" | "warn";
}) {
  const accentClass =
    accent === "primary"
      ? "border-[#1FAE85]/30 bg-gradient-to-br from-[#1FAE85]/8 to-transparent"
      : accent === "warn"
      ? "border-amber-500/30 bg-amber-500/5"
      : "border-border bg-card";
  return (
    <div className={`rounded-[10px] border p-4 ${accentClass}`}>
      <p className="text-[11px] uppercase tracking-[0.06em] font-mono text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tracking-tight text-foreground mt-1 tabular-nums">{value}</p>
      {subtitle ? <p className="text-[11px] text-muted-foreground mt-1">{subtitle}</p> : null}
    </div>
  );
}

function WorkflowStatusBadge({ status }: { status: string }) {
  const styles =
    status === "completed"
      ? "bg-[#1FAE85]/10 border-[#1FAE85]/30 text-[#1FAE85]"
      : status === "failed"
      ? "bg-red-500/10 border-red-500/30 text-red-500"
      : status === "cancelled"
      ? "bg-muted/40 border-border text-muted-foreground"
      : status === "waiting"
      ? "bg-amber-500/10 border-amber-500/30 text-amber-500"
      : "bg-blue-500/10 border-blue-500/30 text-blue-500"; // running
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full border text-[10.5px] font-medium ${styles}`}>
      {status}
    </span>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[10px] border border-dashed border-border bg-card/30 px-5 py-6 text-sm text-muted-foreground">
      {children}
    </div>
  );
}
