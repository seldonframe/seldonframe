import { AutomationBuilder } from "@/components/automations/automation-builder";
import { SoulAutomationsOverview } from "@/components/automations/soul-automations-overview";
import { getSoul } from "@/lib/soul/server";
import { getOrgId } from "@/lib/auth/helpers";
import { db } from "@/db";
import { organizations, stripeConnections } from "@/db/schema";
import { eq } from "drizzle-orm";

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
        db.select({ integrations: organizations.integrations }).from(organizations).where(eq(organizations.id, orgId)).limit(1).then((rows) => rows[0] ?? null),
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

  const soulActions = (soul?.journey?.stages ?? []).flatMap((stage) =>
    (stage.autoActions ?? []).map((action) => ({ stage: stage.name, action }))
  );

  return (
    <section className="animate-page-enter space-y-4 sm:space-y-6">
      <div>
        <h2 className="text-lg sm:text-[22px] font-semibold leading-relaxed text-foreground">Automations</h2>
        <p className="text-sm sm:text-base text-muted-foreground">
          Build trigger → condition → action workflows and reuse them as templates.
        </p>
      </div>

      <SoulAutomationsOverview actions={soulActions} integrations={integrations} />

      <AutomationBuilder />
    </section>
  );
}
