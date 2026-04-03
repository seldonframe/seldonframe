import { requireAuth } from "@/lib/auth/helpers";
import { getOrgId } from "@/lib/auth/helpers";
import { SoulProvider } from "@/components/soul/soul-provider";
import { getSoul } from "@/lib/soul/server";
import { adjustBrightness } from "@/lib/utils/colors";
import { Sidebar } from "@/components/layout/sidebar";
import { CommandPalette } from "@/components/layout/command-palette";
import { DemoBanner } from "@/components/layout/demo-banner";
import { DashboardTopbar } from "@/components/layout/dashboard-topbar";
import { registerCrmEventListeners } from "@/lib/events/listeners";
import { getAllBlocksForOrg } from "@/lib/blocks/registry";
import { canSeldonIt, resolvePlanFromPlanId } from "@/lib/billing/entitlements";
import { db } from "@/db";
import { activities, contacts, deals, landingPages, organizations, users } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import Link from "next/link";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  registerCrmEventListeners();

  const session = await requireAuth();
  const soul = await getSoul();
  const user = session.user;
  const avatarFallback = user?.name?.trim()?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || "U";

  const orgId = await getOrgId();
  const blocks = orgId ? await getAllBlocksForOrg(orgId) : [];
  const [dbUserForPlan] = user?.id
    ? await db.select({ planId: sql<string | null>`plan_id` }).from(users).where(eq(users.id, user.id)).limit(1)
    : [null];
  const plan = resolvePlanFromPlanId(dbUserForPlan?.planId ?? null);
  const canAccessSeldon = canSeldonIt(plan);

  const [activeOrg] = orgId
    ? await db.select({ id: organizations.id, name: organizations.name }).from(organizations).where(eq(organizations.id, orgId)).limit(1)
    : [null];

  const isSwitchedOrg = Boolean(orgId && user?.orgId && orgId !== user.orgId);

  const [contactHits, dealHits, pageHits, activityHits] = orgId
    ? await Promise.all([
        db
          .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName })
          .from(contacts)
          .where(eq(contacts.orgId, orgId))
          .orderBy(desc(contacts.createdAt))
          .limit(8),
        db
          .select({ id: deals.id, title: deals.title })
          .from(deals)
          .where(eq(deals.orgId, orgId))
          .orderBy(desc(deals.createdAt))
          .limit(8),
        db
          .select({ id: landingPages.id, title: landingPages.title })
          .from(landingPages)
          .where(eq(landingPages.orgId, orgId))
          .orderBy(desc(landingPages.updatedAt))
          .limit(8),
        db
          .select({ id: activities.id, subject: activities.subject, contactId: activities.contactId, dealId: activities.dealId })
          .from(activities)
          .where(eq(activities.orgId, orgId))
          .orderBy(desc(activities.createdAt))
          .limit(8),
      ])
    : [[], [], [], []];

  const paletteItems = [
    { label: "Dashboard", href: "/dashboard", group: "Navigate" },
    { label: "Seldon It", href: canAccessSeldon ? "/seldon" : "/settings/billing", group: "Navigate" as const },
    ...(dbUserForPlan?.planId?.startsWith("pro-") ? [{ label: "Organizations", href: "/orgs", group: "Navigate" as const }] : []),
    { label: "Contacts", href: "/contacts", group: "Navigate" },
    { label: "Deals", href: "/deals", group: "Navigate" },
    { label: "Pages", href: "/landing", group: "Navigate" },
    { label: "Bookings", href: "/bookings", group: "Navigate" },
    { label: "Email", href: "/emails", group: "Navigate" },
    { label: "Settings", href: "/settings", group: "Navigate" },
    ...contactHits.map((row) => ({
      label: `${row.firstName} ${row.lastName ?? ""}`.trim(),
      href: `/contacts/${row.id}`,
      group: "Contacts",
    })),
    ...dealHits.map((row) => ({
      label: row.title,
      href: `/deals/${row.id}`,
      group: "Deals",
    })),
    ...pageHits.map((row) => ({
      label: row.title,
      href: `/landing/${row.id}`,
      group: "Pages",
    })),
    ...activityHits.map((row) => ({
      label: row.subject || "Untitled activity",
      href: row.contactId ? `/contacts/${row.contactId}` : row.dealId ? `/deals/${row.dealId}` : "/dashboard",
      group: "Recent Activity",
    })),
  ];

  const bodyStyle = soul?.branding
    ? ({
        "--soul-primary": soul.branding.primaryColor,
        "--soul-primary-hover": adjustBrightness(soul.branding.primaryColor, -8),
        "--soul-accent": soul.branding.accentColor,
      } as React.CSSProperties)
    : undefined;

  return (
    <SoulProvider soul={soul}>
      <div className="crm-page relative px-4! pb-6! pt-4! sm:px-6! sm:pb-8! sm:pt-5!" data-soul-primary style={bodyStyle}>
        <div className="pointer-events-none fixed -left-24 -top-24 h-96 w-96 rounded-full bg-[hsl(var(--primary)/0.1)] blur-[120px]" />
        <div className="pointer-events-none fixed right-0 top-1/3 h-72 w-72 rounded-full bg-[hsl(var(--primary)/0.06)] blur-[140px]" />
        <div className="animate-page-enter flex flex-col gap-4 md:flex-row md:gap-6">
          <Sidebar blocks={blocks} canAccessSeldon={canAccessSeldon} />
          <div className="min-w-0 flex-1 space-y-4">
            <DemoBanner />
            {isSwitchedOrg && activeOrg ? (
              <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.22)] px-3 py-2 text-sm text-[hsl(var(--muted-foreground))]">
                <span className="text-foreground">{activeOrg.name}</span> active · <Link href="/orgs" className="text-primary underline underline-offset-4">Back to all organizations</Link>
              </div>
            ) : null}
            <DashboardTopbar userName={user?.name || "Account"} userEmail={user?.email || ""} avatarFallback={avatarFallback} />
            {children}
          </div>
        </div>
        <CommandPalette items={paletteItems} />
      </div>
    </SoulProvider>
  );
}
