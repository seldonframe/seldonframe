// v1.26.2 — agent conversations review surface
//
// Lists recent conversations for the agent (excluding eval runs) plus
// each one's first user message + last assistant reply. Click expands
// in-place to show the full transcript with tool calls + validator
// results. v1.26.3 will add operator-quality marking (good/bad/notes).

import { notFound } from "next/navigation";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import {
  agentConversations,
  agentTurns,
  agents,
  type AgentToolCall,
  type AgentToolResult,
  type AgentValidatorResult,
} from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export default async function AgentConversationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const expandedId = sp.expand;
  const orgId = await getOrgId();
  if (!orgId) notFound();

  const [agent] = await db
    .select({ id: agents.id, name: agents.name, orgId: agents.orgId })
    .from(agents)
    .where(eq(agents.id, id))
    .limit(1);

  if (!agent || agent.orgId !== orgId) notFound();

  // Recent conversations excluding eval runs (channelMeta.eval_run = true).
  const convs = await db
    .select({
      id: agentConversations.id,
      status: agentConversations.status,
      startedAt: agentConversations.startedAt,
      lastTurnAt: agentConversations.lastTurnAt,
      turnCount: agentConversations.turnCount,
      tokensIn: agentConversations.tokensIn,
      tokensOut: agentConversations.tokensOut,
      llmCostCents: agentConversations.llmCostCents,
      anonymousSessionId: agentConversations.anonymousSessionId,
      channelMeta: agentConversations.channelMeta,
    })
    .from(agentConversations)
    .where(
      and(
        eq(agentConversations.agentId, agent.id),
        sql`(${agentConversations.channelMeta} ->> 'eval_run') IS DISTINCT FROM 'true'`,
      ),
    )
    .orderBy(desc(agentConversations.lastTurnAt))
    .limit(PAGE_SIZE);

  return (
    <section className="animate-page-enter space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-page-title">{agent.name} — conversations</h1>
          <p className="text-label text-[hsl(var(--color-text-secondary))]">
            Recent customer chats. Eval-run conversations hidden by default.
          </p>
        </div>
        <Link
          href={`/admin/agents/${agent.id}/test`}
          className="crm-button-secondary h-9 px-4 text-sm"
        >
          Open sandbox
        </Link>
      </div>

      {convs.length === 0 ? (
        <article className="rounded-xl border bg-card p-6">
          <p className="text-sm text-muted-foreground">
            No conversations yet. Once the embed snippet is on a live page,
            chats land here.
          </p>
        </article>
      ) : await renderConversationList({
          convs,
          agentId: agent.id,
          expandedId,
        })}
    </section>
  );
}

async function renderConversationList(input: {
  convs: Array<{
    id: string;
    status: string;
    startedAt: Date;
    lastTurnAt: Date;
    turnCount: number;
    tokensIn: number;
    tokensOut: number;
    llmCostCents: number;
    anonymousSessionId: string | null;
    channelMeta: Record<string, unknown>;
  }>;
  agentId: string;
  expandedId: string | undefined;
}) {
  const expandedConv = input.convs.find((c) => c.id === input.expandedId);
  const conversationIds = input.convs.map((c) => c.id);

  // Preview: load 1st user + 1st assistant per non-expanded conv via a
  // single `WHERE conversation_id IN (...)` query, capped at the first
  // few turns per conv. For the expanded conv, load the full transcript.
  const previewLimit = 4; // covers 0=user, 1=assistant for most turns
  const previewTurns =
    conversationIds.length === 0
      ? []
      : await db
          .select({
            conversationId: agentTurns.conversationId,
            turnIndex: agentTurns.turnIndex,
            role: agentTurns.role,
            content: agentTurns.content,
            toolCalls: agentTurns.toolCalls,
            toolResults: agentTurns.toolResults,
            validatorsPassed: agentTurns.validatorsPassed,
            latencyMs: agentTurns.latencyMs,
          })
          .from(agentTurns)
          .where(
            and(
              inArray(agentTurns.conversationId, conversationIds),
              sql`${agentTurns.turnIndex} < ${previewLimit}`,
            ),
          );

  const expandedTurns = expandedConv
    ? await db
        .select({
          conversationId: agentTurns.conversationId,
          turnIndex: agentTurns.turnIndex,
          role: agentTurns.role,
          content: agentTurns.content,
          toolCalls: agentTurns.toolCalls,
          toolResults: agentTurns.toolResults,
          validatorsPassed: agentTurns.validatorsPassed,
          latencyMs: agentTurns.latencyMs,
        })
        .from(agentTurns)
        .where(eq(agentTurns.conversationId, expandedConv.id))
        .orderBy(agentTurns.turnIndex)
        .limit(100)
    : [];

  const turnsByConv = new Map<string, typeof previewTurns>();
  for (const t of previewTurns) {
    const arr = turnsByConv.get(t.conversationId) ?? [];
    arr.push(t);
    turnsByConv.set(t.conversationId, arr);
  }

  return (
    <div className="space-y-2">
      {input.convs.map((conv) => {
        const isExpanded = input.expandedId === conv.id;
        const turnsForThis = isExpanded
          ? expandedTurns
          : (turnsByConv.get(conv.id) ?? []).sort(
              (a, b) => a.turnIndex - b.turnIndex,
            );
        const firstUser = turnsForThis.find((t) => t.role === "user");
        const lastAssistant = [...turnsForThis]
          .reverse()
          .find((t) => t.role === "assistant");

        return (
          <article key={conv.id} className="rounded-xl border bg-card p-4">
            <header className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <div className="flex flex-wrap items-center gap-2">
                <ConvStatusPill status={conv.status} />
                <span>{conv.turnCount} turns</span>
                <span>
                  {(conv.tokensIn + conv.tokensOut).toLocaleString()} tok
                </span>
                <span>${(conv.llmCostCents / 100).toFixed(2)}</span>
                <span>{new Date(conv.lastTurnAt).toLocaleString()}</span>
              </div>
              <Link
                href={
                  isExpanded
                    ? `/admin/agents/${input.agentId}/conversations`
                    : `/admin/agents/${input.agentId}/conversations?expand=${conv.id}`
                }
                className="text-primary underline-offset-2 hover:underline"
              >
                {isExpanded ? "Collapse" : "Expand"}
              </Link>
            </header>

            {!isExpanded ? (
              <div className="mt-3 space-y-1 text-sm">
                {firstUser && (
                  <p className="line-clamp-2">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                      Customer:
                    </span>{" "}
                    {firstUser.content}
                  </p>
                )}
                {lastAssistant && (
                  <p className="line-clamp-2 text-muted-foreground">
                    <span className="text-xs uppercase tracking-wide">
                      Agent:
                    </span>{" "}
                    {lastAssistant.content}
                  </p>
                )}
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                {turnsForThis.map((t) => (
                  <TurnDisplay key={t.turnIndex} turn={t} />
                ))}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

function TurnDisplay({
  turn,
}: {
  turn: {
    turnIndex: number;
    role: string;
    content: string | null;
    toolCalls: AgentToolCall[] | null;
    toolResults: AgentToolResult[] | null;
    validatorsPassed: AgentValidatorResult[];
    latencyMs: number | null;
  };
}) {
  const validatorFails = (turn.validatorsPassed ?? []).filter((v) => !v.passed);
  return (
    <div className="border-l-2 border-border pl-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono uppercase">
          {turn.role}
        </span>
        <span>#{turn.turnIndex}</span>
        {turn.latencyMs && <span>{turn.latencyMs}ms</span>}
      </div>
      {turn.content && (
        <p className="mt-1 whitespace-pre-wrap text-sm">{turn.content}</p>
      )}
      {turn.toolCalls && turn.toolCalls.length > 0 && (
        <div className="mt-2 space-y-1">
          {turn.toolCalls.map((tc) => (
            <details
              key={tc.id}
              className="rounded border border-border bg-background p-2 text-xs"
            >
              <summary className="cursor-pointer font-mono">
                → {tc.name}
              </summary>
              <pre className="mt-2 overflow-x-auto text-xs">
                {JSON.stringify(tc.input, null, 2)}
              </pre>
            </details>
          ))}
        </div>
      )}
      {turn.toolResults && turn.toolResults.length > 0 && (
        <div className="mt-1 space-y-1">
          {turn.toolResults.map((tr) => (
            <details
              key={tr.toolCallId}
              className="rounded border border-border bg-background p-2 text-xs"
            >
              <summary className={`cursor-pointer font-mono ${tr.ok ? "" : "text-rose-600"}`}>
                ← result {tr.ok ? "ok" : "error"}
              </summary>
              <pre className="mt-2 overflow-x-auto text-xs">
                {JSON.stringify(tr.ok ? tr.output : tr.error, null, 2)}
              </pre>
            </details>
          ))}
        </div>
      )}
      {validatorFails.length > 0 && (
        <p className="mt-1 text-xs text-rose-600">
          ⚠ Validators failed: {validatorFails.map((v) => v.name).join(", ")}
        </p>
      )}
    </div>
  );
}

function ConvStatusPill({ status }: { status: string }) {
  const tone =
    status === "active"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
      : status === "completed"
        ? "bg-slate-500/15 text-slate-700 dark:text-slate-300"
        : status === "escalated"
          ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
          : status === "test"
            ? "bg-purple-500/15 text-purple-700 dark:text-purple-400"
            : "bg-slate-500/15 text-slate-700 dark:text-slate-300";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${tone}`}>
      {status}
    </span>
  );
}
