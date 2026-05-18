import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Building2 } from "lucide-react";
import { getArchetype } from "@/lib/agents/archetypes";
import { getAgentConfig } from "@/lib/agents/configure-actions";
import { getArchetypeSetupChecklist } from "@/lib/agents/setup-checklist";
import { getOrgId } from "@/lib/auth/helpers";
import { listForms } from "@/lib/forms/actions";
import { listAppointmentTypes } from "@/lib/bookings/actions";
import { ConfigureAgentForm } from "@/components/automations/configure-agent-form";
// 2026-05-18 — workspace selector for /automations/[id]/configure.
// Operator feedback: "it should be easy to select to which workspace
// to apply [the automation]." Today the configure page reads from the
// active org cookie (getOrgId) — so the agency operator first has to
// switch into a client workspace, then navigate to /automations.
// Surfacing a picker here makes the flow obvious: pick workspace,
// configure, save. Reuses the existing setActiveOrgAction (same one
// the sidebar workspace switcher uses) so behavior is consistent.
import { listManagedOrganizations, setActiveOrgAction } from "@/lib/billing/orgs";

/**
 * /automations/[id]/configure — agent configuration form + live
 * preview of the resolved trigger → step → step pipeline.
 *
 * The archetype's `placeholders` metadata drives form generation:
 * each `kind: "user_input"` placeholder becomes a field. Placeholders
 * with `valuesFromTool: "list_forms"` etc. render a select populated
 * from the corresponding listing tool; everything else is a free
 * text input. `kind: "soul_copy"` placeholders are filled by Claude
 * during synthesis and don't appear in the UI.
 *
 * Saved config persists to `organizations.settings.agentConfigs[id]`.
 */

export default async function ConfigureAutomationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const archetype = getArchetype(id);
  if (!archetype) notFound();

  const orgId = await getOrgId();
  const [config, formsResult, appointmentTypesResult, checklist, managedOrgs] = await Promise.all([
    getAgentConfig(id),
    listForms().catch(() => []),
    listAppointmentTypes().catch(() => []),
    orgId
      ? getArchetypeSetupChecklist(id, orgId).catch(() => null)
      : Promise.resolve(null),
    listManagedOrganizations().catch(() => []),
  ]);

  // Surface the typed picker options so the form doesn't have to
  // round-trip back to the server for them.
  const formOptions = (Array.isArray(formsResult) ? formsResult : []).map((f) => ({
    id: f.id,
    label: `${f.name ?? "(unnamed)"} — /${f.slug ?? "intake"}`,
  }));
  const appointmentOptions = (Array.isArray(appointmentTypesResult)
    ? appointmentTypesResult
    : []
  ).map((a) => ({
    id: a.id,
    label: `${(a as { title?: string }).title ?? "(unnamed)"} — /book/${(a as { bookingSlug?: string }).bookingSlug ?? "default"}`,
  }));

  return (
    <section className="animate-page-enter space-y-5 sm:space-y-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-muted-foreground">
        <Link href="/automations" className="inline-flex items-center gap-1 hover:text-foreground">
          <ChevronLeft className="size-3" />
          Automations
        </Link>
        <span>/</span>
        <span className="text-foreground">{archetype.name}</span>
        <span>/</span>
        <span>Configure</span>
      </nav>

      <header className="space-y-2">
        <h1 className="text-lg sm:text-[22px] font-semibold tracking-tight leading-relaxed text-foreground">
          {archetype.name}
        </h1>
        <p className="text-sm text-muted-foreground max-w-3xl">
          {archetype.detailedDescription}
        </p>
      </header>

      {/* 2026-05-18 — workspace selector. Renders only when the
          operator manages 2+ workspaces (a single-workspace operator
          has no selection to make — the active workspace IS the only
          one). Submits orgId + redirectTo back to this configure
          page so the cookie flips and the page re-renders against
          the picked workspace. */}
      {managedOrgs.length > 1 ? (
        <article className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <Building2 className="size-4 text-muted-foreground" />
            <p className="font-medium text-foreground">Apply to workspace</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Pick which workspace this automation should run in. Configuration is per-workspace.
          </p>
          <form action={setActiveOrgAction} className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <input type="hidden" name="redirectTo" value={`/automations/${id}/configure`} />
            <select
              name="orgId"
              defaultValue={orgId ?? ""}
              className="crm-input h-10 px-3 flex-1"
            >
              {managedOrgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                  {org.id === orgId ? " (active)" : ""}
                </option>
              ))}
            </select>
            <button type="submit" className="crm-button-secondary h-10 px-4 text-xs">
              Switch & configure
            </button>
          </form>
        </article>
      ) : null}

      {archetype.knownLimitations.length > 0 ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs">
          <p className="font-medium text-foreground mb-1.5">Heads up — known limitations</p>
          <ul className="space-y-1.5 text-muted-foreground">
            {archetype.knownLimitations.map((lim, i) => (
              <li key={i}>
                <span className="text-foreground">{lim.summary}</span>
                {lim.detail ? <span className="ml-1">{lim.detail}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ConfigureAgentForm
        archetypeId={archetype.id}
        archetypeName={archetype.name}
        placeholders={Object.entries(archetype.placeholders).map(([key, meta]) => ({
          key,
          kind: meta.kind,
          description: meta.description,
          example: meta.example ?? null,
          valuesFromTool: meta.valuesFromTool ?? null,
        }))}
        checklist={checklist}
        savedConfig={config}
        formOptions={formOptions}
        appointmentOptions={appointmentOptions}
        specTemplate={archetype.specTemplate}
      />
    </section>
  );
}
