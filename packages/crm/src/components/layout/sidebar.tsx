"use client";

import Image from "next/image";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { useLabels } from "@/lib/hooks/use-labels";

export function Sidebar() {
  const labels = useLabels();

  const nav = [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" as const },
    { href: "/contacts", label: labels.contact.plural, icon: "contacts" as const },
    { href: "/deals", label: labels.deal.plural, icon: "deals" as const },
    { href: "/bookings", label: "Booking", icon: "booking" as const },
    { href: "/landing", label: "Pages", icon: "pages" as const },
    { href: "/emails", label: "Email", icon: "email" as const },
    { href: "/forms", label: labels.intakeForm.plural, icon: "forms" as const },
    { href: "/automations", label: "Automations", icon: "automations" as const },
    { href: "/settings", label: "Settings", icon: "settings" as const },
  ];

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
