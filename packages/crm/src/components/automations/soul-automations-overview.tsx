"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, CircleDashed, Zap } from "lucide-react";

type ServiceKey = "stripe" | "resend" | "twilio" | "kit" | "google" | "none";

type SuggestedAutomation = {
  id: string;
  name: string;
  trigger: string;
  action: string;
  requiresIntegration: ServiceKey;
};

const serviceLabel: Record<ServiceKey, string> = {
  stripe: "Stripe",
  resend: "Email (Resend)",
  twilio: "Twilio SMS",
  kit: "Kit Newsletter",
  google: "Google Calendar",
  none: "",
};

const serviceBadgeColor: Record<ServiceKey, string> = {
  stripe: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  resend: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  twilio: "bg-red-500/10 text-red-600 dark:text-red-400",
  kit: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  google: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  none: "bg-muted text-muted-foreground",
};

function inferService(action: string): ServiceKey {
  const text = action.toLowerCase();

  if (/payment|invoice|charge|checkout/.test(text)) return "stripe";
  if (/sms|text message|twilio/.test(text)) return "twilio";
  if (/calendar|booking|appointment/.test(text)) return "google";
  if (/campaign|newsletter|kit/.test(text)) return "kit";
  if (/email|welcome|follow up|follow-up/.test(text)) return "resend";

  return "none";
}

function AutomationCard({
  trigger,
  actionText,
  name,
  service,
  connected,
  active,
  onToggle,
}: {
  trigger: string;
  actionText: string;
  name: string;
  service: ServiceKey;
  connected: boolean;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <article className="rounded-xl border bg-card p-4 space-y-3 transition-colors hover:border-primary/30">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-foreground leading-snug">{name}</p>
        <button
          type="button"
          onClick={onToggle}
          className={`shrink-0 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-medium transition-colors ${
            active
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20"
              : "bg-muted text-muted-foreground hover:bg-accent"
          }`}
        >
          {active ? <CheckCircle2 className="size-3" /> : <CircleDashed className="size-3" />}
          {active ? "Active" : "Off"}
        </button>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded-md bg-muted px-2 py-1 text-foreground font-medium">When</span>
        <span className="flex-1 truncate">{trigger}</span>
        <ArrowRight className="size-3 shrink-0" />
        <span className="rounded-md bg-muted px-2 py-1 text-foreground font-medium">Then</span>
        <span className="flex-1 truncate">{actionText}</span>
      </div>

      {service !== "none" ? (
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${serviceBadgeColor[service]}`}>
            <Zap className="size-2.5" />
            {serviceLabel[service]}
          </span>
          {!connected ? (
            <Link href="/settings/integrations" className="text-[10px] text-primary hover:underline">
              Connect →
            </Link>
          ) : (
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400">Connected</span>
          )}
        </div>
      ) : null}
    </article>
  );
}

export function SoulAutomationsOverview({
  activeAutomations,
  availableAutomations,
  inferredActions,
  integrations,
}: {
  activeAutomations: SuggestedAutomation[];
  availableAutomations: SuggestedAutomation[];
  inferredActions: Array<{ stage: string; action: string }>;
  integrations: {
    stripe: boolean;
    resend: boolean;
    twilio: boolean;
    kit: boolean;
    google: boolean;
  };
}) {
  const inferredItems = useMemo(
    () =>
      inferredActions.map((entry, index) => ({
        id: `inferred-${entry.stage}-${index}`,
        stage: entry.stage,
        action: entry.action,
        service: inferService(entry.action),
      })),
    [inferredActions]
  );

  const [toggleState, setToggleState] = useState<Record<string, boolean>>(() => {
    const state: Record<string, boolean> = {};
    for (const item of activeAutomations) state[item.id] = true;
    for (const item of availableAutomations) state[item.id] = false;
    for (const item of inferredItems) state[item.id] = true;
    return state;
  });

  function toggle(id: string) {
    setToggleState((current) => ({ ...current, [id]: !current[id] }));
  }

  function isConnected(service: ServiceKey) {
    if (service === "none") return true;
    return integrations[service];
  }

  const allSuggested = [...activeAutomations, ...availableAutomations];

  return (
    <section className="space-y-6">
      {allSuggested.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Suggested Automations</h3>
            <Link href="/settings/integrations" className="text-xs text-primary hover:underline">Manage integrations</Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {allSuggested.map((item) => (
              <AutomationCard
                key={item.id}
                trigger={item.trigger}
                actionText={item.action}
                name={item.name}
                service={item.requiresIntegration}
                connected={isConnected(item.requiresIntegration)}
                active={toggleState[item.id] ?? false}
                onToggle={() => toggle(item.id)}
              />
            ))}
          </div>
        </div>
      ) : (
        <article className="rounded-xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">No suggested automations for your framework yet. Use the builder below or ask Seldon It.</p>
        </article>
      )}

      {inferredItems.length > 0 ? (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Soul-Inferred Workflows</h3>
          <p className="text-xs text-muted-foreground">Based on the journey stages your Soul defined during setup.</p>
          <div className="grid gap-3 md:grid-cols-2">
            {inferredItems.map((item) => (
              <AutomationCard
                key={item.id}
                trigger={`Contact enters "${item.stage}" stage`}
                actionText={item.action}
                name={item.action}
                service={item.service}
                connected={isConnected(item.service)}
                active={toggleState[item.id] ?? true}
                onToggle={() => toggle(item.id)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
