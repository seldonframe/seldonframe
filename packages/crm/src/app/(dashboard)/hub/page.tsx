import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
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
    { href: "/landing", title: "Pages", subtitle: "Section-based marketing pages" },
    { href: "/emails", title: "Email", subtitle: "Resend-first outbound communications" },
    { href: `/portal/${org?.slug ?? "demo"}/login`, title: "Portal", subtitle: "Client-facing authentication and delivery" },
  ] as const;

  return (
    <section className="animate-page-enter space-y-4">
      <div>
        <h1 className="text-page-title">Hub</h1>
        <p className="text-label text-[hsl(var(--color-text-secondary))]">Quick access to all blocks and system tools.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {blockLinks.map((block) => (
          <Link key={block.href} href={block.href} className="glass-card block rounded-2xl p-5 transition hover:border-primary/20">
            <p className="text-card-title">{block.title}</p>
            <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{block.subtitle}</p>
          </Link>
        ))}
      </div>

      <PwaInstallCard />
    </section>
  );
}
