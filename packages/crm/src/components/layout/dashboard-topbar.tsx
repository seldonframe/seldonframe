"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell, Check, Command, ChevronsUpDown, Menu, Moon, Search, Sun } from "lucide-react";
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
  workspaceName,
  activeWorkspaceId,
  workspaceOptions,
  switchWorkspaceAction,
}: {
  userName: string;
  userEmail: string;
  avatarFallback: string;
  canAccessSeldon: boolean;
  workspaceName: string;
  activeWorkspaceId: string | null;
  workspaceOptions: Array<{ id: string; name: string; contactCount: number; soulId: string | null }>;
  switchWorkspaceAction: (formData: FormData) => void | Promise<void>;
}) {
  const pathname = usePathname();
  const labels = useLabels();
  const title = getTitle(pathname, labels);
  const { theme, setTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const workspaceMenuRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!workspaceMenuRef.current) {
        return;
      }

      if (!workspaceMenuRef.current.contains(event.target as Node)) {
        setWorkspaceMenuOpen(false);
      }
    }

    if (workspaceMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [workspaceMenuOpen]);

  return (
    <header className="sticky top-0 z-10 flex w-full items-center gap-2 rounded-2xl border border-border/80 bg-card/88 px-3 py-3 shadow-(--shadow-xs) backdrop-blur-xl sm:gap-3 sm:px-5 sm:py-4">
      <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-3">
        <button
          type="button"
          className="crm-topbar-icon-btn flex h-11 w-11 items-center justify-center md:hidden"
          aria-label="Open navigation menu"
          onClick={() => window.dispatchEvent(new CustomEvent("crm:mobile-sidebar-open"))}
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold tracking-tight sm:text-lg">{title}</p>
          <p className="truncate text-xs text-muted-foreground">Stay focused on the current client workspace.</p>
        </div>
      </div>

      <div className="relative hidden shrink-0 lg:block" ref={workspaceMenuRef}>
        <button
          type="button"
          onClick={() => setWorkspaceMenuOpen((current) => !current)}
          className="flex h-10 min-w-[240px] items-center gap-3 rounded-xl border border-border/80 bg-background/80 px-3 text-left shadow-(--shadow-xs) transition-all hover:border-border hover:bg-background"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{workspaceName}</p>
            <p className="truncate text-[11px] text-muted-foreground">Switch client workspace</p>
          </div>
          <ChevronsUpDown className="size-4 text-muted-foreground" />
        </button>

        {workspaceMenuOpen ? (
          <div className="absolute right-0 z-30 mt-2 w-[320px] rounded-2xl border border-border/80 bg-card/96 p-2.5 shadow-(--shadow-dropdown) backdrop-blur-xl">
            <p className="px-2 pb-1 text-[10px] font-semibold tracking-[0.16em] text-muted-foreground/80">CLIENT WORKSPACES</p>
            <div className="space-y-1">
              {workspaceOptions.map((workspace) => (
                <form key={workspace.id} action={switchWorkspaceAction}>
                  <input type="hidden" name="orgId" value={workspace.id} />
                  <input type="hidden" name="redirectTo" value={pathname || "/dashboard"} />
                  <button
                    type="submit"
                    className="flex w-full items-start gap-2 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-accent/60"
                    onClick={() => setWorkspaceMenuOpen(false)}
                  >
                    <span className="mt-0.5 inline-flex size-4 items-center justify-center text-primary">
                      {activeWorkspaceId === workspace.id ? <Check className="size-3.5" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{workspace.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{workspace.contactCount.toLocaleString()} clients · {workspace.soulId ? workspace.soulId.charAt(0).toUpperCase() + workspace.soulId.slice(1) : "Custom"}</span>
                    </span>
                  </button>
                </form>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="relative mx-auto hidden flex-1 md:block md:max-w-[320px]">
        <button
          type="button"
          className="crm-topbar-input h-9 w-full pl-10 pr-14 text-left text-sm text-muted-foreground"
          onClick={() => window.dispatchEvent(new CustomEvent("crm:command-palette-toggle", { detail: { open: true } }))}
        >
          Search Anything...
        </button>
        <Search className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
        <span className="absolute right-2 top-1/2 inline-flex -translate-y-1/2 items-center gap-0.5 rounded-md border border-border bg-background/80 px-1.5 py-0.5 text-xs text-muted-foreground shadow-(--shadow-xs)">
          <Command className="size-3" />
          <span>K</span>
        </span>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
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
            className="crm-topbar-icon-btn h-9 w-9 text-xs font-semibold"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="User menu"
          >
            {avatarFallback}
          </button>

          {menuOpen ? (
            <div className="absolute right-0 z-30 mt-2 w-56 rounded-2xl border border-border/80 bg-card/96 p-2 shadow-(--shadow-dropdown) backdrop-blur-xl sm:w-64" role="menu">
              <div className="px-2 py-2">
                <p className="truncate text-sm font-medium text-foreground">{userName}</p>
                <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
              </div>
              <div className="my-1 h-px bg-border" />
              <Link
                href="/settings"
                className="block rounded-xl px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground"
                onClick={() => setMenuOpen(false)}
              >
                Settings
              </Link>
              <button
                type="button"
                className="w-full rounded-xl px-2.5 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground"
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
