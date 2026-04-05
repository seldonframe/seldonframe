import Link from "next/link";
import { auth } from "@/auth";
import { selectPlanAction } from "@/lib/billing/actions";
import { getCloudPlans, getProPlans } from "@/lib/billing/plans";

type PricingPageProps = {
  searchParams: Promise<{ billing?: string }>;
};

function formatPrice(value: number) {
  return `$${value}`;
}

export default async function PricingPage({ searchParams }: PricingPageProps) {
  const session = await auth();
  const params = await searchParams;
  const billingPeriod = params.billing === "yearly" ? "yearly" : "monthly";
  const cloudPlans = getCloudPlans();
  const proPlans = getProPlans();

  return (
    <main className="crm-page">
      <section className="mx-auto max-w-6xl space-y-6">
        <header className="space-y-2 text-center">
          <h1 className="text-page-title">Choose your plan</h1>
          <p className="text-label text-[hsl(var(--color-text-secondary))]">Start with a 14-day free trial. Cancel anytime.</p>
        </header>

        <div className="mx-auto flex w-fit items-center gap-2 rounded-full border border-border bg-card p-1">
          <Link
            href="/pricing?billing=monthly"
            className={`rounded-full px-4 py-2 text-sm ${billingPeriod === "monthly" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >
            Monthly
          </Link>
          <Link
            href="/pricing?billing=yearly"
            className={`rounded-full px-4 py-2 text-sm ${billingPeriod === "yearly" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >
            Yearly (save 20%)
          </Link>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="space-y-3">
            <h2 className="text-section-title">For Your Business</h2>
            <div className="space-y-3">
              {cloudPlans.map((plan) => {
                const isPopular = plan.id === "cloud-pro";
                const periodPrice = billingPeriod === "yearly" ? plan.yearlyPrice : plan.price;

                return (
                  <article key={plan.id} className="crm-card space-y-4 p-5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold">{plan.name}</h3>
                      {isPopular ? <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary">Most Popular</span> : null}
                    </div>
                    <p className="text-2xl font-semibold">{formatPrice(periodPrice)}{billingPeriod === "yearly" ? "/yr" : "/mo"}</p>
                    <ul className="space-y-1 text-sm text-[hsl(var(--color-text-secondary))]">
                      <li>Max organizations: {plan.limits.maxOrgs}</li>
                      <li>{plan.limits.maxContacts < 0 ? "Unlimited contacts" : `${plan.limits.maxContacts} contacts`}</li>
                      <li>{plan.limits.maxEmailsPerMonth < 0 ? "Unlimited emails" : `${plan.limits.maxEmailsPerMonth.toLocaleString()} emails/month`}</li>
                      <li>{plan.limits.customDomain ? "Custom domain included" : "Custom domain unavailable"}</li>
                      <li>{plan.limits.removeBranding ? "Branding removal included" : "Powered by SeldonFrame badge shown"}</li>
                    </ul>
                    {session?.user ? (
                      <form action={selectPlanAction}>
                        <input type="hidden" name="planId" value={plan.id} />
                        <input type="hidden" name="billingPeriod" value={billingPeriod} />
                        <button type="submit" className="crm-button-primary h-10 w-full px-4">
                          Start Free Trial
                        </button>
                      </form>
                    ) : (
                      <Link href="/signup" className="crm-button-primary inline-flex h-10 w-full items-center justify-center px-4">
                        Start Free Trial
                      </Link>
                    )}
                  </article>
                );
              })}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-section-title">For Your Agency</h2>
            <p className="text-sm text-[hsl(var(--color-text-secondary))]">
              Pick a Pro tier by number of managed workspaces. Upgrade anytime as you grow.
            </p>
            <div className="space-y-3">
              {proPlans.map((plan, index) => {
                const periodPrice = billingPeriod === "yearly" ? plan.yearlyPrice : plan.price;
                const isPopular = index === 1;

                return (
                  <article key={plan.id} className="crm-card space-y-4 p-5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold">{plan.name}</h3>
                      {isPopular ? <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary">Best Value</span> : null}
                    </div>
                    <p className="text-2xl font-semibold">{formatPrice(periodPrice)}{billingPeriod === "yearly" ? "/yr" : "/mo"}</p>
                    <ul className="space-y-1 text-sm text-[hsl(var(--color-text-secondary))]">
                      <li>Up to {plan.limits.maxOrgs} managed workspaces</li>
                      <li>Workspace switcher + all-workspaces dashboard</li>
                      <li>Workspace onboarding + saved framework library</li>
                      <li>Custom domains + white-label branding</li>
                      <li>Seldon custom generation for each workspace</li>
                    </ul>
                    {session?.user ? (
                      <form action={selectPlanAction}>
                        <input type="hidden" name="planId" value={plan.id} />
                        <input type="hidden" name="billingPeriod" value={billingPeriod} />
                        <button type="submit" className="crm-button-primary h-10 w-full px-4">
                          Start Free Trial
                        </button>
                      </form>
                    ) : (
                      <Link href="/signup" className="crm-button-primary inline-flex h-10 w-full items-center justify-center px-4">
                        Start Free Trial
                      </Link>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        </div>

        <p className="text-center text-sm text-[hsl(var(--color-text-secondary))]">
          Self-host for free. No limits. Deploy on your own infrastructure. {" "}
          <a href="https://github.com/seldonframe/crm" target="_blank" rel="noreferrer" className="font-medium text-primary underline underline-offset-4">
            View on GitHub
          </a>
        </p>
      </section>
    </main>
  );
}
