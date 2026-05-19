import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Building2 } from "lucide-react";
import { getArchetype } from "@/lib/agents/archetypes";
import { getAgentConfig, revertAgentConfigFormAction } from "@/lib/agents/configure-actions";
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
import { WorkspaceAutoApplySelect } from "@/components/automations/workspace-auto-apply-select";
// 2026-05-19 — Phase 7 Task 7.2. Live system-prompt preview. Renders
// the fully-resolved conversation prompt + opening SMS on the server
// so operators see byte-identical output to what dispatchConversation
// will pass to the LLM on the next real form submission.
import { previewConversationSystemPrompt } from "@/lib/agents/preview-system-prompt";

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

  // 2026-05-19 — Phase 7 Task 7.2. Preview is computed AFTER config
  // loads so synthesis sees the operator's most recent placeholder
  // values. Surfaces synthesis failures inline as an amber notice so
  // the operator knows which required field is still empty.
  const preview = orgId
    ? await previewConversationSystemPrompt(orgId, id, config).catch((err) => ({
        ok: false as const,
        error: `preview_threw:${err instanceof Error ? err.message : String(err)}`,
      }))
    : ({ ok: false, error: "no_active_workspace" } as const);

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
            Pick which workspace this automation should run in. Switches happen instantly when you change the selection.
          </p>
          {/* 2026-05-18 — auto-applies on select change (no separate
              "Switch & configure" button) per operator feedback. */}
          <WorkspaceAutoApplySelect
            orgs={managedOrgs.map((o) => ({ id: o.id, name: o.name }))}
            activeOrgId={orgId}
            switchAction={setActiveOrgAction}
            redirectTo={`/automations/${id}/configure`}
          />
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

      {/* 2026-05-19 — Phase 7 Task 7.2. Live system-prompt preview.
          Shows the FULLY-RESOLVED conversation system prompt + opening
          SMS — all {{contact.firstName}}, {{businessName}}, {{clock.today}},
          $forbiddenPhrases substituted with sample values. The operator
          sees exactly what the LLM will read AFTER saving, without
          having to trigger a real form submission. Pairs with the /runs
          page snapshot (Phase 7.1) which shows what the LLM ACTUALLY
          read on a past run. */}
      <article className="rounded-xl border bg-card p-4 sm:p-5 space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-card-title">Live preview</h2>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            what the LLM will read
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Resolved with sample values (Sample Customer / +1 555 555 5555). Once you save, real form
          submissions get the live customer name, phone, and today&apos;s date.
        </p>
        {preview.ok ? (
          <>
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Opening SMS (with sample placeholders filled)
              </p>
              <pre className="overflow-x-auto rounded-md border bg-background p-3 text-xs leading-relaxed whitespace-pre-wrap">
                {preview.conversationStep.initial_message || "(empty — archetype has no initial_message)"}
              </pre>
            </div>
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                System prompt (resolved)
              </p>
              <pre className="overflow-x-auto rounded-md border bg-background p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap max-h-96">
                {preview.systemPrompt}
              </pre>
            </div>
          </>
        ) : (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
            Can&apos;t preview yet: <code className="font-mono">{preview.error}</code>. Fill the
            required fields above and save, then come back to see the resolved prompt.
          </p>
        )}
      </article>

      {/* 2026-05-19 — Phase 7 Task 7.3. Edit history + one-click revert.
          Every save snapshots the pre-edit state. Operator can "go back"
          to any of the last 20 saves with one click. Defends against the
          "I edited the prompt and now nothing works" panic. */}
      {config?.history && config.history.length > 0 ? (
        <article className="rounded-xl border bg-card p-4 sm:p-5 space-y-3">
          <div>
            <h2 className="text-card-title">Edit history</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Recover from a bad edit. Each save is snapshotted; click revert to restore.
            </p>
          </div>
          <ul className="divide-y">
            {config.history.map((entry, i) => (
              <li key={`${entry.savedAt}-${i}`} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-foreground">
                    {new Date(entry.savedAt).toLocaleString()}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {entry.systemPromptOverride
                      ? `Custom prompt: ${entry.systemPromptOverride.slice(0, 80)}…`
                      : `Placeholders: ${Object.keys(entry.placeholders).length} fields`}
                  </p>
                </div>
                <form action={revertAgentConfigFormAction}>
                  <input type="hidden" name="archetypeId" value={id} />
                  <input type="hidden" name="historyIndex" value={i} />
                  <button
                    type="submit"
                    className="rounded-md border bg-background px-3 py-1.5 text-[11px] text-foreground hover:bg-muted"
                  >
                    Revert to this
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </article>
      ) : null}
    </section>
  );
}
