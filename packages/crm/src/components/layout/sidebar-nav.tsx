"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, Calendar, FileText, Layout, LayoutDashboard, Mail, Puzzle, Settings, Sparkles, Users, Zap } from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: string;
  disabled?: boolean;
  tooltip?: string;
  upgrade?: boolean;
};

const iconMap = {
  dashboard: LayoutDashboard,
  layoutdashboard: LayoutDashboard,
  contacts: Users,
  users: Users,
  deals: Briefcase,
  briefcase: Briefcase,
  booking: Calendar,
  calendar: Calendar,
  pages: Layout,
  layout: Layout,
  email: Mail,
  mail: Mail,
  forms: FileText,
  filetext: FileText,
  automations: Zap,
  zap: Zap,
  settings: Settings,
  sparkles: Sparkles,
  puzzle: Puzzle,
} as const;

function resolveIcon(iconName: string) {
  const normalized = iconName.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
  return iconMap[normalized as keyof typeof iconMap] ?? Puzzle;
}

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ nav }: { nav: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="space-y-1.5">
      {nav.map((item) => {
        const Icon = resolveIcon(item.icon);
        const active = isActivePath(pathname, item.href);
        const className = item.disabled
          ? "crm-sidebar-link flex items-center gap-2.5 px-3 py-2.5 text-label opacity-55"
          : "crm-sidebar-link flex items-center gap-2.5 px-3 py-2.5 text-label";

        return (
          <Link
            key={item.href}
            href={item.href}
            data-active={item.disabled ? false : active}
            className={className}
            title={item.tooltip}
          >
            <Icon className="crm-sidebar-icon h-4 w-4 shrink-0" />
            <span className="crm-sidebar-text flex-1">{item.label}</span>
            {item.upgrade ? (
              <span className="rounded border border-[hsl(var(--border))] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.06em] text-[hsl(var(--muted-foreground))]">
                Upgrade
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
