import { SoulAutomationsOverview } from "@/components/automations/soul-automations-overview";
import { getSoul } from "@/lib/soul/server";
import { getOrgId } from "@/lib/auth/helpers";
import { db } from "@/db";
import { organizations, stripeConnections } from "@/db/schema";
import { eq } from "drizzle-orm";
import coachingFramework from "@/lib/frameworks/coaching.json";
import agencyFramework from "@/lib/frameworks/agency.json";
import saasFramework from "@/lib/frameworks/saas.json";

type ServiceKey = "stripe" | "resend" | "twilio" | "kit" | "google" | "none";

type OverviewAutomation = {
  id: string;
  name: string;
  trigger: string;
  action: string;
  requiresIntegration: ServiceKey;
};

/*
  Square UI class reference (source of truth):
  - templates/dashboard-2/components/dashboard/welcome-section.tsx
    - title: "text-lg sm:text-[22px] font-semibold leading-relaxed"
    - helper copy: "text-sm sm:text-base text-muted-foreground"
  - templates/task-management/components/task/header/task-header.tsx
    - header shell: "border-b border-border bg-background"
*/

export default async function AutomationsPage() {
  const [soul, orgId] = await Promise.all([getSoul(), getOrgId()]);
  const [org, stripe] = orgId
    ? await Promise.all([
        db
          .select({ integrations: organizations.integrations, settings: organizations.settings })
          .from(organizations)
          .where(eq(organizations.id, orgId))
          .limit(1)
          .then((rows) => rows[0] ?? null),
        db.select({ id: stripeConnections.id }).from(stripeConnections).where(eq(stripeConnections.orgId, orgId)).limit(1).then((rows) => rows[0] ?? null),
      ])
    : [null, null];

  const integrations = {
    stripe: Boolean(stripe?.id),
    resend: Boolean(org?.integrations?.resend?.connected),
    twilio: Boolean(org?.integrations?.twilio?.connected),
    kit: Boolean(org?.integrations?.kit?.connected),
    google: Boolean(org?.integrations?.google?.calendarConnected),
  };

  const frameworks = {
    coaching: coachingFramework,
    agency: agencyFramework,
    saas: saasFramework,
  } as const;

  const frameworkId = (soul?.industry ?? "") as keyof typeof frameworks;
  const framework = frameworks[frameworkId];

  const suggestions: OverviewAutomation[] = (framework?.automationSuggestions ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    trigger: item.trigger,
    action: item.action,
    requiresIntegration: (item.requiresIntegration as ServiceKey) ?? "none",
  }));
  const enabledAutomationIds = new Set<string>(
    Array.isArray(org?.settings?.enabledAutomations)
      ? (org?.settings?.enabledAutomations as string[])
      : [],
  );

  const activeAutomations = suggestions.filter((item) => enabledAutomationIds.has(item.id));
  const availableAutomations = suggestions.filter((item) => !enabledAutomationIds.has(item.id));

  const soulActions = (soul?.journey?.stages ?? []).flatMap((stage) =>
    (stage.autoActions ?? []).map((action) => ({ stage: stage.name, action })),
  );

  return (
    <section className="animate-page-enter space-y-4 sm:space-y-6">
      <div>
        <h2 className="text-lg sm:text-[22px] font-semibold leading-relaxed text-foreground">Automations</h2>
        <p className="text-sm sm:text-base text-muted-foreground">
          Toggle automations on or off. Each card reads like a sentence: &ldquo;When X happens → Then do Y.&rdquo;
        </p>
      </div>

      <SoulAutomationsOverview
        activeAutomations={activeAutomations}
        availableAutomations={availableAutomations}
        inferredActions={soulActions}
        integrations={integrations}
      />
    </section>
  );
}
