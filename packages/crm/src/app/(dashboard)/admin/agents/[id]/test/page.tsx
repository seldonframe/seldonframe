// v1.26.2 — agent test sandbox
//
// Server component fetches the agent + workspace slug to compose the
// turn URL, then hands off to TestSandboxClient for the interactive chat.
// Always uses status='test' so eval/test conversations don't pollute
// production /tail_conversations output.

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
      archetype: agents.archetype,
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

  // Sandbox uses 'test' status so the conversation is flagged accordingly.
  // The agent has to be in 'test' or 'live' for the turn endpoint to accept.
  // Show a guard if the agent is currently 'draft' or 'paused'.
  const canChat = row.status === "test" || row.status === "live";

  return (
    <section className="animate-page-enter space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-page-title">{row.name} — sandbox</h1>
          <p className="text-label text-[hsl(var(--color-text-secondary))]">
            Test your agent before pointing customers at it. {row.archetype} •{" "}
            <code className="font-mono text-xs">{row.slug}</code>
          </p>
        </div>
        <Link
          href={`/admin/agents/${row.id}/conversations`}
          className="crm-button-secondary h-9 px-4 text-sm"
        >
          View conversations
        </Link>
      </div>

      {!canChat ? (
        <article className="rounded-xl border bg-card p-6">
          <p className="text-sm text-muted-foreground">
            This agent is in <strong>{row.status}</strong> status. Promote it to{" "}
            <code className="font-mono text-xs">test</code> first — call{" "}
            <code className="font-mono text-xs">publish_agent</code> with{" "}
            <code className="font-mono text-xs">status=&quot;test&quot;</code> from
            Claude Code.
          </p>
        </article>
      ) : (
        <TestSandboxClient
          agentName={row.name}
          turnUrl={turnUrl}
          greeting={greeting}
        />
      )}
    </section>
  );
}
