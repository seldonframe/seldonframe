import Link from "next/link";
import { notFound } from "next/navigation";
import { CreateCustomObjectRecordForm } from "@/components/crm/create-custom-object-record-form";
import { CustomObjectCrmSurface } from "@/components/crm/custom-object-crm-surface";
import { getCurrentWorkspaceRole, getOrgId } from "@/lib/auth/helpers";
import { getCustomObjectConfig, getCustomObjectFormSchema, listCustomObjectCrmRecords } from "@/lib/crm/custom-objects";
import { mapWorkspaceRoleToCustomObjectRole } from "@/lib/crm/custom-object-permissions";

export default async function CustomObjectPage({
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

  const route = `/${config.spec.routeBase}`;
  const tableViews = config.parsed.views.filter((view) => view.type === "table" && view.route === route);
  const tableView = selectedViewName
    ? tableViews.find((candidate) => candidate.name === selectedViewName) ?? tableViews[0] ?? null
    : tableViews.find((candidate) => candidate.default) ?? tableViews[0] ?? null;
  const hasPipeline = config.parsed.views.some((view) => view.route === `${route}/pipeline` && view.type === "kanban");
  const editableFields = config.entity.fields.filter((field) => !field.auto && !/^(createdAt|updatedAt)$/i.test(field.name)).map((field) => field.name);
  const pipelineHref = normalizedClientId ? `${route}/pipeline?clientId=${normalizedClientId}` : `${route}/pipeline`;

  return (
    <main className="animate-page-enter flex-1 overflow-auto bg-background p-4 sm:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-page-title">{config.spec.plural}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Custom object rendered from BLOCK.md entity and view metadata.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={normalizedClientId ? `/objects?clientId=${normalizedClientId}` : "/objects"} className="crm-button-ghost h-10 px-4">
            All Objects
          </Link>
          {hasPipeline ? (
            <Link href={pipelineHref} className="crm-button-ghost h-10 px-4">
              Open Pipeline
            </Link>
          ) : null}
        </div>
      </div>

      <section className="mb-5 rounded-xl border border-border/80 bg-card/70 p-4 shadow-(--shadow-xs)">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">{normalizedClientId ? "Client-specific custom object surface" : "Org-wide custom object surface"}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {normalizedClientId
                ? `Changes to ${config.spec.plural.toLowerCase()} here affect only this client-scoped experience.`
                : `Changes here become the default ${config.spec.plural.toLowerCase()} surface for the workspace.`}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">{`Prompt tip: try “create a custom object called ${config.spec.plural} with fields name, status linked to Contacts”.`}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {tableViews.map((candidate) => {
              const href = new URLSearchParams();
              if (normalizedClientId) href.set("clientId", normalizedClientId);
              href.set("view", candidate.name);
              const label = candidate.savedViews[0]?.label ?? candidate.name;
              const isActive = tableView?.name === candidate.name;
              return (
                <Link key={candidate.name} href={`/${config.spec.routeBase}?${href.toString()}`} className={isActive ? "rounded-full border border-primary/30 bg-primary/15 px-2.5 py-1 text-primary" : "rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-primary"}>
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
              <p className="mt-1 text-sm text-muted-foreground">Create a fresh {config.spec.singular.toLowerCase()} directly into the live schema-driven surface.</p>
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
        viewName={tableView?.name}
        scopedOverride={config.scopedOverride}
        endClientMode={Boolean(normalizedClientId)}
        clientId={normalizedClientId}
        editableFields={editableFields}
      />
    </main>
  );
}
