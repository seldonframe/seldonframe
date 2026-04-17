import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { UpgradePlanCheckoutButton } from "@/components/orgs/upgrade-plan-checkout-button";
import { getWorkspaceLimitStatus, listManagedOrganizations, setActiveOrgAction } from "@/lib/billing/orgs";
import { getPlan } from "@/lib/billing/plans";

export default async function OrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<{ limit?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;

  if (!session?.user?.id) {
    redirect("/login");
  }

  const plan = getPlan(session.user.planId ?? "");

  if (!plan || plan.type !== "pro") {
    redirect("/dashboard");
  }

  const rows = await listManagedOrganizations();
  const limitStatus = await getWorkspaceLimitStatus();
  const isLimited = !limitStatus.canCreate;

  return (
    <main className="crm-page">
      <section className="mx-auto max-w-6xl space-y-6">
        <header className="space-y-1">
          <h1 className="text-page-title">Your Client Organizations</h1>
          <p className="text-label text-[hsl(var(--color-text-secondary))]">
            Managing {rows.length} of {limitStatus.maxOrgs} organizations
          </p>
        </header>

        {isLimited || params.limit === "1" ? (
          <div className="rounded-lg border border-caution/30 bg-caution/10 px-4 py-3 text-sm text-caution">
            Workspace limit reached for your current plan. Upgrade to add more workspaces.
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((org) => (
            <article key={org.id} className="space-y-3 rounded-xl border bg-card p-5">
              <div>
                <p className="text-card-title">{org.name}</p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">/{org.slug}</p>
              </div>
              <div className="text-sm text-[hsl(var(--muted-foreground))]">
                <p>Soul: {org.soulId ?? "not set"}</p>
                <p>Contacts: {org.contactCount}</p>
              </div>
              <div className="flex gap-2">
                <form action={setActiveOrgAction} className="flex-1">
                  <input type="hidden" name="orgId" value={org.id} />
                  <input type="hidden" name="redirectTo" value="/dashboard" />
                  <button type="submit" className="crm-button-primary h-9 w-full px-3 text-sm">
                    Open
                  </button>
                </form>
                <form action={setActiveOrgAction} className="flex-1">
                  <input type="hidden" name="orgId" value={org.id} />
                  <input type="hidden" name="redirectTo" value="/settings" />
                  <button type="submit" className="crm-button-secondary h-9 w-full px-3 text-sm">
                    Settings
                  </button>
                </form>
              </div>
            </article>
          ))}
        </div>

        <section className="rounded-xl border bg-card p-5">
          <h2 className="text-section-title">Create New Workspace</h2>
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
            Use the guided 4-step onboarding flow to create and launch a new client workspace.
          </p>
          <div className="mt-4 flex items-center justify-between gap-3">
            <Link href="/dashboard" className="text-sm text-[hsl(var(--muted-foreground))] underline underline-offset-4">
              Back to dashboard
            </Link>
            {isLimited ? (
              <UpgradePlanCheckoutButton />
            ) : (
              <Link href="/orgs/new" className="crm-button-primary h-10 px-4 inline-flex items-center">
                Create Workspace
              </Link>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
