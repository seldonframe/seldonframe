// v1.22.0 — operator portal /deals mirror
//
// Pipeline-grouped deals view scoped to the operator's workspace.
// Twenty-CRM-style — light mode, dense rows, status-pill stages,
// totals per stage. v1.23 will add inline stage drag-and-drop.

import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts, deals, pipelines } from "@/db/schema";
import { requireOperatorSessionForOrg } from "@/lib/operator-portal/auth";

type DealRow = {
  id: string;
  title: string;
  value: string;
  currency: string;
  stage: string;
  probability: number;
  contactId: string;
  contactName: string | null;
  expectedCloseDate: string | null;
  updatedAt: Date;
};

export default async function OperatorPortalDealsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const session = await requireOperatorSessionForOrg(orgSlug);

  const [dealRows, pipelineRows] = await Promise.all([
    db
      .select({
        id: deals.id,
        title: deals.title,
        value: deals.value,
        currency: deals.currency,
        stage: deals.stage,
        probability: deals.probability,
        contactId: deals.contactId,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
        expectedCloseDate: deals.expectedCloseDate,
        updatedAt: deals.updatedAt,
      })
      .from(deals)
      .leftJoin(contacts, eq(deals.contactId, contacts.id))
      .where(eq(deals.orgId, session.orgId))
      .orderBy(desc(deals.updatedAt))
      .limit(500),
    db
      .select({
        id: pipelines.id,
        stages: pipelines.stages,
      })
      .from(pipelines)
      .where(eq(pipelines.orgId, session.orgId))
      .limit(1)
      .then((r) => r[0] ?? null),
  ]);

  const stageOrder: string[] = pipelineRows
    ? extractStageNames(pipelineRows.stages)
    : [];

  // Build mapped rows with derived fields.
  const mapped: DealRow[] = dealRows.map((d) => ({
    id: d.id,
    title: d.title,
    value: d.value,
    currency: d.currency,
    stage: d.stage,
    probability: d.probability,
    contactId: d.contactId,
    contactName:
      `${d.contactFirstName ?? ""} ${d.contactLastName ?? ""}`.trim() || null,
    expectedCloseDate: d.expectedCloseDate,
    updatedAt: d.updatedAt,
  }));

  // Group by stage. Use pipeline stage order when available; otherwise
  // derive from the data itself.
  const byStage = new Map<string, DealRow[]>();
  for (const row of mapped) {
    const list = byStage.get(row.stage) ?? [];
    list.push(row);
    byStage.set(row.stage, list);
  }
  const orderedStages =
    stageOrder.length > 0
      ? stageOrder.filter((s) => byStage.has(s))
      : Array.from(byStage.keys());
  // Append any stage that wasn't in the pipeline definition.
  for (const stage of byStage.keys()) {
    if (!orderedStages.includes(stage)) orderedStages.push(stage);
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1
            className="text-[20px] font-semibold tracking-tight"
            style={{ color: "#111" }}
          >
            Deals
          </h1>
          <p className="text-[13px]" style={{ color: "#666" }}>
            {mapped.length} {mapped.length === 1 ? "deal" : "deals"} across{" "}
            {orderedStages.length}{" "}
            {orderedStages.length === 1 ? "stage" : "stages"}
          </p>
        </div>
      </header>

      {orderedStages.length === 0 ? (
        <article
          className="px-6 py-7 text-center"
          style={{
            backgroundColor: "#FFFFFF",
            border: "1px dashed #E5E5E1",
            borderRadius: "12px",
          }}
        >
          <p className="text-[14px]" style={{ color: "#888" }}>
            No deals yet. New bookings and contacts will move into your
            pipeline as work begins.
          </p>
        </article>
      ) : (
        <div className="space-y-4">
          {orderedStages.map((stage) => {
            const stageRows = byStage.get(stage) ?? [];
            const totalValue = stageRows.reduce(
              (sum, row) => sum + Number(row.value || 0),
              0,
            );
            const currency = stageRows[0]?.currency ?? "USD";
            return (
              <section
                key={stage}
                className="overflow-hidden"
                style={{
                  backgroundColor: "#FFFFFF",
                  border: "1px solid #E5E5E1",
                  borderRadius: "12px",
                }}
              >
                <header
                  className="flex items-center justify-between px-4 py-3"
                  style={{ borderBottom: "1px solid #F0F0EC" }}
                >
                  <h2
                    className="text-[13px] font-semibold tracking-tight"
                    style={{ color: "#111" }}
                  >
                    {stage}
                  </h2>
                  <div className="flex items-center gap-3 text-[12px]">
                    <span style={{ color: "#666" }}>
                      {stageRows.length}{" "}
                      {stageRows.length === 1 ? "deal" : "deals"}
                    </span>
                    <span
                      className="font-medium"
                      style={{ color: "#111" }}
                    >
                      {formatCurrency(totalValue, currency)}
                    </span>
                  </div>
                </header>
                <ul>
                  {stageRows.map((row, idx) => (
                    <li
                      key={row.id}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]"
                      style={{
                        borderTop:
                          idx === 0 ? "none" : "1px solid #F0F0EC",
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <p
                          className="font-medium truncate"
                          style={{ color: "#111" }}
                        >
                          {row.title}
                        </p>
                        {row.contactName ? (
                          <Link
                            href={`/portal/${orgSlug}/contacts/${row.contactId}`}
                            className="text-[11px] hover:underline truncate block"
                            style={{ color: "#666" }}
                          >
                            {row.contactName}
                          </Link>
                        ) : null}
                      </div>
                      <span
                        className="text-[12px] whitespace-nowrap"
                        style={{ color: "#888" }}
                      >
                        {row.expectedCloseDate
                          ? `Close ${new Date(
                              row.expectedCloseDate,
                            ).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })}`
                          : ""}
                      </span>
                      <span
                        className="font-medium whitespace-nowrap"
                        style={{ color: "#111" }}
                      >
                        {formatCurrency(Number(row.value || 0), row.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatCurrency(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(0)}`;
  }
}

/** pipelines.stages is jsonb of varied historical shape — sometimes
 *  an array of strings, sometimes objects with .name. We tolerate
 *  both and skip non-string entries silently. */
function extractStageNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (typeof entry === "string") return entry;
      if (entry && typeof entry === "object" && "name" in entry) {
        const name = (entry as { name?: unknown }).name;
        return typeof name === "string" ? name : null;
      }
      return null;
    })
    .filter((s): s is string => Boolean(s));
}
