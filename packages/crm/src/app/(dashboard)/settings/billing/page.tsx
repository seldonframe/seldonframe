import Link from "next/link";
import { auth } from "@/auth";
import { createBillingPortalSessionAction } from "@/lib/billing/actions";
import { listManagedOrganizations } from "@/lib/billing/orgs";
import { getPlan, getProPlans } from "@/lib/billing/plans";

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

  return (
    <section className="animate-page-enter space-y-4">
      <div>
        <h1 className="text-page-title">Billing</h1>
        <p className="text-label text-[hsl(var(--color-text-secondary))]">Manage your plan and subscription details.</p>
      </div>

      <div className="glass-card space-y-4 rounded-2xl p-5">
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

      {plan?.type === "pro" ? (
        <div className="glass-card space-y-4 rounded-2xl p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-section-title">Client Organizations</h2>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              {managedOrgs.length} of {plan.limits.maxOrgs} used
            </p>
          </div>

          <ul className="space-y-2 text-sm text-[hsl(var(--muted-foreground))]">
            {managedOrgs.map((org) => (
              <li key={org.id} className="flex items-center justify-between rounded-lg border border-[hsl(var(--border))] px-3 py-2">
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
