// v1.26.2 — agent admin index. Lists workspace agents with quick links
// to /test sandbox + /conversations review surface.

import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";

export const dynamic = "force-dynamic";

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
      tokensUsedToday: agents.tokensUsedToday,
      dailyTokenBudget: agents.dailyTokenBudget,
      createdAt: agents.createdAt,
    })
    .from(agents)
    .where(eq(agents.orgId, orgId))
    .orderBy(desc(agents.createdAt));

  return (
    <section className="animate-page-enter space-y-4">
      <div>
        <h1 className="text-page-title">Agents</h1>
        <p className="text-label text-[hsl(var(--color-text-secondary))]">
          Build, test, and review the AI agents serving your customers.
        </p>
      </div>

      {rows.length === 0 ? (
        <article className="rounded-xl border bg-card p-6">
          <p className="text-sm text-muted-foreground">
            No agents yet. Create one from Claude Code with the SeldonFrame
            MCP — call <code className="font-mono text-xs">create_agent</code>.
          </p>
        </article>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const tokenPct = Math.min(
              100,
              Math.round((row.tokensUsedToday / row.dailyTokenBudget) * 100),
            );
            return (
              <article
                key={row.id}
                className="rounded-xl border bg-card p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-card-title">{row.name}</h2>
                    <p className="text-sm text-muted-foreground">
                      {row.archetype} • {row.channel} • v{row.currentVersion} •
                      slug: <code className="font-mono text-xs">{row.slug}</code>
                    </p>
                  </div>
                  <StatusPill status={row.status} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                  <span>
                    Tokens today: {row.tokensUsedToday.toLocaleString()} /{" "}
                    {row.dailyTokenBudget.toLocaleString()} ({tokenPct}%)
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={`/admin/agents/${row.id}/test`}
                    className="crm-button-secondary h-9 px-4 text-sm"
                  >
                    Open sandbox
                  </Link>
                  <Link
                    href={`/admin/agents/${row.id}/conversations`}
                    className="crm-button-secondary h-9 px-4 text-sm"
                  >
                    View conversations
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
    <span
      className={`rounded-full px-3 py-1 text-xs font-medium ${tone}`}
    >
      {status}
    </span>
  );
}
