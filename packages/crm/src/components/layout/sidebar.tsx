"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ChevronsUpDown } from "lucide-react";
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
  workspaceMembers?: number;
  userName: string;
  userEmail: string;
  avatarFallback: string;
}) {
  const { canAccessSeldon, hiddenBlocks = [], workspaceName, userName, userEmail, avatarFallback } = props;
  const labels = useLabels();
  const hiddenHrefs = new Set(hiddenBlocks.map((slug) => hiddenSlugToHref[slug]).filter(Boolean));

  function filterHidden<T extends { href: string }>(items: T[]): T[] {
    return items.filter((item) => !hiddenHrefs.has(item.href));
  }

  const navGroups: NavGroup[] = [
    {
      title: "YOUR SOUL",
      items: filterHidden([
        { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
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
        { href: "/settings", label: "Settings", icon: "Settings" },
      ]),
    },
  ].filter((group) => group.items.length > 0);

  const [mobileOpen, setMobileOpen] = useState(false);

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
          <div className="mb-3 flex items-center gap-2 sm:gap-3 rounded-lg border border-border bg-muted/45 p-2 sm:p-3">
            <div className="flex size-8 sm:size-[34px] items-center justify-center overflow-hidden rounded-lg shrink-0">
              <Image src="/logo.svg" alt="SeldonFrame logo" width={34} height={34} className="h-full w-full" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold sm:text-sm">{workspaceName}</p>
            </div>
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
      <aside className="crm-sidebar hidden w-full flex-col border bg-card md:sticky md:top-0 md:flex md:h-screen md:w-[220px] md:overflow-y-auto">
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
