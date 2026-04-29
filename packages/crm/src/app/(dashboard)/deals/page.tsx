import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { getLabels } from "@/lib/soul/labels";
import { getDefaultPipeline, listDeals } from "@/lib/deals/actions";
import { getDealsView } from "@/lib/deals/view-cookie";
import {
  DealsView,
  type ContactOption,
  type DealRow,
  type StageDef,
} from "@/components/deals/deals-view";

/**
 * /deals — main Engagements page.
 *
 * Server-loads deals + pipeline stages + contacts + the operator's
 * preferred view (from cookie), then hands off to the `<DealsView>`
 * client component which owns the Kanban / Table render + drag-drop
 * via @dnd-kit.
 *
 * Cookie-based view persistence (vs. localStorage) means SSR picks
 * the right initial render — no flash from kanban → table when the
 * operator prefers table.
 *
 * Pipeline stages drive kanban column ordering. If the org has no
 * `pipelines` row (legacy workspaces predating eager-seed), the
 * fallback is a 6-stage B2B funnel; createDealAction self-heals on
 * first deal create via ensureDefaultPipelineForOrg.
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

  const [labels, dealRows, defaultPipeline, orgId, initialView] = await Promise.all([
    getLabels(),
    listDeals(),
    getDefaultPipeline(),
    getOrgId(),
    getDealsView(),
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
  const contactOptions: ContactOption[] = [];
  for (const c of contactRows) {
    const name = `${c.firstName} ${c.lastName ?? ""}`.trim() || "(unnamed)";
    contactById[c.id] = name;
    contactOptions.push({ id: c.id, name });
  }
  contactOptions.sort((a, b) => a.name.localeCompare(b.name));

  const stages: StageDef[] =
    Array.isArray(defaultPipeline?.stages) && defaultPipeline.stages.length > 0
      ? defaultPipeline.stages.map((s) => ({
          name: s.name,
          color: s.color || "",
          probability: s.probability ?? 0,
        }))
      : FALLBACK_STAGES;

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
          <h1 className="text-lg sm:text-[22px] font-semibold tracking-tight leading-relaxed text-foreground">
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
        contactOptions={contactOptions}
        contactLabelSingular={labels.contact.singular}
        dealLabelPlural={labels.deal.plural}
        availableStages={availableStages}
        initialFilters={{ search, stage: selectedStage, value: selectedValue }}
        initialView={initialView}
      />
    </main>
  );
}
