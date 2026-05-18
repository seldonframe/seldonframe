"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, ChevronsUpDown, Plus, Settings2 } from "lucide-react";
import type { BlockManifest } from "@seldonframe/core/blocks";
import { SidebarNav, type NavGroup } from "@/components/layout/sidebar-nav";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useLabels } from "@/lib/hooks/use-labels";

/*
  Square UI class reference (source of truth):
  - templates/dashboard-2/components/dashboard/sidebar.tsx
    - header spacing: "p-3 sm:p-4 lg:p-5 pb-0"
    - content spacing: "px-3 sm:px-4 lg:px-5"
    - account card shell: "flex items-center gap-2 sm:gap-3 rounded-lg border bg-card p-2 sm:p-3"
*/

const hiddenSlugToHref: Record<string, string> = {
  // `contacts` deliberately omitted — Clients is a baseline CRM
  // surface and must always appear in the sidebar even when other
  // blocks are hidden via the visibility settings. Operators with
  // `crm` in their hiddenBlocks array still see Clients in nav so
  // they can re-enable; otherwise the page becomes unreachable.
  bookings: "/bookings",
  deals: "/deals",
  email: "/emails",
  pages: "/landing",
  forms: "/forms",
  automations: "/automations",
  payments: "/settings/integrations",
  seldon: "/seldon",
};

export function Sidebar(props: {
  blocks: BlockManifest[];
  canAccessSeldon: boolean;
  hiddenBlocks?: string[];
  workspaceName: string;
  activeWorkspaceId: string | null;
  workspaceOptions: Array<{ id: string; name: string; slug: string; contactCount: number; soulId: string | null }>;
  switchWorkspaceAction: (formData: FormData) => void | Promise<void>;
  workspaceMembers?: number;
  userName: string;
  userEmail: string;
  avatarFallback: string;
  /** v1.25.1 — true when the active session is from the operator-portal
   *  cookie (sub-tenant operator like the HVAC owner). Hides SF-internal
   *  nav items (Soul Marketplace, Pages, Email, Forms, Automations,
   *  Settings) so the operator only sees the CRM essentials they care
   *  about: Dashboard / Contacts / Deals / Bookings. */
  isOperatorSession?: boolean;
  /** v1.25.1 — agency name when the workspace is under an active
   *  partner agency. Surfaced as "<workspace> on <agency>" subtitle. */
  agencyBrandName?: string | null;
  /** v1.35.6 — true when the signed-in user's email is in
   *  SF_SUPERADMIN_EMAILS. Surfaces an "SF Admin" entry in the
   *  SYSTEM nav section so platform admins can switch from the
   *  operator dashboard to /super-admin without typing the URL. */
  isSuperAdmin?: boolean;
  /** 2026-05-17 — true when the agency operator has switched INTO a
   *  client workspace (active orgId !== user's primary orgId). When
   *  set, the sidebar hides agency-only items (Client workspaces,
   *  Agents, Automations, Templates) and adds a "← Back to agency"
   *  link, giving the operator the same lighter view that an SMB
   *  owner logging into their own workspace would see. Independent
   *  of isOperatorSession (which is the magic-link operator portal). */
  isInsideClientWorkspace?: boolean;
  /** 2026-05-17 — the user's PRIMARY workspace id (user.orgId). Used
   *  to build the "← Back to agency" switch link so the operator
   *  actually flips the cookie back to their agency workspace and
   *  sees the full nav + their own contacts/deals/bookings. Without
   *  this, the back link would just navigate without switching the
   *  active org cookie. */
  primaryOrgId?: string | null;
  /** 2026-05-18 — workspace logo from organizations.theme.logoUrl.
   *  Renders in the workspace switcher tile + the brand header in
   *  place of the SeldonFrame icon when set. Per-workspace; the
   *  layout fetches it from the active org and threads it through. */
  workspaceLogoUrl?: string | null;
}) {
  const {
    hiddenBlocks = [],
    workspaceName,
    workspaceLogoUrl = null,
    activeWorkspaceId,
    workspaceOptions,
    switchWorkspaceAction,
    userName,
    userEmail,
    avatarFallback,
    isOperatorSession = false,
    agencyBrandName = null,
    isSuperAdmin = false,
    isInsideClientWorkspace = false,
    primaryOrgId = null,
  } = props;
  const labels = useLabels();
  const pathname = usePathname();
  const hiddenHrefs = new Set(hiddenBlocks.map((slug) => hiddenSlugToHref[slug]).filter(Boolean));

  function filterHidden<T extends { href: string }>(items: T[]): T[] {
    return items.filter((item) => !hiddenHrefs.has(item.href));
  }

  // v1.25.1 — operator portal sessions see a trimmed nav: Dashboard +
  // CRM essentials only. The full SF nav (Soul Marketplace, Pages, Email,
  // Forms, Automations, Studio) belongs to the SF agency operator
  // (Acme AI), not the sub-tenant operator (HVAC owner).
  //
  // 2026-05-17 — agency operators who have SWITCHED into a client
  // workspace get a similar lighter view (between the trimmed operator
  // portal and the full agency view). This is what the SMB owner
  // would see if they signed into their own workspace: contacts/deals/
  // bookings + their own pages/email/forms, but NOT the agency-level
  // builder items (Client workspaces, Agents, Automations, Templates).
  // Per operator feedback 2026-05-17 — "they see the same /contacts,
  // /deals, /bookings but they dont see pages like agents, automations,
  // templates, etc — these are for the agency."
  const navGroups: NavGroup[] = isOperatorSession
    ? [
        // v1.25.3 — operator sidebar trimmed further: no SF Discord
        // help link. HVAC owner / dentist / etc. get support from
        // their AGENCY (Acme AI), not SF community. The agency-side
        // contact info lives in the user-account dropdown footer
        // (workspace settings / brand chrome).
        {
          title: "OVERVIEW",
          items: filterHidden([
            { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
          ]),
        },
        {
          title: "CRM",
          items: filterHidden([
            { href: "/contacts", label: labels.contact.plural, icon: "Users" },
            { href: "/deals", label: labels.deal.plural, icon: "Building2" },
            { href: "/bookings", label: "Booking", icon: "Calendar" },
          ]),
        },
      ].filter((group) => group.items.length > 0)
    : isInsideClientWorkspace
    ? [
        {
          title: "OVERVIEW",
          items: filterHidden([
            { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
            // Escape hatch back to the agency workspace. Hits the
            // /switch-workspace route which sets sf_active_org_id back
            // to the agency's primary org id BEFORE redirecting —
            // crucial so the operator lands on the agency dashboard
            // with the full nav restored (Agents/Automations/Templates/
            // Client workspaces). Without flipping the cookie the back
            // link would just navigate but leave us pinned to the
            // client's workspace context.
            ...(primaryOrgId
              ? [
                  {
                    href: `/switch-workspace?to=${encodeURIComponent(primaryOrgId)}&next=${encodeURIComponent("/dashboard")}`,
                    label: "← Back to agency",
                    icon: "ChevronLeft",
                  },
                ]
              : [
                  // Fallback: no primary org id (rare — synthesised
                  // user). Send them to /clients which at least lists
                  // their workspaces.
                  { href: "/clients", label: "← Back to agency", icon: "ChevronLeft" },
                ]),
          ]),
        },
        {
          title: "WORKSPACE",
          items: filterHidden([
            { href: "/contacts", label: labels.contact.plural, icon: "Users" },
            { href: "/deals", label: labels.deal.plural, icon: "Building2" },
            { href: "/bookings", label: "Bookings", icon: "Calendar" },
            // 2026-05-18 — messaging-layer slice 4. Two-way SMS inbox
            // — every contact this workspace has had inbound SMS from,
            // with an inline operator reply box. Placed adjacent to
            // Bookings since both are inbound-customer surfaces.
            { href: "/conversations", label: "Conversations", icon: "MessageCircle" },
            // 2026-05-18 — renamed "Email" → "Messaging" because the
            // page now also hosts Twilio SMS connect + outbound trigger
            // editor for both channels. "Email" was misleading.
            { href: "/emails", label: "Messaging", icon: "Mail" },
            { href: "/forms", label: labels.intakeForm.plural, icon: "FileText" },
            // 2026-05-17 — Pages (/landing) dropped from the nav. SF
            // isn't a landing-page builder; existing rows still render
            // via the public /l/<slug>/<page> route for backward compat
            // but operators no longer create new ones from the dashboard.
            // Agents, Automations, Templates intentionally hidden —
            // operator manages chatbots via the Ready hub's "Test
            // chatbot" deep link.
          ]),
        },
        {
          title: "SYSTEM",
          items: filterHidden([
            { href: "/settings", label: "Settings", icon: "Settings" },
            ...(isSuperAdmin
              ? [
                  {
                    href: "/super-admin",
                    label: "SF Admin",
                    icon: "Shield",
                  },
                ]
              : []),
          ]),
        },
      ].filter((group) => group.items.length > 0)
    : [
        // v1.29.0 — operator-language sidebar. Two flat groups instead
        // of three jargon-named ones ("YOUR SOUL" / "YOUR BLOCKS" /
        // "SYSTEM"). Operators don't say "Soul" or "Block." They say
        // "my customers", "my schedule", "my settings."
        {
          title: "OVERVIEW",
          items: filterHidden([
            { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
            // Cut B Phase 3 Task 23 — /clients is the agency's daily
            // landing surface (lists every client workspace they've
            // built). Belongs in OVERVIEW next to Dashboard since
            // it's a workspace-level surface, not a CRM record type.
            // Label is "Client workspaces" (not just "Clients") to
            // avoid colliding with the CRM "Contacts" entry below,
            // which several personality templates re-label as
            // "Clients" (see lib/crm/personality.ts coaching/agency/
            // consulting templates). Operator-session branch above
            // intentionally omits this (operators don't manage
            // agency workspaces).
            { href: "/clients", label: "Client workspaces", icon: "Building2" },
          ]),
        },
        {
          title: "RUN THE BUSINESS",
          items: filterHidden([
            { href: "/contacts", label: labels.contact.plural, icon: "Users" },
            { href: "/deals", label: labels.deal.plural, icon: "Building2" },
            { href: "/bookings", label: "Bookings", icon: "Calendar" },
            // 2026-05-18 — messaging-layer slice 4. See sibling comment
            // in the isInsideClientWorkspace branch.
            { href: "/conversations", label: "Conversations", icon: "MessageCircle" },
            // 2026-05-18 — /agents removed from sidebar entirely per
            // operator feedback ("/agents page is confusing, just keep
            // /automations"). Route still resolves for deep links from
            // the Ready hub's "Test chatbot" CTA, but agency operators
            // manage AI surfaces exclusively through /automations now.
            // 2026-05-17 — Pages (/landing) dropped from nav. See
            // the matching comment in the isInsideClientWorkspace branch.
            // 2026-05-18 — renamed "Email" → "Messaging" because the
            // page now also hosts SMS (Twilio connect + per-trigger
            // skill editor for both channels).
            { href: "/emails", label: "Messaging", icon: "Mail" },
            { href: "/forms", label: labels.intakeForm.plural, icon: "FileText" },
            { href: "/automations", label: "Automations", icon: "Zap" },
            // 2026-05-18 — Removed "Templates" (route /marketplace).
            // Per operator feedback: the marketplace is future scope and
            // surfacing it now just clutters the agency sidebar. The
            // /marketplace route still resolves (no 404) for anyone who
            // bookmarked it; we just don't link to it from the nav until
            // the marketplace product is real.
          ]),
        },
        {
          title: "SYSTEM",
          items: filterHidden([
            { href: "/docs", label: "Docs", icon: "BookOpen" },
            {
              href: "https://discord.gg/sbVUu976NW",
              label: "Discord",
              icon: "MessageCircle",
              external: true,
            },
            { href: "/settings", label: "Settings", icon: "Settings" },
            // v1.35.6 — SF Admin entry, only rendered for super-admins.
            // Surfaces the platform-admin dashboard from inside the
            // operator chrome so SF team members can switch surfaces
            // without typing the URL.
            ...(isSuperAdmin
              ? [
                  {
                    href: "/super-admin",
                    label: "SF Admin",
                    icon: "Shield",
                  },
                ]
              : []),
          ]),
        },
      ].filter((group) => group.items.length > 0);

  const [mobileOpen, setMobileOpen] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);

  useEffect(() => {
    function handleOpen() {
      setMobileOpen(true);
    }

    window.addEventListener("crm:mobile-sidebar-open", handleOpen);
    return () => {
      window.removeEventListener("crm:mobile-sidebar-open", handleOpen);
    };
  }, []);

  function renderSidebarShell(isMobile = false) {
    return (
      // 2026-05-17 — Vercel-style compact density. Outer horizontal padding
      // pulled in (px-3 / lg:px-4) so the nav links use more of the 240px
      // column. Top padding kept generous so the brand mark doesn't crowd
      // the OS chrome.
      <div className={isMobile ? "flex h-full w-full flex-col" : "flex w-full flex-col"}>
        <div className="px-3 pb-0 pt-4 sm:px-3.5 sm:pt-5 lg:px-4">
          <div className="flex min-h-8 items-center gap-3">
            <div className="flex size-8 items-center justify-center overflow-hidden rounded-xl border border-border/80 bg-card/80 shadow-(--shadow-xs)">
              {/* SLICE 9 PR 2 C1: SeldonFrame icon (brand-isolated; never themed) */}
              <Image src="/brand/seldonframe-icon.svg" alt="SeldonFrame" width={20} height={20} />
            </div>
            <div className="min-w-0">
              {/* v1.25.1 — operator-session brand override: show the
                  agency name as the primary brand, with "Powered by
                  SeldonFrame" subtitle (or hide it when agency has
                  hide_powered_by_badge=true via the chrome wrapper).
                  Default SF branding stays for non-operator sessions. */}
              <p className="text-sm font-semibold tracking-tight text-foreground">
                {isOperatorSession && agencyBrandName ? agencyBrandName : "SeldonFrame"}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {isOperatorSession
                  ? agencyBrandName
                    ? `${workspaceName}'s CRM`
                    : `${workspaceName} portal`
                  : "Operating system for modern teams"}
              </p>
            </div>
          </div>
        </div>

        <div className="px-3 sm:px-3.5 lg:px-4">
          <div className="relative mb-3 mt-3">
            <button
              type="button"
              onClick={() => setWorkspaceMenuOpen((open) => !open)}
              className="flex w-full items-center gap-2.5 rounded-xl border border-border/80 bg-card/80 p-2 text-left shadow-(--shadow-xs) transition-all hover:border-border hover:bg-card"
            >
              <div className="flex size-8 items-center justify-center overflow-hidden rounded-lg border border-border/70 bg-muted/30 shrink-0">
                {/* 2026-05-18 — per-workspace logo (theme.logoUrl) now
                    wins over the default SeldonFrame icon. When the
                    operator uploads a logo at /settings/theme, that
                    image becomes the workspace's identity in the
                    sidebar tile (and emails / public pages already
                    consume it). Falls back to the SF icon when unset. */}
                {workspaceLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={workspaceLogoUrl}
                    alt={`${workspaceName} logo`}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <Image src="/brand/seldonframe-icon.svg" alt="Workspace" width={28} height={28} className="h-full w-full" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-foreground">{workspaceName}</p>
                <p className="truncate text-[10px] text-muted-foreground">Active workspace</p>
              </div>
              <ChevronsUpDown className="size-3.5 text-muted-foreground" />
            </button>

            {workspaceMenuOpen ? (
              <div className="absolute left-0 right-0 top-full z-30 mt-3 rounded-2xl border border-border/80 bg-card/96 p-2.5 shadow-(--shadow-dropdown) backdrop-blur-xl">
                <p className="px-2 pb-1 text-[10px] font-semibold tracking-[0.16em] text-muted-foreground/80">YOUR WORKSPACES</p>
                <div className="space-y-1">
                  {/* 2026-05-17 — switched from <form action={switchWorkspaceAction}>
                      to plain Links targeting /switch-workspace?to=…&next=…
                      because the form-in-popover pattern silently failed:
                      onClick closed the menu (popover unmounts) BEFORE the
                      server action dispatch completed, so the cookie was
                      never set and the switch never happened. The
                      /switch-workspace route does the same cookie set +
                      redirect server-side, but as a regular GET that doesn't
                      depend on the form staying mounted.

                      Workspace flips land on the Ready hub for CLIENT
                      workspaces (deliverables + admin shortcuts), but on
                      the primary AGENCY workspace they go straight to
                      /dashboard — the Ready hub is meaningless for the
                      agency's own workspace (it doesn't have a customer
                      portal / public landing / etc.) */}
                  {workspaceOptions.map((workspace) => {
                    const isPrimaryAgencyOrg = workspace.id === primaryOrgId;
                    const nextPath = isPrimaryAgencyOrg
                      ? "/dashboard"
                      : `/clients/${workspace.slug}/ready`;
                    const href = `/switch-workspace?to=${encodeURIComponent(workspace.id)}&next=${encodeURIComponent(nextPath)}`;
                    return (
                      // 2026-05-17 — plain <a> instead of <Link> so the
                      // browser does a HARD navigation. Soft navigation
                      // (Next.js Link) keeps the cached layout chrome
                      // in-memory client-side, so even after the cookie
                      // is set on the redirect response the sidebar +
                      // topbar kept showing the previous workspace name
                      // until the user manually refreshed. <a> forces a
                      // full document load so the layout server-renders
                      // with the new cookie applied.
                      <a
                        key={workspace.id}
                        href={href}
                        className="flex w-full items-start gap-2 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-accent/60"
                        onClick={() => setWorkspaceMenuOpen(false)}
                      >
                        <span className="mt-0.5 inline-flex size-4 items-center justify-center text-primary">
                          {activeWorkspaceId === workspace.id ? <Check className="size-3.5" /> : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium text-foreground sm:text-sm">
                            {workspace.name}
                            {isPrimaryAgencyOrg ? (
                              <span className="ml-1.5 inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 align-middle text-[9px] font-semibold tracking-[0.08em] text-emerald-700 dark:text-emerald-300">
                                YOUR AGENCY
                              </span>
                            ) : null}
                          </span>
                          <span className="block truncate text-[10px] text-muted-foreground sm:text-xs">
                            {workspace.contactCount.toLocaleString()} clients · {workspace.soulId ? workspace.soulId.charAt(0).toUpperCase() + workspace.soulId.slice(1) : "Custom"}
                          </span>
                        </span>
                      </a>
                    );
                  })}
                </div>

                <div className="my-2 h-px bg-border" />

                <div className="space-y-1">
                  {/* 2026-05-17 — /orgs/new was deleted in Cut B (404'd).
                      /clients/new is the canonical create-workspace entry. */}
                  <Link href="/clients/new" className="flex items-center gap-2 rounded-xl px-2.5 py-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent/60 sm:text-sm" onClick={() => setWorkspaceMenuOpen(false)}>
                    <Plus className="size-3.5 text-primary" />
                    Create new workspace
                  </Link>
                  <Link href="/orgs" className="flex items-center gap-2 rounded-xl px-2.5 py-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent/60 sm:text-sm" onClick={() => setWorkspaceMenuOpen(false)}>
                    <Settings2 className="size-3.5 text-muted-foreground" />
                    Manage workspaces
                  </Link>
                </div>
              </div>
            ) : null}
          </div>

          <SidebarNav groups={navGroups} onNavigate={() => setMobileOpen(false)} />
        </div>

        <div className="mt-auto px-3 pb-3 pt-5 sm:px-3.5 sm:pb-4 lg:px-4 lg:pb-4">
          <button type="button" className="flex w-full items-center gap-2.5 rounded-xl border border-border/80 bg-card/72 p-2 text-left shadow-(--shadow-xs) transition-all hover:border-border hover:bg-card/92 hover:shadow-(--shadow-sm)">
            <div className="flex size-8 items-center justify-center rounded-lg border border-border/70 bg-muted/30 text-xs font-semibold text-foreground">
              {avatarFallback}
            </div>
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-[13px] font-semibold text-foreground">{userName}</p>
              <p className="truncate text-[10px] text-muted-foreground">{userEmail}</p>
            </div>
            <ChevronsUpDown className="size-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <aside className="crm-sidebar hidden w-full flex-col border-0 bg-card md:sticky md:top-0 md:flex md:h-screen md:w-[240px] md:overflow-y-auto">
        {renderSidebarShell()}
      </aside>

      <div className="md:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-[240px] max-w-[240px] p-0 [&>button]:hidden">
            <aside className="crm-sidebar flex h-full w-full flex-col border-0 bg-card">{renderSidebarShell(true)}</aside>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
