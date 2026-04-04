import Link from "next/link";
import { getStripeConnectionStatus } from "@/lib/payments/actions";
import { getLabels } from "@/lib/soul/labels";

/*
  Square UI class reference (source of truth):
  - templates/dashboard-2/components/dashboard/welcome-section.tsx
    - title: "text-lg sm:text-[22px] font-semibold leading-relaxed"
    - helper copy: "text-sm sm:text-base text-muted-foreground"
  - templates/dashboard-2/components/dashboard/deals-table.tsx
    - card/list shell: "rounded-xl border bg-card"
*/

export default async function SettingsPage() {
  const [labels, stripeStatus] = await Promise.all([getLabels(), getStripeConnectionStatus()]);

  const sections = [
    { href: "/settings/profile", title: "Business Profile", description: "Your business name, industry, and branding", status: null },
    { href: "/settings/pipeline", title: "Pipeline", description: `Manage your ${labels.deal.singular.toLowerCase()} stages and workflow`, status: null },
    { href: "/settings/fields", title: "Custom Fields", description: "Add fields specific to your business", status: null },
    { href: "/settings/team", title: "Team", description: "Invite team members and manage roles", status: null },
    { href: "/settings/webhooks", title: "Webhooks", description: "Connect external services and automations", status: null },
    { href: "/settings/api", title: "API Keys", description: "Generate keys for programmatic access", status: null },
    { href: "/settings/payments", title: "Payments", description: "Connect Stripe to accept payments", status: stripeStatus ? "Connected ✓" : null },
    { href: "/settings/billing", title: "Billing", description: "Manage plan, trial, and subscription portal", status: null },
    { href: "/settings/integrations", title: "Integrations", description: "Connect Twilio, Resend, Kit, and Google", status: null },
    { href: "/settings/soul-transfer", title: "Soul Export / Import", description: "Download or upload your system configuration", status: null },
  ] as const;

  const grouped = [
    {
      id: "business",
      title: "Business Settings",
      items: sections.slice(0, 4),
    },
    {
      id: "developer",
      title: "Developer & System",
      items: sections.slice(4, 7),
    },
    {
      id: "billing",
      title: "Billing & Integrations",
      items: sections.slice(7),
    },
  ] as const;

  return (
    <section className="animate-page-enter space-y-6 sm:space-y-8">
      <div className="space-y-2">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your business profile, billing, and configuration tabs.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {grouped.map((group) => (
          <span key={group.id} className="inline-flex items-center justify-center gap-2 h-9 px-3 rounded-md border text-sm font-medium border-border hover:bg-background bg-muted shadow-xs">
            {group.title}
          </span>
        ))}
      </div>

      <div className="space-y-4">
        {grouped.map((group) => (
          <article key={group.id} className="rounded-xl border bg-card overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b">
              <p className="font-medium text-muted-foreground">{group.title}</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 hover:bg-muted/50 border-b border-border/50">
                    <th className="min-w-[180px] text-muted-foreground font-medium h-10 px-4 text-left align-middle">Tab</th>
                    <th className="min-w-[220px] text-muted-foreground font-medium h-10 px-4 text-left align-middle">Description</th>
                    <th className="min-w-[140px] text-muted-foreground font-medium h-10 px-4 text-left align-middle">Status</th>
                    <th className="min-w-[120px] text-muted-foreground font-medium h-10 px-4 text-left align-middle">Open</th>
                  </tr>
                </thead>
                <tbody>
                  {group.items.map((section) => (
                    <tr key={section.href} className="border-b border-border/50">
                      <td className="p-4 align-middle font-medium">{section.title}</td>
                      <td className="p-4 align-middle text-muted-foreground">{section.description}</td>
                      <td className="p-4 align-middle">
                        {section.status ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-medium bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800">
                            {section.status}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Configured</span>
                        )}
                      </td>
                      <td className="p-4 align-middle">
                        <Link href={section.href} className="inline-flex items-center justify-center gap-2 h-8 px-3 rounded-md border text-xs font-medium border-border hover:bg-background bg-muted shadow-xs">
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
