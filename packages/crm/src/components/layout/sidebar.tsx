"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, ChevronsUpDown, Plus, Settings2 } from "lucide-react";
import type { BlockManifest } from "@seldonframe/core/blocks";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { buildNavGroups, type NavSessionType } from "@/components/layout/nav-config";
import type { ModuleId } from "@/lib/workspace/modules";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useLabels } from "@/lib/hooks/use-labels";

/*
  Square UI class reference (source of truth):
  - templates/dashboard-2/components/dashboard/sidebar.tsx
    - header spacing: "p-3 sm:p-4 lg:p-5 pb-0"
    - content spacing: "px-3 sm:px-4 lg:px-5"
    - account card shell: "flex items-center gap-2 sm:gap-3 rounded-lg border bg-card p-2 sm:p-3"
*/

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
  /** 2026-05-18 (later) — agency-level white-label logo. When an
   *  active partner agency owns this workspace (is_white_label), this
   *  is the agency's logoUrl from partner_agencies.logoUrl. Threaded
   *  separately from workspaceLogoUrl because the brand HEADER (top-
   *  left) should show the AGENCY identity while the workspace
   *  switcher TILE shows the client's own logo. Operator feedback:
   *  "when an agency wants to whitelabel all workspaces they should
   *   be able to add their logo... so their clients dont see
   *   seldonframe logo top left of dashboard". */
  agencyLogoUrl?: string | null;
  /** 2026-07-05 — simple-home module filter (Task 3's readEnabledModules()
   *  output). undefined/null both mean "no filtering" — see nav-config.ts's
   *  BuildNavInput.enabledModules doc. Only affects the inside-client-
   *  workspace nav; other session types ignore it. */
  enabledModules?: ModuleId[] | null;
}) {
  const {
    hiddenBlocks = [],
    workspaceName,
    workspaceLogoUrl = null,
    agencyLogoUrl = null,
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
    enabledModules = null,
  } = props;
  const labels = useLabels();
  const pathname = usePathname();

  // 2026-06-20 — icp3-wedge: the left nav is now built by a single
  // PURE function (nav-config.ts) instead of three inline hardcoded
  // branches. It produces the unified SIX-NOUN structure (Home ·
  // Agents · Customers · Inbox · Money · Clients + System) that adapts
  // by what the operator HAS, not who they are. The three legacy
  // session shapes map to one of three NavSessionType values; the
  // builder owns the per-session item sets, the noun labels, the
  // enabledBlocks/hiddenBlocks filtering, and the progressive-
  // disclosure rule (Clients portfolio noun appears only when the
  // operator owns more than one workspace).
  const workspaceCount = workspaceOptions.length;
  const sessionType: NavSessionType = isOperatorSession
    ? "operator-portal"
    : isInsideClientWorkspace
      ? "inside-client-workspace"
      : "agency";
  // Drives both the Clients noun (inside buildNavGroups) and the
  // workspace switcher render below — a solo operator sees neither.
  const showWorkspaceSwitcher = sessionType !== "operator-portal" && workspaceCount > 1;
  const navGroups = buildNavGroups({
    sessionType,
    workspaceCount,
    hiddenBlocks,
    isSuperAdmin,
    primaryOrgId,
    labels: {
      contact: labels.contact,
      deal: labels.deal,
      intakeForm: labels.intakeForm,
    },
    enabledModules,
  });

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
              {/* 2026-05-18 (later) — agency-level white-label brand
                  mark. When an active partner agency owns this workspace,
                  the agency's logo replaces the SeldonFrame icon top-
                  left. Falls back to the SF icon when no agency logo is
                  set (agency that registered without uploading one). */}
              {agencyLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={agencyLogoUrl}
                  alt={agencyBrandName ? `${agencyBrandName} logo` : "Brand logo"}
                  className="h-full w-full object-contain"
                />
              ) : (
                <Image src="/brand/seldonframe-icon.svg" alt="SeldonFrame" width={20} height={20} />
              )}
            </div>
            <div className="min-w-0">
              {/* 2026-05-18 (later) — agency-level brand name. Previously
                  gated on isOperatorSession (only flipped for sub-tenant
                  magic-link sessions). Now flips whenever a white-label
                  agency owns the workspace — both the sub-tenant operator
                  AND the agency operator looking at their own dashboard
                  see the agency identity instead of "SeldonFrame". */}
              <p className="text-sm font-semibold tracking-tight text-foreground">
                {agencyBrandName ?? "SeldonFrame"}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {agencyBrandName
                  ? isOperatorSession
                    ? `${workspaceName}'s CRM`
                    : isInsideClientWorkspace
                      ? `${workspaceName} workspace`
                      : "Agency dashboard"
                  : "Operating system for modern teams"}
              </p>
            </div>
          </div>
        </div>

        <div className="px-3 sm:px-3.5 lg:px-4">
          {/* 2026-06-20 — progressive disclosure: the workspace
              switcher only renders for multi-tenant operators (more
              than one workspace). A solo operator has nothing to switch
              between, so the tile + popover are hidden entirely — the
              nav goes straight under the brand header. Mirrors the
              Clients portfolio noun gate in nav-config.ts. */}
          {showWorkspaceSwitcher ? (
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
          ) : null}

          <SidebarNav groups={navGroups} onNavigate={() => setMobileOpen(false)} />
        </div>

        <div className="mt-auto px-3 pb-3 pt-5 sm:px-3.5 sm:pb-4 lg:px-4 lg:pb-4">
          {/* 2026-06-27 — calm direction-A: the account tile is a flat
              hairline card that just softens its background on hover
              (matches the mockup's user card). The old shadow-bloom +
              transition-all lift read as loud against the hairline
              chrome. */}
          <button type="button" className="flex w-full items-center gap-2.5 rounded-xl border border-border/80 bg-card/72 p-2 text-left shadow-(--shadow-xs) transition-colors hover:bg-card/92">
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
