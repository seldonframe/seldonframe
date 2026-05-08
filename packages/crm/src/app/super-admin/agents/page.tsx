// v1.35.3 — Agents tab.
//
// Platform-wide agent fleet health. Replaces the v1.35.0 placeholder
// with real metrics: fleet status counts, per-archetype pass rates,
// top failing scenarios, conversation volume.

import { getAgentMetrics } from "@/lib/super-admin/agents";

export const dynamic = "force-dynamic";

export default async function AgentsTabPage() {
  const m = await getAgentMetrics();

  const passRatePct = m.recentPassRate !== null ? Math.round(m.recentPassRate * 100) : null;
  const completedSharePct = Math.round(m.conversations.completedShare30d * 100);

  return (
    <div className="px-6 py-8 sm:px-10 sm:py-10 max-w-[1200px] mx-auto space-y-10">
      <header>
        <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground font-mono mb-2">
          SeldonFrame · Agents
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Agent fleet
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Platform-wide. Are agents working? Is the eval gate catching things? Where do skill packs need work?
        </p>
      </header>

      {/* Fleet status strip */}
      <section>
        <h2 className="text-base font-semibold text-foreground mb-3">Fleet status</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <FleetCard label="Live" value={m.fleet.live} accent="primary" subtitle="customer-facing" />
          <FleetCard label="Draft / Test" value={m.fleet.draft + m.fleet.test} subtitle="pre-publish" />
          <FleetCard label="Paused" value={m.fleet.paused} subtitle="manually disabled" />
          <FleetCard label="Total" value={m.fleet.total} subtitle="all statuses" />
        </div>
      </section>

      {/* Recent eval pass rate */}
      <section>
        <h2 className="text-base font-semibold text-foreground mb-3">Eval pass rate · live agents</h2>
        <div className="rounded-[12px] border border-border bg-card p-6 space-y-4">
          {passRatePct !== null ? (
            <>
              <div className="flex items-baseline gap-3">
                <p className="text-5xl font-bold tracking-tight text-foreground tabular-nums">
                  {passRatePct}%
                </p>
                <p className="text-sm text-muted-foreground">
                  most recent eval run per (agent × scenario), averaged across live agents
                </p>
              </div>
              {/* Bar */}
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    passRatePct >= 87
                      ? "bg-gradient-to-r from-[#1FAE85] to-[#24c997]"
                      : passRatePct >= 75
                      ? "bg-gradient-to-r from-amber-500 to-amber-400"
                      : "bg-gradient-to-r from-red-500 to-red-400"
                  }`}
                  style={{ width: `${passRatePct}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Publish gate threshold is ≥87.5%. Below that, agents can&apos;t go live.
                {passRatePct < 87 && (
                  <span className="text-amber-500">
                    {" "}Some live agents are pre-existing or were grandfathered before the gate tightened.
                  </span>
                )}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No eval runs recorded yet for live agents. Numbers populate as agents publish + run their suites.
            </p>
          )}
        </div>
      </section>

      {/* Per-archetype */}
      <section>
        <h2 className="text-base font-semibold text-foreground mb-3">Per-archetype health</h2>
        {m.archetypes.length === 0 ? (
          <EmptyHint>No agents yet — archetype breakdown will populate as workspaces build their first chatbot.</EmptyHint>
        ) : (
          <div className="rounded-[12px] border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b">
                <tr className="text-left">
                  <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] font-mono text-muted-foreground font-semibold">Archetype</th>
                  <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] font-mono text-muted-foreground font-semibold text-right">Total</th>
                  <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] font-mono text-muted-foreground font-semibold text-right">Live</th>
                  <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] font-mono text-muted-foreground font-semibold text-right">Pass rate</th>
                </tr>
              </thead>
              <tbody>
                {m.archetypes.map((a) => {
                  const pct = a.recentPassRate !== null ? Math.round(a.recentPassRate * 100) : null;
                  return (
                    <tr key={a.archetype} className="border-b last:border-b-0 hover:bg-accent/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-foreground">{a.archetype}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{a.total}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-foreground">{a.live}</td>
                      <td className="px-4 py-3 text-right">
                        {pct !== null ? (
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full border text-[10.5px] font-medium tabular-nums ${
                              pct >= 87
                                ? "bg-[#1FAE85]/10 border-[#1FAE85]/30 text-[#1FAE85]"
                                : pct >= 75
                                ? "bg-amber-500/10 border-amber-500/30 text-amber-500"
                                : "bg-red-500/10 border-red-500/30 text-red-500"
                            }`}
                          >
                            {pct}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50 text-xs">no data</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Top failing scenarios */}
      <section>
        <h2 className="text-base font-semibold text-foreground mb-1">Top failing scenarios</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Scenarios with the highest fail rate across the fleet. These are where the next skill-pack improvements should land.
        </p>
        {m.topFailingScenarios.length === 0 ? (
          <EmptyHint>
            No scenarios with ≥3 attempts have failures yet. Either everyone&apos;s passing (great) or the eval suite hasn&apos;t run enough times to surface trends.
          </EmptyHint>
        ) : (
          <div className="rounded-[12px] border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b">
                <tr className="text-left">
                  <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] font-mono text-muted-foreground font-semibold">Scenario ID</th>
                  <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] font-mono text-muted-foreground font-semibold text-right">Attempts</th>
                  <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] font-mono text-muted-foreground font-semibold text-right">Fails</th>
                  <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] font-mono text-muted-foreground font-semibold text-right">Fail rate</th>
                </tr>
              </thead>
              <tbody>
                {m.topFailingScenarios.map((s) => {
                  const failPct = Math.round(s.failRate * 100);
                  return (
                    <tr key={s.scenarioId} className="border-b last:border-b-0 hover:bg-accent/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-foreground">{s.scenarioId}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{s.attempts}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-foreground">{s.fails}</td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full border text-[10.5px] font-medium tabular-nums ${
                            failPct >= 50
                              ? "bg-red-500/10 border-red-500/30 text-red-500"
                              : "bg-amber-500/10 border-amber-500/30 text-amber-500"
                          }`}
                        >
                          {failPct}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Conversation volume */}
      <section>
        <h2 className="text-base font-semibold text-foreground mb-3">Conversations</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <FleetCard label="Last 24h" value={m.conversations.last24h} subtitle="started" />
          <FleetCard label="Last 7d" value={m.conversations.last7d} subtitle="started" />
          <FleetCard label="Last 30d" value={m.conversations.last30d} subtitle="started" />
          <FleetCard
            label="Completed · 30d"
            value={`${completedSharePct}%`}
            subtitle="ended without escalation"
            accent={completedSharePct >= 60 ? "primary" : "neutral"}
          />
        </div>
      </section>

      <p className="text-[11px] font-mono text-muted-foreground/70">
        Computed at {new Date(m.computedAt).toLocaleString()} · cache TTL 5m · pass-rate is most-recent run per (agent × scenario)
      </p>
    </div>
  );
}

function FleetCard({
  label,
  value,
  subtitle,
  accent,
}: {
  label: string;
  value: number | string;
  subtitle?: string;
  accent?: "primary" | "neutral";
}) {
  const accentClass = accent === "primary"
    ? "border-[#1FAE85]/30 bg-gradient-to-br from-[#1FAE85]/8 to-transparent"
    : "border-border bg-card";
  return (
    <div className={`rounded-[10px] border p-4 ${accentClass}`}>
      <p className="text-[11px] uppercase tracking-[0.06em] font-mono text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tracking-tight text-foreground mt-1 tabular-nums">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      {subtitle ? <p className="text-[11px] text-muted-foreground mt-1">{subtitle}</p> : null}
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[10px] border border-dashed border-border bg-card/30 px-5 py-6 text-sm text-muted-foreground">
      {children}
    </div>
  );
}
