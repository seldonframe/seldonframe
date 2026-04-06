import Link from "next/link";
import { getStripeConnectionStatus } from "@/lib/payments/actions";
import { getLabels } from "@/lib/soul/labels";
import { getCustomDomainSettings } from "@/lib/domains/actions";
import { listSavedFrameworkLibrary } from "@/lib/frameworks/actions";
import { getBrandingSettings } from "@/lib/branding/actions";

/*
  Square UI class reference (source of truth):
  - templates/dashboard-2/components/dashboard/welcome-section.tsx
    - title: "text-lg sm:text-[22px] font-semibold leading-relaxed"
    - helper copy: "text-sm sm:text-base text-muted-foreground"
  - templates/dashboard-2/components/dashboard/deals-table.tsx
    - card/list shell: "rounded-xl border bg-card"
*/

export default async function SettingsPage() {
  const [labels, stripeStatus, domainSettings, savedFrameworks, brandingSettings] = await Promise.all([
    getLabels(),
    getStripeConnectionStatus(),
    getCustomDomainSettings(),
    listSavedFrameworkLibrary(),
    getBrandingSettings(),
  ]);

  const domainStatus = domainSettings?.customDomain
    ? domainSettings.domainVerified
      ? "Verified ✓"
      : "Pending verification"
    : null;

  const frameworksStatus = savedFrameworks.length > 0 ? `${savedFrameworks.length} saved` : null;
  const brandingStatus = brandingSettings?.removePoweredBy ? "White-label enabled" : null;

  const sections = [
    { href: "/settings/profile", title: "Business Profile", description: "Your business name, industry, and branding", status: null },
    { href: "/settings/theme", title: "Brand & Theme", description: "Set public colors, fonts, radius, and logo", status: null },
    { href: "/settings/pipeline", title: "Pipeline", description: `Manage your ${labels.deal.singular.toLowerCase()} stages and workflow`, status: null },
    { href: "/settings/fields", title: "Custom Fields", description: "Add fields specific to your business", status: null },
    { href: "/settings/team", title: "Team", description: "Invite team members and manage roles", status: null },
    { href: "/settings/webhooks", title: "Webhooks", description: "Connect external services and automations", status: null },
    { href: "/settings/api", title: "API Keys", description: "Generate keys for programmatic access", status: null },
    { href: "/settings/payments", title: "Payments", description: "Connect Stripe to accept payments", status: stripeStatus ? "Connected ✓" : null },
    { href: "/settings/billing", title: "Billing", description: "Manage plan, trial, and subscription portal", status: null },
    { href: "/docs", title: "Docs", description: "Concept guides for souls, blocks, frameworks, and Seldon It", status: null },
    { href: "/settings/domain", title: "Domain", description: "Connect a custom domain for public pages", status: domainStatus },
    { href: "/settings/branding", title: "Branding", description: "Control public branding and white-label defaults", status: brandingStatus },
    { href: "/settings/frameworks", title: "Saved Frameworks", description: "Manage reusable framework presets", status: frameworksStatus },
    { href: "/settings/integrations", title: "Integrations", description: "Connect Twilio, Resend, Kit, and Google", status: null },
    { href: "/settings/soul-transfer", title: "Soul Export / Import", description: "Download or upload your system configuration", status: null },
  ] as const;

  const grouped = [
    {
      id: "business",
      title: "Business Settings",
      items: sections.slice(0, 5),
    },
    {
      id: "developer",
      title: "Developer & System",
      items: sections.slice(5, 8),
    },
    {
      id: "billing",
      title: "Billing & Integrations",
      items: sections.slice(8),
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
          <article key={group.id} className="rounded-xl border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium text-muted-foreground">{group.title}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {group.items.map((section) => (
                <div key={section.href} className="rounded-lg border bg-background/40 p-4 space-y-3">
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium text-foreground">{section.title}</p>
                    <p className="text-xs text-muted-foreground">{section.description}</p>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    {section.status ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-medium border-positive/30 bg-positive/10 text-positive">
                        {section.status}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Configured</span>
                    )}

                    <Link href={section.href} className="inline-flex items-center justify-center gap-2 h-8 px-3 rounded-md border text-xs font-medium border-border hover:bg-background bg-muted shadow-xs">
                      Open
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
