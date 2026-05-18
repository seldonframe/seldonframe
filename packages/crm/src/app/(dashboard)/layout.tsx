import { requireAuth } from "@/lib/auth/helpers";
import { getOrgId } from "@/lib/auth/helpers";
import { isAdminTokenUserId } from "@/lib/auth/admin-token";
import { isOperatorPortalUserId } from "@/lib/auth/operator-portal-context";
import { isSuperAdminUser } from "@/lib/auth/super-admin";
import { getEffectiveBrandingForWorkspace } from "@/lib/partner-agencies/branding";
import { SoulProvider } from "@/components/soul/soul-provider";
import { getSoul } from "@/lib/soul/server";
import { getPersonality } from "@/lib/crm/personality-server";
import { Sidebar } from "@/components/layout/sidebar";
import { CommandPalette } from "@/components/layout/command-palette";
import { DemoBanner } from "@/components/layout/demo-banner";
import { TestModeBanner } from "@/components/layout/test-mode-banner";
import { DashboardTopbar } from "@/components/layout/dashboard-topbar";
import { HelpButton } from "@/components/layout/help-button";
// 2026-05-18 — SeldonChat removed; see comment near the dock placement
// below. Power users now go through Claude Code + the SF MCP server.
import { registerCrmEventListeners } from "@/lib/events/listeners";
import { getAllBlocksForOrg } from "@/lib/blocks/registry";
import { canSeldonIt, resolvePlanFromPlanId } from "@/lib/billing/entitlements";
import { listManagedOrganizations, setActiveOrgAction } from "@/lib/billing/orgs";
import { getHiddenBlocks } from "@/lib/blocks/visibility-actions";
import { getNotificationFeed } from "@/lib/notifications/feed";
// 2026-05-17 — pulls the workspace's brand color / accent / radius
// into the admin chrome so theme settings actually affect the
// operator's own dashboard (not just public pages). Previously the
// provider existed but wasn't mounted anywhere — saved themes only
// applied to /l/, /book/, /forms/ surfaces.
import { AdminThemeProvider } from "@/components/theme/admin-theme-provider";
import { getThemeSettings } from "@/lib/theme/actions";
import { db } from "@/db";
import { activities, contacts, deals, landingPages, organizations, users } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import Link from "next/link";

/*
  Square UI class reference (source of truth):
  - templates/dashboard-2/app/page.tsx
    - shell wrapper: "h-svh overflow-hidden lg:p-2 w-full"
    - inner frame: "lg:border lg:rounded-md overflow-hidden flex flex-col items-center justify-start bg-container h-full w-full bg-background"
*/

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  registerCrmEventListeners();

  const session = await requireAuth();
  const [soul, personality] = await Promise.all([getSoul(), getPersonality()]);
  const user = session.user;
  const avatarFallback = user?.name?.trim()?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || "U";

  const orgId = await getOrgId();
  const [blocks, hiddenBlocks] = await Promise.all([
    orgId ? getAllBlocksForOrg(orgId) : [],
    getHiddenBlocks(),
  ]);
  // C6: admin-token sessions bind to a workspace, not a real user. The
  // user.id is the nil-UUID sentinel which doesn't exist in the users
  // table, so plan / billing / managed-org lookups all throw or return
  // empty. Skip them and synthesize sensible defaults — the admin-token
  // operator sees their workspace's data, not a personal billing view.
  const isAdminTokenSession = isAdminTokenUserId(user?.id);
  // v1.25.0 — operator-portal sessions follow the same skip-the-lookup
  // pattern: synthetic user.id won't exist in the users table, so we
  // synthesize sensible defaults rather than crashing or rendering
  // empty plan/billing state. The operator sees their workspace's data,
  // not personal billing.
  const isOperatorSession = isOperatorPortalUserId(user?.id);
  const skipUserLookup = isAdminTokenSession || isOperatorSession;
  // v1.35.6 — surface a "SF Admin" sidebar entry to platform admins
  // (anyone whose email is in SF_SUPERADMIN_EMAILS) so they can hop
  // from the operator dashboard to /super-admin without typing the
  // URL. Operator portal sessions never get this — they're not on
  // the SF team regardless of email.
  const isSuperAdmin =
    !isOperatorSession && (await isSuperAdminUser(user?.email));
  const [dbUserForPlan] = user?.id && !skipUserLookup
    ? await db.select({ planId: sql<string | null>`plan_id` }).from(users).where(eq(users.id, user.id)).limit(1)
    : [null];
  const plan = resolvePlanFromPlanId(dbUserForPlan?.planId ?? null);
  const canAccessSeldon = canSeldonIt(plan);
  const workspaceOptions =
    user?.id && !skipUserLookup ? await listManagedOrganizations(user.id) : [];

  // 2026-05-17 — pre-fetch the notification feed on the server so the
  // bell popover renders with full state on first paint (no skeleton
  // flash). Synthetic sessions (admin token, operator portal) return []
  // because the access-predicate query crashes on non-uuid ids; both
  // session types are workspace-scoped so the empty feed is fine.
  const notifications = user?.id && !skipUserLookup
    ? await getNotificationFeed(user.id, user.orgId ?? null)
    : [];

  // 2026-05-17 — fetch the workspace theme so the AdminThemeProvider
  // can override --primary / --ring / --accent / --radius in admin
  // chrome. Best-effort: failures just skip the override (chrome falls
  // back to default shadcn tokens).
  const adminThemeSettings = orgId
    ? await getThemeSettings().catch(() => null)
    : null;

  const [activeOrg, orgMemberCount, effectiveBranding] = orgId
    ? await Promise.all([
        db.select({ id: organizations.id, name: organizations.name, testMode: organizations.testMode }).from(organizations).where(eq(organizations.id, orgId)).limit(1).then((rows) => rows[0] ?? null),
        db
          .select({ count: sql<number>`count(*)` })
          .from(users)
          .where(eq(users.orgId, orgId))
          .then((rows) => Number(rows[0]?.count ?? 0)),
        // v1.25.1 — pull active partner-agency branding so the
        // operator's chrome shows "Acme AI" instead of SeldonFrame
        // when their workspace is under an active white-label agency.
        getEffectiveBrandingForWorkspace(orgId),
      ])
    : [null, 0, null];

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

  // v1.25.4 — palette items split by session type. Operator sessions
  // (HVAC owner / dentist / etc.) only get their CRM essentials; SF-
  // internal nav (Soul Marketplace, Studio, Seldon It, Pages, Email,
  // Settings) is hidden + not searchable. Recent activity entries
  // also limited to /contacts and /deals destinations (operator nav).
  const paletteItems = isOperatorSession
    ? [
        { label: "Dashboard", href: "/dashboard", group: "Navigate" },
        { label: "Contacts", href: "/contacts", group: "Navigate" },
        { label: "Deals", href: "/deals", group: "Navigate" },
        { label: "Bookings", href: "/bookings", group: "Navigate" },
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
      ]
    : [
        { label: "Dashboard", href: "/dashboard", group: "Navigate" },
        { label: "Creator Studio", href: "/studio", group: "Navigate" },
        { label: "Soul Marketplace", href: "/soul-marketplace", group: "Navigate" },
        { label: "Seldon It", href: canAccessSeldon ? "/seldon" : "/settings/billing", group: "Navigate" as const },
        ...(dbUserForPlan?.planId?.startsWith("pro-") ? [{ label: "Organizations", href: "/orgs", group: "Navigate" as const }] : []),
        { label: "Contacts", href: "/contacts", group: "Navigate" },
        { label: "Deals", href: "/deals", group: "Navigate" },
        // 2026-05-17 — Pages (/landing) dropped from the command palette.
        // Existing pages still load via their direct /landing/<id> URL.
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
        // 2026-05-17 — Pages no longer surfaced in the command palette
        // recents. Operators with legacy /landing pages can still load
        // them via direct URL.
        ...([] as Array<{ label: string; href: string; group: "Pages" }>).map((row) => row),
        ...activityHits.map((row) => ({
          label: row.subject || "Untitled activity",
          href: row.contactId ? `/contacts/${row.contactId}` : row.dealId ? `/deals/${row.dealId}` : "/dashboard",
          group: "Recent Activity",
        })),
      ];

  return (
    <SoulProvider soul={soul} personality={personality}>
      <AdminThemeProvider theme={adminThemeSettings?.theme ?? null}>
      <div className="min-h-screen w-full lg:p-3">
        <div className="flex min-h-screen w-full flex-col items-center justify-start bg-background/95 lg:rounded-2xl lg:border lg:border-border/80 lg:shadow-(--shadow-card)">
          <div className="animate-page-enter flex min-h-screen w-full flex-col md:flex-row">
            <Sidebar
              blocks={blocks}
              canAccessSeldon={canAccessSeldon}
              hiddenBlocks={hiddenBlocks}
              workspaceName={activeOrg?.name || "SeldonFrame"}
              activeWorkspaceId={orgId}
              workspaceOptions={workspaceOptions.map((workspace) => ({
                id: workspace.id,
                name: workspace.name,
                slug: workspace.slug,
                contactCount: workspace.contactCount,
                soulId: workspace.soulId,
              }))}
              switchWorkspaceAction={setActiveOrgAction}
              workspaceMembers={orgMemberCount > 0 ? orgMemberCount : undefined}
              userName={user?.name || "Account"}
              userEmail={user?.email || ""}
              avatarFallback={avatarFallback}
              isOperatorSession={isOperatorSession}
              agencyBrandName={
                effectiveBranding?.is_white_label
                  ? effectiveBranding.brand_name
                  : null
              }
              isSuperAdmin={isSuperAdmin}
              isInsideClientWorkspace={isSwitchedOrg}
              primaryOrgId={user?.orgId ?? null}
            />
            <div className="min-h-screen min-w-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
              <DemoBanner />
              <TestModeBanner testMode={activeOrg?.testMode ?? false} />
              {isSwitchedOrg && activeOrg ? (
                <div className="mb-5 rounded-2xl border border-border/80 bg-card/75 px-4 py-3 text-sm text-muted-foreground shadow-(--shadow-xs)">
                  <span className="font-medium text-foreground">{activeOrg.name}</span> active · {" "}
                  <Link href="/orgs" className="text-primary underline underline-offset-4">
                    Back to all organizations
                  </Link>
                </div>
              ) : null}
              <div className="space-y-6 lg:space-y-8">
                <DashboardTopbar
                  userName={user?.name || "Account"}
                  userEmail={user?.email || ""}
                  avatarFallback={avatarFallback}
                  canAccessSeldon={canAccessSeldon}
                  workspaceName={activeOrg?.name || "SeldonFrame"}
                  activeWorkspaceId={orgId}
                  workspaceOptions={workspaceOptions.map((workspace) => ({
                    id: workspace.id,
                    name: workspace.name,
                    slug: workspace.slug,
                    contactCount: workspace.contactCount,
                    soulId: workspace.soulId,
                  }))}
                  switchWorkspaceAction={setActiveOrgAction}
                  isOperatorSession={isOperatorSession}
                  notifications={notifications}
                  primaryOrgId={user?.orgId ?? null}
                />
                {children}
              </div>
            </div>
          </div>
          {/* 2026-05-18 — SeldonChat floating dock removed.
              Power users configure workspaces via Claude Code + the
              SeldonFrame MCP server directly. Non-tech operators
              didn't engage with the in-dashboard chat (it competed
              with the HelpButton + Docs link without adding signal).
              Less floating UI = cleaner view. */}
          <CommandPalette items={paletteItems} />
          {/* May 1, 2026 — persistent help escape hatch on every
              admin page. Floating bottom-right button opens a popover
              with Discord / Docs / Report-a-bug links.
              v1.25.3 — hidden for operator sessions: their support is
              their agency (Acme AI), not SF community / docs. */}
          {!isOperatorSession ? <HelpButton /> : null}
        </div>
      </div>
      </AdminThemeProvider>
    </SoulProvider>
  );
}
