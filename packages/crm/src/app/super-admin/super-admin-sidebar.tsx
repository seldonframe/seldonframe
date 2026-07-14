"use client";

// v1.35.0 — Super-admin sidebar.
//
// Five tabs (Overview / Users / Workspaces / Agents / Revenue / Health)
// matching the architectural reflection. Active highlight via pathname.
// Bottom shows the signed-in admin's email + a link back to the
// operator dashboard.

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Building2,
  Bot,
  DollarSign,
  Activity,
  ArrowLeft,
} from "lucide-react";

const NAV: Array<{ href: string; label: string; icon: React.ComponentType<{ className?: string }>; exact?: boolean }> = [
  { href: "/super-admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/super-admin/users", label: "Users", icon: Users },
  { href: "/super-admin/workspaces", label: "Workspaces", icon: Building2 },
  { href: "/super-admin/agents", label: "Agents", icon: Bot },
  { href: "/super-admin/revenue", label: "Revenue", icon: DollarSign },
  { href: "/super-admin/health", label: "Health", icon: Activity },
];

export function SuperAdminSidebar({
  adminEmail,
  adminName,
}: {
  adminEmail: string;
  adminName: string;
}) {
  const pathname = usePathname();

  function isActive(href: string, exact?: boolean): boolean {
    if (exact) return pathname === href;
    return pathname?.startsWith(href) ?? false;
  }

  return (
    <aside className="hidden md:flex w-60 shrink-0 border-r bg-background/50 flex-col h-screen sticky top-0">
      {/* Top: brand + label */}
      <div className="px-4 py-5 border-b">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand mark */}
          <img src="/brand/seldon-mark.svg" alt="Seldon" width={28} height={28} className="size-7 rounded-md" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground leading-tight">SeldonFrame</p>
            <p className="text-[10px] text-muted-foreground tracking-wide uppercase">Admin</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors ${
                active
                  ? "bg-accent text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
              }`}
            >
              <Icon className="size-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom: admin user + back-to-dashboard */}
      <div className="border-t px-3 py-3 space-y-1">
        <div className="px-2 pb-2">
          <p className="text-xs font-medium text-foreground truncate">{adminName}</p>
          <p className="text-[10px] text-muted-foreground truncate">{adminEmail}</p>
        </div>
        <Link
          href="/dashboard"
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          Back to operator dashboard
        </Link>
      </div>
    </aside>
  );
}
