// v1.28.1 — agent roster + health dashboard.
//
// Each row now exposes inline health stats (status, version,
// validator pass rate 24h, eval pass rate, conversations 24h) PLUS
// 4 quick-link CTAs (Overview, Sandbox, Conversations, Settings, Evals)
// so operators don't have to drill into /agents/[id] for the daily
// "is my agent healthy?" check. Replaces the v1.26.2 list-of-links
// design that surfaced only 2 CTAs and zero stats.

import Link from "next/link";
import { and, desc, eq, gte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  agents,
  agentConversations,
  agentEvals,
  agentTurns,
} from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";

export const dynamic = "force-dynamic";

type AgentRowStats = {
  conversations24h: number;
  validatorPassRate: number | null;
  validatorTotalTurns: number;
  evalPassed: number;
  evalTotal: number;
  evalMeetsGate: boolean | null;
  lastEvalRun: Date | null;
};

export default async function AdminAgentsPage() {
  const orgId = await getOrgId();
  if (!orgId) {
    return (
      <section className="animate-page-enter space-y-4">
        <h1 className="text-page-title">Agents</h1>
        <p className="text-sm text-muted-foreground">
          Sign in to view your workspace's agents.
        </p>
      </section>
    );
  }

  const rows = await db
    .select({
      id: agents.id,
      name: agents.name,
      slug: agents.slug,
      channel: agents.channel,
      archetype: agents.archetype,
      status: agents.status,
      currentVersion: agents.currentVersion,
      createdAt: agents.createdAt,
    })
    .from(agents)
    // copilot rows are plumbing, not user agents (win-ladder plan T2)
    .where(and(eq(agents.orgId, orgId), ne(agents.archetype, "workspace_copilot")))
    .orderBy(desc(agents.createdAt));

  const sinceTs = new Date(Date.now() - 24 * 3600 * 1000);

  // Compute per-agent stats in parallel (cap is small — the operator
  // typically has 1-3 agents per workspace).
  const statsByAgent = new Map<string, AgentRowStats>();
  await Promise.all(
    rows.map(async (row) => {
      const [convAgg] = await db
        .select({
          conversations: sql<number>`count(distinct ${agentConversations.id})`,
        })
        .from(agentConversations)
        .where(
          and(
            eq(agentConversations.agentId, row.id),
            gte(agentConversations.startedAt, sinceTs),
            sql`(${agentConversations.channelMeta} ->> 'eval_run') IS DISTINCT FROM 'true'`,
          ),
        );

      const [validatorAgg] = await db
        .select({
          total: sql<number>`count(*)`,
          clean: sql<number>`count(*) filter (where not exists (select 1 from jsonb_array_elements(${agentTurns.validatorsPassed}) elem where (elem->>'passed')::boolean = false))`,
        })
        .from(agentTurns)
        .innerJoin(
          agentConversations,
          eq(agentConversations.id, agentTurns.conversationId),
        )
        .where(
          and(
            eq(agentConversations.agentId, row.id),
            eq(agentTurns.role, "assistant"),
            gte(agentTurns.createdAt, sinceTs),
          ),
        );

      const evalRows = await db
        .select({
          scenarioId: agentEvals.scenarioId,
          passed: agentEvals.passed,
          ranAt: agentEvals.ranAt,
        })
        .from(agentEvals)
        .where(eq(agentEvals.agentId, row.id))
        .orderBy(desc(agentEvals.ranAt))
        .limit(50);

      const latestByScenario = new Map<string, boolean | null>();
      let mostRecentRun: Date | null = null;
      for (const r of evalRows) {
        if (!latestByScenario.has(r.scenarioId)) {
          latestByScenario.set(r.scenarioId, r.passed);
          if (!mostRecentRun || r.ranAt > mostRecentRun) mostRecentRun = r.ranAt;
        }
      }
      const evalTotal = latestByScenario.size;
      const evalPassed = [...latestByScenario.values()].filter(
        (p) => p === true,
      ).length;

      statsByAgent.set(row.id, {
        conversations24h: Number(convAgg?.conversations ?? 0),
        validatorPassRate:
          validatorAgg && validatorAgg.total > 0
            ? validatorAgg.clean / validatorAgg.total
            : null,
        validatorTotalTurns: Number(validatorAgg?.total ?? 0),
        evalPassed,
        evalTotal,
        evalMeetsGate: evalTotal > 0 ? evalPassed / evalTotal >= 0.875 : null,
        lastEvalRun: mostRecentRun,
      });
    }),
  );

  return (
    <section className="animate-page-enter space-y-4">
      <div>
        <h1 className="text-page-title">Agents</h1>
        <p className="text-label text-[hsl(var(--color-text-secondary))]">
          Build, test, and review the AI agents serving your customers.
        </p>
      </div>

      {rows.length === 0 ? (
        <article className="rounded-xl border bg-card p-8 text-center">
          <div className="mx-auto max-w-md space-y-4">
            <h2 className="text-lg font-semibold">Build your first AI assistant</h2>
            <p className="text-sm text-muted-foreground">
              Your AI assistant answers customer questions, books appointments,
              and escalates to your team when it can&apos;t help. Lives on your
              website as a chat bubble. Set up takes ~30 seconds.
            </p>
            <div className="flex flex-wrap justify-center gap-2 pt-2">
              <a
                href="https://seldonframe.com/docs/agents"
                target="_blank"
                rel="noopener"
                className="crm-button-secondary h-10 px-5 text-sm"
              >
                How it works
              </a>
              <details className="inline-block text-left">
                <summary className="crm-button-primary h-10 px-5 text-sm cursor-pointer inline-flex items-center">
                  Build with Claude Code →
                </summary>
                <pre className="mt-3 rounded-md bg-muted p-3 text-xs whitespace-pre-wrap text-left">
{`build_website_chatbot({
  workspace_id: "<your-workspace-id>",
  name: "My HVAC Assistant",
  faq: [
    { q: "What hours?", a: "Mon-Fri 8a-6p" },
    { q: "Service area?", a: "Phoenix metro" }
  ],
  pricing_facts: [
    { label: "Service call", amount: 89, currency: "USD" }
  ]
})`}
                </pre>
              </details>
            </div>
          </div>
        </article>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const stats = statsByAgent.get(row.id);
            return (
              <article key={row.id} className="rounded-xl border bg-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <Link
                      href={`/agents/${row.id}`}
                      className="text-card-title hover:underline"
                    >
                      {row.name}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {row.archetype} • {row.channel} • v{row.currentVersion} •
                      slug: <code className="font-mono text-xs">{row.slug}</code>
                    </p>
                  </div>
                  <StatusPill status={row.status} />
                </div>

                {stats && (
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3">
                    <Stat
                      label="Conversations 24h"
                      value={stats.conversations24h.toLocaleString()}
                    />
                    <Stat
                      label="Validator pass 24h"
                      value={
                        stats.validatorPassRate === null
                          ? "—"
                          : `${(stats.validatorPassRate * 100).toFixed(0)}%`
                      }
                      tone={
                        stats.validatorPassRate === null
                          ? undefined
                          : stats.validatorPassRate < 0.95
                            ? "warn"
                            : "ok"
                      }
                      hint={
                        stats.validatorTotalTurns > 0
                          ? `${stats.validatorTotalTurns} turns`
                          : undefined
                      }
                    />
                    <Stat
                      label="Eval pass rate"
                      value={
                        stats.evalTotal === 0
                          ? "Not run"
                          : `${stats.evalPassed}/${stats.evalTotal}`
                      }
                      tone={
                        stats.evalTotal === 0
                          ? "warn"
                          : stats.evalMeetsGate
                            ? "ok"
                            : "warn"
                      }
                      hint={
                        stats.lastEvalRun
                          ? `Last: ${formatRelative(stats.lastEvalRun)}`
                          : "Run before going live"
                      }
                    />
                  </div>
                )}

                {row.status !== "live" && stats && (
                  <PromoteHint stats={stats} agentId={row.id} status={row.status} />
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={`/agents/${row.id}`}
                    className="crm-button-primary h-9 px-4 text-sm"
                  >
                    Overview
                  </Link>
                  <Link
                    href={`/agents/${row.id}/test`}
                    className="crm-button-secondary h-9 px-4 text-sm"
                  >
                    Sandbox
                  </Link>
                  <Link
                    href={`/agents/${row.id}/conversations`}
                    className="crm-button-secondary h-9 px-4 text-sm"
                  >
                    Conversations
                  </Link>
                  <Link
                    href={`/agents/${row.id}/evals`}
                    className="crm-button-secondary h-9 px-4 text-sm"
                  >
                    Evals
                  </Link>
                  <Link
                    href={`/agents/${row.id}/settings`}
                    className="crm-button-secondary h-9 px-4 text-sm"
                  >
                    Settings
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn";
  hint?: string;
}) {
  const toneClass =
    tone === "warn"
      ? "text-amber-700 dark:text-amber-400"
      : tone === "ok"
        ? "text-emerald-700 dark:text-emerald-400"
        : "text-foreground";
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1 text-lg font-semibold ${toneClass}`}>{value}</p>
      {hint && (
        <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

function PromoteHint({
  stats,
  agentId,
  status,
}: {
  stats: AgentRowStats;
  agentId: string;
  status: string;
}) {
  // Surface the most actionable next step inline so operators don't
  // have to figure out what's blocking promotion to live.
  const needsEvalRun = stats.evalTotal === 0;
  const evalsBelowGate =
    stats.evalTotal > 0 && stats.evalMeetsGate === false;

  if (needsEvalRun) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs dark:border-amber-900/50 dark:bg-amber-950/30">
        <span className="text-amber-800 dark:text-amber-200">
          ⚠ Evals haven't run yet — required before going live.
        </span>
        <Link
          href={`/agents/${agentId}/evals`}
          className="ml-auto rounded-md border border-current/30 px-2 py-1 font-medium text-amber-900 hover:bg-current/10 dark:text-amber-200"
        >
          Run evals →
        </Link>
      </div>
    );
  }
  if (evalsBelowGate) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-2 text-xs dark:border-rose-900/50 dark:bg-rose-950/30">
        <span className="text-rose-800 dark:text-rose-200">
          ⚠ Eval pass rate below 87.5% gate. Fix in Settings, then re-run evals.
        </span>
        <Link
          href={`/agents/${agentId}/settings`}
          className="ml-auto rounded-md border border-current/30 px-2 py-1 font-medium text-rose-900 hover:bg-current/10 dark:text-rose-200"
        >
          Open Settings →
        </Link>
      </div>
    );
  }
  if (status === "draft" || status === "test") {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-xs dark:border-emerald-900/50 dark:bg-emerald-950/30">
        <span className="text-emerald-800 dark:text-emerald-200">
          ✓ Eval gate met. Ready to promote to live.
        </span>
        <Link
          href={`/agents/${agentId}`}
          className="ml-auto rounded-md border border-current/30 px-2 py-1 font-medium text-emerald-900 hover:bg-current/10 dark:text-emerald-200"
        >
          Promote to live →
        </Link>
      </div>
    );
  }
  return null;
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "live"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
      : status === "test"
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
        : status === "paused"
          ? "bg-rose-500/15 text-rose-700 dark:text-rose-400"
          : "bg-slate-500/15 text-slate-700 dark:text-slate-300";
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${tone}`}>
      {status}
    </span>
  );
}

function formatRelative(d: Date): string {
  const ms = Date.now() - d.getTime();
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
