import { eq } from "drizzle-orm";

import { db } from "@/db";
import { organizations } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { MODULE_REGISTRY, type ModuleId } from "@/lib/workspace/modules";
import { canDisableModule, readEnabledModules } from "@/lib/workspace/surface";
import { toggleModuleAction } from "./actions";

/*
  Square UI class reference (source of truth — copied from
  settings/billing/page.tsx, keep this page visually native to /settings):
  - title: "text-lg sm:text-[22px] font-semibold leading-relaxed"
  - helper text: "text-sm sm:text-base text-muted-foreground"
  - card shell: "rounded-xl border bg-card"
*/

// Plain-language copy for the `reason` codes returned by canDisableModule /
// setModuleEnabled. Keep in sync with lib/workspace/surface.ts.
const BLOCKED_REASON_COPY: Record<string, string> = {
  home_always_on: "Home is always on.",
  active_subscription: "You have an active paid subscription — turn that off first.",
  active_deployment: "You have a live AI agent running — turn that off first.",
  blocked: "This can't be turned off right now.",
};

function blockedReasonCopy(reason: string | undefined): string {
  if (!reason) return BLOCKED_REASON_COPY.blocked;
  return BLOCKED_REASON_COPY[reason] ?? BLOCKED_REASON_COPY.blocked;
}

export default async function FeaturesSettingsPage({
  searchParams,
}: {
  // Next.js 15+ Promise-based searchParams. We resolve before reading.
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const orgId = await getOrgId();

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const blockedRaw = resolvedSearchParams?.blocked;
  const blockedReason = Array.isArray(blockedRaw) ? blockedRaw[0] : blockedRaw;

  const org = orgId
    ? await db
        .select({ settings: organizations.settings })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1)
        .then((rows) => rows[0] ?? null)
    : null;

  // null ⇒ grandfathered (never seeded / predates simple-home): show
  // everything on. setModuleEnabled already starts from the full
  // MODULE_IDS set when it sees a null current surface, so the first
  // toggle from this state materializes-then-removes correctly.
  const enabledModules = orgId ? readEnabledModules(org?.settings) : null;
  const isGrandfathered = enabledModules === null;
  const enabledSet = new Set<ModuleId>(enabledModules ?? []);

  // Pre-compute disable eligibility for the modules that have a guard
  // (money/agents) so we don't need client-side state for this simple form.
  const disableChecks = orgId
    ? await Promise.all(
        MODULE_REGISTRY.map(async (mod) => {
          if (mod.alwaysOn) return [mod.id, { ok: true }] as const;
          const decision = await canDisableModule(orgId, mod.id);
          return [mod.id, decision] as const;
        }),
      )
    : [];
  const disableDecisions = new Map<ModuleId, { ok: boolean; reason?: string }>(disableChecks);

  return (
    <section className="animate-page-enter space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-lg sm:text-[22px] font-semibold leading-relaxed text-foreground">Features</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Turn features on when you need them. Turning one off just hides it — nothing is deleted.
        </p>
      </div>

      {blockedReason ? (
        <div className="rounded-xl border border-caution/30 bg-caution/10 p-4 text-sm">
          <p className="font-medium text-foreground">Couldn&apos;t turn that off.</p>
          <p className="mt-1 text-muted-foreground">{blockedReasonCopy(blockedReason)}</p>
        </div>
      ) : null}

      {isGrandfathered ? (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
          <p className="font-medium text-foreground">You&apos;re seeing everything.</p>
          <p className="mt-1 text-muted-foreground">
            Turning something off hides it from your menu.
          </p>
        </div>
      ) : null}

      <div className="rounded-xl border bg-card divide-y divide-border">
        {MODULE_REGISTRY.map((mod) => {
          const isOn = mod.alwaysOn || isGrandfathered || enabledSet.has(mod.id);
          const decision = disableDecisions.get(mod.id) ?? { ok: true };
          const showToggle = !mod.alwaysOn;
          // Only disabling is ever blocked (turning something ON is always
          // allowed). If it's currently off, the toggle (to turn on) is
          // always enabled.
          const toggleDisabled = showToggle && isOn && !decision.ok;
          const nextEnabled = !isOn;

          return (
            <div key={mod.id} className="flex items-center justify-between gap-4 p-4">
              <div>
                <p className="text-sm font-medium text-foreground">{mod.label}</p>
                <p className="text-xs text-muted-foreground">{mod.description}</p>
                {toggleDisabled ? (
                  <p className="mt-1 text-xs text-caution">{blockedReasonCopy(decision.reason)}</p>
                ) : null}
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-muted-foreground">{isOn ? "On" : "Off"}</span>
                {showToggle ? (
                  <form action={toggleModuleAction}>
                    <input type="hidden" name="moduleId" value={mod.id} />
                    <input type="hidden" name="enabled" value={nextEnabled ? "true" : "false"} />
                    <button
                      type="submit"
                      disabled={toggleDisabled}
                      aria-label={`${nextEnabled ? "Turn on" : "Turn off"} ${mod.label}`}
                      className="crm-button-secondary inline-flex h-9 items-center px-3 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {nextEnabled ? "Turn on" : "Turn off"}
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
