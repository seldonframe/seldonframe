"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, Folder, MoreHorizontal, Sparkles, Users, ChevronsUpDown } from "lucide-react";
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

export function Sidebar({ blocks, canAccessSeldon }: { blocks: BlockManifest[]; canAccessSeldon: boolean }) {
  const labels = useLabels();
  const [foldersOpen, setFoldersOpen] = useState(true);
  const folderItems = ["TechCorp Upgrade", "Fintra Expansion", "Nova Redesign"];

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
          <div className="mb-3 flex items-center gap-2 sm:gap-3 rounded-lg border bg-card p-2 sm:p-3">
            <div className="flex size-8 sm:size-[34px] items-center justify-center rounded-lg bg-linear-to-b from-[#6e3ff3] to-[#aa8ef9] text-white shrink-0">
              <Sparkles className="size-4 sm:size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold sm:text-sm">Synclead</p>
              <div className="flex items-center gap-1 text-muted-foreground">
                <Users className="size-3 sm:size-3.5" />
                <span className="text-[10px] sm:text-xs">16 Members</span>
              </div>
            </div>
          </div>

          <SidebarNav nav={nav} onNavigate={() => setMobileOpen(false)} />

          <div className="mt-4">
            <button
              type="button"
              className="mb-2 flex w-full items-center justify-between text-[11px] font-semibold tracking-wider text-muted-foreground"
              onClick={() => setFoldersOpen((current) => !current)}
            >
              <span className="flex items-center gap-1.5">
                <ChevronDown className={`size-3.5 transition-transform ${foldersOpen ? "" : "-rotate-90"}`} />
                FOLDERS
              </span>
              <MoreHorizontal className="size-4" />
            </button>

            {foldersOpen ? (
              <div className="space-y-1">
                {folderItems.map((folder) => (
                  <button
                    key={folder}
                    type="button"
                    className="flex h-[38px] w-full items-center gap-2.5 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                  >
                    <Folder className="size-4 text-muted-foreground" />
                    <span className="flex-1 truncate text-left">{folder}</span>
                    <span className="size-1.5 rounded-full bg-[#6e3ff3]" />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {!isMobile ? (
          <div className="mt-auto px-3 pb-3 pt-4 sm:px-4 sm:pb-4 sm:pt-6 lg:px-5 lg:pb-5 lg:pt-8">
            <Link
              href="https://square.lndevui.com"
              target="_blank"
              rel="noopener noreferrer"
              className="mb-2 inline-flex h-9 w-full items-center justify-center rounded-md border bg-card px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:h-[38px]"
            >
              square.lndevui.com
            </Link>

            <button type="button" className="flex w-full items-center gap-2 rounded-lg p-2 transition-colors hover:bg-accent">
              <Image src="/logo-small.svg" alt="Profile" width={28} height={28} className="size-7 rounded-md" />
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate text-xs font-semibold text-foreground sm:text-sm">Account</p>
                <p className="truncate text-[10px] text-muted-foreground sm:text-xs">workspace owner</p>
              </div>
              <ChevronsUpDown className="size-4 text-muted-foreground" />
            </button>
          </div>
        ) : null}
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
