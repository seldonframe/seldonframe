import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getArchetype } from "@/lib/agents/archetypes";
import { getAgentConfig } from "@/lib/agents/configure-actions";
import { listForms } from "@/lib/forms/actions";
import { listAppointmentTypes } from "@/lib/bookings/actions";
import { ConfigureAgentForm } from "@/components/automations/configure-agent-form";

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

  const [config, formsResult, appointmentTypesResult] = await Promise.all([
    getAgentConfig(id),
    listForms().catch(() => []),
    listAppointmentTypes().catch(() => []),
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
        requiresInstalled={archetype.requiresInstalled}
        savedConfig={config}
        formOptions={formOptions}
        appointmentOptions={appointmentOptions}
        specTemplate={archetype.specTemplate}
      />
    </section>
  );
}
