import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { createManagedOrganizationAction, listManagedOrganizations, setActiveOrgAction } from "@/lib/billing/orgs";
import { getPlan } from "@/lib/billing/plans";

export default async function OrganizationsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const plan = getPlan(session.user.planId ?? "");

  if (!plan || plan.type !== "pro") {
    redirect("/dashboard");
  }

  const rows = await listManagedOrganizations();

  return (
    <main className="crm-page">
      <section className="mx-auto max-w-6xl space-y-6">
        <header className="space-y-1">
          <h1 className="text-page-title">Your Client Organizations</h1>
          <p className="text-label text-[hsl(var(--color-text-secondary))]">
            Managing {rows.length} of {plan.limits.maxOrgs} organizations
          </p>
        </header>

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
          <h2 className="text-section-title">Add Client Organization</h2>
          <form action={createManagedOrganizationAction} className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="space-y-1 md:col-span-2">
              <label className="text-label" htmlFor="businessName">
                Business name
              </label>
              <input id="businessName" name="businessName" required className="crm-input h-10 w-full px-3" />
            </div>
            <div className="space-y-1">
              <label className="text-label" htmlFor="soulId">
                Soul package
              </label>
              <select id="soulId" name="soulId" className="crm-input h-10 w-full px-3">
                <option value="coach">Coach</option>
                <option value="therapist">Therapist</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-label" htmlFor="ownerName">
                Client owner name (optional)
              </label>
              <input id="ownerName" name="ownerName" className="crm-input h-10 w-full px-3" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-label" htmlFor="ownerEmail">
                Client owner email (optional)
              </label>
              <input id="ownerEmail" name="ownerEmail" type="email" className="crm-input h-10 w-full px-3" />
            </div>
            <div className="md:col-span-2 flex items-center justify-between pt-2">
              <Link href="/dashboard" className="text-sm text-[hsl(var(--muted-foreground))] underline underline-offset-4">
                Back to dashboard
              </Link>
              <button type="submit" className="crm-button-primary h-10 px-4">
                Create Organization
              </button>
            </div>
          </form>
        </section>
      </section>
    </main>
  );
}
