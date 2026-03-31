"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell, Command, Moon, Search, Sun } from "lucide-react";
import { signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import { usePathname } from "next/navigation";
import { DensityToggle } from "@/components/shared/density-toggle";
import { useLabels } from "@/lib/hooks/use-labels";

const staticTitleMap: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/orgs": "Organizations",
  "/bookings": "Booking",
  "/landing": "Landing Pages",
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
    return labels.deal.plural;
  }

  if (pathname === "/bookings") {
    return `${labels.activity.plural} · Booking`;
  }

  if (pathname === "/forms") {
    return labels.intakeForm.plural;
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
    return labels.intakeForm.singular;
  }

  if (pathname.startsWith("/landing/")) {
    return "Landing Page";
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
}: {
  userName: string;
  userEmail: string;
  avatarFallback: string;
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
    <header className="flex flex-wrap items-center gap-3 rounded-2xl border-b border-[hsl(var(--border))] bg-background/80 p-4 backdrop-blur-xl lg:flex-nowrap">
      <div className="min-w-[140px]">
        <p className="text-card-title text-foreground">{title}</p>
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

        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted)/0.45)] hover:text-foreground"
          aria-label="Toggle theme"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        <button type="button" className="crm-topbar-icon-btn relative" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" />
        </button>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((current) => !current)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--color-surface-raised))] text-xs font-semibold text-foreground"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="User menu"
          >
            {avatarFallback}
          </button>

          {menuOpen ? (
            <div className="glass-card absolute right-0 z-30 mt-2 w-64 rounded-xl p-2 shadow-dropdown" role="menu">
              <div className="px-2 py-2">
                <p className="truncate text-sm font-medium text-foreground">{userName}</p>
                <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">{userEmail}</p>
              </div>
              <div className="my-1 h-px bg-[hsl(var(--border))]" />
              <Link
                href="/settings"
                className="block rounded-md px-2 py-2 text-sm text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted)/0.5)] hover:text-foreground"
                onClick={() => setMenuOpen(false)}
              >
                Settings
              </Link>
              <button
                type="button"
                className="w-full rounded-md px-2 py-2 text-left text-sm text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted)/0.5)] hover:text-foreground"
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
