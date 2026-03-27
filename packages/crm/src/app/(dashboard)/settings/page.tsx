import Link from "next/link";

const sections = [
  { href: "/settings/profile", title: "Business Profile" },
  { href: "/settings/pipeline", title: "Pipeline" },
  { href: "/settings/fields", title: "Custom Fields" },
  { href: "/settings/team", title: "Team" },
  { href: "/settings/webhooks", title: "Webhooks" },
  { href: "/settings/api", title: "API Keys" },
  { href: "/settings/soul-transfer", title: "Soul Export / Import" },
];

export default function SettingsPage() {
  return (
    <section className="animate-page-enter space-y-4">
      <h1 className="text-page-title">Settings</h1>
      <div className="grid gap-3 md:grid-cols-2">
        {sections.map((section) => (
          <Link key={section.href} href={section.href} className="crm-card block hover:bg-[hsl(var(--color-surface-raised))]">
            <p className="text-[11px] uppercase tracking-[0.08em] text-[hsl(var(--color-text-muted))]">Configuration</p>
            <p className="text-card-title">{section.title}</p>
            <p className="mt-1 text-label text-[hsl(var(--color-text-secondary))]">Configure {section.title.toLowerCase()} preferences.</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
