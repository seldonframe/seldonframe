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
    <aside className="crm-sidebar flex w-full flex-col border-r border-[hsl(var(--border))] pr-6 md:w-[220px]">
      <div className="mb-8 px-2 py-4">
        <Image src="/logo-full.svg" alt="SeldonFrame" width={172} height={32} className="h-8 w-auto" priority />
      </div>
      <SidebarNav nav={nav} />
      <div className="mt-auto px-2 pb-2 pt-8">
        <button
          type="button"
          className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.35)] px-3 py-2 text-left text-xs font-medium text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted)/0.5)] hover:text-foreground"
          onClick={() => window.dispatchEvent(new CustomEvent("crm:command-palette-toggle", { detail: { open: true } }))}
        >
          Command Palette <span className="float-right rounded border border-[hsl(var(--border))] px-1.5 py-0.5 text-[10px] text-[hsl(var(--muted-foreground))]">⌘K</span>
        </button>
      </div>
    </aside>
  );
}
