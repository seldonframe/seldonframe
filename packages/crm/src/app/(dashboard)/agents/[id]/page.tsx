// v1.27.0 — agent overview tab. At-a-glance health card grid + recent
// conversations preview + latest eval verdict + embed snippet.

import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  agents,
  agentConversations,
  agentTurns,
  agentEvals,
  organizations,
  type AgentBlueprint,
} from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { getLatestEvalRun } from "@/lib/agents/eval-runner";
import { OverviewActions } from "./overview-actions";

export default async function AgentOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const orgId = await getOrgId();
  if (!orgId) notFound();

  const [agent] = await db
    .select({
      id: agents.id,
      name: agents.name,
      slug: agents.slug,
      status: agents.status,
      archetype: agents.archetype,
      blueprint: agents.blueprint,
      currentVersion: agents.currentVersion,
      tokensUsedToday: agents.tokensUsedToday,
      dailyTokenBudget: agents.dailyTokenBudget,
      orgId: agents.orgId,
      orgSlug: organizations.slug,
    })
    .from(agents)
    .innerJoin(organizations, eq(organizations.id, agents.orgId))
    .where(eq(agents.id, id))
    .limit(1);
  if (!agent || agent.orgId !== orgId) notFound();

  const sinceTs = new Date(Date.now() - 24 * 3600 * 1000);

  const [agg] = await db
    .select({
      conversations: sql<number>`count(distinct ${agentConversations.id})`,
      turns: sql<number>`count(${agentTurns.id})`,
      tokensIn: sql<number>`coalesce(sum(${agentTurns.tokensIn}), 0)`,
      tokensOut: sql<number>`coalesce(sum(${agentTurns.tokensOut}), 0)`,
      avgLatency: sql<number>`coalesce(avg(${agentTurns.latencyMs}), 0)::int`,
    })
    .from(agentConversations)
    .leftJoin(
      agentTurns,
      eq(agentTurns.conversationId, agentConversations.id),
    )
    .where(
      and(
        eq(agentConversations.agentId, agent.id),
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
        eq(agentConversations.agentId, agent.id),
        eq(agentTurns.role, "assistant"),
        gte(agentTurns.createdAt, sinceTs),
      ),
    );

  const validatorPassRate =
    validatorAgg && validatorAgg.total > 0
      ? validatorAgg.clean / validatorAgg.total
      : null;

  // Latest eval run
  const evalSummary = await getLatestEvalRun({ agentId: agent.id, orgId });

  // 3 most recent conversations (excluding evals)
  const recent = await db
    .select({
      id: agentConversations.id,
      lastTurnAt: agentConversations.lastTurnAt,
      turnCount: agentConversations.turnCount,
      status: agentConversations.status,
      operatorQuality: agentConversations.operatorQuality,
    })
    .from(agentConversations)
    .where(
      and(
        eq(agentConversations.agentId, agent.id),
        sql`(${agentConversations.channelMeta} ->> 'eval_run') IS DISTINCT FROM 'true'`,
      ),
    )
    .orderBy(desc(agentConversations.lastTurnAt))
    .limit(3);

  const baseDomain =
    process.env.WORKSPACE_BASE_DOMAIN?.trim() || "app.seldonframe.com";
  const embedUrl = `https://${baseDomain}/api/v1/public/agent/${agent.orgSlug}--${agent.slug}/embed.js`;
  const blueprint = (agent.blueprint ?? {}) as AgentBlueprint;
  const tokenPct = Math.min(
    100,
    Math.round((agent.tokensUsedToday / agent.dailyTokenBudget) * 100),
  );

  return (
    <div className="space-y-4">
      <OverviewActions agentId={agent.id} status={agent.status} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Conversations 24h"
          value={String(agg?.conversations ?? 0)}
        />
        <Stat
          label="Validator pass rate 24h"
          value={
            validatorPassRate === null
              ? "—"
              : `${(validatorPassRate * 100).toFixed(0)}%`
          }
          tone={
            validatorPassRate !== null && validatorPassRate < 0.95
              ? "warn"
              : "ok"
          }
        />
        <Stat
          label="Eval pass rate"
          value={
            evalSummary
              ? `${evalSummary.passed}/${evalSummary.totalRun}`
              : "Not run"
          }
          tone={
            evalSummary
              ? evalSummary.meetsPublishGate
                ? "ok"
                : "warn"
              : undefined
          }
        />
        <Stat
          label="Avg latency 24h"
          value={`${agg?.avgLatency ?? 0}ms`}
        />
      </div>

      <article className="rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-card-title">Daily token usage</h2>
          <span className="text-xs text-muted-foreground">
            {agent.tokensUsedToday.toLocaleString()} /{" "}
            {agent.dailyTokenBudget.toLocaleString()} ({tokenPct}%)
          </span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full ${tokenPct >= 90 ? "bg-rose-500" : tokenPct >= 70 ? "bg-amber-500" : "bg-emerald-500"}`}
            style={{ width: `${tokenPct}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Auto-resets every 24h. Adjust in Settings if you need more headroom.
        </p>
      </article>

      <article className="rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-card-title">Recent conversations</h2>
          <Link
            href={`/agents/${agent.id}/conversations`}
            className="text-xs text-primary underline-offset-2 hover:underline"
          >
            View all →
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No conversations yet. Drop the embed snippet below on a live page
            to start chatting.
          </p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {recent.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
              >
                <span className="rounded bg-secondary px-1.5 py-0.5 font-mono">
                  {c.status}
                </span>
                <span>{c.turnCount} turns</span>
                <span>{new Date(c.lastTurnAt).toLocaleString()}</span>
                {c.operatorQuality === "good" && (
                  <span className="text-emerald-600">✓ marked good</span>
                )}
                {c.operatorQuality === "bad" && (
                  <span className="text-rose-600">✗ marked bad</span>
                )}
                <Link
                  href={`/agents/${agent.id}/conversations?expand=${c.id}`}
                  className="ml-auto text-primary underline-offset-2 hover:underline"
                >
                  Open
                </Link>
              </li>
            ))}
          </ul>
        )}
      </article>

      <article className="rounded-xl border bg-card p-5">
        <h2 className="text-card-title">Embed snippet</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Paste before <code>&lt;/body&gt;</code> on any page where you want the
          chat bubble.
        </p>
        <pre className="mt-3 overflow-x-auto rounded bg-muted p-3 text-xs">
          {`<script src="${embedUrl}" async></script>`}
        </pre>
        {blueprint.greeting && (
          <p className="mt-3 text-xs text-muted-foreground">
            Greeting:{" "}
            <span className="italic">&ldquo;{blueprint.greeting}&rdquo;</span>{" "}
            (edit in Settings)
          </p>
        )}
      </article>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn";
}) {
  const toneClass =
    tone === "warn"
      ? "text-amber-700 dark:text-amber-400"
      : tone === "ok"
        ? "text-emerald-700 dark:text-emerald-400"
        : "text-foreground";
  return (
    <article className="rounded-xl border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</p>
    </article>
  );
}
