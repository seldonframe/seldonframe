// v1.27.0 — agent test sandbox tab
//
// Renders inside the /agents/[id] layout (header + tab nav already there).
// Agent must be in 'test' or 'live' for the turn endpoint to accept.

import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { agents, organizations, type AgentBlueprint } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { TestSandboxClient } from "./test-client";

export const dynamic = "force-dynamic";

export default async function AgentTestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const orgId = await getOrgId();
  if (!orgId) notFound();

  const [row] = await db
    .select({
      id: agents.id,
      name: agents.name,
      slug: agents.slug,
      status: agents.status,
      blueprint: agents.blueprint,
      orgId: agents.orgId,
      orgSlug: organizations.slug,
    })
    .from(agents)
    .innerJoin(organizations, eq(organizations.id, agents.orgId))
    .where(eq(agents.id, id))
    .limit(1);

  if (!row || row.orgId !== orgId) notFound();

  const blueprint = (row.blueprint ?? {}) as AgentBlueprint;
  const greeting = blueprint.greeting ?? "Hi! How can I help you today?";
  const turnUrl = `/api/v1/public/agent/${row.orgSlug}--${row.slug}/turn`;
  const canChat = row.status === "test" || row.status === "live";

  if (!canChat) {
    return (
      <article className="rounded-xl border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          This agent is in <strong>{row.status}</strong> status. Switch to{" "}
          <code className="font-mono text-xs">test</code> on the{" "}
          <Link
            href={`/agents/${row.id}`}
            className="text-primary underline-offset-2 hover:underline"
          >
            Overview tab
          </Link>{" "}
          to start chatting.
        </p>
      </article>
    );
  }

  return (
    <TestSandboxClient
      agentName={row.name}
      turnUrl={turnUrl}
      greeting={greeting}
    />
  );
}
