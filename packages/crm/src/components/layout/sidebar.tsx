"use client";

import Image from "next/image";
import { SidebarNav } from "@/components/layout/sidebar-nav";

export function Sidebar() {
  const nav = [
    { href: "/hub", label: "Hub", icon: "dashboard" as const },
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" as const },
    { href: "/contacts", label: "Contacts", icon: "contacts" as const },
    { href: "/deals", label: "Deals", icon: "deals" as const },
    { href: "/bookings", label: "Booking", icon: "activities" as const },
    { href: "/landing", label: "Landing", icon: "meetings" as const },
    { href: "/emails", label: "Email", icon: "meetings" as const },
    { href: "/forms", label: "Forms", icon: "meetings" as const },
    { href: "/automations", label: "Automations", icon: "activities" as const },
    { href: "/activities", label: "Activities", icon: "activities" as const },
    { href: "/settings", label: "Settings", icon: "settings" as const },
  ];

  return (
    <aside className="crm-sidebar flex w-full flex-col border-r border-[hsl(var(--border))] pr-6 md:w-[248px]">
      <div className="mb-8 px-2 py-3">
        <Image src="/logo-full.svg" alt="SeldonFrame" width={172} height={32} className="h-8 w-auto" priority />
      </div>
      <SidebarNav nav={nav} />
      <div className="mt-auto px-2 pb-2 pt-8">
        <button
          type="button"
          className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.35)] px-3 py-2 text-left text-xs font-medium text-[hsl(var(--color-text-secondary))]"
          onClick={() => window.dispatchEvent(new CustomEvent("crm:command-palette-toggle", { detail: { open: true } }))}
        >
          Command Palette <span className="float-right rounded border border-[hsl(var(--border))] px-1.5 py-0.5 text-[10px]">⌘K</span>
        </button>
      </div>
    </aside>
  );
}
