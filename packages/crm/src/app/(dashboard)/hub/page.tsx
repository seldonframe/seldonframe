import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { SoulWizard } from "@/components/soul/soul-wizard";
import { AiCustomizationPanel } from "@/components/hub/ai-customization-panel";
import { SoulInsightsPlaceholder } from "@/components/hub/soul-insights-placeholder";
import { PwaInstallCard } from "@/components/hub/pwa-install-card";

export default async function HubPage() {
  const orgId = await getOrgId();
  const [org] = orgId
    ? await db.select({ slug: organizations.slug }).from(organizations).where(eq(organizations.id, orgId)).limit(1)
    : [];

  const blockLinks = [
    { href: "/contacts", title: "CRM", subtitle: "Contacts and core relationship workflows" },
    { href: "/deals", title: "Deals", subtitle: "Pipeline and opportunity flow" },
    { href: "/bookings", title: "Booking", subtitle: "Scheduling and calendar-linked sessions" },
    { href: "/landing", title: "Landing", subtitle: "Section-based marketing pages" },
    { href: "/emails", title: "Email", subtitle: "Resend-first outbound communications" },
    { href: `/portal/${org?.slug ?? "demo"}/login`, title: "Portal", subtitle: "Client-facing authentication and delivery" },
  ] as const;

  return (
    <section className="animate-page-enter space-y-4">
      <div>
        <h1 className="text-page-title">Hub</h1>
        <p className="text-label text-[hsl(var(--color-text-secondary))]">Unified shell across all active blocks with Soul-first control surfaces.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {blockLinks.map((block) => (
          <Link key={block.href} href={block.href} className="crm-card block hover:bg-[hsl(var(--color-surface-raised))]">
            <p className="text-[11px] uppercase tracking-[0.08em] text-[hsl(var(--color-text-muted))]">Block</p>
            <p className="text-card-title">{block.title}</p>
            <p className="mt-1 text-label text-[hsl(var(--color-text-secondary))]">{block.subtitle}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <AiCustomizationPanel />
        <PwaInstallCard />
      </div>

      <SoulInsightsPlaceholder />

      <section className="space-y-3">
        <h2 className="text-section-title">Soul Wizard (8 steps)</h2>
        <SoulWizard completionRedirect="/hub" />
      </section>
    </section>
  );
}
