// v1.35.0 — Super-admin overview.
//
// Above the fold: 4 hero numbers (MRR / ARR / Paid signups 7d /
// Active workspaces 24h). Below: pointer to the deeper tabs.
//
// Server Component — metrics queries run on the server, cached for
// 5 minutes via unstable_cache. The page renders with cached data
// the moment it's requested.

import { getHeroMetrics, type HeroMetric } from "@/lib/super-admin/metrics";
import { getActivationFunnel, type FunnelStage } from "@/lib/super-admin/activation";

export const dynamic = "force-dynamic";

export default async function SuperAdminOverviewPage() {
  const [metrics, activation] = await Promise.all([getHeroMetrics(), getActivationFunnel()]);

  return (
    <div className="px-6 py-8 sm:px-10 sm:py-10 max-w-[1200px] mx-auto space-y-10">
      <header>
        <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground font-mono mb-2">
          SeldonFrame · Platform overview
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Today
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The four numbers that tell you whether the business is moving, plus the activation funnel
          showing whether signups are turning into builders. Refreshes every 5 minutes from cache.
        </p>
      </header>

      {/* Hero stat cards */}
      <section>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard metric={metrics.mrr} accent="primary" />
          <StatCard metric={metrics.arr} accent="muted" />
          <StatCard metric={metrics.paidSignupsLast7d} accent="muted" />
          <StatCard metric={metrics.activeWorkspacesLast24h} accent="muted" />
        </div>
        <p className="mt-3 text-[11px] font-mono text-muted-foreground/70">
          Computed at {new Date(metrics.computedAt).toLocaleString()} · cache TTL 5m
        </p>
      </section>

      {/* Activation funnel */}
      <section className="border-t pt-10">
        <h2 className="text-base font-semibold text-foreground mb-1">Activation</h2>
        <p className="text-sm text-muted-foreground mb-5">
          Where signups turn into usage — and where they leak.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {activation.stages.map((stage, i) => (
            <FunnelTile key={stage.label} stage={stage} accent={i === 0 ? "primary" : "muted"} />
          ))}
        </div>
        <div className="mt-5 space-y-1.5">
          <p className="text-xs text-muted-foreground">
            IDE connections: {formatNumber(activation.connections.used)} of{" "}
            {formatNumber(activation.connections.minted)} device tokens have ever made a call (
            {activation.connections.usedPct}%) — the rest connected but never built.
          </p>
          <p className="text-xs text-muted-foreground">
            {formatNumber(activation.signupsTotal)} people signed up · {formatNumber(activation.signupsLast7d)} this
            week.
          </p>
        </div>
      </section>

      {/* Drill-down cues */}
      <section className="border-t pt-10">
        <h2 className="text-base font-semibold text-foreground mb-4">Drill into the tabs</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <DrillCard
            href="/super-admin/users"
            title="Users"
            body="Search, filter by plan, drill into per-user history."
          />
          <DrillCard
            href="/super-admin/workspaces"
            title="Workspaces"
            body="Sortable by activity. Per-workspace template, agents, integrations."
          />
          <DrillCard
            href="/super-admin/agents"
            title="Agents"
            body="Platform-wide eval pass rate, top failing scenarios, regen rate."
          />
          <DrillCard
            href="/super-admin/revenue"
            title="Revenue"
            body="Stripe-sourced. MRR over time, churn, conversion funnel. (v1.35.4)"
          />
          <DrillCard
            href="/super-admin/health"
            title="Health"
            body="API errors, p95 latency, workflow success rate. (v1.35.5)"
          />
        </div>
      </section>
    </div>
  );
}

function StatCard({ metric, accent }: { metric: HeroMetric; accent: "primary" | "muted" }) {
  const accentClass =
    accent === "primary"
      ? "border-[#1FAE85]/30 bg-gradient-to-br from-[#1FAE85]/8 to-transparent"
      : "border-border bg-card";

  return (
    <div className={`relative rounded-[14px] border ${accentClass} p-5`}>
      <p className="text-[11px] uppercase tracking-[0.08em] font-mono text-muted-foreground mb-2">
        {metric.label}
      </p>
      <p className="text-[clamp(28px,3.5vw,40px)] font-bold tracking-tight text-foreground leading-none">
        {metric.ready ? metric.value : "—"}
      </p>
      {metric.subtitle ? (
        <p className="mt-2 text-xs text-muted-foreground">{metric.subtitle}</p>
      ) : null}
    </div>
  );
}

function FunnelTile({ stage, accent }: { stage: FunnelStage; accent: "primary" | "muted" }) {
  const accentClass =
    accent === "primary"
      ? "border-[#1FAE85]/30 bg-gradient-to-br from-[#1FAE85]/8 to-transparent"
      : "border-border bg-card";

  return (
    <div className={`relative rounded-[14px] border ${accentClass} p-5`}>
      <p className="text-[11px] uppercase tracking-[0.08em] font-mono text-muted-foreground mb-2">
        {stage.label}
      </p>
      <p className="text-[clamp(28px,3.5vw,40px)] font-bold tracking-tight text-foreground leading-none">
        {formatNumber(stage.count)}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        {stage.ofTotalPct}% · {stage.hint}
      </p>
    </div>
  );
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

function DrillCard({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <a
      href={href}
      className="group block rounded-[12px] border border-border bg-card p-5 hover:border-[#1FAE85]/30 hover:-translate-y-[1px] transition-all"
    >
      <h3 className="text-sm font-semibold text-foreground group-hover:text-[#1FAE85] transition-colors">
        {title}
      </h3>
      <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{body}</p>
    </a>
  );
}
