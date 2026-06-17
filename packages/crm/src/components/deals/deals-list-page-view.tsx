// v1.24.0 — shared deals-list page view (admin + operator portal)
//
// One source of truth for the /deals surface. Used by:
//   - /deals/page.tsx                       (admin dashboard)
//   - /portal/<slug>/deals/page.tsx         (operator portal mirror)
//
// Caller passes orgId + readonly. Drag-drop / kanban interactions
// in DealsView are wired to NextAuth-backed server actions; the
// operator portal sets readonly=true to disable those pending
// v1.24.1 dual-auth refactor.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { getLabels } from "@/lib/soul/labels";
import { getDefaultPipeline, listDeals } from "@/lib/deals/actions";
import { getDealsView } from "@/lib/deals/view-cookie";
import {
  DealsView,
  type ContactOption,
  type DealRow,
  type StageDef,
} from "@/components/deals/deals-view";

const FALLBACK_STAGES: StageDef[] = [
  { name: "Lead", color: "#0284c7", probability: 10 },
  { name: "Qualified", color: "#9333ea", probability: 30 },
  { name: "Proposal", color: "#d97706", probability: 60 },
  { name: "Negotiation", color: "#ea580c", probability: 80 },
  { name: "Won", color: "#16a34a", probability: 100 },
  { name: "Lost", color: "#71717a", probability: 0 },
];

export type DealsListPageSearchParams = {
  stage?: string;
  value?: string;
  search?: string;
};

export type DealsListPageViewProps = {
  orgId: string;
  searchParams: DealsListPageSearchParams;
  readonly?: boolean;
};

export async function DealsListPageView({
  orgId,
  searchParams,
  readonly = false,
}: DealsListPageViewProps) {
  const search = (searchParams.search ?? "").trim();
  const selectedStage = (searchParams.stage ?? "all").trim() || "all";
  const selectedValue = (searchParams.value ?? "all").trim() || "all";

  const [labels, dealRows, defaultPipeline, initialView] = await Promise.all([
    getLabels(orgId),
    listDeals(orgId),
    getDefaultPipeline(orgId),
    getDealsView(),
  ]);

  const contactRows = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
    })
    .from(contacts)
    .where(eq(contacts.orgId, orgId));

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

  const availableStages = Array.from(
    new Set(dealRows.map((d) => d.stage)),
  ).sort((a, b) => a.localeCompare(b));

  const initialDeals: DealRow[] = dealRows.map((d) => ({
    id: d.id,
    title: d.title,
    contactId: d.contactId,
    stage: d.stage,
    value: String(d.value),
    probability: d.probability,
    createdAt:
      d.createdAt instanceof Date ? d.createdAt.toISOString() : String(d.createdAt),
    updatedAt:
      d.updatedAt instanceof Date ? d.updatedAt.toISOString() : String(d.updatedAt),
  }));

  return (
    <main className="animate-page-enter flex-1 overflow-auto p-4 sm:p-6 space-y-6 bg-background w-full">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 sm:gap-6">
        <div className="space-y-2">
          <h1 className="text-lg sm:text-[22px] font-semibold tracking-tight leading-relaxed text-foreground">
            {labels.deal.plural}
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Track and move {labels.deal.plural.toLowerCase()} through your pipeline.
          </p>
          {readonly ? (
            <p className="text-xs text-muted-foreground italic">
              Read-only view. Edits available via the SF dashboard
              (operator-portal write mode lands in v1.24.1).
            </p>
          ) : null}
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
