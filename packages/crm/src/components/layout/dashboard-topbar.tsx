"use client";

import { Bell, Command, Search } from "lucide-react";
import { usePathname } from "next/navigation";
import { DensityToggle } from "@/components/shared/density-toggle";

const titleMap: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/contacts": "CRM",
  "/deals": "Deals",
  "/activities": "Booking",
  "/forms": "Meetings",
  "/settings": "Settings",
  "/setup": "Soul Setup",
};

function getTitle(pathname: string) {
  if (pathname.startsWith("/contacts/")) {
    return "Contact Detail";
  }

  if (pathname.startsWith("/deals/")) {
    return "Deal Detail";
  }

  if (pathname.startsWith("/settings/")) {
    return "Settings";
  }

  return titleMap[pathname] ?? "Dashboard";
}

export function DashboardTopbar({
  userName,
  avatarFallback,
  businessName,
}: {
  userName: string;
  avatarFallback: string;
  businessName: string;
}) {
  const pathname = usePathname();
  const title = getTitle(pathname);

  return (
    <header className="crm-card flex flex-wrap items-center gap-3 lg:flex-nowrap">
      <div className="min-w-[140px]">
        <p className="text-card-title text-foreground">{title}</p>
        <p className="text-xs text-[hsl(var(--color-text-secondary))]">{businessName}</p>
      </div>

      <button
        type="button"
        className="crm-topbar-input mx-auto hidden h-10 max-w-[320px] flex-1 items-center justify-between gap-3 px-3 text-left lg:flex"
        onClick={() => window.dispatchEvent(new CustomEvent("crm:command-palette-toggle", { detail: { open: true } }))}
      >
        <span className="text-sm text-[hsl(var(--color-text-secondary))]">Command Palette</span>
        <span className="inline-flex items-center gap-1 rounded border border-[hsl(var(--border))] px-1.5 py-0.5 text-[10px] text-[hsl(var(--color-text-muted))]">
          <Command className="h-3 w-3" />K
        </span>
      </button>

      <div className="ml-auto flex items-center gap-2">
        <label className="crm-topbar-input hidden h-10 items-center gap-2 px-3 lg:flex">
          <Search className="h-4 w-4 text-[hsl(var(--color-text-secondary))]" />
          <input
            aria-label="Search"
            placeholder="Search"
            className="w-28 bg-transparent text-sm text-foreground outline-none placeholder:text-[hsl(var(--color-text-secondary))] xl:w-44"
          />
        </label>

        <DensityToggle />

        <button type="button" className="crm-topbar-icon-btn relative" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" />
        </button>

        <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--color-surface-raised))] text-xs font-semibold text-foreground">
          {avatarFallback}
        </button>

        <span className="hidden text-label text-foreground xl:inline">{userName}</span>
      </div>
    </header>
  );
}
