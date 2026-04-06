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
  bookings: "/bookings",
  contacts: "/contacts",
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
  workspaceOptions: Array<{ id: string; name: string; contactCount: number; soulId: string | null }>;
  switchWorkspaceAction: (formData: FormData) => void | Promise<void>;
  workspaceMembers?: number;
  userName: string;
  userEmail: string;
  avatarFallback: string;
}) {
  const { canAccessSeldon, hiddenBlocks = [], workspaceName, activeWorkspaceId, workspaceOptions, switchWorkspaceAction, userName, userEmail, avatarFallback } = props;
  const labels = useLabels();
  const pathname = usePathname();
  const hiddenHrefs = new Set(hiddenBlocks.map((slug) => hiddenSlugToHref[slug]).filter(Boolean));

  function filterHidden<T extends { href: string }>(items: T[]): T[] {
    return items.filter((item) => !hiddenHrefs.has(item.href));
  }

  const navGroups: NavGroup[] = [
    {
      title: "YOUR SOUL",
      items: filterHidden([
        { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
        { href: "/studio", label: "Creator Studio", icon: "Sparkles" },
        { href: "/soul-marketplace", label: "Soul Marketplace", icon: "Puzzle" },
        {
          href: canAccessSeldon ? "/seldon" : "/settings/billing",
          label: "Seldon It",
          icon: "sparkles",
          disabled: !canAccessSeldon,
          tooltip: canAccessSeldon ? undefined : "Upgrade to Cloud Pro to Seldon custom blocks",
          upgrade: !canAccessSeldon,
        },
      ]),
    },
    {
      title: "YOUR BLOCKS",
      items: filterHidden([
        { href: "/contacts", label: labels.contact.plural, icon: "Users" },
        { href: "/deals", label: labels.deal.plural, icon: "Building2" },
        { href: "/bookings", label: "Booking", icon: "Calendar" },
        { href: "/landing", label: "Pages", icon: "Layout" },
        { href: "/emails", label: "Email", icon: "Mail" },
        { href: "/forms", label: labels.intakeForm.plural, icon: "FileText" },
        { href: "/automations", label: "Automations", icon: "Zap" },
      ]),
    },
    {
      title: "SYSTEM",
      items: filterHidden([
        { href: "/docs", label: "Docs", icon: "BookOpen" },
        { href: "/settings", label: "Settings", icon: "Settings" },
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
      <div className={isMobile ? "flex h-full w-full flex-col" : "flex w-full flex-col"}>
        <div className="p-3 pb-0 sm:p-4 sm:pb-0 lg:p-5 lg:pb-0">
          <div className="flex min-h-8 items-center gap-2">
            <div className="flex size-5 items-center justify-center overflow-hidden rounded">
              <Image src="/logo.svg" alt="SeldonFrame logo" width={20} height={20} />
            </div>
            <p className="text-base font-semibold tracking-tight text-foreground">
              SeldonFrame
            </p>
          </div>
        </div>

        <div className="px-3 sm:px-4 lg:px-5">
          <div className="relative mb-3">
            <button
              type="button"
              onClick={() => setWorkspaceMenuOpen((open) => !open)}
              className="flex w-full items-center gap-2 sm:gap-3 rounded-lg border border-border bg-muted/45 p-2 sm:p-3 text-left"
            >
              <div className="flex size-8 sm:size-[34px] items-center justify-center overflow-hidden rounded-lg shrink-0">
                <Image src="/logo.svg" alt="SeldonFrame logo" width={34} height={34} className="h-full w-full" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold sm:text-sm">{workspaceName}</p>
                <p className="truncate text-[10px] text-muted-foreground sm:text-xs">Your workspace</p>
              </div>
              <ChevronsUpDown className="size-4 text-muted-foreground" />
            </button>

            {workspaceMenuOpen ? (
              <div className="absolute left-0 right-0 top-full z-30 mt-2 rounded-lg border border-border bg-card p-2 shadow-lg">
                <p className="px-2 pb-1 text-[10px] font-semibold tracking-[0.08em] text-muted-foreground">YOUR WORKSPACES</p>
                <div className="space-y-1">
                  {workspaceOptions.map((workspace) => (
                    <form key={workspace.id} action={switchWorkspaceAction}>
                      <input type="hidden" name="orgId" value={workspace.id} />
                      <input type="hidden" name="redirectTo" value={pathname || "/dashboard"} />
                      <button
                        type="submit"
                        className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-accent/60"
                        onClick={() => setWorkspaceMenuOpen(false)}
                      >
                        <span className="mt-0.5 inline-flex size-4 items-center justify-center text-primary">
                          {activeWorkspaceId === workspace.id ? <Check className="size-3.5" /> : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium text-foreground sm:text-sm">{workspace.name}</span>
                          <span className="block truncate text-[10px] text-muted-foreground sm:text-xs">
                            {workspace.contactCount.toLocaleString()} clients · {workspace.soulId ? workspace.soulId.charAt(0).toUpperCase() + workspace.soulId.slice(1) : "Custom"}
                          </span>
                        </span>
                      </button>
                    </form>
                  ))}
                </div>

                <div className="my-2 h-px bg-border" />

                <div className="space-y-1">
                  <Link href="/orgs/new" className="flex items-center gap-2 rounded-md px-2 py-2 text-xs font-medium text-foreground hover:bg-accent/60 sm:text-sm" onClick={() => setWorkspaceMenuOpen(false)}>
                    <Plus className="size-3.5 text-primary" />
                    Create new workspace
                  </Link>
                  <Link href="/orgs" className="flex items-center gap-2 rounded-md px-2 py-2 text-xs font-medium text-foreground hover:bg-accent/60 sm:text-sm" onClick={() => setWorkspaceMenuOpen(false)}>
                    <Settings2 className="size-3.5 text-muted-foreground" />
                    Manage workspaces
                  </Link>
                </div>
              </div>
            ) : null}
          </div>

          <SidebarNav groups={navGroups} onNavigate={() => setMobileOpen(false)} />
        </div>

        <div className="mt-auto px-3 pb-3 pt-4 sm:px-4 sm:pb-4 sm:pt-6 lg:px-5 lg:pb-5 lg:pt-8">
          <button type="button" className="flex w-full items-center gap-2 rounded-lg p-2 transition-colors hover:bg-accent">
            <div className="flex size-7 items-center justify-center rounded-md bg-muted text-xs font-semibold text-foreground">
              {avatarFallback}
            </div>
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-xs font-semibold text-foreground sm:text-sm">{userName}</p>
              <p className="truncate text-[10px] text-muted-foreground sm:text-xs">{userEmail}</p>
            </div>
            <ChevronsUpDown className="size-4 text-muted-foreground" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <aside className="crm-sidebar hidden w-full flex-col border-0 bg-card md:sticky md:top-0 md:flex md:h-screen md:w-[220px] md:overflow-y-auto">
        {renderSidebarShell()}
      </aside>

      <div className="md:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-[220px] max-w-[220px] p-0 [&>button]:hidden">
            <aside className="crm-sidebar flex h-full w-full flex-col border-0 bg-card">{renderSidebarShell(true)}</aside>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
