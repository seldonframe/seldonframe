import Link from "next/link";
import { notFound } from "next/navigation";
import { CreateCustomObjectRecordForm } from "@/components/crm/create-custom-object-record-form";
import { CustomObjectCrmSurface } from "@/components/crm/custom-object-crm-surface";
import { getCurrentWorkspaceRole, getOrgId } from "@/lib/auth/helpers";
import { getCustomObjectConfig, getCustomObjectFormSchema, listCustomObjectCrmRecords } from "@/lib/crm/custom-objects";
import { mapWorkspaceRoleToCustomObjectRole } from "@/lib/crm/custom-object-permissions";

export default async function CustomObjectPipelinePage({
  params,
  searchParams,
}: {
  params: Promise<{ objectSlug: string }>;
  searchParams: Promise<{ clientId?: string; view?: string }>;
}) {
  const [{ objectSlug }, { clientId, view }] = await Promise.all([params, searchParams]);
  const normalizedClientId = clientId?.trim() || null;
  const selectedViewName = view?.trim() || null;
  const [orgId, workspaceRole] = await Promise.all([getOrgId(), getCurrentWorkspaceRole()]);

  if (!orgId) {
    notFound();
  }

  const runtimeRole = mapWorkspaceRoleToCustomObjectRole(workspaceRole);

  const [config, records, formSchema] = await Promise.all([
    getCustomObjectConfig({ orgId, objectSlug, clientId: normalizedClientId, runtimeRole }),
    listCustomObjectCrmRecords({ orgId, objectSlug, clientId: normalizedClientId, runtimeRole }),
    getCustomObjectFormSchema({ orgId, objectSlug, clientId: normalizedClientId, runtimeRole }),
  ]);

  if (!config || !formSchema) {
    notFound();
  }

  const route = `/${config.spec.routeBase}/pipeline`;
  const pipelineViews = config.parsed.views.filter((candidate) => candidate.route === route && candidate.type === "kanban");
  const pipelineView = selectedViewName
    ? pipelineViews.find((candidate) => candidate.name === selectedViewName) ?? pipelineViews[0] ?? null
    : pipelineViews.find((candidate) => candidate.default) ?? pipelineViews[0] ?? null;
  if (!pipelineView) {
    notFound();
  }

  const editableFields = config.entity.fields.filter((field) => !field.auto && !/^(createdAt|updatedAt)$/i.test(field.name)).map((field) => field.name);
  const backHref = normalizedClientId ? `/${config.spec.routeBase}?clientId=${normalizedClientId}` : `/${config.spec.routeBase}`;

  return (
    <main className="animate-page-enter flex-1 overflow-auto bg-background p-4 sm:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-page-title">{config.spec.plural} Pipeline</h1>
          <p className="mt-1 text-sm text-muted-foreground">Live schema-driven kanban surface rendered from generated custom-object views.</p>
        </div>
        <Link href={backHref} className="crm-button-ghost h-10 px-4">
          Back to {config.spec.plural}
        </Link>
      </div>

      <section className="mb-5 rounded-xl border border-border/80 bg-card/70 p-4 shadow-(--shadow-xs)">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">{normalizedClientId ? "Client-specific pipeline surface" : "Org-wide pipeline surface"}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {normalizedClientId
                ? `Changes to this ${config.spec.plural.toLowerCase()} board affect only the current client-scoped experience.`
                : `Changes here become the default ${config.spec.plural.toLowerCase()} board for the workspace.`}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">{`Prompt tip: try “show ${config.spec.plural.toLowerCase()} as a board” after creating the custom object.`}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {pipelineViews.map((candidate) => {
              const href = new URLSearchParams();
              if (normalizedClientId) href.set("clientId", normalizedClientId);
              href.set("view", candidate.name);
              const label = candidate.savedViews[0]?.label ?? candidate.name;
              const isActive = pipelineView.name === candidate.name;
              return (
                <Link key={candidate.name} href={`/${config.spec.routeBase}/pipeline?${href.toString()}`} className={isActive ? "rounded-full border border-primary/30 bg-primary/15 px-2.5 py-1 text-primary" : "rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-primary"}>
                  {label}
                </Link>
              );
            })}
            <span className="rounded-full border border-border/80 bg-background/70 px-2.5 py-1">Ctrl/Cmd K for CRM shortcuts</span>
          </div>
        </div>
      </section>

      {config.access.canCreate ? (
        <section className="mb-5 rounded-xl border border-border/80 bg-card/70 p-4 shadow-(--shadow-xs)">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-card-title">Quick add {config.spec.singular.toLowerCase()}</h2>
              <p className="mt-1 text-sm text-muted-foreground">Add a fresh {config.spec.singular.toLowerCase()} and move it across the generated pipeline immediately.</p>
            </div>
          </div>
          <CreateCustomObjectRecordForm
            objectSlug={config.slug}
            objectLabel={config.spec.singular}
            clientId={normalizedClientId}
            fields={formSchema.fields}
            relationOptions={formSchema.relationOptions}
          />
        </section>
      ) : null}

      <CustomObjectCrmSurface
        blockMd={config.spec.blockMd}
        records={records}
        objectSlug={config.slug}
        route={route}
        viewName={pipelineView.name}
        scopedOverride={config.scopedOverride}
        endClientMode={Boolean(normalizedClientId)}
        clientId={normalizedClientId}
        editableFields={editableFields}
      />
    </main>
  );
}
