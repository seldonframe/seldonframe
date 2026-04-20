import Link from "next/link";
import { notFound } from "next/navigation";
import { BrainInsightSection } from "@/components/crm/brain-insight-section";
import { CrmViewRenderer } from "@/components/crm/crm-view-renderer";
import { getCurrentWorkspaceRole, getOrgId } from "@/lib/auth/helpers";
import { getBrainInsightForRecord } from "@/lib/brain-record-insights";
import { getCustomObjectConfig, getCustomObjectCrmRecord } from "@/lib/crm/custom-objects";
import { mapWorkspaceRoleToCustomObjectRole } from "@/lib/crm/custom-object-permissions";

export default async function CustomObjectRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ objectSlug: string; id: string }>;
  searchParams: Promise<{ clientId?: string }>;
}) {
  const [{ objectSlug, id }, { clientId }] = await Promise.all([params, searchParams]);
  const normalizedClientId = clientId?.trim() || null;
  const [orgId, workspaceRole] = await Promise.all([getOrgId(), getCurrentWorkspaceRole()]);

  if (!orgId) {
    notFound();
  }

  const runtimeRole = mapWorkspaceRoleToCustomObjectRole(workspaceRole);

  const [config, record] = await Promise.all([
    getCustomObjectConfig({ orgId, objectSlug, clientId: normalizedClientId, runtimeRole }),
    getCustomObjectCrmRecord({ orgId, objectSlug, recordId: id, clientId: normalizedClientId, runtimeRole }),
  ]);

  if (!config || !record) {
    notFound();
  }

  const route = `/${config.spec.routeBase}/[id]`;
  const recordView = config.parsed.views.find((view) => view.type === "record") ?? null;
  const backHref = normalizedClientId ? `/${config.spec.routeBase}?clientId=${normalizedClientId}` : `/${config.spec.routeBase}`;
  const brainInsight = await getBrainInsightForRecord({
    workspaceId: orgId,
    blockMd: config.spec.blockMd,
    entityLabel: config.spec.singular,
    record,
    objectSlug: config.slug,
    endClientMode: Boolean(normalizedClientId),
  });

  return (
    <main className="flex-1 overflow-auto bg-background p-4 sm:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-page-title">{config.spec.singular} Record</h1>
          <p className="mt-1 text-sm text-muted-foreground">Record detail rendered from the generated BLOCK.md record view.</p>
        </div>
        <Link href={backHref} className="crm-button-ghost h-10 px-4">
          Back to {config.spec.plural}
        </Link>
      </div>

      <section className="mb-5 rounded-xl border border-border/80 bg-card/70 p-4 shadow-(--shadow-xs)">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">{normalizedClientId ? "Client-specific record" : "Org-wide record"}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {normalizedClientId
                ? `This ${config.spec.singular.toLowerCase()} record is rendered within a client-scoped custom-object surface.`
                : `This ${config.spec.singular.toLowerCase()} record is part of the workspace-wide custom-object surface.`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border border-border/80 bg-background/70 px-2.5 py-1">Entity: {config.entity.singular ?? config.entity.name}</span>
            <span className="rounded-full border border-border/80 bg-background/70 px-2.5 py-1">Route: {config.spec.routeBase}</span>
          </div>
        </div>
      </section>

      <BrainInsightSection insight={brainInsight} endClientMode={Boolean(normalizedClientId)} />

      <section className="space-y-4">
        <CrmViewRenderer
          blockMd={config.spec.blockMd}
          viewName={recordView?.name}
          route={route}
          record={record}
          scopedOverride={config.scopedOverride}
          endClientMode={Boolean(normalizedClientId)}
        />
      </section>
    </main>
  );
}
