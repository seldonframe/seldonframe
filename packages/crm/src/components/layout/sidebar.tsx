"use client";

import Image from "next/image";
import type { BlockManifest } from "@seldonframe/core/blocks";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { useLabels } from "@/lib/hooks/use-labels";

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

  return (
    <aside className="crm-sidebar glass-card flex w-full flex-col border border-[hsl(var(--border))] md:w-[220px]">
      <div className="p-3 pb-0 sm:p-4 sm:pb-0 lg:p-5 lg:pb-0">
        <Image src="/logo-full.svg" alt="SeldonFrame" width={172} height={32} className="h-8 w-auto" priority />
      </div>

      <div className="px-3 sm:px-4 lg:px-5">
        <SidebarNav nav={nav} />
      </div>

      <div className="mt-auto px-3 pb-3 pt-4 sm:px-4 sm:pb-4 sm:pt-6 lg:px-5 lg:pb-5 lg:pt-8">
        <button
          type="button"
          className="crm-topbar-input h-9 w-full rounded-md px-3 text-left text-xs font-medium text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted)/0.6)] hover:text-foreground sm:h-[38px]"
          onClick={() => window.dispatchEvent(new CustomEvent("crm:command-palette-toggle", { detail: { open: true } }))}
        >
          Command Palette <span className="float-right rounded border border-[hsl(var(--border))] px-1.5 py-0.5 text-[10px] text-[hsl(var(--muted-foreground))]">⌘K</span>
        </button>
      </div>
    </aside>
  );
}
