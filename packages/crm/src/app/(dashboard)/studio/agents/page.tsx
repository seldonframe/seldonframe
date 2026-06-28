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
import { Bot, Phone, MessageSquare, Mail, Bell, Radio, Settings2, ExternalLink } from "lucide-react";
import { count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { agentTemplates, deployments } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import type { AgentBlueprint } from "@/db/schema";
import { surfaceForType, type AgentTemplateType } from "@/lib/agent-templates/store";
import { resolveAgentTrigger } from "@/lib/agents/triggers/agent-trigger";
import {
  loadAgentMarketplaceStatusForOrg,
  marketplaceStatusFor,
  marketplaceCellState,
  type AgentMarketplaceStatus,
} from "@/lib/marketplace/agent-marketplace-status";
import { NewAgentButton } from "./new-agent-button";
import { DescribeAgent } from "./describe-agent";
import { DeployButton } from "./deploy-button";
import {
  TemplateStatusBadge,
  formatTemplateType,
  formatChannel,
  formatTriggerDescriptor,
} from "./status-badge";
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
      // Needed for the trigger chip (unified agent model P1) — blueprint.trigger
      // resolved against the type-derived surface gives the row's "fires when".
      blueprint: agentTemplates.blueprint,
    })
    .from(agentTemplates)
    .where(eq(agentTemplates.builderOrgId, orgId))
    .orderBy(desc(agentTemplates.updatedAt));

  // Deployment count per template (one grouped query) + the marketplace status
  // per template (listed? price? earned?) in PARALLEL. Deployment = "to clients";
  // marketplace = "listed for sale". Both default cleanly (0 deploys / not
  // listed) and the marketplace read is fail-soft (errors → empty map), so the
  // roster never breaks because of a marketplace read.
  const [deployCounts, marketplaceStatus] = templates.length
    ? await Promise.all([
        db
          .select({
            agentTemplateId: deployments.agentTemplateId,
            n: count(),
          })
          .from(deployments)
          .where(eq(deployments.builderOrgId, orgId))
          .groupBy(deployments.agentTemplateId),
        loadAgentMarketplaceStatusForOrg(orgId),
      ])
    : [[], new Map<string, AgentMarketplaceStatus>()];
  const deployCountByTemplate = new Map<string, number>(
    deployCounts.map((r) => [r.agentTemplateId, Number(r.n)]),
  );

  // ── Build the Agents-table row model (Claude Design direction A) ──────────
  // One pass over the templates derives every cell the table renders: name +
  // channel (for the icon badge + Channel column), the trigger descriptor (its
  // own column), the deployment count, and the status. Then partition into
  // "Live" (published) vs "Drafts" (draft/tested) so the table groups exactly
  // like the mockup. Pure derivation — no behavior, no new queries.
  const agentRows = templates.map((tmpl) => {
    const bp = (tmpl.blueprint ?? {}) as AgentBlueprint;
    const surface = surfaceForType(tmpl.type as AgentTemplateType);
    const trigger = resolveAgentTrigger(bp.trigger, surface);
    const deployCount = deployCountByTemplate.get(tmpl.id) ?? 0;
    return {
      id: tmpl.id,
      name: tmpl.name,
      type: tmpl.type,
      status: tmpl.status,
      evalScore: tmpl.evalScore,
      // The trigger's channel drives BOTH the leading icon badge and the
      // Channel column; the trigger descriptor is the Trigger column.
      channel: trigger.channel,
      triggerDescriptor: formatTriggerDescriptor(trigger),
      deployCount,
      // Marketplace facet (listed? price? earned?) — distinct from Deployed.
      marketplace: marketplaceStatusFor(marketplaceStatus, tmpl.id),
    };
  });
  const liveRows = agentRows.filter((r) => r.status === "published");
  const draftRows = agentRows.filter((r) => r.status !== "published");

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
    <section className="animate-page-enter space-y-6">
      <StudioTabs />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2.5">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-[2.35rem] sm:leading-[1.05]">
            Agents
          </h1>
          <p className="max-w-xl text-[15px] leading-relaxed text-muted-foreground">
            Build a reusable AI agent once, then deploy it to as many clients as
            you like.
          </p>
        </div>
        {templates.length > 0 && <NewAgentButton />}
      </div>

      {templates.length === 0 ? (
        <div className="space-y-6">
          {/* Generate-by-default: the headline path. Describe the outcome in one
              sentence → a complete, guard-railed, verified agent. */}
          <DescribeAgent />

          {/* Then a curated, forkable menu as the template fallback. */}
          <StarterPackSection starters={starterCards} />

          {/* Secondary: describe-your-own / start-blank, kept available. */}
          <article className="rounded-2xl border border-border bg-card p-6 text-center shadow-(--shadow-xs)">
            <div className="mx-auto max-w-md space-y-3">
              <span
                className="mx-auto inline-flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"
                aria-hidden
              >
                <Bot className="size-5" />
              </span>
              <h2 className="text-base font-semibold text-foreground">
                Prefer to start from a blank template?
              </h2>
              <p className="text-sm text-muted-foreground">
                Open the builder to pick a surface and configure every section
                yourself.
              </p>
              <div className="flex justify-center pt-1">
                <NewAgentButton />
              </div>
            </div>
          </article>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Create surface FIRST: describe-by-default, then the curated resale
              menu (fork a starter). The builder's existing roster follows below. */}
          <DescribeAgent />
          <StarterPackSection starters={starterCards} />

          {/* Then the builder's already-built agents as a calm table (Claude
              Design direction A): Agent · Trigger · Channel · Deployed · Status,
              grouped Live / Drafts, hairline-divided rows with a hover lift. */}
          <div className="space-y-3 border-t border-border pt-6">
            <div className="flex items-baseline gap-2.5">
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                Your agents
              </h2>
              <span className="font-mono text-sm text-muted-foreground">
                {agentRows.length}
              </span>
            </div>

            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-(--shadow-xs)">
              <div className="overflow-x-auto">
                <div className="min-w-[920px]">
                  {/* Column header */}
                  <div className="grid grid-cols-[1.7fr_1.1fr_0.9fr_0.8fr_1.2fr_0.8fr_auto] gap-3 border-b border-border bg-muted/40 px-5 py-3">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Agent
                    </span>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Trigger
                    </span>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Channel
                    </span>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Deployed
                    </span>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Marketplace
                    </span>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Status
                    </span>
                    <span aria-hidden />
                  </div>

                  {/* Live group */}
                  {liveRows.length > 0 && (
                    <>
                      <AgentGroupHeader label="Live" count={liveRows.length} />
                      {liveRows.map((row) => (
                        <AgentTableRow key={row.id} row={row} />
                      ))}
                    </>
                  )}

                  {/* Drafts group */}
                  {draftRows.length > 0 && (
                    <>
                      <AgentGroupHeader
                        label="Drafts"
                        count={draftRows.length}
                      />
                      {draftRows.map((row) => (
                        <AgentTableRow key={row.id} row={row} />
                      ))}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ── Agents-table presentation (Claude Design direction A) ────────────────────
// Server-safe (no "use client", no hooks) so they render inside the server page.
// Pure layout/typography — every wired control (Configure link, Deploy button,
// status chip) is preserved exactly, just re-laid-out into table rows.

/** One derived Agents-table row. */
type AgentRow = {
  id: string;
  name: string;
  type: string;
  status: string;
  evalScore: number | null;
  channel: string;
  triggerDescriptor: string;
  deployCount: number;
  marketplace: AgentMarketplaceStatus;
};

/** Channel slug → leading icon for the Agent cell's badge + the Trigger column. */
function channelIcon(channel: string) {
  switch (channel) {
    case "voice":
      return Phone;
    case "chat":
      return MessageSquare;
    case "sms":
      return MessageSquare;
    case "email":
      return Mail;
    case "digest":
      return Bell;
    default:
      return Radio;
  }
}

/** A quiet group label row inside the table (Live / Drafts), with a mono count. */
function AgentGroupHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 border-b border-border/70 bg-primary/5 px-5 py-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </span>
      <span className="font-mono text-[11px] text-muted-foreground">
        {count}
      </span>
    </div>
  );
}

/** One agent table row: Agent · Trigger · Channel · Deployed · Status + actions.
 *  Reskin only — the Configure link, Deploy button, and status chip are the same
 *  wired controls the old card rendered. */
function AgentTableRow({ row }: { row: AgentRow }) {
  const Channel = channelIcon(row.channel);
  return (
    <div className="grid grid-cols-[1.7fr_1.1fr_0.9fr_0.8fr_1.2fr_0.8fr_auto] items-center gap-3 border-b border-border/70 px-5 py-3.5 transition-colors duration-150 ease-out last:border-b-0 hover:bg-muted/40">
      {/* Agent — icon badge + linked name (+ template-type subline) */}
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
          aria-hidden
        >
          <Channel className="size-4.5" />
        </span>
        <div className="min-w-0">
          <Link
            href={`/studio/agents/${row.id}`}
            className="block truncate text-sm font-semibold tracking-tight text-foreground hover:underline"
          >
            {row.name}
          </Link>
          <span className="block truncate text-xs text-muted-foreground">
            {formatTemplateType(row.type)}
            {row.evalScore !== null && <> · eval {row.evalScore}</>}
          </span>
        </div>
      </div>

      {/* Trigger */}
      <span className="inline-flex items-center gap-1.5 truncate text-[13px] text-muted-foreground">
        <Channel className="size-3.5 shrink-0" aria-hidden />
        {row.triggerDescriptor}
      </span>

      {/* Channel */}
      <span className="truncate text-[13px] text-muted-foreground">
        {formatChannel(row.channel)}
      </span>

      {/* Deployed — mono count, em-dash when none */}
      <span className="font-mono text-[13px] text-foreground">
        {row.deployCount > 0 ? (
          row.deployCount === 1 ? (
            "1 client"
          ) : (
            `${row.deployCount} clients`
          )
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </span>

      {/* Marketplace — listed chip + price + earned sub-line, or "Not listed" */}
      <MarketplaceCell marketplace={row.marketplace} />

      {/* Status chip */}
      <span>
        <TemplateStatusBadge status={row.status} />
      </span>

      {/* Actions — Configure (icon) + Deploy. Both load-bearing, preserved. */}
      <div className="flex items-center gap-2">
        <Link
          href={`/studio/agents/${row.id}`}
          aria-label={`Configure ${row.name}`}
          title="Configure"
          className="crm-button-secondary inline-flex size-9 items-center justify-center p-0"
        >
          <Settings2 className="size-4" />
        </Link>
        <DeployButton templateId={row.id} variant="primary" />
      </div>
    </div>
  );
}

/** The Marketplace cell: a calm "is this agent listed for sale, and what has it
 *  earned?" — distinct from Deployed (to clients). Listed → an accent-soft
 *  "Listed · $29/mo" chip + a muted "$120 earned" sub-line (+ a quiet
 *  "View listing" link when it's live on the storefront). Not listed → muted
 *  "Not listed". All presentation comes from the pure `marketplaceCellState`. */
function MarketplaceCell({ marketplace }: { marketplace: AgentMarketplaceStatus }) {
  const cell = marketplaceCellState(marketplace);

  if (!cell.listed) {
    return <span className="text-[13px] text-muted-foreground">Not listed</span>;
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="inline-flex w-fit max-w-full items-center gap-1.5 truncate rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
        <span className="shrink-0">{cell.published ? "Listed" : "Draft"}</span>
        <span className="text-primary/60" aria-hidden>
          ·
        </span>
        <span className="truncate font-mono text-[11px]">{cell.priceLabel}</span>
      </span>
      <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="font-mono">{cell.revenueLabel}</span>
        {cell.published && cell.slug && (
          <Link
            href={`/marketplace/${cell.slug}`}
            target="_blank"
            className="inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground hover:underline"
            title="View listing"
          >
            View <ExternalLink className="size-3" aria-hidden />
          </Link>
        )}
      </span>
    </div>
  );
}
