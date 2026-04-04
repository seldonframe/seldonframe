"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, Building2, Calendar, ChevronRight, FileText, Layout, LayoutDashboard, Mail, Puzzle, Settings, Sparkles, Users, Zap } from "lucide-react";

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
  building2: Building2,
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

export function SidebarNav({ nav, onNavigate }: { nav: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="space-y-1">
      {nav.map((item) => {
        const Icon = resolveIcon(item.icon);
        const active = isActivePath(pathname, item.href);
        const className = item.disabled
          ? "flex h-9 items-center gap-2.5 rounded-md px-3 text-sm font-medium text-muted-foreground opacity-55 sm:h-[38px]"
          : `flex h-9 items-center gap-2.5 rounded-md px-3 text-sm font-medium transition-colors sm:h-[38px] ${active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`;

        return (
          <Link
            key={item.href}
            href={item.href}
            data-active={item.disabled ? false : active}
            className={className}
            title={item.tooltip}
            onClick={() => {
              if (!item.disabled) {
                onNavigate?.();
              }
            }}
          >
            <Icon className="size-4 shrink-0 sm:size-5" />
            <span className="flex-1">{item.label}</span>
            {active && !item.disabled ? <ChevronRight className="h-4 w-4 text-[hsl(var(--muted-foreground))]/70" /> : null}
            {item.upgrade ? (
              <span className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.06em] text-[hsl(var(--muted-foreground))]">
                Upgrade
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
