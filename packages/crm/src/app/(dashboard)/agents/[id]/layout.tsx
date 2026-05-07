// v1.27.0 — agent detail shell. Header (name + status pill + actions)
// + tab nav. Each child route renders inside this shell.

import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { AgentTabs } from "./agent-tabs";

export const dynamic = "force-dynamic";

export default async function AgentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
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
      currentVersion: agents.currentVersion,
      orgId: agents.orgId,
    })
    .from(agents)
    .where(eq(agents.id, id))
    .limit(1);
  if (!agent || agent.orgId !== orgId) notFound();

  return (
    <section className="animate-page-enter space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/agents"
            className="text-xs text-muted-foreground hover:underline"
          >
            ← All agents
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-page-title">{agent.name}</h1>
            <StatusPill status={agent.status} />
            <span className="text-xs text-muted-foreground">
              v{agent.currentVersion} • {agent.archetype} •{" "}
              <code className="font-mono">{agent.slug}</code>
            </span>
          </div>
        </div>
      </div>
      <AgentTabs agentId={agent.id} />
      <div className="pt-2">{children}</div>
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
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${tone}`}>
      {status}
    </span>
  );
}
