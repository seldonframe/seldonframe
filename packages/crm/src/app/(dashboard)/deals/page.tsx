import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { getLabels } from "@/lib/soul/labels";
import { getDefaultPipeline, listDeals } from "@/lib/deals/actions";
import { DealsView, type DealRow, type StageDef } from "@/components/deals/deals-view";

/**
 * /deals — main Engagements page.
 *
 * Server-loads deals + pipeline stages + contacts, then hands off to the
 * `<DealsView>` client component which renders a Table | Kanban toggle
 * with HTML5 drag-and-drop between stages. The kanban view uses the
 * existing `moveDealStageAction` server action so persistence semantics
 * (probability, closedAt for Won/Lost) match the rest of the app.
 *
 * Search / stage / value filters stay URL-driven (the `<form method="get">`
 * inside DealsView submits to this same route). The reason: deep links
 * still work, and the SSR-rendered table/kanban respects the filter on
 * first paint without needing a client-side fetch.
 */

const FALLBACK_STAGES: StageDef[] = [
  { name: "Lead", color: "#0284c7", probability: 10 },
  { name: "Qualified", color: "#9333ea", probability: 30 },
  { name: "Proposal", color: "#d97706", probability: 60 },
  { name: "Negotiation", color: "#ea580c", probability: 80 },
  { name: "Won", color: "#16a34a", probability: 100 },
  { name: "Lost", color: "#71717a", probability: 0 },
];

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string; value?: string; search?: string }>;
}) {
  const params = await searchParams;
  const search = (params.search ?? "").trim();
  const selectedStage = (params.stage ?? "all").trim() || "all";
  const selectedValue = (params.value ?? "all").trim() || "all";

  const [labels, dealRows, defaultPipeline, orgId] = await Promise.all([
    getLabels(),
    listDeals(),
    getDefaultPipeline(),
    getOrgId(),
  ]);

  const contactRows = orgId
    ? await db
        .select({
          id: contacts.id,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
        })
        .from(contacts)
        .where(eq(contacts.orgId, orgId))
    : [];

  const contactById: Record<string, string> = {};
  for (const c of contactRows) {
    contactById[c.id] = `${c.firstName} ${c.lastName ?? ""}`.trim();
  }

  // Stages from the org's default pipeline drive kanban column order;
  // fall back to a sensible default for orgs that haven't customized.
  // The fallback mirrors the standard B2B funnel (Lead → ... → Won/Lost)
  // and the stage colors below match `pipelines.stages[].color`.
  const stages: StageDef[] =
    Array.isArray(defaultPipeline?.stages) && defaultPipeline.stages.length > 0
      ? defaultPipeline.stages.map((s) => ({
          name: s.name,
          color: s.color || "",
          probability: s.probability ?? 0,
        }))
      : FALLBACK_STAGES;

  // Stages dropdown still derives from data so legacy stages that aren't
  // in the pipeline schema appear too.
  const availableStages = Array.from(new Set(dealRows.map((d) => d.stage))).sort((a, b) =>
    a.localeCompare(b)
  );

  const initialDeals: DealRow[] = dealRows.map((d) => ({
    id: d.id,
    title: d.title,
    contactId: d.contactId,
    stage: d.stage,
    value: String(d.value),
    probability: d.probability,
    createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : String(d.createdAt),
    updatedAt: d.updatedAt instanceof Date ? d.updatedAt.toISOString() : String(d.updatedAt),
  }));

  return (
    <main className="animate-page-enter flex-1 overflow-auto p-4 sm:p-6 space-y-6 bg-background w-full">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 sm:gap-6">
        <div className="space-y-2">
          <h1 className="text-lg sm:text-[22px] font-semibold leading-relaxed text-foreground">
            Engagements
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Track and move {labels.deal.plural.toLowerCase()} through your pipeline.
          </p>
        </div>
      </div>

      <DealsView
        initialDeals={initialDeals}
        stages={stages}
        contactById={contactById}
        contactLabelSingular={labels.contact.singular}
        dealLabelPlural={labels.deal.plural}
        availableStages={availableStages}
        initialFilters={{ search, stage: selectedStage, value: selectedValue }}
      />
    </main>
  );
}
