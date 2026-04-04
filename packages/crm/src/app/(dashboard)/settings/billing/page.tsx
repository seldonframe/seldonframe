import Link from "next/link";
import { auth } from "@/auth";
import { createBillingPortalSessionAction } from "@/lib/billing/actions";
import { listManagedOrganizations } from "@/lib/billing/orgs";
import { getPlan, getProPlans } from "@/lib/billing/plans";
import { getSeldonUsageStats } from "@/lib/ai/client";
import { getOrgId } from "@/lib/auth/helpers";

/*
  Square UI class reference (source of truth):
  - templates/dashboard-2/components/dashboard/welcome-section.tsx
    - title: "text-lg sm:text-[22px] font-semibold leading-relaxed"
    - helper text: "text-sm sm:text-base text-muted-foreground"
  - templates/dashboard-2/components/dashboard/deals-table.tsx
    - card/list shell: "rounded-xl border bg-card"
*/

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Not set";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not set";
  }

  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export default async function BillingSettingsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const plan = getPlan(session.user.planId ?? "");
  const trialEndsAt = session.user.trialEndsAt ?? null;
  const status = session.user.subscriptionStatus ?? "trialing";
  const managedOrgs = plan?.type === "pro" ? await listManagedOrganizations() : [];
  const nextProTier = plan?.type === "pro" ? getProPlans().find((entry) => entry.limits.maxOrgs > plan.limits.maxOrgs) : null;
  const orgId = await getOrgId();
  const usageStats = orgId ? await getSeldonUsageStats({ orgId, userId: session.user.id }) : null;

  return (
    <section className="animate-page-enter space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-lg sm:text-[22px] font-semibold leading-relaxed text-foreground">Billing</h1>
        <p className="text-sm sm:text-base text-muted-foreground">Manage your plan and subscription details.</p>
      </div>

      <div className="rounded-xl border bg-card space-y-4 p-5">
        <div className="grid gap-2 md:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-[0.08em] text-[hsl(var(--muted-foreground))]">Current plan</p>
            <p className="text-lg font-semibold text-foreground">{plan?.name ?? "Self-hosted / Free"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.08em] text-[hsl(var(--muted-foreground))]">Subscription status</p>
            <p className="text-lg font-semibold capitalize text-foreground">{status.replace("_", " ")}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.08em] text-[hsl(var(--muted-foreground))]">Billing period</p>
            <p className="text-foreground capitalize">{session.user.billingPeriod ?? "monthly"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.08em] text-[hsl(var(--muted-foreground))]">Trial end</p>
            <p className="text-foreground">{formatDate(trialEndsAt)}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <form action={createBillingPortalSessionAction}>
            <button type="submit" className="crm-button-primary h-10 px-4">
              Manage Subscription
            </button>
          </form>
          <Link href="/pricing" className="crm-button-secondary inline-flex h-10 items-center px-4">
            Change Plan
          </Link>
        </div>
      </div>

      {usageStats ? (
        <div className="rounded-xl border bg-card space-y-4 p-5">
          <h2 className="text-section-title">Seldon AI Usage</h2>
          <div className="grid gap-2 md:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-[0.08em] text-[hsl(var(--muted-foreground))]">
                Included runs
              </p>
              <p className="text-lg font-semibold text-foreground">
                {usageStats.includedUsed}{Number.isFinite(usageStats.includedLimit) ? ` / ${usageStats.includedLimit}` : " / ∞"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.08em] text-[hsl(var(--muted-foreground))]">
                Metered runs
              </p>
              <p className="text-lg font-semibold text-foreground">{usageStats.meteredUsed}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.08em] text-[hsl(var(--muted-foreground))]">
                BYOK runs
              </p>
              <p className="text-lg font-semibold text-foreground">{usageStats.byokUsed}</p>
            </div>
          </div>
          {Number.isFinite(usageStats.includedLimit) && usageStats.includedLimit > 0 ? (
            <div className="space-y-1">
              <div className="h-2 w-full overflow-hidden rounded-full bg-[hsl(var(--border))]">
                <div
                  className="h-full rounded-full bg-[hsl(var(--primary))]"
                  style={{ width: `${Math.min(100, (usageStats.includedUsed / usageStats.includedLimit) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                {usageStats.totalThisMonth} total this month
                {usageStats.mode === "metered" ? " · You have exceeded your included quota" : ""}
              </p>
            </div>
          ) : null}
          <div className="flex gap-2">
            <Link href="/settings/integrations" className="crm-button-secondary inline-flex h-10 items-center px-4">
              Add Your Own API Key
            </Link>
          </div>
        </div>
      ) : null}

      {plan?.type === "pro" ? (
        <div className="rounded-xl border bg-card space-y-4 p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-section-title">Client Organizations</h2>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              {managedOrgs.length} of {plan.limits.maxOrgs} used
            </p>
          </div>

          <ul className="space-y-2 text-sm text-[hsl(var(--muted-foreground))]">
            {managedOrgs.map((org) => (
              <li key={org.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                <span className="text-foreground">{org.name}</span>
                <span>/{org.slug}</span>
              </li>
            ))}
          </ul>

          {nextProTier ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Need more capacity? Upgrade to <span className="font-medium text-foreground">{nextProTier.name}</span>.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
