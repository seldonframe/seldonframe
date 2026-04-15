"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell, Command, Menu, MessageCircle, Moon, Search, Sun } from "lucide-react";
import { signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import { usePathname } from "next/navigation";
import { useLabels } from "@/lib/hooks/use-labels";

/*
  Square UI class reference (source of truth):
  - templates/dashboard-2/components/dashboard/header.tsx
    - header shell: "flex items-center gap-2 sm:gap-3 px-3 sm:px-6 py-3 sm:py-4 border-b bg-card sticky top-0 z-10 w-full"
    - title: "text-base sm:text-lg font-medium flex-1 truncate"
    - search shell: "hidden md:block relative"
    - search icon: "absolute left-3 top-1/2 -translate-y-1/2 size-5 text-muted-foreground"
    - input shell: "pl-10 pr-14 w-[180px] lg:w-[220px] h-9 bg-card border"
*/

const staticTitleMap: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/seldon": "Seldon It",
  "/orgs": "Organizations",
  "/bookings": "Booking",
  "/landing": "Pages",
  "/emails": "Email",
  "/automations": "Automations",
  "/hub": "Hub",
  "/settings": "Settings",
  "/setup": "Soul Setup",
};

function getTitle(pathname: string, labels: ReturnType<typeof useLabels>) {
  if (pathname === "/contacts") {
    return labels.contact.plural;
  }

  if (pathname === "/deals") {
    return "Engagements";
  }

  if (pathname === "/bookings") {
    return "Booking";
  }

  if (pathname === "/forms") {
    return "Intake Forms";
  }

  if (pathname === "/activities") {
    return labels.activity.plural;
  }

  if (pathname === "/settings/profile") {
    return "Business Profile";
  }

  if (pathname === "/settings/pipeline") {
    return "Pipeline Settings";
  }

  if (pathname === "/settings/fields") {
    return "Custom Fields";
  }

  if (pathname === "/settings/team") {
    return "Team";
  }

  if (pathname === "/settings/webhooks") {
    return "Webhook Endpoints";
  }

  if (pathname === "/settings/api") {
    return "API Keys";
  }

  if (pathname === "/settings/payments") {
    return "Payments";
  }

  if (pathname === "/settings/billing") {
    return "Billing";
  }

  if (pathname === "/settings/integrations/kit") {
    return "Kit Integration";
  }

  if (pathname === "/settings/soul-transfer") {
    return "Soul Export / Import";
  }

  if (pathname.startsWith("/contacts/")) {
    return labels.contact.singular;
  }

  if (pathname.startsWith("/deals/")) {
    return labels.deal.singular;
  }

  if (pathname.startsWith("/forms/")) {
    return "Intake Forms";
  }

  if (pathname.startsWith("/landing/")) {
    return "Pages";
  }

  if (pathname.startsWith("/settings/")) {
    return "Settings";
  }

  return staticTitleMap[pathname] ?? "Dashboard";
}

export function DashboardTopbar({
  userName,
  userEmail,
  avatarFallback,
  canAccessSeldon,
}: {
  userName: string;
  userEmail: string;
  avatarFallback: string;
  canAccessSeldon: boolean;
}) {
  const pathname = usePathname();
  const labels = useLabels();
  const title = getTitle(pathname, labels);
  const { theme, setTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!menuRef.current) {
        return;
      }

      if (!menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-10 flex w-full items-center gap-2 border-b bg-card px-3 py-3 sm:gap-3 sm:px-6 sm:py-4">
      <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-3">
        <button
          type="button"
          className="crm-topbar-icon-btn flex h-11 w-11 items-center justify-center md:hidden"
          aria-label="Open navigation menu"
          onClick={() => window.dispatchEvent(new CustomEvent("crm:mobile-sidebar-open"))}
        >
          <Menu className="h-5 w-5" />
        </button>
        <p className="flex-1 truncate text-base font-medium sm:text-lg">{title}</p>
      </div>

      <div className="relative mx-auto hidden flex-1 md:block md:max-w-[320px]">
        <button
          type="button"
          className="h-9 w-full rounded-md border bg-card pl-10 pr-14 text-left text-sm text-muted-foreground"
          onClick={() => window.dispatchEvent(new CustomEvent("crm:command-palette-toggle", { detail: { open: true } }))}
        >
          Search Anything...
        </button>
        <Search className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
        <span className="absolute right-2 top-1/2 inline-flex -translate-y-1/2 items-center gap-0.5 rounded bg-muted px-1 py-0.5 text-xs text-muted-foreground">
          <Command className="size-3" />
          <span>K</span>
        </span>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
        {canAccessSeldon ? (
          <button
            type="button"
            className="crm-topbar-icon-btn"
            aria-label="Open Seldon builder chat"
            onClick={() => window.dispatchEvent(new CustomEvent("crm:builder-seldon-open"))}
          >
            <MessageCircle className="h-4 w-4" />
          </button>
        ) : null}

        <button type="button" className="crm-topbar-icon-btn" aria-label="Toggle theme" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        <button type="button" className="crm-topbar-icon-btn relative" aria-label="Notifications">
          <Bell className="h-4 w-4" />
        </button>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((current) => !current)}
            className="crm-topbar-icon-btn h-9 w-9 rounded-md text-xs font-semibold"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="User menu"
          >
            {avatarFallback}
          </button>

          {menuOpen ? (
            <div className="absolute right-0 z-30 mt-2 w-56 rounded-xl border bg-card p-2 shadow-sm sm:w-64" role="menu">
              <div className="px-2 py-2">
                <p className="truncate text-sm font-medium text-foreground">{userName}</p>
                <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
              </div>
              <div className="my-1 h-px bg-border" />
              <Link
                href="/settings"
                className="block rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                onClick={() => setMenuOpen(false)}
              >
                Settings
              </Link>
              <button
                type="button"
                className="w-full rounded-md px-2 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                onClick={() => signOut({ callbackUrl: "/login" })}
              >
                Log out
              </button>
            </div>
          ) : null}
        </div>

        <span className="hidden text-label text-foreground xl:inline">{userName}</span>
      </div>
    </header>
  );
}
