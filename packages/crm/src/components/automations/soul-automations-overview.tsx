"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type ServiceKey = "stripe" | "resend" | "twilio" | "kit" | "google" | "none";

type AutoActionItem = {
  id: string;
  stage: string;
  action: string;
  requiredService: ServiceKey;
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
  actions,
  integrations,
}: {
  actions: Array<{ stage: string; action: string }>;
  integrations: {
    stripe: boolean;
    resend: boolean;
    twilio: boolean;
    kit: boolean;
    google: boolean;
  };
}) {
  const items = useMemo<AutoActionItem[]>(
    () =>
      actions.map((entry, index) => ({
        id: `${entry.stage}-${index}`,
        stage: entry.stage,
        action: entry.action,
        requiredService: inferService(entry.action),
      })),
    [actions]
  );

  const [activeById, setActiveById] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(items.map((item) => [item.id, true]))
  );

  return (
    <section className="space-y-4">
      <article className="rounded-xl border bg-card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-base font-medium text-foreground">Automations powered by your Soul</h3>
            <p className="text-sm text-muted-foreground">Recommendations generated from your onboarding journey and connected services.</p>
          </div>
          <Link href="/dashboard/soul-deepener" className="crm-button-secondary h-9 px-4 text-xs">
            Edit Soul Answers
          </Link>
        </div>
      </article>

      {items.length === 0 ? (
        <article className="rounded-xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">No inferred automations yet. Complete soul setup to unlock suggested workflows.</p>
        </article>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((item) => {
            const connected = item.requiredService === "none" ? true : integrations[item.requiredService];
            const isActive = activeById[item.id] ?? true;

            return (
              <article key={item.id} className="rounded-xl border bg-card p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Trigger</p>
                    <p className="text-sm font-medium text-foreground">{item.stage}</p>
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
                  <p className="text-sm text-foreground">{item.action}</p>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">Required integration: {serviceLabel[item.requiredService]}</p>
                  {!connected && item.requiredService !== "none" ? (
                    <Link href="/settings/integrations" className="crm-button-secondary h-8 px-3 text-xs">
                      Connect {serviceLabel[item.requiredService]}
                    </Link>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
