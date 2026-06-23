// ICP-3 — the Agent TEMPLATE editor page (server component).
//
// Loads the builder's template (org-guarded via getOrgId + builderOrgId match),
// then renders the editor — greeting / persona script / FAQ / voice / tools —
// reusing the voice-receptionist editor's section patterns. Saves flow through
// saveAgentTemplateBlueprintAction. The header offers Test (the sandboxed chat
// panel, task 1.2) + Deploy (the deploy-to-client flow). The eval gate is 1.3.

import { notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ChevronLeft, Bot } from "lucide-react";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import {
  getAgentTemplate,
  surfaceForType,
  capabilitiesForSurface,
  DEFAULT_VOICE_RECEPTIONIST_VOICE,
  type AgentTemplateType,
} from "@/lib/agent-templates/store";
import { getSellerListingContextAction } from "@/lib/marketplace/seller-actions";
import { VETTED_CONNECTORS } from "@/lib/agents/mcp/connectors";
import type { AgentBlueprint } from "@/db/schema";
import { AgentTemplateEditor } from "./editor-client";
import { ListOnMarketplace } from "./list-on-marketplace";
import { TemplateStatusBadge, formatTemplateType } from "../status-badge";
import { DeployButton } from "../deploy-button";
import { DeployToClientsButton } from "../deploy-to-clients-button";
import { TestButton } from "../test-button";

export const dynamic = "force-dynamic";

export default async function AgentTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const orgId = await getOrgId();
  if (!orgId) notFound();

  const { id } = await params;
  const template = await getAgentTemplate(id);
  // Ownership guard: only the builder that owns the template can open it.
  if (!template || template.builderOrgId !== orgId) notFound();

  const blueprint = (template.blueprint ?? {}) as AgentBlueprint;
  // template.type is the DB text column (typed `string`); the column only ever
  // holds a valid AgentTemplateType, and surfaceForType safely defaults
  // anything non-chat to voice.
  const surface = surfaceForType(template.type as AgentTemplateType);
  // The tools a template can toggle, per surface — voice gets the voice set
  // (excl. the chat-only provide_faq_answer), chat gets the chat set (excl. the
  // voice-only get_quote_range). Same helper the generator's allow-list uses.
  const allCapabilities = capabilitiesForSurface(surface);

  // Seller marketplace context: the current listing for this template (if any)
  // + the builder's Stripe Connect status, so the "List on the marketplace"
  // panel opens pre-filled. Plus the builder's org name for the listing's
  // "built by" credit. Both are best-effort — never block the editor.
  const [listingCtx, orgRow] = await Promise.all([
    getSellerListingContextAction({ templateId: template.id }),
    db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1),
  ]);
  const sellerListing = listingCtx.ok ? listingCtx.listing : null;
  const sellerConnect = listingCtx.ok ? listingCtx.connect : { ready: false, pending: false };
  const builderName = orgRow[0]?.name ?? "A SeldonFrame builder";

  return (
    <section className="animate-page-enter space-y-5 sm:space-y-6">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1 text-xs text-muted-foreground"
      >
        <Link
          href="/studio/agents"
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          <ChevronLeft className="size-3" />
          Agents
        </Link>
        <span>/</span>
        <span className="text-foreground">{template.name}</span>
      </nav>

      <header className="flex flex-wrap items-start gap-3">
        <span
          className="inline-flex size-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500 dark:text-indigo-400"
          aria-hidden
        >
          <Bot className="size-5" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg sm:text-[22px] font-semibold tracking-tight leading-relaxed text-foreground">
              {template.name}
            </h1>
            <TemplateStatusBadge status={template.status} />
          </div>
          <p className="text-sm text-muted-foreground max-w-3xl">
            {formatTemplateType(template.type)} template. Configure it once here,
            test it in the sandbox, then deploy it to as many clients as you
            like.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TestButton templateId={template.id} variant="secondary" />
          <DeployToClientsButton templateId={template.id} variant="secondary" />
          <DeployButton templateId={template.id} variant="primary" />
        </div>
      </header>

      {/* List on the marketplace — publish this template as a sellable
          kind:'agent' listing, with a live preview + the paid Connect gate. */}
      <ListOnMarketplace
        templateId={template.id}
        templateName={template.name}
        agentType={template.type}
        builderName={builderName}
        initialListing={sellerListing}
        initialConnect={sellerConnect}
      />

      <AgentTemplateEditor
        templateId={template.id}
        surface={surface}
        initialBlueprint={{
          greeting: blueprint.greeting ?? "",
          customSkillMd: blueprint.customSkillMd ?? "",
          voice: blueprint.voice ?? DEFAULT_VOICE_RECEPTIONIST_VOICE,
          capabilities: blueprint.capabilities ?? [...allCapabilities],
          faq: (blueprint.faq ?? []).map((f) => ({ q: f.q, a: f.a })),
          quoteRanges: (blueprint.quoteRanges ?? []).map((r) => ({
            service: r.service,
            low: r.low,
            high: r.high,
          })),
          // MCP connector bindings (#3). Plain JSON (serviceName pointer + cached
          // tool schemas — NEVER the bearer key) so they cross the server→client
          // boundary safely. The picker renders + toggles these.
          connectors: blueprint.connectors ?? [],
        }}
        allCapabilities={allCapabilities}
        vettedConnectors={VETTED_CONNECTORS.map((c) => ({
          id: c.id,
          label: c.label,
          secretService: c.secretService,
        }))}
      />
    </section>
  );
}
