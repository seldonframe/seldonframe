"use client";

import { useEffect, useState } from "react";
import { Sparkles, Users, ChevronsUpDown } from "lucide-react";
import type { BlockManifest } from "@seldonframe/core/blocks";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useLabels } from "@/lib/hooks/use-labels";

/*
  Square UI class reference (source of truth):
  - templates/dashboard-2/components/dashboard/sidebar.tsx
    - header spacing: "p-3 sm:p-4 lg:p-5 pb-0"
    - content spacing: "px-3 sm:px-4 lg:px-5"
    - account card shell: "flex items-center gap-2 sm:gap-3 rounded-lg border bg-card p-2 sm:p-3"
*/

const fallbackNav = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/seldon", label: "Seldon It", icon: "sparkles" },
  { href: "/contacts", label: "Contacts", icon: "contacts" },
  { href: "/deals", label: "Deals", icon: "deals" },
  { href: "/bookings", label: "Booking", icon: "booking" },
  { href: "/landing", label: "Pages", icon: "pages" },
  { href: "/emails", label: "Email", icon: "email" },
  { href: "/forms", label: "Forms", icon: "forms" },
  { href: "/automations", label: "Automations", icon: "automations" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

export function Sidebar({
  blocks,
  canAccessSeldon,
  workspaceName,
  workspaceMembers,
  userName,
  userEmail,
  avatarFallback,
}: {
  blocks: BlockManifest[];
  canAccessSeldon: boolean;
  workspaceName: string;
  workspaceMembers?: number;
  userName: string;
  userEmail: string;
  avatarFallback: string;
}) {
  const labels = useLabels();

  const blockNav = blocks.length
    ? [...blocks].sort((a, b) => a.nav.order - b.nav.order).map((block) => {
        const label =
          block.id === "contacts"
            ? labels.contact.plural
            : block.id === "deals"
              ? labels.deal.plural
              : block.id === "forms"
                ? labels.intakeForm.plural
                : block.nav.label;

        return {
          href: block.nav.href,
          label,
          icon: block.nav.icon || block.icon || "Puzzle",
          order: block.nav.order,
        };
      })
    : fallbackNav.map((item, idx) => ({ ...item, order: idx * 10 + 10 }));

  const filteredBlockNav = blockNav.filter((item) => item.href !== "/seldon");

  const nav = [
    ...filteredBlockNav,
    {
      href: canAccessSeldon ? "/seldon" : "/settings/billing",
      label: "Seldon It",
      icon: "sparkles",
      order: 15,
      disabled: !canAccessSeldon,
      tooltip: canAccessSeldon ? undefined : "Upgrade to Cloud Pro to Seldon custom blocks",
      upgrade: !canAccessSeldon,
    },
  ].sort((a, b) => a.order - b.order);

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
            <div className="flex size-5 items-center justify-center rounded bg-linear-to-b from-[#6e3ff3] to-[#aa8ef9] text-white">
              <Sparkles className="size-3" />
            </div>
            <p className="text-base font-semibold tracking-tight text-foreground">
              SeldonFrame
            </p>
          </div>
        </div>

        <div className="px-3 sm:px-4 lg:px-5">
          <div className="mb-3 flex items-center gap-2 sm:gap-3 rounded-lg border border-border bg-muted/45 p-2 sm:p-3">
            <div className="flex size-8 sm:size-[34px] items-center justify-center rounded-lg bg-linear-to-b from-[#6e3ff3] to-[#aa8ef9] text-white shrink-0">
              <Sparkles className="size-4 sm:size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold sm:text-sm">{workspaceName}</p>
              {typeof workspaceMembers === "number" ? (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Users className="size-3 sm:size-3.5" />
                  <span className="text-[10px] sm:text-xs">{workspaceMembers} Members</span>
                </div>
              ) : null}
            </div>
          </div>

          <SidebarNav nav={nav} onNavigate={() => setMobileOpen(false)} />
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
      <aside className="crm-sidebar hidden w-full flex-col border bg-card md:flex md:w-[220px]">{renderSidebarShell()}</aside>

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
