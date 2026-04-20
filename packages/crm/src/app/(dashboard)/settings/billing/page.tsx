import Link from "next/link";
import { auth } from "@/auth";
import { createBillingPortalSessionAction } from "@/lib/billing/actions";
import { getOrgFeatures } from "@/lib/billing/features";
import { listManagedOrganizations } from "@/lib/billing/orgs";
import { getOrgSubscription } from "@/lib/billing/subscription";
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

function getTierLabel(tier: string) {
  const labels: Record<string, string> = {
    free: "Self-hosted / Free",
    starter: "Starter",
    cloud_pro: "Cloud Pro",
    pro_3: "Pro 3",
    pro_5: "Pro 5",
    pro_10: "Pro 10",
    pro_20: "Pro 20",
  };

  return labels[tier] ?? tier;
}

export default async function BillingSettingsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const orgId = await getOrgId();
  const activeOrgId = orgId ?? session.user.orgId ?? null;
  const subscription = await getOrgSubscription(activeOrgId);
  const tier = subscription.tier ?? "free";
  const features = getOrgFeatures(tier);
  const trialEndsAt = subscription.trialEndsAt ?? null;
  const status = subscription.status ?? "trialing";
  const billingPeriod = subscription.stripePriceId?.includes("year") ? "yearly" : "monthly";
  const managedOrgs = features.maxWorkspaces > 1 ? await listManagedOrganizations(session.user.id) : [];
  const usageStats = activeOrgId ? await getSeldonUsageStats({ orgId: activeOrgId, userId: session.user.id }) : null;

  return (
    <section className="animate-page-enter space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-lg sm:text-[22px] font-semibold leading-relaxed text-foreground">Billing</h1>
        <p className="text-sm sm:text-base text-muted-foreground">Manage your plan and subscription details.</p>
      </div>

      <div className="rounded-xl border bg-card space-y-4 p-5">
        <div className="grid gap-2 md:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Current plan</p>
            <p className="text-lg font-semibold text-foreground">{getTierLabel(tier)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Subscription status</p>
            <p className="text-lg font-semibold capitalize text-foreground">{status.replace("_", " ")}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Billing period</p>
            <p className="text-foreground capitalize">{billingPeriod}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Trial end</p>
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
              <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                Included runs
              </p>
              <p className="text-lg font-semibold text-foreground">
                {usageStats.includedUsed}{Number.isFinite(usageStats.includedLimit) ? ` / ${usageStats.includedLimit}` : " / ∞"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                Metered runs
              </p>
              <p className="text-lg font-semibold text-foreground">{usageStats.meteredUsed}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                BYOK runs
              </p>
              <p className="text-lg font-semibold text-foreground">{usageStats.byokUsed}</p>
            </div>
          </div>
          {Number.isFinite(usageStats.includedLimit) && usageStats.includedLimit > 0 ? (
            <div className="space-y-1">
              <div className="h-2 w-full overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full bg-[hsl(var(--primary))]"
                  style={{ width: `${Math.min(100, (usageStats.includedUsed / usageStats.includedLimit) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
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

      {features.maxWorkspaces > 1 ? (
        <div className="rounded-xl border bg-card space-y-4 p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-section-title">Client Organizations</h2>
            <p className="text-sm text-muted-foreground">
              {managedOrgs.length} of {features.maxWorkspaces} used
            </p>
          </div>

          <ul className="space-y-2 text-sm text-muted-foreground">
            {managedOrgs.map((org) => (
              <li key={org.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                <span className="text-foreground">{org.name}</span>
                <span>/{org.slug}</span>
              </li>
            ))}
          </ul>

          <p className="text-sm text-muted-foreground">
            Need more capacity? Upgrade to a higher Pro tier from the pricing page.
          </p>
        </div>
      ) : null}
    </section>
  );
}
