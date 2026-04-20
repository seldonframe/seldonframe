import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentWorkspaceRole, getOrgId } from "@/lib/auth/helpers";
import { listCustomObjectManagementItems } from "@/lib/crm/custom-objects";
import { mapWorkspaceRoleToCustomObjectRole } from "@/lib/crm/custom-object-permissions";

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Recently updated";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export default async function CustomObjectManagerPage({ searchParams }: { searchParams: Promise<{ clientId?: string }> }) {
  const { clientId } = await searchParams;
  const normalizedClientId = clientId?.trim() || null;
  const [orgId, workspaceRole] = await Promise.all([getOrgId(), getCurrentWorkspaceRole()]);

  if (!orgId) {
    notFound();
  }

  const items = await listCustomObjectManagementItems({
    orgId,
    clientId: normalizedClientId,
    runtimeRole: mapWorkspaceRoleToCustomObjectRole(workspaceRole),
  });

  return (
    <main className="animate-page-enter flex-1 overflow-auto bg-background p-4 sm:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-page-title">Custom Objects</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage every schema-driven custom object generated from BLOCK.md metadata in one place.</p>
        </div>
      </div>

      <section className="mb-5 rounded-xl border border-border/80 bg-card/70 p-4 shadow-(--shadow-xs)">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">{normalizedClientId ? "Client-specific object management" : "Workspace-wide object management"}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {normalizedClientId
                ? "This list includes object surfaces and linked records currently visible inside the client-scoped CRM experience."
                : "Review every generated object, inspect relation coverage, and jump directly into the live CRM surfaces."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border border-border/80 bg-background/70 px-2.5 py-1">{items.length} object{items.length === 1 ? "" : "s"}</span>
            <span className="rounded-full border border-border/80 bg-background/70 px-2.5 py-1">Schema-driven</span>
          </div>
        </div>
      </section>

      {items.length > 0 ? (
        <section className="grid gap-4 xl:grid-cols-2">
          {items.map((item) => (
            <article key={item.slug} className="rounded-2xl border border-border/80 bg-card/70 p-5 shadow-(--shadow-xs)">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-card-title">{item.label}</h2>
                  {item.description ? <p className="mt-1 text-sm text-muted-foreground">{item.description}</p> : null}
                </div>
                <span className="rounded-full border border-border/80 bg-background/70 px-2.5 py-1 text-xs text-muted-foreground">
                  {item.recordCount} record{item.recordCount === 1 ? "" : "s"}
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="rounded-full border border-border/80 bg-background/70 px-2.5 py-1">{item.singular}</span>
                <span className="rounded-full border border-border/80 bg-background/70 px-2.5 py-1">Updated {formatUpdatedAt(item.updatedAt)}</span>
                {item.relationTargets.length > 0 ? item.relationTargets.map((target) => (
                  <span key={`${item.slug}-${target}`} className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-primary">
                    Linked to {target}
                  </span>
                )) : (
                  <span className="rounded-full border border-border/80 bg-background/70 px-2.5 py-1">No relations defined</span>
                )}
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <Link href={item.href} className="crm-button-primary h-10 px-4">
                  Open {item.label}
                </Link>
                {item.pipelineHref ? (
                  <Link href={item.pipelineHref} className="crm-button-ghost h-10 px-4">
                    Open Pipeline
                  </Link>
                ) : null}
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-border/80 bg-card/40 p-8 text-center shadow-(--shadow-xs)">
          <h2 className="text-card-title">No custom objects yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">Try Seldon It with a prompt like “create a custom object called Projects with fields name, status, due_date linked to Contacts”.</p>
        </section>
      )}
    </main>
  );
}
