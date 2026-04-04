"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Zap } from "lucide-react";

type ServiceKey = "stripe" | "resend" | "twilio" | "kit" | "google" | "none";

type InferredActionItem = {
  id: string;
  stage: string;
  action: string;
  requiredService: ServiceKey;
};

type SuggestedAutomation = {
  id: string;
  name: string;
  trigger: string;
  action: string;
  requiresIntegration: ServiceKey;
};

const serviceLabel: Record<ServiceKey, string> = {
  stripe: "Stripe",
  resend: "Resend",
  twilio: "Twilio",
  kit: "Kit",
  google: "Google Calendar",
  none: "None",
};

function inferService(action: string): ServiceKey {
  const text = action.toLowerCase();

  if (/payment|invoice|charge|checkout/.test(text)) {
    return "stripe";
  }

  if (/sms|text message|twilio/.test(text)) {
    return "twilio";
  }

  if (/calendar|booking|appointment/.test(text)) {
    return "google";
  }

  if (/campaign|newsletter|kit/.test(text)) {
    return "kit";
  }

  if (/email|welcome|follow up|follow-up/.test(text)) {
    return "resend";
  }

  return "none";
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
  const items = useMemo<InferredActionItem[]>(
    () =>
      inferredActions.map((entry, index) => ({
        id: `${entry.stage}-${index}`,
        stage: entry.stage,
        action: entry.action,
        requiredService: inferService(entry.action),
      })),
    [inferredActions]
  );

  const [activeById, setActiveById] = useState<Record<string, boolean>>(() => {
    const base = Object.fromEntries(activeAutomations.map((item) => [item.id, true]));
    return base;
  });

  const [availableById, setAvailableById] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(availableAutomations.map((item) => [item.id, false]))
  );

  const [inferredById, setInferredById] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(items.map((item) => [item.id, true]))
  );

  function integrationConnected(service: ServiceKey) {
    if (service === "none") {
      return true;
    }

    return integrations[service];
  }

  return (
    <section className="space-y-4">
      <article className="rounded-xl border bg-card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-base font-medium text-foreground">Your Automations</h3>
            <p className="text-sm text-muted-foreground">Automations selected during onboarding and powered by your integrations.</p>
          </div>
          <Link href="/settings/integrations" className="crm-button-secondary h-9 px-4 text-xs">
            Manage Integrations
          </Link>
        </div>
      </article>

      {activeAutomations.length === 0 ? (
        <article className="rounded-xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">No active automations yet. Enable one below to get started.</p>
        </article>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {activeAutomations.map((item) => {
            const connected = integrationConnected(item.requiresIntegration);
            const isActive = activeById[item.id] ?? true;

            return (
              <article key={item.id} className="rounded-xl border bg-card p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Trigger</p>
                    <p className="text-sm font-medium text-foreground">{item.trigger}</p>
                  </div>
                  <button
                    type="button"
                    className="h-8 px-3 rounded-md border border-border bg-muted/50 text-xs hover:bg-accent"
                    onClick={() => setActiveById((current) => ({ ...current, [item.id]: !isActive }))}
                  >
                    {isActive ? "Active" : "Paused"}
                  </button>
                </div>

                <div>
                  <p className="text-xs text-muted-foreground">Action</p>
                  <p className="text-sm text-foreground">{item.name}</p>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">Required integration: {serviceLabel[item.requiresIntegration]}</p>
                  {!connected && item.requiresIntegration !== "none" ? (
                    <Link href="/settings/integrations" className="crm-button-secondary h-8 px-3 text-xs">
                      Connect {serviceLabel[item.requiresIntegration]}
                    </Link>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <article className="rounded-xl border bg-card p-5 space-y-4">
        <div>
          <h3 className="text-base font-medium text-foreground">Available Automations</h3>
          <p className="text-sm text-muted-foreground">Suggested automations you did not enable during onboarding.</p>
        </div>

        {availableAutomations.length === 0 ? (
          <p className="text-sm text-muted-foreground">All suggested automations are already enabled.</p>
        ) : (
          <div className="space-y-2">
            {availableAutomations.map((item) => {
              const enabled = availableById[item.id] ?? false;
              const connected = integrationConnected(item.requiresIntegration);
              return (
                <div key={item.id} className="rounded-lg border border-border px-3 py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.name}</p>
                    <p className="text-xs text-muted-foreground">Requires {serviceLabel[item.requiresIntegration]}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!connected && item.requiresIntegration !== "none" ? (
                      <Link href="/settings/integrations" className="crm-button-secondary h-8 px-3 text-xs">
                        Connect {serviceLabel[item.requiresIntegration]}
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      className="h-8 px-3 rounded-md border border-border bg-muted/50 text-xs hover:bg-accent"
                      onClick={() => setAvailableById((current) => ({ ...current, [item.id]: !enabled }))}
                    >
                      {enabled ? "Enabled" : "Enable"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </article>

      <article className="rounded-xl border bg-card p-5 space-y-4">
        <div>
          <h3 className="text-base font-medium text-foreground">Custom Automations</h3>
          <p className="text-sm text-muted-foreground">Advanced trigger → condition → action workflows for power users.</p>
        </div>

        {items.length > 0 ? (
          <div className="space-y-2">
            {items.map((item) => {
              const connected = integrationConnected(item.requiredService);
              const isActive = inferredById[item.id] ?? true;
              return (
                <div key={item.id} className="rounded-lg border border-border px-3 py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">{item.stage}</p>
                    <p className="text-sm text-foreground">{item.action}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!connected && item.requiredService !== "none" ? (
                      <Link href="/settings/integrations" className="crm-button-secondary h-8 px-3 text-xs">
                        Connect {serviceLabel[item.requiredService]}
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      className="h-8 px-3 rounded-md border border-border bg-muted/50 text-xs hover:bg-accent"
                      onClick={() => setInferredById((current) => ({ ...current, [item.id]: !isActive }))}
                    >
                      {isActive ? "Active" : "Paused"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Build your first custom automation below.
          </div>
        )}
      </article>
    </section>
  );
}
