import Link from "next/link";
import { getStripeConnectionStatus } from "@/lib/payments/actions";
import { getLabels } from "@/lib/soul/labels";

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

  return (
    <section className="animate-page-enter space-y-4">
      <h1 className="text-page-title">Settings</h1>
      <div className="grid gap-3 md:grid-cols-2">
        {sections.map((section) => (
          <Link key={section.href} href={section.href} className="glass-card block rounded-2xl p-5 transition hover:border-primary/20">
            <div className="flex items-start justify-between gap-2">
              <p className="text-card-title">{section.title}</p>
              {section.status ? (
                <span className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">{section.status}</span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{section.description}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
