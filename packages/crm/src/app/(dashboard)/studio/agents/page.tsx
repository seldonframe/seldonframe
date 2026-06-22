// ICP-3 — the Agents Studio (builder's template roster).
//
// A "builder" creates reusable, sellable agent TEMPLATES here, then deploys each
// to many no-login SMB clients. This page lists the builder's templates (name,
// type, status, eval score if present, and a deployment count) and offers a
// "New agent" action that creates a voice_receptionist template and routes to
// its editor. Distinct from the per-workspace /agents roster (the live agents
// serving THIS workspace's customers): this is the product catalog the builder
// SELLS.
//
// Auth + builder resolution: getOrgId() — the operator's org IS the builder org.

import Link from "next/link";
import { Bot } from "lucide-react";
import { count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { agentTemplates, deployments } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { NewAgentButton } from "./new-agent-button";
import { DeployButton } from "./deploy-button";
import { TemplateStatusBadge, formatTemplateType } from "./status-badge";
import { StudioTabs } from "../studio-tabs";
import { StarterPackSection } from "./starter-pack-section";
import { STARTER_TEMPLATES } from "@/lib/agent-templates/starter-pack";

export const dynamic = "force-dynamic";

export default async function AgentsStudioPage() {
  const orgId = await getOrgId();
  if (!orgId) {
    return (
      <section className="animate-page-enter space-y-4">
        <h1 className="text-page-title">Agents</h1>
        <p className="text-sm text-muted-foreground">
          Sign in to build your agents.
        </p>
      </section>
    );
  }

  const templates = await db
    .select({
      id: agentTemplates.id,
      name: agentTemplates.name,
      type: agentTemplates.type,
      status: agentTemplates.status,
      evalScore: agentTemplates.evalScore,
      updatedAt: agentTemplates.updatedAt,
    })
    .from(agentTemplates)
    .where(eq(agentTemplates.builderOrgId, orgId))
    .orderBy(desc(agentTemplates.updatedAt));

  // Deployment count per template (one grouped query). 0 is fine — most
  // templates start undeployed.
  const deployCounts = templates.length
    ? await db
        .select({
          agentTemplateId: deployments.agentTemplateId,
          n: count(),
        })
        .from(deployments)
        .where(eq(deployments.builderOrgId, orgId))
        .groupBy(deployments.agentTemplateId)
    : [];
  const deployCountByTemplate = new Map<string, number>(
    deployCounts.map((r) => [r.agentTemplateId, Number(r.n)]),
  );

  // Trim the static registry to the card-facing menu copy (no blueprint shipped
  // to the client — the action holds the blueprint server-side).
  const starterCards = STARTER_TEMPLATES.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    type: s.type,
    summary: s.summary,
  }));

  return (
    <section className="animate-page-enter space-y-5">
      <StudioTabs />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-page-title">Agents</h1>
          <p className="text-label text-[hsl(var(--color-text-secondary))]">
            Build a reusable AI agent once, then deploy it to as many clients as
            you like.
          </p>
        </div>
        {templates.length > 0 && <NewAgentButton />}
      </div>

      {templates.length === 0 ? (
        <div className="space-y-6">
          {/* Primary path for a brand-new builder: a curated, forkable menu. */}
          <StarterPackSection starters={starterCards} />

          {/* Secondary: describe-your-own / start-blank, kept available. */}
          <article className="rounded-xl border bg-card p-6 text-center">
            <div className="mx-auto max-w-md space-y-3">
              <span
                className="mx-auto inline-flex size-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500 dark:text-indigo-400"
                aria-hidden
              >
                <Bot className="size-5" />
              </span>
              <h2 className="text-base font-semibold">
                Or build one from scratch.
              </h2>
              <p className="text-sm text-muted-foreground">
                Describe what your agent should do in a sentence and we&apos;ll
                draft it — or start from a blank template.
              </p>
              <div className="flex justify-center pt-1">
                <NewAgentButton />
              </div>
            </div>
          </article>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((tmpl) => {
            const deployCount = deployCountByTemplate.get(tmpl.id) ?? 0;
            return (
              <article key={tmpl.id} className="rounded-xl border bg-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/studio/agents/${tmpl.id}`}
                      className="text-card-title hover:underline"
                    >
                      {tmpl.name}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {formatTemplateType(tmpl.type)} •{" "}
                      {deployCount === 1
                        ? "1 deployment"
                        : `${deployCount} deployments`}
                      {tmpl.evalScore !== null && (
                        <> • eval {tmpl.evalScore}</>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <TemplateStatusBadge status={tmpl.status} />
                    <Link
                      href={`/studio/agents/${tmpl.id}`}
                      className="crm-button-secondary h-9 px-4 text-sm"
                    >
                      Configure
                    </Link>
                    <DeployButton templateId={tmpl.id} variant="primary" />
                  </div>
                </div>
              </article>
            );
          })}

          {/* Always-available resale menu: fork another curated starter. */}
          <div className="border-t pt-6">
            <StarterPackSection starters={starterCards} />
          </div>
        </div>
      )}
    </section>
  );
}
