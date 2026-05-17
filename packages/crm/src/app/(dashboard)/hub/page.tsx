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
    // 2026-05-17 — Pages (/landing) removed from Hub. SF isn't a
    // landing-page builder; the chatbot + booking + intake are the
    // public-facing deliverables now.
    { href: "/emails", title: "Email", subtitle: "Resend-first outbound communications" },
    { href: `/customer/${org?.slug ?? "demo"}/login`, title: "Customer Portal", subtitle: "Where your customers sign in to view their account with you" },
    { href: `/portal/${org?.slug ?? "demo"}`, title: "Operator Portal", subtitle: "Branded mini-CRM for sub-tenant operators (white-label)" },
  ] as const;

  return (
    <section className="animate-page-enter space-y-4">
      <div>
        <h1 className="text-page-title">Hub</h1>
        <p className="text-label text-[hsl(var(--color-text-secondary))]">Quick access to all blocks and system tools.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {blockLinks.map((block) => (
          <Link key={block.href} href={block.href} className="block rounded-xl border bg-card p-5 transition-colors hover:bg-accent hover:text-accent-foreground">
            <p className="text-card-title">{block.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{block.subtitle}</p>
          </Link>
        ))}
      </div>

      <PwaInstallCard />
    </section>
  );
}
