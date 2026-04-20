import { eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { DealsCrmSurface } from "@/components/crm/deals-crm-surface";
import { CreateDealForm } from "@/components/deals/create-deal-form";
import { getOrgId } from "@/lib/auth/helpers";
import { getCrmSurfaceConfig } from "@/lib/crm/view-config";
import { mapDealRowToCrmRecord } from "@/lib/crm/view-models";
import { getDefaultPipeline, listDeals } from "@/lib/deals/actions";
import { getLabels } from "@/lib/soul/labels";

export default async function DealsPipelinePage({ searchParams }: { searchParams: Promise<{ clientId?: string; view?: string }> }) {
  const { clientId, view } = await searchParams;
  const normalizedClientId = clientId?.trim() || null;
  const selectedViewName = view?.trim() || null;
  const orgId = await getOrgId();

  const [labels, dealsSurface, dealRows, defaultPipeline] = await Promise.all([
    getLabels(),
    getCrmSurfaceConfig({ orgId: orgId ?? "", entity: "deals", clientId: normalizedClientId }),
    listDeals(),
    getDefaultPipeline(),
  ]);

  const contactRows = orgId
    ? await db.select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName }).from(contacts).where(eq(contacts.orgId, orgId))
    : [];
  const contactById = new Map(contactRows.map((contact) => [contact.id, `${contact.firstName} ${contact.lastName ?? ""}`.trim()]));
  const stageProbabilities = Object.fromEntries(
    Array.isArray(defaultPipeline?.stages)
      ? defaultPipeline.stages.map((stage) => [stage.name, stage.probability])
      : []
  );

  const crmRecords = dealRows.map((deal) =>
    mapDealRowToCrmRecord({
      row: deal,
      contactName: contactById.get(deal.contactId) || labels.contact.singular,
      href: `/deals/${deal.id}${normalizedClientId ? `?clientId=${normalizedClientId}` : ""}`,
    })
  );
  const pipelineViews = dealsSurface.parsed.views.filter((candidate) => candidate.type === "kanban" && candidate.route === "/deals/pipeline");
  const pipelineView = selectedViewName
    ? pipelineViews.find((candidate) => candidate.name === selectedViewName) ?? pipelineViews[0] ?? null
    : pipelineViews.find((candidate) => candidate.default) ?? pipelineViews[0] ?? null;

  return (
    <main className="animate-page-enter flex-1 overflow-auto bg-background p-4 sm:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-page-title">Opportunity Pipeline</h1>
          <p className="mt-1 text-sm text-muted-foreground">Live schema-driven kanban surface rendered from BLOCK.md CRM view metadata.</p>
        </div>
        <Link href={normalizedClientId ? `/deals?clientId=${normalizedClientId}` : "/deals"} className="crm-button-ghost h-10 px-4">
          Back to Opportunities
        </Link>
      </div>

      <section className="mb-5 rounded-xl border border-border/80 bg-card/70 p-4 shadow-(--shadow-xs)">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">{normalizedClientId ? "Client-specific pipeline surface" : "Org-wide pipeline surface"}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {normalizedClientId
                ? "Changes to this pipeline view affect only the client-scoped experience."
                : "Changes here become the default kanban pipeline view for the workspace."}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">Prompt tip: try “show deals as a board” or “create an opportunity pipeline”.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {pipelineViews.map((candidate) => {
              const href = new URLSearchParams();
              if (normalizedClientId) href.set("clientId", normalizedClientId);
              href.set("view", candidate.name);
              const label = candidate.savedViews[0]?.label ?? candidate.name;
              const isActive = pipelineView?.name === candidate.name;
              return (
                <Link key={candidate.name} href={`/deals/pipeline?${href.toString()}`} className={isActive ? "rounded-full border border-primary/30 bg-primary/15 px-2.5 py-1 text-primary" : "rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-primary"}>
                  {label}
                </Link>
              );
            })}
            <span className="rounded-full border border-border/80 bg-background/70 px-2.5 py-1">Ctrl/Cmd K for CRM shortcuts</span>
          </div>
        </div>
      </section>

      <section className="mb-5 rounded-xl border border-border/80 bg-card/70 p-4 shadow-(--shadow-xs)">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-card-title">Quick add opportunity</h2>
            <p className="mt-1 text-sm text-muted-foreground">Drop a fresh opportunity into the default stage, then move it across the live pipeline.</p>
          </div>
        </div>
        <CreateDealForm contacts={contactRows} />
      </section>

      <DealsCrmSurface
        blockMd={dealsSurface.blockMd}
        records={crmRecords}
        stageProbabilities={stageProbabilities}
        scopedOverride={dealsSurface.scopedOverride}
        endClientMode={Boolean(normalizedClientId)}
        route="/deals/pipeline"
        viewName={pipelineView?.name}
      />
    </main>
  );
}
